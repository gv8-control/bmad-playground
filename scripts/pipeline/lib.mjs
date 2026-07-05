// Shared helpers for the gen-2 self-improving pipeline scripts.
// Dependency-free on purpose: these run inside n8n executeCommand nodes and
// must behave deterministically regardless of workspace install state.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PATHS = {
  playbook: path.join(REPO_ROOT, '_bmad-output', 'pipeline', 'playbook.json'),
  journal: path.join(REPO_ROOT, '_bmad-output', 'pipeline', 'journal.jsonl'),
  ledger: path.join(REPO_ROOT, '_bmad-output', 'pipeline', 'ledger.jsonl'),
  proposalsDir: path.join(REPO_ROOT, '_bmad-output', 'pipeline', 'proposals'),
  sprintStatus: path.join(REPO_ROOT, '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml'),
};

export function readPlaybook() {
  return JSON.parse(fs.readFileSync(PATHS.playbook, 'utf8'));
}

export function writePlaybook(playbook) {
  fs.writeFileSync(PATHS.playbook, JSON.stringify(playbook, null, 2) + '\n');
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

export function appendJsonl(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

// sprint-status.yaml is intentionally flat under development_status;
// parse only two-space-indented "key: value" lines, same as the gen-1
// webhook validator did.
export function readSprintStatus() {
  const text = fs.readFileSync(PATHS.sprintStatus, 'utf8');
  const entries = [];
  let inBlock = false;
  for (const line of text.split('\n')) {
    if (/^development_status:\s*$/.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock && /^\S/.test(line)) inBlock = false;
    if (!inBlock) continue;
    const m = line.match(/^\s{2}([\w-]+):\s*(\S+)\s*$/);
    if (m) entries.push({ key: m[1], status: m[2] });
  }
  return entries;
}

// "2-1-mirror-repository-artifacts" -> "2.1"
export function storyIdFromKey(key) {
  const m = key.match(/^(\d+)-(\d+)-/);
  return m ? `${m[1]}.${m[2]}` : null;
}

export function nowIso() {
  return new Date().toISOString();
}

export function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(1);
}

export function output(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}
