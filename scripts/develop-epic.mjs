// Trigger the 'Develop Epic' n8n webhook.
//
//   node scripts/develop-epic.mjs [epic-number]
//
// Defaults to epic 2 when no argument is provided, matching the default
// in the n8n 'Configuration' node and docs/self-improving-pipeline.md.
import { execSync } from 'node:child_process';

const epic = process.argv[2] ?? '2';
if (!/^\d+$/.test(epic)) {
  console.error(`Usage: develop-epic.mjs <epic-number>; got "${epic}"`);
  process.exit(1);
}

const body = JSON.stringify({ epic });
const url = 'http://localhost:5678/webhook/develop-epic';

execSync(
  `curl -s --fail-with-body -X POST ${url} -H 'Content-Type: application/json' -d '${body}'`,
  { stdio: 'inherit' },
);
