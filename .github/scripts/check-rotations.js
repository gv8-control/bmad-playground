#!/usr/bin/env node
'use strict';

const fs = require('fs');

function parseDate(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return date.getTime();
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Usage: node check-rotations.js <config-path>');
    console.log(JSON.stringify([]));
    process.exit(0);
  }

  // Let JSON.parse and readFileSync errors propagate to the outer catch
  // (unexpected errors exit non-zero — see H3).
  const configRaw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configRaw);

  const launchDate = parseDate(config.productionLaunchDate);
  if (launchDate === null) {
    // C1: no valid launch date — tracking is inactive. This is an expected
    // empty result, not an error. Log a warning so it is visible, not silent.
    console.error(
      'WARNING: productionLaunchDate is not set in the config. Secret rotation tracking is inactive until a launch date is configured.',
    );
    console.log(JSON.stringify([]));
    process.exit(0);
  }

  const reminderWindowDaysRaw = config.reminderWindowDays;
  let reminderWindowDays;
  if (typeof reminderWindowDaysRaw === 'number') {
    reminderWindowDays = reminderWindowDaysRaw;
  } else if (
    typeof reminderWindowDaysRaw === 'string' &&
    /^\d+$/.test(reminderWindowDaysRaw)
  ) {
    reminderWindowDays = parseInt(reminderWindowDaysRaw, 10);
  } else {
    reminderWindowDays = 7;
  }
  if (!(reminderWindowDays >= 1)) {
    reminderWindowDays = 7;
  }
  // reminderWindowMs is a short window (7 days); DST drift is negligible here.
  const reminderWindowMs = reminderWindowDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (now < launchDate) {
    // Launch date is in the future — no secrets due yet.
    console.log(JSON.stringify([]));
    process.exit(0);
  }

  const secrets = Array.isArray(config.secrets) ? config.secrets : [];
  const reminders = [];

  for (const secret of secrets) {
    if (typeof secret !== 'object' || secret === null) continue;
    if (typeof secret.name !== 'string' || !secret.name) continue;
    if (typeof secret.runbookSection !== 'string' || !secret.runbookSection) continue;

    const intervalDays = secret.rotationIntervalDays;
    if (!Number.isFinite(intervalDays) || intervalDays <= 0) continue;

    // H5: Use calendar arithmetic (setDate) instead of fixed ms arithmetic
    // to avoid DST drift over long rotation intervals (90/180 days).
    let mostRecentDueDate = new Date(launchDate);
    let nextDueDate = new Date(launchDate);
    nextDueDate.setDate(nextDueDate.getDate() + intervalDays);

    let intervalsPassed = 0;
    while (nextDueDate.getTime() <= now) {
      intervalsPassed++;
      mostRecentDueDate = new Date(nextDueDate);
      nextDueDate.setDate(nextDueDate.getDate() + intervalDays);
    }

    const hasPassedDueDate = intervalsPassed >= 1;
    const isApproaching =
      nextDueDate.getTime() - now <= reminderWindowMs &&
      nextDueDate.getTime() > now;

    if (hasPassedDueDate || isApproaching) {
      const dueDate = hasPassedDueDate ? mostRecentDueDate : nextDueDate;
      reminders.push({
        name: secret.name,
        dueDate: formatDate(dueDate),
        runbookSection: secret.runbookSection,
        runbookRef: secret.runbookRef || null,
      });
    }
  }

  console.log(JSON.stringify(reminders));
  process.exit(0);
}

try {
  main();
} catch (e) {
  // H3: unexpected errors (file not found, invalid JSON, runtime errors)
  // exit non-zero so failures are visible. Output [] to stdout for backward
  // compatibility with downstream consumers.
  console.error('check-rotations error:', e.message);
  console.log(JSON.stringify([]));
  process.exit(1);
}
