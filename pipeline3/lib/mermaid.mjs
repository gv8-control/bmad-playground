// Mermaid graph view generator for the gen-3 pipeline.
//
// Generates a Markdown file containing a Mermaid flowchart from the pipeline's
// graph.json state. The dispatcher regenerates this on every graph mutation
// (see graph-pipeline.md: Viewer, line 1445). Viewable in VS Code preview
// (with the mermaid extension) and on GitHub after push. Zero infrastructure.
//
// Pure JS: Node stdlib + ./atomic.mjs + ./paths.mjs only.

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { atomicWrite } from './atomic.mjs';
import { stateDir } from './paths.mjs';

// Status → fill color. Kept in sync with STATUS in graph.mjs.
const STATUS_COLORS = {
  pending: '#f0f0f0',
  claimed: '#d4e6f1',
  parked: '#fce4d6',
  completed: '#d5e8d4',
  failed: '#f8cecc',
  abandoned: '#e1d5e7',
  merged: '#b8e0b8',
};

// A node is "merged" when it carries mergeTo and its merge has landed.
// We honor an explicit `merged` field if present; otherwise a completed
// merge-point node counts as merged (step 4 semantics: completed = merged).
function isMerged(node) {
  if (!node.mergeTo) return false;
  if (typeof node.merged === 'boolean') return node.merged;
  return node.status === 'completed';
}

// Sanitize a node id for use as a Mermaid node identifier.
function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_]/g, '_');
}

// Escape text for Mermaid label (double-quote delimited).
function esc(text) {
  return String(text ?? '').replace(/["\\]/g, '\\$&');
}

/**
 * Generate a complete Markdown file (with a Mermaid flowchart) from a graph.
 *
 * @param {object} graph - graph state (same shape as graph.json)
 * @returns {string} Markdown content
 */
export function generateMermaid(graph) {
  const runId = graph?.runId ?? null;
  const paused = Boolean(graph?.paused);
  const generatedAt = new Date().toISOString();
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];

  const lines = [];
  lines.push(`# Pipeline graph view`);
  lines.push('');
  lines.push(`- **runId:** ${runId ?? '(unassigned)'}`);
  lines.push(`- **paused:** ${paused}`);
  lines.push(`- **generatedAt:** ${generatedAt}`);
  lines.push(`- **nodes:** ${nodes.length}`);
  lines.push('');

  if (nodes.length === 0) {
    lines.push('> No nodes in the graph yet.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('```mermaid');
  lines.push('flowchart TD');

  // classDef blocks
  for (const [status, color] of Object.entries(STATUS_COLORS)) {
    lines.push(`  classDef ${status} fill:${color},stroke:#333,stroke-width:1px;`);
  }

  // Group nodes by chainId, preserving first-seen order.
  const chains = [];
  const chainIndex = new Map();
  for (const n of nodes) {
    if (!chainIndex.has(n.chainId)) {
      chainIndex.set(n.chainId, chains.length);
      chains.push({ chainId: n.chainId, nodes: [] });
    }
    chains[chainIndex.get(n.chainId)].nodes.push(n);
  }

  // Map original node id → sanitized id (for edges).
  const idMap = new Map();
  for (const n of nodes) idMap.set(n.id, safeId(n.id));

  // Emit subgraphs.
  for (const { chainId, nodes: cnodes } of chains) {
    lines.push(`  subgraph chain-${safeId(chainId)}`);
    for (const n of cnodes) {
      const sid = idMap.get(n.id);
      const label = `${esc(n.chainId)}/${esc(n.id)} · ${esc(n.skill)} · ${esc(n.status)}`;
      // Merge-point nodes use the subroutine shape [[ ]].
      if (n.mergeTo) {
        lines.push(`    ${sid}[["${label}"]]`);
      } else {
        lines.push(`    ${sid}["${label}"]`);
      }
      // Status class (merged takes precedence over completed for merge points).
      const cls = isMerged(n) ? 'merged' : (STATUS_COLORS[n.status] ? n.status : 'pending');
      lines.push(`    class ${sid} ${cls};`);
    }
    lines.push('  end');
  }

  // Emit dependsOn edges (solid arrows). Cross-chain edges are drawn naturally.
  for (const n of nodes) {
    const deps = Array.isArray(n.dependsOn) ? n.dependsOn : [];
    const to = idMap.get(n.id);
    for (const dep of deps) {
      const from = idMap.get(dep);
      if (from) lines.push(`  ${from} --> ${to}`);
    }
  }

  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

/**
 * Generate the Mermaid view and write it atomically to outputPath.
 *
 * @param {object} graph - graph state
 * @param {string} [outputPath] - target path (default: stateDir/graph-view.md)
 */
export function writeMermaidView(graph, outputPath) {
  const target = outputPath ?? join(stateDir, 'graph-view.md');
  atomicWrite(target, generateMermaid(graph));
  return target;
}

// ─── Self-test ───────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  let tests = 0, failures = 0;
  function assert(name, cond) {
    tests++;
    if (cond) { console.log(`  \u2713 ${name}`); }
    else { failures++; console.error(`  \u2717 ${name}`); }
  }

  console.log('\nmermaid.mjs self-test');

  // --- Empty graph ---
  console.log('\nempty graph');
  const empty = generateMermaid({ runId: null, paused: false, nodes: [] });
  assert('empty graph has no-nodes message', empty.includes('No nodes in the graph'));
  assert('empty graph has no mermaid block', !empty.includes('```mermaid'));

  // --- Simple 3-node chain ---
  console.log('\nsimple 3-node chain');
  const chain = generateMermaid({
    runId: 'r1', paused: false, nodes: [
      { id: 'n1', chainId: 'c1', skill: 'a', status: 'completed', dependsOn: [] },
      { id: 'n2', chainId: 'c1', skill: 'b', status: 'claimed', dependsOn: ['n1'] },
      { id: 'n3', chainId: 'c1', skill: 'c', status: 'pending', dependsOn: ['n2'] },
    ],
  });
  assert('has flowchart TD', chain.includes('flowchart TD'));
  assert('has subgraph chain-c1', chain.includes('subgraph chain-c1'));
  assert('has n1->n2 edge', chain.includes('n1 --> n2'));
  assert('has n2->n3 edge', chain.includes('n2 --> n3'));
  assert('label includes skill', chain.includes('· b ·'));

  // --- Merge-point node ---
  console.log('\nmerge-point node');
  const merge = generateMermaid({
    runId: 'r1', paused: false, nodes: [
      { id: 'mp1', chainId: 'c1', skill: 'merge', status: 'completed', dependsOn: [], mergeTo: 'main' },
    ],
  });
  assert('merge point uses subroutine shape', merge.includes('mp1[["'));
  assert('merge point gets merged class', /class mp1 merged;/.test(merge));

  // --- Cross-chain dependency ---
  console.log('\ncross-chain dependency');
  const cross = generateMermaid({
    runId: 'r1', paused: false, nodes: [
      { id: 'a', chainId: 'ca', skill: 's', status: 'completed', dependsOn: [], mergeTo: 'main' },
      { id: 'b', chainId: 'cb', skill: 's', status: 'pending', dependsOn: ['a'] },
    ],
  });
  assert('two subgraphs present', cross.includes('subgraph chain-ca') && cross.includes('subgraph chain-cb'));
  assert('cross-chain edge drawn', cross.includes('a --> b'));

  // --- Status colors via classDef ---
  console.log('\nstatus colors');
  const colors = generateMermaid({
    runId: 'r1', paused: false, nodes: [
      { id: 'p', chainId: 'c', skill: 's', status: 'pending', dependsOn: [] },
      { id: 'f', chainId: 'c', skill: 's', status: 'failed', dependsOn: [] },
    ],
  });
  assert('classDef pending fill', colors.includes('classDef pending fill:#f0f0f0'));
  assert('classDef failed fill', colors.includes('classDef failed fill:#f8cecc'));
  assert('pending node assigned pending class', /class p pending;/.test(colors));
  assert('failed node assigned failed class', /class f failed;/.test(colors));

  // --- Paused state in header ---
  console.log('\npaused state in header');
  const paused = generateMermaid({ runId: 'r1', paused: true, nodes: [] });
  assert('header shows paused true', paused.includes('**paused:** true'));
  assert('header shows runId', paused.includes('**runId:** r1'));

  console.log(`\n${tests - failures}/${tests} passed`);
  if (failures > 0) {
    console.error('\u2717 self-test FAILED');
    process.exit(1);
  } else {
    console.log('\u2705 self-test passed');
  }
}
