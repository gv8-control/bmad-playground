// Resolve the playbook into the ordered list of steps for one story run.
//
//   node scripts/pipeline/get-steps.mjs <story-id>
//
// Prints a JSON array of enabled steps; the n8n story pipeline iterates it.
import { readPlaybook, fail } from './lib.mjs';

const story = (process.argv[2] ?? '').trim();
if (!/^\d+\.\d+$/.test(story)) fail(`Usage: get-steps.mjs <story-id>; got "${story}"`);

const playbook = readPlaybook();

const steps = playbook.steps.filter((s) => s.enabled);
if (steps.length === 0) fail('Playbook has no enabled steps');

const items = steps.map((s, i) => ({
  index: i + 1,
  total: steps.length,
  id: s.id,
  label: s.label,
  skill: s.skill,
  agent: s.agent,
  prompt: s.prompt,
  origin: s.origin,
  story,
}));

const incompleteContinueCap = Number(playbook.policy?.incompleteContinueCap);
process.stdout.write(
  JSON.stringify({
    steps: items,
    incompleteContinueCap: Number.isFinite(incompleteContinueCap) ? incompleteContinueCap : 10,
  }) + '\n'
);
