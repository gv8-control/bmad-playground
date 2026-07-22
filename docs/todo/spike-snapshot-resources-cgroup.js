#!/usr/bin/env node
/**
 * Follow-up: check cgroup-level cpu/memory enforcement on an image sandbox
 * created with resources { cpu: 4, memory: 8, disk: 10 }.
 *
 * spike-snapshot-resources.js found nproc/free report host-level values (48
 * cores, 189 GiB) on the image path — only disk was visibly honored. This
 * checks whether cpu/memory are enforced as cgroup quotas (v2 cpu.max /
 * memory.max, v1 cpu.cfs_quota_us / memory.limit_in_bytes) that nproc/free
 * don't reflect.
 */

const { Daytona, Image } = require('@daytonaio/sdk');
const { log, sleep, elapsed } = require('./spike-opencode-sandbox.js');

function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`${name} is not set in env`);
  return val;
}

const BASE_IMAGE = 'daytonaio/sandbox:0.8.0';
const REQUESTED = { cpu: 4, memory: 8, disk: 10 };

async function main() {
  const daytona = new Daytona({
    apiKey: requireEnv('DAYTONA_API_KEY'),
    apiUrl: requireEnv('DAYTONA_API_URL'),
  });

  log('main', 'Follow-up: cgroup enforcement check on image path');
  const image = Image.base(BASE_IMAGE);
  const sb = await daytona.create(
    {
      image,
      resources: REQUESTED,
      labels: { scope: 'spike', runId: 'cgroup-check' },
      autoStopInterval: 0,
    },
    { timeout: 900, onSnapshotCreateLogs: (c) => process.stdout.write(c) },
  );
  log('main', `sandbox ${sb.id} created`);

  try {
    await sleep(3000);
    const cmd =
      `echo "=== cgroup version ===" && ` +
      `stat -fc %T /sys/fs/cgroup/ 2>/dev/null && ` +
      `echo "=== /proc/self/cgroup ===" && cat /proc/self/cgroup && ` +
      `echo "=== cgroup v2 cpu.max ===" && cat /sys/fs/cgroup/cpu.max 2>/dev/null; ` +
      `cat /sys/fs/cgroup/$(cat /proc/self/cgroup | grep ^0:: | cut -d: -f3)/cpu.max 2>/dev/null; ` +
      `echo "=== cgroup v2 memory.max ===" && cat /sys/fs/cgroup/memory.max 2>/dev/null; ` +
      `cat /sys/fs/cgroup/$(cat /proc/self/cgroup | grep ^0:: | cut -d: -f3)/memory.max 2>/dev/null; ` +
      `echo "=== cgroup v1 cpu.cfs_quota_us ===" && cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us 2>/dev/null; ` +
      `cat /sys/fs/cgroup/cpu/cpu.cfs_period_us 2>/dev/null; ` +
      `echo "=== cgroup v1 memory.limit_in_bytes ===" && cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null; ` +
      `echo "=== nproc ===" && nproc && ` +
      `echo "=== free -m ===" && free -m && ` +
      `echo "=== df -h / ===" && df -h /`;
    const resp = await sb.process.executeCommand(cmd, undefined, undefined, 60);
    log('main', `exit=${resp.exitCode}`);
    console.log('--- cgroup probe output ---');
    console.log(resp.result);
    console.log('--- end ---');
  } finally {
    try {
      await daytona.delete(sb);
      log('main', `sandbox ${sb.id} destroyed`);
    } catch (e) {
      log('main', `destroy failed: ${e.message}`);
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
