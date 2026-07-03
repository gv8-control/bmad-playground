// Decide what the 'Develop Epic' loop should do next.
//
//   node scripts/pipeline/next-story.mjs <epic-number>
//
// Prints one JSON object:
//   { action: "run", story, storyKey, storyStatus, attempt, runId }
//   { action: "epic-complete", epic }
//   { action: "halt", reason }
import { PATHS, readJsonl, readPlaybook, readSprintStatus, storyIdFromKey, fail, output } from './lib.mjs';

const epic = (process.argv[2] ?? '').trim();
if (!/^\d+$/.test(epic)) fail(`Usage: next-story.mjs <epic-number>; got "${epic}"`);

const entries = readSprintStatus();
const epicEntry = entries.find((e) => e.key === `epic-${epic}`);
if (!epicEntry) {
  output({ action: 'halt', reason: `Epic ${epic} not found in sprint-status.yaml` });
  process.exit(0);
}

const storyPattern = new RegExp(`^${epic}-\\d+-`);
const stories = entries.filter((e) => storyPattern.test(e.key));
if (stories.length === 0) {
  output({ action: 'halt', reason: `Epic ${epic} has no stories in sprint-status.yaml` });
  process.exit(0);
}

const candidate = stories.find((e) => e.status.toLowerCase() !== 'done');
if (!candidate) {
  output({ action: 'epic-complete', epic });
  process.exit(0);
}

const story = storyIdFromKey(candidate.key);
const { policy } = readPlaybook();
const attempts = readJsonl(PATHS.journal).filter((e) => e.type === 'story_start' && e.story === story).length;

if (attempts >= policy.maxAttemptsPerStory) {
  output({
    action: 'halt',
    reason: `Story ${story} (${candidate.key}) is "${candidate.status}" after ${attempts} attempt(s); maxAttemptsPerStory=${policy.maxAttemptsPerStory}. Human review needed.`,
  });
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
output({
  action: 'run',
  story,
  storyKey: candidate.key,
  storyStatus: candidate.status,
  attempt: attempts + 1,
  runId: `${story}-a${attempts + 1}-${stamp}`,
});
