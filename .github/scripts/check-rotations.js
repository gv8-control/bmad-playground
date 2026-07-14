#!/usr/bin/env node
'use strict';

const fs = require('fs');

function parseDate(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return date.getTime();
}

function formatDate(ms) {
  return new Date(ms).toISOString().split('T')[0];
}

function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Usage: node check-rotations.js <config-path>');
    console.log(JSON.stringify([]));
    process.exit(0);
  }

  const configRaw = fs.readFileSync(configPath, 'utf8');
  let config;
  try {
    config = JSON.parse(configRaw);
  } catch (e) {
    console.error('Invalid JSON in config file:', e.message);
    console.log(JSON.stringify([]));
    process.exit(0);
  }

  const launchDate = parseDate(config.productionLaunchDate);
  if (launchDate === null) {
    console.log(JSON.stringify([]));
    process.exit(0);
  }

  const reminderWindowDays =
    typeof config.reminderWindowDays === 'number' && config.reminderWindowDays >= 1
      ? config.reminderWindowDays
      : 7;
  const reminderWindowMs = reminderWindowDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const secrets = Array.isArray(config.secrets) ? config.secrets : [];
  const reminders = [];

  for (const secret of secrets) {
    if (typeof secret !== 'object' || secret === null) continue;
    if (typeof secret.name !== 'string' || !secret.name) continue;
    if (typeof secret.runbookSection !== 'string' || !secret.runbookSection) continue;

    const intervalDays = secret.rotationIntervalDays;
    if (!Number.isFinite(intervalDays) || intervalDays <= 0) continue;

    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    const elapsed = now - launchDate;
    if (elapsed < 0) continue;

    const intervalsPassed = Math.floor(elapsed / intervalMs);
    const mostRecentDueDate = launchDate + intervalsPassed * intervalMs;
    const nextDueDate = mostRecentDueDate + intervalMs;

    const hasPassedDueDate = intervalsPassed >= 1;
    const isApproaching = nextDueDate - now <= reminderWindowMs && nextDueDate > now;

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
  console.error('check-rotations error:', e.message);
  console.log(JSON.stringify([]));
  process.exit(0);
}
