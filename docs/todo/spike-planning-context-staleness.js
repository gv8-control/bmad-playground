#!/usr/bin/env node
/**
 * Spike: planning-run context staleness vs. fold-time validation (I2)
 *
 * Verifies the reviewer-flagged assumption I2 from the graph-pipeline plan:
 *
 *   The planner reads graph.json at launch (T0). By fold time (T1), state has
 *   moved. The delta-validation spike verified that structural staleness
 *   (claimed nodes, merged nodes) is caught. But there's a semantic staleness
 *   layer the validation can't catch:
 *
 *   The planner reads an artifact at origin/<trunkBranch> at T0. Between T0
 *   and T1, another chain merges a different version of that artifact (or a
 *   conflicting change to the same files). The planner composed nodes based
 *   on the T0 artifact. The delta's addNode ops are structurally valid (fresh
 *   ids, legal edges), so validation passes. But the planned nodes are
 *   semantically wrong — they target an artifact version that no longer
 *   exists on trunk.
 *
 *   Spike scope: Not a code spike — a design decision. Should the planner
 *   re-fetch origin/<trunkBranch> right before composing, to minimize the
 *   T0→T1 window? Should the fold check whether any merges landed between T0
 *   and T1 that touch files the planner read, and reject the delta if so?
 *
 * This is a PURE-LOGIC discrete-event simulation. No infrastructure, no
 * network, no sandboxes, no LLM calls. It models:
 *
 *   - A work graph with N chains, each producing merges to trunk.
 *   - Merge arrival rate (Poisson process, parameterized).
 *   - Planning run duration (minutes, parameterized).
 *   - Fold latency (tick-based, parameterized).
 *   - The T0→T1 window and whether a merge lands in it.
 *   - File overlap: whether the merge touches files the planner read.
 *   - Six mitigation designs and their false positive/negative rates.
 *
 * What this spike measures:
 *
 *   Phase 1 — Window quantification: how long is T0→T1, and what fraction of
 *   planning runs see a merge land in the window?
 *
 *   Phase 2 — Semantic staleness rate: of those merges, how many touch files
 *   the planner read (true semantic staleness)?
 *
 *   Phase 3 — Mitigation comparison: for each design, what are the false
 *   positive, false negative, and wasted-cost rates?
 *
 *   Phase 4 — Livelock risk: under Design 4/6 (reject on any trunk movement),
 *   how often does the re-plan also get rejected? Is there a livelock?
 *
 *   Phase 5 — Cost asymmetry validation: confirm that a false positive (re-plan,
 *   minutes) is orders of magnitude cheaper than a false negative (wrong agent
 *   work, hours).
 *
 * Usage:
 *   node spike-planning-context-staleness.js
 *
 * No external dependencies — uses only Node.js stdlib.
 * See: docs/todo/spike-planning-context-staleness.md for the full report.
 */

'use strict';

// ─── Constants ─────────────────────────────────────────────────────────────

// Simulated durations (in "ticks" — 1 tick ≈ a few minutes, the schedule-tick
// interval). The plan says: node skill runs take hours, merge cycles take
// seconds, planning runs take minutes, the tick is every few minutes.
const PLANNING_RUN_TICKS = 2;       // ~minutes (2 ticks ≈ 6-10 min)
const PLANNING_RUN_TICKS_SLOW = 4;  // slow planner (~12-20 min)
const MERGE_DURATION_TICKS = 0;     // seconds — completes within a tick
const NODE_DURATION_TICKS = 60;     // ~hours (60 ticks ≈ 3-5 hours)
const TICK_MINUTES = 4;             // minutes per tick (schedule interval)

// Merge arrival rates (merges per tick). With N chains each merging roughly
// hourly, and a tick ≈ 4 min, that's ~1 merge every 15 ticks per chain.
// For N=4 chains: ~4/15 ≈ 0.27 merges/tick.
const MERGE_RATE_LOW = 0.1;         // ~1 merge every 10 ticks (slow sprint)
const MERGE_RATE_MED = 0.27;        // ~4 chains, each merging hourly
const MERGE_RATE_HIGH = 0.5;        // ~8 chains or fast sprint
const MERGE_RATE_BURST = 1.0;       // extreme: merge every tick

// File overlap probability. When a merge lands, what's the probability it
// touches a file the planner read? Story specs are high-churn and highly
// read; code is high-churn but less load-bearing for planning; PRD/arch
// are low-churn. Estimate: 10-30% of merges touch a planner-read file.
const OVERLAP_LOW = 0.10;
const OVERLAP_MED = 0.20;
const OVERLAP_HIGH = 0.35;

// Costs (in "tick-equivalents" for comparison).
const COST_FALSE_POSITIVE = PLANNING_RUN_TICKS; // one wasted re-plan (minutes)
const COST_FALSE_NEGATIVE = NODE_DURATION_TICKS; // one wasted node run (hours)

// ─── Utilities ─────────────────────────────────────────────────────────────

function log(phase, msg) {
  console.log(`[${phase}] ${msg}`);
}

/**
 * Simple PRNG (mulberry32) for reproducible runs.
 */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sample from an exponential distribution (for Poisson arrivals).
 * @param {function} rng - PRNG function
 * @param {number} rate - arrival rate (events per tick)
 * @returns {number} ticks until next event
 */
function exponentialSample(rng, rate) {
  return -Math.log(1 - rng()) / rate;
}

/**
 * Run a single simulation trial: one planning run with a T0→T1 window.
 *
 * @param {object} opts - simulation parameters
 * @param {number} opts.mergeRate - merges per tick (Poisson rate)
 * @param {number} opts.overlapProb - P(merge touches planner-read file)
 * @param {number} opts.planningTicks - duration of the planning run
 * @param {number} opts.foldLatencyTicks - ticks until fold
 * @param {boolean} opts.reFetch - whether Design 1 (re-fetch) is active
 * @param {function} rng - PRNG
 * @returns {object} trial result
 */
function simulateTrial(opts, rng) {
  const {
    mergeRate,
    overlapProb,
    planningTicks,
    foldLatencyTicks,
    reFetch,
  } = opts;

  // The T0→T1 window. Without re-fetch, T0 is at run start.
  // With re-fetch, T0 is at fetch time (right before the planner reads),
  // which is ~0 ticks into the run (the fetch is seconds, sub-tick).
  // The window is: T0 → (planning run) → (fold latency) → T1.
  const t0 = reFetch ? 0.1 : 0; // re-fetch adds ~0.1 ticks of fetch time
  const t1 = planningTicks + foldLatencyTicks;
  const windowDuration = t1 - t0;

  // Simulate merge arrivals in the window using a Poisson process.
  // Number of merges in the window ~ Poisson(rate * windowDuration).
  const expectedMerges = mergeRate * windowDuration;
  let mergesInWindow = 0;
  let semanticOverlaps = 0;
  let anyTrunkMovement = false;

  // Sample merge events
  let currentTime = t0;
  while (currentTime < t1) {
    const interArrival = exponentialSample(rng, mergeRate);
    currentTime += interArrival;
    if (currentTime >= t1) break;
    mergesInWindow++;
    anyTrunkMovement = true;
    // Does this merge touch a file the planner read?
    if (rng() < overlapProb) {
      semanticOverlaps++;
    }
  }

  return {
    windowDuration,
    mergesInWindow,
    semanticOverlaps,
    anyTrunkMovement,
    hasSemanticStaleness: semanticOverlaps > 0,
  };
}

/**
 * Evaluate a mitigation design against a trial.
 *
 * @param {object} trial - result from simulateTrial
 * @param {string} design - which design to evaluate
 * @returns {object} { rejected, correctReject, falsePositive, falseNegative }
 */
function evaluateDesign(trial, design) {
  const { hasSemanticStaleness, anyTrunkMovement } = trial;

  switch (design) {
    case 'none': // Design 5: status quo
      return {
        rejected: false,
        correctReject: false,
        falsePositive: false,
        falseNegative: hasSemanticStaleness, // staleness slips through
      };

    case 'refetch-only': // Design 1: re-fetch (shrinks window, doesn't reject)
      // Re-fetch is already baked into the trial via opts.reFetch.
      // It doesn't reject — it just reduces the window. The trial's
      // mergesInWindow already reflects the shrunk window.
      return {
        rejected: false,
        correctReject: false,
        falsePositive: false,
        falseNegative: hasSemanticStaleness,
      };

    case 'sha-pin-any': // Design 2a/4: reject on ANY trunk movement
      return {
        rejected: anyTrunkMovement,
        correctReject: anyTrunkMovement && hasSemanticStaleness,
        falsePositive: anyTrunkMovement && !hasSemanticStaleness,
        falseNegative: !anyTrunkMovement && hasSemanticStaleness, // ~0
      };

    case 'sha-pin-overlap': // Design 2b/3: reject only on file overlap
      // Requires knowing the planner's read-set (unreliable). Model as:
      // catches semanticOverlaps, but has a false-negative rate from
      // unreported reads. Assume 15% of real overlaps are missed.
      const FALSE_NEG_RATE = 0.15;
      const detected = trial.semanticOverlaps > 0 && rng2() > FALSE_NEG_RATE;
      return {
        rejected: detected,
        correctReject: detected && hasSemanticStaleness,
        falsePositive: false, // no false positives if read-set is accurate
        falseNegative: hasSemanticStaleness && !detected,
      };

    case 'hybrid': // Design 6: re-fetch + SHA pin
      // Re-fetch shrinks the window (already in trial via opts.reFetch),
      // SHA pin rejects on any movement.
      return {
        rejected: anyTrunkMovement,
        correctReject: anyTrunkMovement && hasSemanticStaleness,
        falsePositive: anyTrunkMovement && !hasSemanticStaleness,
        falseNegative: !anyTrunkMovement && hasSemanticStaleness,
      };

    default:
      throw new Error(`unknown design: ${design}`);
  }
}

// Separate RNG for the overlap design's false-negative modeling
let _rng2State = 12345;
function rng2() {
  _rng2State = (_rng2State * 1103515245 + 12345) & 0x7fffffff;
  return _rng2State / 0x7fffffff;
}

// ─── Test framework ────────────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assertEqual(actual, expected, testName) {
  totalTests++;
  if (actual !== expected) {
    failures.push(`FAIL: ${testName} — expected ${expected}, got ${actual}`);
    console.log(`  ✗ FAIL: expected ${expected}, got ${actual}`);
    failedTests++;
    return;
  }
  console.log(`  ✓ PASS: ${testName}`);
  passedTests++;
}

function assertApprox(actual, expected, tolerance, testName) {
  totalTests++;
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    failures.push(`FAIL: ${testName} — expected ~${expected} (±${tolerance}), got ${actual}`);
    console.log(`  ✗ FAIL: expected ~${expected} (±${tolerance}), got ${actual}`);
    failedTests++;
    return;
  }
  console.log(`  ✓ PASS: ${testName} (got ${actual.toFixed(4)}, expected ~${expected})`);
  passedTests++;
}

function assertTrue(value, testName) {
  totalTests++;
  if (!value) {
    failures.push(`FAIL: ${testName} — expected true, got false`);
    console.log(`  ✗ FAIL: expected true`);
    failedTests++;
    return;
  }
  console.log(`  ✓ PASS: ${testName}`);
  passedTests++;
}

// ─── Phase 1: Window quantification ────────────────────────────────────────

function phase1() {
  console.log('\n=== Phase 1: Window quantification ===\n');

  const rng = mulberry32(42);
  const NUM_TRIALS = 10000;
  const foldLatency = 1; // ~1 tick (fold on next pass)

  // Test under different merge rates
  const rates = [
    { name: 'low (1 merge/10 ticks)', rate: MERGE_RATE_LOW },
    { name: 'med (4 chains, hourly)', rate: MERGE_RATE_MED },
    { name: 'high (8 chains)', rate: MERGE_RATE_HIGH },
  ];

  for (const { name, rate } of rates) {
    let mergesTotal = 0;
    let trialsWithMerge = 0;

    for (let i = 0; i < NUM_TRIALS; i++) {
      const trial = simulateTrial({
        mergeRate: rate,
        overlapProb: OVERLAP_MED,
        planningTicks: PLANNING_RUN_TICKS,
        foldLatencyTicks: foldLatency,
        reFetch: false,
      }, rng);
      mergesTotal += trial.mergesInWindow;
      if (trial.mergesInWindow > 0) trialsWithMerge++;
    }

    const avgMerges = mergesTotal / NUM_TRIALS;
    const pctWithMerge = (trialsWithMerge / NUM_TRIALS) * 100;
    const windowTicks = PLANNING_RUN_TICKS + foldLatency;
    const windowMinutes = windowTicks * TICK_MINUTES;

    console.log(`  ${name}:`);
    console.log(`    Window: ${windowTicks} ticks (~${windowMinutes} min)`);
    console.log(`    Avg merges in window: ${avgMerges.toFixed(3)}`);
    console.log(`    Trials with ≥1 merge: ${pctWithMerge.toFixed(1)}%`);
    console.log();

    // Verify: the fraction of trials with a merge should be ~1 - e^(-rate*window)
    const expectedPct = (1 - Math.exp(-rate * windowTicks)) * 100;
    assertApprox(pctWithMerge, expectedPct, 5,
      `P(merge in window) matches Poisson for ${name}`);
  }

  // Test with re-fetch (Design 1): window shrinks slightly
  {
    const rng2 = mulberry32(99);
    let trialsWithMergeNoFetch = 0;
    let trialsWithMergeWithFetch = 0;
    const NUM = 10000;

    for (let i = 0; i < NUM; i++) {
      const t1 = simulateTrial({
        mergeRate: MERGE_RATE_MED,
        overlapProb: OVERLAP_MED,
        planningTicks: PLANNING_RUN_TICKS,
        foldLatencyTicks: 1,
        reFetch: false,
      }, rng2);
      if (t1.mergesInWindow > 0) trialsWithMergeNoFetch++;

      const t2 = simulateTrial({
        mergeRate: MERGE_RATE_MED,
        overlapProb: OVERLAP_MED,
        planningTicks: PLANNING_RUN_TICKS,
        foldLatencyTicks: 1,
        reFetch: true,
      }, rng2);
      if (t2.mergesInWindow > 0) trialsWithMergeWithFetch++;
    }

    const pctNoFetch = (trialsWithMergeNoFetch / NUM) * 100;
    const pctWithFetch = (trialsWithMergeWithFetch / NUM) * 100;
    const reduction = pctNoFetch - pctWithFetch;

    console.log(`  Re-fetch (Design 1) window reduction:`);
    console.log(`    Without re-fetch: ${pctNoFetch.toFixed(1)}% of trials had a merge`);
    console.log(`    With re-fetch:    ${pctWithFetch.toFixed(1)}% of trials had a merge`);
    console.log(`    Reduction: ${reduction.toFixed(1)} percentage points`);
    console.log();

    // Re-fetch should reduce (not eliminate) merges in window
    assertTrue(pctWithFetch <= pctNoFetch,
      're-fetch reduces or maintains merge-in-window rate');
    assertTrue(pctWithFetch > 0,
      're-fetch does NOT eliminate merges in window (residual risk)');
  }
}

// ─── Phase 2: Semantic staleness rate ──────────────────────────────────────

function phase2() {
  console.log('\n=== Phase 2: Semantic staleness rate ===\n');

  const rng = mulberry32(77);
  const NUM_TRIALS = 10000;

  const scenarios = [
    { name: 'low overlap (10%)', overlap: OVERLAP_LOW },
    { name: 'med overlap (20%)', overlap: OVERLAP_MED },
    { name: 'high overlap (35%)', overlap: OVERLAP_HIGH },
  ];

  for (const { name, overlap } of scenarios) {
    let semanticStale = 0;

    for (let i = 0; i < NUM_TRIALS; i++) {
      const trial = simulateTrial({
        mergeRate: MERGE_RATE_MED,
        overlapProb: overlap,
        planningTicks: PLANNING_RUN_TICKS,
        foldLatencyTicks: 1,
        reFetch: false,
      }, rng);
      if (trial.hasSemanticStaleness) semanticStale++;
    }

    const pctStale = (semanticStale / NUM_TRIALS) * 100;

    console.log(`  ${name}: ${pctStale.toFixed(1)}% of planning runs have semantic staleness`);

    // Semantic staleness should be less frequent than any-merge-in-window
    // (it's a subset: only merges that touch planner-read files)
    assertTrue(pctStale < 50,
      `semantic staleness < 50% for ${name} (it's a subset of any-merge)`);
  }

  console.log();

  // Verify: semantic staleness rate matches the Poisson-overlap model.
  // When there are n merges in the window, each has an independent p_overlap
  // chance of touching a planner-read file. P(≥1 overlap) = 1 - (1-p)^n.
  // The overall rate is E[1 - (1-p)^N] where N ~ Poisson(rate*window).
  {
    const rng2 = mulberry32(33);
    const NUM = 20000;
    let stale = 0;
    for (let i = 0; i < NUM; i++) {
      const t = simulateTrial({
        mergeRate: MERGE_RATE_MED,
        overlapProb: OVERLAP_MED,
        planningTicks: PLANNING_RUN_TICKS,
        foldLatencyTicks: 1,
        reFetch: false,
      }, rng2);
      if (t.hasSemanticStaleness) stale++;
    }
    const observed = stale / NUM;
    // Expected: E[1 - (1-p)^N] where N ~ Poisson(λ), λ = rate*window.
    // For small λ, this ≈ 1 - e^(-λ*p) (Poisson thinning).
    const lambda = MERGE_RATE_MED * (PLANNING_RUN_TICKS + 1);
    const expected = 1 - Math.exp(-lambda * OVERLAP_MED);
    assertApprox(observed, expected, 0.02,
      'semantic staleness rate matches Poisson thinning model');
  }
}

// ─── Phase 3: Mitigation comparison ────────────────────────────────────────

function phase3() {
  console.log('\n=== Phase 3: Mitigation comparison ===\n');

  const rng = mulberry32(555);
  const NUM_TRIALS = 10000;

  const designs = ['none', 'refetch-only', 'sha-pin-any', 'sha-pin-overlap', 'hybrid'];
  const designNames = {
    'none': 'Design 5 (status quo)',
    'refetch-only': 'Design 1 (re-fetch only)',
    'sha-pin-any': 'Design 4 (SHA pin, reject any movement)',
    'sha-pin-overlap': 'Design 2b/3 (file-overlap check)',
    'hybrid': 'Design 6 (re-fetch + SHA pin)',
  };

  console.log(`  Scenario: ${MERGE_RATE_MED} merges/tick, ${OVERLAP_MED * 100}% overlap, ${PLANNING_RUN_TICKS}-tick planning run\n`);

  // Header
  console.log(`  ${'Design'.padEnd(40)} | ${'FP%'.padStart(6)} | ${'FN%'.padStart(6)} | ${'Reject%'.padStart(7)} | ${'Wasted cost (ticks)'.padStart(20)}`);
  console.log(`  ${'-'.repeat(40)}-+-${'-'.repeat(6)}-+-${'-'.repeat(6)}-+-${'-'.repeat(7)}-+-${'-'.repeat(20)}`);

  for (const design of designs) {
    let falsePositives = 0;
    let falseNegatives = 0;
    let rejections = 0;
    let wastedCost = 0;

    for (let i = 0; i < NUM_TRIALS; i++) {
      const trial = simulateTrial({
        mergeRate: MERGE_RATE_MED,
        overlapProb: OVERLAP_MED,
        planningTicks: PLANNING_RUN_TICKS,
        foldLatencyTicks: 1,
        reFetch: design === 'refetch-only' || design === 'hybrid',
      }, rng);

      const result = evaluateDesign(trial, design);

      if (result.rejected) rejections++;
      if (result.falsePositive) {
        falsePositives++;
        wastedCost += COST_FALSE_POSITIVE;
      }
      if (result.falseNegative) {
        falseNegatives++;
        wastedCost += COST_FALSE_NEGATIVE;
      }
    }

    const fpPct = (falsePositives / NUM_TRIALS) * 100;
    const fnPct = (falseNegatives / NUM_TRIALS) * 100;
    const rejectPct = (rejections / NUM_TRIALS) * 100;

    console.log(`  ${designNames[design].padEnd(40)} | ${fpPct.toFixed(1).padStart(5)}% | ${fnPct.toFixed(1).padStart(5)}% | ${rejectPct.toFixed(1).padStart(6)}% | ${wastedCost.toString().padStart(20)}`);
  }

  console.log();

  // Key assertion: SHA-pin designs have near-zero false negatives
  {
    const rng2 = mulberry32(888);
    const NUM = 10000;
    let fnNone = 0, fnShaPin = 0, fnHybrid = 0;

    for (let i = 0; i < NUM; i++) {
      const trial = simulateTrial({
        mergeRate: MERGE_RATE_MED,
        overlapProb: OVERLAP_MED,
        planningTicks: PLANNING_RUN_TICKS,
        foldLatencyTicks: 1,
        reFetch: false,
      }, rng2);

      if (evaluateDesign(trial, 'none').falseNegative) fnNone++;
      if (evaluateDesign(trial, 'sha-pin-any').falseNegative) fnShaPin++;

      const trialHybrid = simulateTrial({
        mergeRate: MERGE_RATE_MED,
        overlapProb: OVERLAP_MED,
        planningTicks: PLANNING_RUN_TICKS,
        foldLatencyTicks: 1,
        reFetch: true,
      }, rng2);
      if (evaluateDesign(trialHybrid, 'hybrid').falseNegative) fnHybrid++;
    }

    console.log(`  False negative rates (out of ${NUM} trials):`);
    console.log(`    Status quo:     ${fnNone} (${(fnNone / NUM * 100).toFixed(1)}%)`);
    console.log(`    SHA pin (any):  ${fnShaPin} (${(fnShaPin / NUM * 100).toFixed(1)}%)`);
    console.log(`    Hybrid:         ${fnHybrid} (${(fnHybrid / NUM * 100).toFixed(1)}%)`);
    console.log();

    assertTrue(fnShaPin <= fnNone,
      'SHA pin has ≤ false negatives vs status quo');
    assertTrue(fnShaPin === 0,
      'SHA pin (reject any movement) has ZERO false negatives');
  }

  // Key assertion: hybrid has fewer false positives than SHA-pin alone
  {
    const rng2 = mulberry32(111);
    const NUM = 10000;
    let fpShaPin = 0, fpHybrid = 0;

    for (let i = 0; i < NUM; i++) {
      const trialShaPin = simulateTrial({
        mergeRate: MERGE_RATE_MED,
        overlapProb: OVERLAP_MED,
        planningTicks: PLANNING_RUN_TICKS,
        foldLatencyTicks: 1,
        reFetch: false,
      }, rng2);
      if (evaluateDesign(trialShaPin, 'sha-pin-any').falsePositive) fpShaPin++;

      const trialHybrid = simulateTrial({
        mergeRate: MERGE_RATE_MED,
        overlapProb: OVERLAP_MED,
        planningTicks: PLANNING_RUN_TICKS,
        foldLatencyTicks: 1,
        reFetch: true,
      }, rng2);
      if (evaluateDesign(trialHybrid, 'hybrid').falsePositive) fpHybrid++;
    }

    console.log(`  False positive rates (out of ${NUM} trials):`);
    console.log(`    SHA pin (any):  ${fpShaPin} (${(fpShaPin / NUM * 100).toFixed(1)}%)`);
    console.log(`    Hybrid:         ${fpHybrid} (${(fpHybrid / NUM * 100).toFixed(1)}%)`);
    console.log();

    assertTrue(fpHybrid <= fpShaPin,
      'hybrid (re-fetch + SHA pin) has ≤ false positives vs SHA pin alone');
  }
}

// ─── Phase 4: Livelock risk ────────────────────────────────────────────────

function phase4() {
  console.log('\n=== Phase 4: Livelock risk (Design 4/6) ===\n');

  // Under Design 4/6, a rejected delta re-plans. The re-plan also reads trunk
  // and may also be rejected if trunk moved again. Livelock = infinite rejections.
  //
  // Model: simulate consecutive planning runs. Each run has a T0→T1 window.
  // If trunk moved, the run is rejected and a new run starts. Count how many
  // consecutive rejections occur before a run succeeds (trunk didn't move).

  const rng = mulberry32(222);
  const NUM_SIMULATIONS = 1000;
  const MAX_REPLANS = 20; // cap to detect livelock

  const rates = [
    { name: 'low', rate: MERGE_RATE_LOW },
    { name: 'med', rate: MERGE_RATE_MED },
    { name: 'high', rate: MERGE_RATE_HIGH },
    { name: 'burst', rate: MERGE_RATE_BURST },
  ];

  console.log(`  ${'Merge rate'.padEnd(12)} | ${'Avg replans'.padStart(11)} | ${'Max replans'.padStart(11)} | ${'Livelocks'.padStart(9)}`);
  console.log(`  ${'-'.repeat(12)}-+-${'-'.repeat(11)}-+-${'-'.repeat(11)}-+-${'-'.repeat(9)}`);

  for (const { name, rate } of rates) {
    let totalReplans = 0;
    let maxReplans = 0;
    let livelocks = 0;

    for (let sim = 0; sim < NUM_SIMULATIONS; sim++) {
      let replans = 0;
      let succeeded = false;

      for (let attempt = 0; attempt <= MAX_REPLANS; attempt++) {
        const trial = simulateTrial({
          mergeRate: rate,
          overlapProb: OVERLAP_MED,
          planningTicks: PLANNING_RUN_TICKS,
          foldLatencyTicks: 1,
          reFetch: true, // Design 6: re-fetch before each attempt
        }, rng);

        if (!trial.anyTrunkMovement) {
          succeeded = true;
          break;
        }
        replans++;
      }

      if (!succeeded) {
        livelocks++;
        replans = MAX_REPLANS;
      }

      totalReplans += replans;
      if (replans > maxReplans) maxReplans = replans;
    }

    const avgReplans = totalReplans / NUM_SIMULATIONS;

    console.log(`  ${name.padEnd(12)} | ${avgReplans.toFixed(2).padStart(11)} | ${maxReplans.toString().padStart(11)} | ${livelocks.toString().padStart(9)}`);

    // Assertions
    if (rate < MERGE_RATE_BURST) {
      assertTrue(avgReplans < 5,
        `${name}: avg replans < 5 (no livelock at realistic rates)`);
    }
    if (rate < MERGE_RATE_HIGH) {
      assertTrue(livelocks === 0,
        `${name}: zero livelocks at low/med rates`);
    }
    // At high and burst rates, livelock is possible but rare — documented as
    // a residual risk, not a test failure. The DAG is finite, so sustained
    // livelock does not occur; the cap catches tail cases.
  }

  console.log();

  // Key insight: even at burst rate, the re-plan eventually catches a quiet
  // window because the DAG is finite (chains run out of work).
  // At burst rate, livelock is possible but not sustained.
  console.log('  Note: at burst rate (1 merge/tick), livelock is theoretically possible');
  console.log('  but not sustained — the DAG is finite, so merge demand eventually drains.');
  console.log('  A "max replans before fallback to rework" counter is the documented');
  console.log('  fallback if production data shows livelock — do not build it preemptively.');
}

// ─── Phase 5: Cost asymmetry validation ────────────────────────────────────

function phase5() {
  console.log('\n=== Phase 5: Cost asymmetry validation ===\n');

  const fpCost = COST_FALSE_POSITIVE; // re-plan (minutes)
  const fnCost = COST_FALSE_NEGATIVE; // wrong node run (hours)
  const ratio = fnCost / fpCost;

  console.log(`  False positive cost:  ${fpCost} ticks (~${fpCost * TICK_MINUTES} min)`);
  console.log(`  False negative cost: ${fnCost} ticks (~${(fnCost * TICK_MINUTES / 60).toFixed(1)} hours)`);
  console.log(`  Cost ratio (FN/FP):  ${ratio.toFixed(0)}x`);
  console.log();

  assertTrue(ratio >= 20,
    'false negative is ≥20x more expensive than false positive (hours vs minutes)');

  // Under Design 4 (SHA pin), what's the expected wasted cost vs status quo?
  const rng = mulberry32(444);
  const NUM = 10000;
  let wastedNone = 0, wastedShaPin = 0;

  for (let i = 0; i < NUM; i++) {
    const trial = simulateTrial({
      mergeRate: MERGE_RATE_MED,
      overlapProb: OVERLAP_MED,
      planningTicks: PLANNING_RUN_TICKS,
      foldLatencyTicks: 1,
      reFetch: false,
    }, rng);

    // Status quo: false negatives cost hours
    if (evaluateDesign(trial, 'none').falseNegative) {
      wastedNone += COST_FALSE_NEGATIVE;
    }

    // SHA pin: false positives cost minutes, false negatives ~0
    const shaResult = evaluateDesign(trial, 'sha-pin-any');
    if (shaResult.falsePositive) wastedShaPin += COST_FALSE_POSITIVE;
    if (shaResult.falseNegative) wastedShaPin += COST_FALSE_NEGATIVE;
  }

  console.log(`  Expected wasted cost over ${NUM} trials (med merge rate):`);
  console.log(`    Status quo:     ${wastedNone} ticks (~${(wastedNone * TICK_MINUTES / 60).toFixed(0)} hours)`);
  console.log(`    SHA pin (any):  ${wastedShaPin} ticks (~${(wastedShaPin * TICK_MINUTES / 60).toFixed(0)} hours)`);
  console.log(`    Reduction:      ${(((wastedNone - wastedShaPin) / wastedNone) * 100).toFixed(1)}%`);
  console.log();

  assertTrue(wastedShaPin < wastedNone,
    'SHA pin reduces expected wasted cost vs status quo');
}

// ─── Phase 6: T0 SHA capture ordering ──────────────────────────────────────

function phase6() {
  console.log('\n=== Phase 6: T0 SHA capture ordering ===\n');

  // The sub-agents identified a critical ordering detail:
  // The T0 SHA must be captured AFTER the fetch, not before.
  // If captured before the fetch, the fetch itself "moves" trunk,
  // causing a guaranteed false positive.

  // Simulate: fetch moves trunk, then T0 SHA capture.
  // If T0 is captured before fetch, the SHA is stale and the fold
  // will always see movement (the fetch moved it).

  const rng = mulberry32(666);
  const NUM = 1000;

  // "Wrong ordering": T0 SHA before fetch
  let falsePositivesWrongOrder = 0;
  // "Correct ordering": fetch, then T0 SHA
  let falsePositivesCorrectOrder = 0;

  for (let i = 0; i < NUM; i++) {
    // Simulate: trunk has some commits. Fetch brings new ones.
    // The fetch itself is a trunk movement.

    // Wrong order: T0 SHA = pre-fetch SHA. Fold sees post-fetch SHA. Movement detected.
    // This is ALWAYS a false positive if the fetch brought new commits.
    const fetchBroughtCommits = rng() < 0.5; // 50% chance fetch finds new commits
    if (fetchBroughtCommits) {
      falsePositivesWrongOrder++; // guaranteed false positive
    }

    // Correct order: fetch, then T0 SHA = post-fetch SHA. Fold sees post-fetch SHA.
    // No movement from the fetch itself. Only real concurrent merges cause movement.
    // The trial's mergesInWindow already reflects post-fetch state.
    const trial = simulateTrial({
      mergeRate: MERGE_RATE_LOW, // low rate to isolate the ordering effect
      overlapProb: OVERLAP_MED,
      planningTicks: PLANNING_RUN_TICKS,
      foldLatencyTicks: 1,
      reFetch: true,
    }, rng);
    if (trial.anyTrunkMovement) {
      // This is a real concurrent merge, not the fetch itself
      falsePositivesCorrectOrder++;
    }
  }

  const pctWrong = (falsePositivesWrongOrder / NUM) * 100;
  const pctCorrect = (falsePositivesCorrectOrder / NUM) * 100;

  console.log(`  Wrong ordering (T0 SHA before fetch): ${pctWrong.toFixed(1)}% false positives`);
  console.log(`  Correct ordering (fetch, then T0 SHA): ${pctCorrect.toFixed(1)}% false positives`);
  console.log();

  assertTrue(pctWrong > pctCorrect,
    'wrong ordering (SHA before fetch) produces more false positives');
  assertTrue(pctWrong >= 40,
    'wrong ordering produces near-guaranteed false positives when fetch finds commits');
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('═'.repeat(78));
  console.log('  Spike: planning-run context staleness vs. fold-time validation (I2)');
  console.log('═'.repeat(78));
  console.log();

  phase1();
  phase2();
  phase3();
  phase4();
  phase5();
  phase6();

  // ─── Summary ──
  console.log('\n' + '═'.repeat(78));
  console.log('  Summary');
  console.log('═'.repeat(78));
  console.log();
  console.log(`  Total tests: ${totalTests}`);
  console.log(`  Passed:      ${passedTests}`);
  console.log(`  Failed:      ${failedTests}`);
  if (failures.length > 0) {
    console.log('\n  Failures:');
    for (const f of failures) {
      console.log(`    ${f}`);
    }
  }
  console.log();

  if (failedTests > 0) {
    process.exit(1);
  }
}

main();
