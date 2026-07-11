/**
 * Pre-test cleanup: deletes all Daytona sandboxes to free disk quota.
 *
 * The nightly real-service tier creates a sandbox per conversation, and
 * failed runs can leave orphaned sandboxes that accumulate against the
 * 30GiB account limit. This script runs before the test to ensure a
 * clean slate.
 *
 * Usage: npx tsx scripts/cleanup-daytona-sandboxes.ts
 * Requires: DAYTONA_API_URL, DAYTONA_API_KEY env vars.
 */
import { Daytona } from '@daytonaio/sdk';

async function main() {
  const apiUrl = process.env.DAYTONA_API_URL;
  const apiKey = process.env.DAYTONA_API_KEY;

  if (!apiUrl || !apiKey) {
    console.log('DAYTONA_API_URL or DAYTONA_API_KEY not set — skipping cleanup');
    return;
  }

  const daytona = new Daytona({ apiKey, apiUrl });
  let deleted = 0;
  let checked = 0;

  try {
    for await (const sandbox of daytona.list()) {
      checked++;
      try {
        await daytona.delete(sandbox);
        console.log(`Deleted sandbox ${sandbox.id} (labels: ${JSON.stringify(sandbox.labels)})`);
        deleted++;
      } catch (err) {
        console.error(`Failed to delete sandbox ${sandbox.id}: ${err}`);
      }
    }
  } catch (err) {
    console.error(`Failed to list sandboxes: ${err}`);
  }

  console.log(`Cleanup complete: ${deleted}/${checked} sandboxes deleted`);
}

main().catch((err) => {
  console.error('Cleanup script failed:', err);
  process.exit(0);
});
