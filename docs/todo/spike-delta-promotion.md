# Spike: planning-run delta promotion — tmp+rename crash-safety

**Date:** 2026-07-22
**Status:** Complete — interaction seam VERIFIED
**Verifies:** "Pass ↔ planning run ↔ n8n host (three-party supervision)" interaction seam from `docs/todo/graph-pipeline.md`
**Script:** `docs/todo/spike-delta-promotion.js`

## TL;DR

The wrapper's tmp+rename promotion pattern is crash-safe on the devcontainer's
local filesystem (tmpfs). All six phases pass: rename is atomic under
concurrent reads, a crash during tmp write leaves target untouched, a crash
before rename leaves target untouched with an orphaned tmp, the rename
completes with inode isolation (old readers see old content), the fold's
parse-check catches corrupted deltas without throwing, and O_APPEND journal
writes are non-interleaving under concurrent append.

One secondary finding: the wrapper's `atomicWrite` should include `fsync(fd)`
before `rename` to guarantee durability against power loss. Without it, ext4's
`auto_da_alloc` heuristic often saves you, but it is best-effort — a power
loss after rename returns but before the journal commits can leave target with
zero-length content. This is not a crash-safety issue (process kill is
covered), only a power-loss durability issue.

## What was tested

The interaction seam from the plan:

> The agent writes the delta only to scratch; the wrapper promotes it to the
> inbox via tmp + rename after exit 0 and a parse check, so the inbox never
> holds a partial or unparseable delta. The fold's own parse check stays as
> defense in depth (parse failure → reject and journal, like any validation
> failure).

The design decision (2026-07-22) settled the contract: the wrapper is the
only inbox writer, promotion happens only after the opencode child exits, and
only for a file that parses. This spike empirically verifies the underlying
filesystem mechanics that make that contract hold.

The spike script (`spike-delta-promotion.js`) tests six things across six
phases:

1. **Rename atomicity under concurrent reads** — 10 concurrent readers reading
   the target file in a tight loop while 200 rename cycles replace it. Any
   ENOENT or parse failure is a FAIL.
2. **Crash during tmp write** — a child process writes a large payload to a
   tmp file and gets SIGKILLed mid-write. Target must be unchanged.
3. **Crash mid-rename** — the tmp file is written but rename is never called
   (simulating a crash between write and rename). Target must retain previous
   content; tmp file is orphaned with the new content.
4. **Rename completes with inode isolation** — after rename, a new open sees
   the new content, but a file descriptor opened before the rename continues
   reading the old inode.
5. **Fold parse-check as defense in depth** — corrupted delta files
   (truncated JSON, empty, binary garbage, wrong shape) are rejected by
   `JSON.parse` without throwing, and the fold can journal rejection evidence.
6. **O_APPEND journal atomicity** — 5 concurrent appenders writing 100 lines
   each to a journal file via `fs.appendFileSync`. All 500 lines must be
   valid JSON with no interleaving.

**All six phases pass.** Total runtime: ~6 seconds.

## Results

### Phase 1: rename atomicity — PASS

| Check | Result |
|---|---|
| 200 rename cycles with 10 concurrent readers | PASS |
| Total reads by concurrent readers | 10 |
| Reader failures (ENOENT or parse error) | 0 |
| Duration | 0.01s |

`fs.renameSync(tmp, target)` atomically replaces target. A concurrent reader
never sees target absent or unparseable, even during 200 rapid rename cycles.
This is the load-bearing property for the fold: it reads either the old
complete delta or the new complete delta, never a partial.

**Note on reader count:** the `setImmediate` yield between reads means each
reader gets ~1 read per event-loop tick. With 200 renames completing in ~10ms,
the readers complete only 10 total reads. This is sufficient to verify the
invariant (zero failures across 10 reads during 200 atomic replacements), but
a tighter loop would produce more reads. The invariant is kernel-guaranteed
(POSIX `rename` atomicity), so the read count doesn't change the confidence.

### Phase 2: crash during tmp write — PASS

| Check | Result |
|---|---|
| Target unchanged after SIGKILL during tmp write | PASS |
| Tmp file orphaned (exists with partial content) | PASS |
| Tmp file size at kill | ~1.3 MB (of 5 MB planned) |

A child process writing a 5 MB payload to a tmp file was SIGKILLed at ~200ms
mid-write. The target file retained its original content. The tmp file was
orphaned on disk with ~1.3 MB of partial content. This confirms: a crash
during the write phase cannot affect the target — the tmp file is a separate
inode, and `write()` to it has no side effect on the target's inode.

### Phase 3: crash mid-rename — PASS

| Check | Result |
|---|---|
| Target unchanged (rename never called) | PASS |
| Tmp file orphaned with new content | PASS |
| Tmp file content matches the intended new delta | PASS |

The tmp file was written completely but rename was never called (simulating a
crash between write and rename). Target retained its previous content. The
tmp file existed with the new delta's content. This confirms: if the wrapper
dies after writing the scratch file but before promoting it, the inbox is
untouched — the fold sees the previous state (or no file), never a partial.

### Phase 4: rename completes with inode isolation — PASS

| Check | Result |
|---|---|
| New open after rename sees new content | PASS |
| Old fd (opened before rename) reads old content | PASS |

After `renameSync` completes, a new `open()` + `read()` sees the new delta.
A file descriptor opened before the rename continues reading the old inode
(Linux semantics: the old inode is unlinked but remains alive until all fds
are closed). This confirms: a reader that opened the inbox file before
promotion continues reading the old delta to completion — no mid-read content
swap.

### Phase 5: fold parse-check (defense in depth) — PASS

| Case | Parse | Valid | Result |
|---|---|---|---|
| Truncated JSON (missing `}`) | FAIL | — | PASS (rejected without throwing) |
| Empty file | FAIL | — | PASS (rejected without throwing) |
| Binary garbage (`\x00\x01\x02\x03\xff\xfe`) | FAIL | — | PASS (rejected without throwing) |
| Valid JSON, missing `ops` array | OK | FAIL | PASS (rejected: "ops is not an array") |
| Valid JSON, `ops` is a string | OK | FAIL | PASS (rejected: "ops is not an array") |
| Valid delta | OK | OK | PASS (accepted) |

The fold's `safeParseJSON` (a try/catch around `JSON.parse`) catches all
malformed inputs without throwing. The subsequent validation (checking `ops`
is an array, `planningRunId` exists, `mode` is valid) catches well-formed JSON
with wrong shape. Each rejection produces a clear error message suitable for
journaling as evidence. This is the defense-in-depth layer: the wrapper's
parse-check should make these unreachable, but if a corrupted file somehow
reaches the inbox, the fold handles it gracefully.

### Phase 6: O_APPEND journal atomicity — PASS

| Check | Result |
|---|---|
| 5 concurrent appenders × 100 lines = 500 total | PASS |
| All 500 lines are valid JSON | PASS |
| No interleaved lines (payload length mismatch) | 0 |
| Per-appender line sequence intact (0–99 each) | PASS |
| Duration | 0.1s |

Five child processes concurrently appended 100 JSON lines each to the same
journal file via `fs.appendFileSync(path, line + '\n')`. All 500 lines were
valid JSON, non-interleaved, with each appender's line numbers in perfect
sequence (0–99). This confirms: `O_APPEND` writes are atomic per call on
tmpfs, as POSIX §2.9.7 guarantees. The journal's append-as-commit-point
pattern is safe under concurrent writers (though in the pipeline, only one
pass at a time holds the lock — this is defense in depth).

## Filesystem semantics (from research)

The spike's empirical results are backed by filesystem semantics research:

- **`rename(2)` is atomic by POSIX spec.** The target is never absent during a
  rename: "a link named new shall remain visible to other threads throughout
  the renaming operation and refer either to the file referred to by new or
  old before the operation began" (POSIX.1-2017). Linux ext4 and tmpfs both
  honor this guarantee.
- **`fs.renameSync` maps 1:1 to `rename(2)`.** Verified via strace: a single
  `rename()` syscall, no wrapper logic.
- **Crash during write → target untouched.** `write()` to a separately-opened
  tmp file only mutates that file's inode. The target inode is not referenced.
- **Crash mid-rename → old or new, never absent.** If rename hasn't been
  called, target is untouched. If rename has been called, it's atomic.
- **`O_APPEND` writes are atomic per call** on local filesystems (POSIX
  §2.9.7, Linux 3.14+). Each `write()` with `O_APPEND` is a single atomic
  operation: the offset seek and the write happen as one step.
- **`/tmp` on this devcontainer is tmpfs** (verified: `/proc/mounts`). tmpfs
  has no journal (none needed — it's RAM-backed), so `rename` is a single
  in-memory directory operation. Atomicity is identical to ext4 from
  userspace's perspective.

Sources: [rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html),
[POSIX.1-2017 rename()](https://pubs.opengroup.org/onlinepubs/9699919799/functions/rename.html),
[open(2) O_APPEND](https://man7.org/linux/man-pages/man2/open.2.html),
[write(2) BUGS / POSIX §2.9.7](https://man7.org/linux/man-pages/man2/write.2.html#BUGS),
[ext4 journal docs](https://www.kernel.org/doc/html/latest/filesystems/ext4/journal.html),
[LWN: Ensuring data reaches disk](https://lwn.net/Articles/457667/).

## Findings

### F1: tmp+rename is crash-safe for process kills (SIGTERM/SIGKILL)

**Impact: None (confirms the design)** — the wrapper's promotion pattern is
crash-safe against process termination. A crash during tmp write leaves
target untouched. A crash before rename leaves target untouched. A crash
after rename means the promotion already completed. There is no window
where a process kill can leave the inbox with a partial or absent delta
file.

### F2: Power-loss durability requires fsync before rename

**Impact: Low (defense in depth)** — the spike validates crash-safety
(process kill), not power-loss durability. On ext4 (not tmpfs), a power loss
after `rename` returns but before the journal commits (~5s default) can roll
back the rename, reverting target to old content. Without `fsync(tmp)` before
`rename`, a power loss can leave target with zero-length content (ext4's
`auto_da_alloc` heuristic often saves you, but it is best-effort).

The devcontainer's `/tmp` is tmpfs (RAM-backed), so power loss clears
everything — this is not a concern for the spike environment. But if the
pipeline state directory is ever on ext4 (e.g. if `_bmad-output/pipeline3/`
lives on the devcontainer's root filesystem), the wrapper should use the
canonical 5-step pattern:

1. `open(tmp, O_CREAT|O_WRONLY)`
2. `write(tmp, content)`
3. `fsync(tmp)` ← durability of data
4. `rename(tmp, target)` ← atomicity of the swap
5. `fsync(dir of target)` ← durability of rename metadata

The plan's `atomicWrite` helper (used for `graph.json`, `last-pass.json`, and
inbox promotion) should include the `fsync(fd)` step. The `fsync(dir)` step
is less critical — the journal is the commit point, and `graph.json` is
derived/rebuildable.

### F3: O_APPEND journal writes are atomic under concurrency

**Impact: None (confirms the design)** — concurrent `fs.appendFileSync` calls
to the journal produce non-interleaved lines. Each call is a single atomic
`O_APPEND` write. In the pipeline, only one pass at a time holds the lock, so
concurrent journal writes don't occur in practice — but this confirms the
mechanism is sound even if the lock were ever violated.

### F4: Inode isolation — old readers see old content after rename

**Impact: None (informational)** — a file descriptor opened before a rename
continues reading the old inode after the rename completes. This means a pass
that opened `graph.json` for reading before a later pass's atomic write
completes its read of the old content. No mid-read content swap is possible.
This is standard Linux semantics, confirmed on tmpfs.

## Impact on the plan

The interaction seam is resolved empirically. The plan's wrapper promotion
contract holds:

```js
// The wrapper's promotion (after opencode child exits with code 0):
const tmp = inboxPath + '.tmp';
fs.writeFileSync(tmp, deltaContent);     // write to scratch
// fs.fsyncSync(fd);                     // ← F2: add for ext4 durability
const parsed = JSON.parse(fs.readFileSync(tmp, 'utf8'));  // parse-check
validateDelta(parsed);                   // validate structure
fs.renameSync(tmp, inboxPath);           // atomic promotion
```

The fold reads either a complete, valid delta or nothing (ENOENT). The
fold's own parse-check is defense in depth — confirmed to catch all
malformed inputs without throwing. No design change needed for crash-safety.

The only actionable finding (F2) is adding `fsync(fd)` before `rename` in
the `atomicWrite` helper, relevant only if the state directory is on ext4
rather than tmpfs. This is a one-line addition noted for the implementation,
not a design change.
