// Deterministic gatekeeper between the reflection agent and the playbook.
// Reads the proposal the reflection run wrote, validates every part against
// the playbook policy, applies what passes, records everything in the ledger.
// The LLM proposes; this script decides.
//
//   node scripts/pipeline/apply-amendments.mjs <run-id>
//
// Prints a JSON summary: { applied, rejected, retired, observations }
import fs from 'node:fs';
import path from 'node:path';
import { PATHS, readPlaybook, writePlaybook, readJsonl, appendJsonl, fail, output, nowIso } from './lib.mjs';

const runId = (process.argv[2] ?? '').trim();
if (!runId || runId.includes('/') || runId.includes('..')) fail('Usage: apply-amendments.mjs <run-id>');

const proposalPath = path.join(PATHS.proposalsDir, `${runId}.json`);
if (!fs.existsSync(proposalPath)) {
  output({ applied: [], rejected: [], retired: [], observations: 0, note: 'no proposal file; nothing to apply' });
  process.exit(0);
}

let proposal;
try {
  proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));
} catch (e) {
  appendJsonl(PATHS.ledger, { ts: nowIso(), runId, type: 'rejected', reason: `unparseable proposal: ${e.message}` });
  output({ applied: [], rejected: [`unparseable proposal: ${e.message}`], retired: [], observations: 0 });
  process.exit(0);
}

const story = proposal.story ?? 'unknown';
const playbook = readPlaybook();
const { policy, config } = playbook;
const applied = [];
const rejected = [];
const retired = [];

// 1. Observations: always recorded. Recurrence across distinct runs is what
//    later authorizes an add_step — this is the signal-vs-noise memory.
const observations = Array.isArray(proposal.observations) ? proposal.observations : [];
for (const obs of observations) {
  if (!obs.fingerprint || !obs.summary) {
    rejected.push(`observation missing fingerprint/summary: ${JSON.stringify(obs).slice(0, 120)}`);
    continue;
  }
  appendJsonl(PATHS.ledger, {
    ts: nowIso(),
    runId,
    story,
    type: 'observation',
    fingerprint: obs.fingerprint,
    summary: obs.summary,
    evidence: obs.evidence ?? '',
    grade: obs.grade ?? 'confirmed',
    hypothesis: obs.hypothesis ?? '',
    nextStep: obs.nextStep ?? '',
  });
}

// Recurrence = distinct runIds that observed a fingerprint (including this run).
const ledger = readJsonl(PATHS.ledger);
const recurrence = (fingerprint) =>
  new Set(ledger.filter((e) => e.type === 'observation' && e.fingerprint === fingerprint).map((e) => e.runId)).size;

// 2. Guard reports: learned steps that keep finding nothing earn retirement.
const guardReports = Array.isArray(proposal.guardReports) ? proposal.guardReports : [];
for (const report of guardReports) {
  const step = playbook.steps.find((s) => s.id === report.stepId);
  if (!step || step.origin !== 'learned' || !step.enabled) continue;
  step.cleanStreak = report.fired ? 0 : (step.cleanStreak ?? 0) + 1;
  if (step.cleanStreak >= policy.retireCleanStreak) {
    step.enabled = false;
    step.retiredAt = nowIso();
    step.retiredReason = `clean for ${step.cleanStreak} consecutive runs (threshold ${policy.retireCleanStreak})`;
    retired.push(step.id);
    appendJsonl(PATHS.ledger, { ts: nowIso(), runId, story, type: 'retired', stepId: step.id, reason: step.retiredReason });
  }
}

// 3. Amendments: validated against policy; core steps can be tuned (update_step)
//    but never retired by the machine.
const amendments = Array.isArray(proposal.amendments) ? proposal.amendments : [];
const learnedCount = () => playbook.steps.filter((s) => s.origin === 'learned' && s.enabled).length;

for (const a of amendments) {
  if (a.type === 'add_step') {
    const s = a.step ?? {};
    const fingerprints = Array.isArray(a.evidenceFingerprints) ? a.evidenceFingerprints : [];
    const reasons = [];
    if (!/^[a-z0-9][a-z0-9-]+$/.test(s.id ?? '')) reasons.push('invalid step id');
    if (playbook.steps.some((x) => x.id === s.id)) reasons.push(`step id "${s.id}" already exists`);
    if (!/^bmad-/.test(s.skill ?? '')) reasons.push('skill must be a bmad-* skill');
    if (!config.allowedAgents.includes(s.agent)) reasons.push(`agent must be one of ${config.allowedAgents.join(', ')}`);
    if (!s.label || typeof s.prompt !== 'string') reasons.push('label and prompt are required');
    if (learnedCount() >= policy.maxLearnedSteps) reasons.push(`learned step cap reached (${policy.maxLearnedSteps})`);
    // infra-* fingerprints record machinery failures (runner, provider, n8n);
    // a playbook step cannot fix those, so they never justify an amendment.
    const infraFps = fingerprints.filter((f) => f.startsWith('infra-'));
    if (infraFps.length > 0) reasons.push(`infra-* fingerprints are not amendment evidence (machinery fixes are human-only): ${infraFps.join(', ')}`);
    const recurring = fingerprints.filter((f) => !f.startsWith('infra-') && recurrence(f) >= policy.addStepRecurrenceThreshold);
    if (recurring.length === 0)
      reasons.push(
        `no evidence fingerprint recurs across >= ${policy.addStepRecurrenceThreshold} distinct runs (signal threshold not met)`
      );
    const anchor = a.position?.before ?? a.position?.after;
    const anchorIdx = playbook.steps.findIndex((x) => x.id === anchor);
    if (anchorIdx === -1) reasons.push(`position anchor "${anchor}" not found`);

    if (reasons.length > 0) {
      rejected.push(`add_step ${s.id ?? '?'}: ${reasons.join('; ')}`);
      appendJsonl(PATHS.ledger, { ts: nowIso(), runId, story, type: 'rejected', amendment: a, reasons });
      continue;
    }
    const newStep = {
      id: s.id,
      label: s.label,
      // Own stage: a learned step is never order-independent with its
      // neighbours until a human says so.
      stage: s.id,
      skill: s.skill,
      agent: s.agent,
      prompt: s.prompt,
      enabled: true,
      origin: 'learned',
      addedAt: nowIso(),
      addedByRun: runId,
      evidenceFingerprints: recurring,
      cleanStreak: 0,
    };
    // Never insert inside a stage group — adjacent same-stage steps are
    // order-independent, and a step between them would impose an order.
    // Shift to the group edge that keeps the requested before/after true.
    let insertIdx = a.position?.before ? anchorIdx : anchorIdx + 1;
    const stageAt = (i) => playbook.steps[i]?.stage;
    if (a.position?.before) {
      while (insertIdx > 0 && stageAt(insertIdx - 1) !== undefined && stageAt(insertIdx - 1) === stageAt(insertIdx)) insertIdx--;
    } else {
      while (insertIdx < playbook.steps.length && stageAt(insertIdx) !== undefined && stageAt(insertIdx) === stageAt(insertIdx - 1)) insertIdx++;
    }
    playbook.steps.splice(insertIdx, 0, newStep);
    applied.push(`add_step ${s.id}`);
    appendJsonl(PATHS.ledger, { ts: nowIso(), runId, story, type: 'applied', amendment: 'add_step', stepId: s.id, rationale: a.rationale ?? '' });
  } else if (a.type === 'retire_step' || a.type === 'update_step') {
    const step = playbook.steps.find((x) => x.id === a.stepId);
    const reasons = [];
    if (!step) reasons.push(`step "${a.stepId}" not found`);
    // Core steps can have their prompt tuned by the machine, but retirement
    // (removing a step from the run) stays human-only regardless of origin.
    else if (a.type === 'retire_step' && step.origin !== 'learned') reasons.push('core steps cannot be retired by the machine');
    if (a.type === 'update_step' && typeof a.prompt !== 'string') reasons.push('update_step requires a prompt');

    if (reasons.length > 0) {
      rejected.push(`${a.type} ${a.stepId ?? '?'}: ${reasons.join('; ')}`);
      appendJsonl(PATHS.ledger, { ts: nowIso(), runId, story, type: 'rejected', amendment: a, reasons });
      continue;
    }
    if (a.type === 'retire_step') {
      step.enabled = false;
      step.retiredAt = nowIso();
      step.retiredReason = a.rationale ?? 'retired by reflection proposal';
      retired.push(step.id);
    } else {
      step.prompt = a.prompt;
      step.updatedAt = nowIso();
      step.updatedByRun = runId;
    }
    applied.push(`${a.type} ${a.stepId}`);
    appendJsonl(PATHS.ledger, { ts: nowIso(), runId, story, type: 'applied', amendment: a.type, stepId: a.stepId, stepOrigin: step.origin, rationale: a.rationale ?? '' });
  } else {
    rejected.push(`unknown amendment type "${a.type}"`);
    appendJsonl(PATHS.ledger, { ts: nowIso(), runId, story, type: 'rejected', amendment: a, reasons: ['unknown type'] });
  }
}

writePlaybook(playbook);
output({ applied, rejected, retired, observations: observations.length });
