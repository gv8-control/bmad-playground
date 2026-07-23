// Atomic write + read primitives for pipeline state files.
//
// atomicWrite: writes to a temp file on the same filesystem, fsyncs the fd,
// then renameSyncs to the target. The fsync-before-rename ordering is the
// durability guarantee on ext4 (spike finding F2 — fsync matters on ext4, not
// tmpfs, but we do it unconditionally). No await between fsync and rename —
// ordering is the guarantee.
//
// atomicReadJSON: parses with a fallback on missing/malformed files. A viewer
// keeps last-good state on parse failure; this helper is for code that wants
// a typed fallback.

import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

/**
 * Atomically write content to filePath.
 *
 * Writes to <filePath>.tmp.<pid>, fsyncs the fd, then renameSyncs to the
 * target. The temp file is cleaned up if rename fails.
 */
export function atomicWrite(filePath, content) {
  const tmp = `${filePath}.tmp.${process.pid}`;
  const fd = openSync(tmp, 'w', 0o644);
  try {
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
  } catch (err) {
    try {
      closeSync(fd);
    } catch {
      // fd may already be closed
    }
    try {
      unlinkSync(tmp);
    } catch {
      // temp file may not exist; ignore
    }
    throw err;
  }
  renameSync(tmp, filePath);
}

/**
 * Read and parse a JSON file, returning fallback on missing/malformed.
 *
 * For code that wants a typed default rather than crash-on-parse-failure.
 * A viewer keeping last-good state should manage its own fallback.
 */
export function atomicReadJSON(filePath, fallback) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
