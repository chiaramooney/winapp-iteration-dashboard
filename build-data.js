#!/usr/bin/env node
// Fetches iteration data and merges the results into docs/data.json.
// The hosted dashboard reads that file and filters it by the date range the
// viewer selects.
//
// Usage:
//   node build-data.js                     # yesterday (default for daily runs)
//   node build-data.js 2026-07-22          # a specific day
//   node build-data.js 2026-07-01 2026-07-22  # every day in the range (backfill)
//   node build-data.js 2026-06             # a full month
//   node build-data.js 2026-01 2026-06     # every month in the range (backfill)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getToken, fetchDashboardData, REPOS, RELEASE_REPOS, PROJECT_NUMBER } from "./lib/fetch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "docs", "data.json");

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isMonthArg(str) {
  return /^\d{4}-\d{1,2}$/.test(str);
}

function isDayArg(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str);
}

function parseMonthArg(str) {
  const m = str.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) {
    console.error(`Invalid month "${str}". Expected YYYY-MM (e.g. 2026-06).`);
    process.exit(1);
  }
  return { year: parseInt(m[1]), month: parseInt(m[2]) - 1 };
}

function parseDayArg(str) {
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    console.error(`Invalid date "${str}". Expected YYYY-MM-DD (e.g. 2026-07-22).`);
    process.exit(1);
  }
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}

function monthWindow({ year, month }) {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999); // last day of month
  return { start, end };
}

function dayWindow(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return { start, end };
}

// Resolve windows to fetch based on CLI args.
// Returns an array of { start, end, key } objects.
function resolveWindows(args) {
  if (args.length === 0) {
    // Yesterday (default for daily cron).
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const { start, end } = dayWindow(yesterday);
    return [{ start, end, key: dayKey(yesterday) }];
  }

  // Single argument: either a day or a month.
  if (args.length === 1) {
    if (isDayArg(args[0])) {
      const d = parseDayArg(args[0]);
      const { start, end } = dayWindow(d);
      return [{ start, end, key: dayKey(d) }];
    }
    const m = parseMonthArg(args[0]);
    const { start, end } = monthWindow(m);
    return [{ start, end, key: monthKey(start) }];
  }

  // Range of two arguments (both must be same type).
  if (isDayArg(args[0]) && isDayArg(args[1])) {
    const from = parseDayArg(args[0]);
    const to = parseDayArg(args[1]);
    const windows = [];
    let cur = new Date(from);
    while (cur <= to) {
      const { start, end } = dayWindow(cur);
      windows.push({ start, end, key: dayKey(cur) });
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
    return windows;
  }

  if (isMonthArg(args[0]) && isMonthArg(args[1])) {
    const from = parseMonthArg(args[0]);
    const to = parseMonthArg(args[1]);
    const windows = [];
    let cur = new Date(from.year, from.month, 1);
    const last = new Date(to.year, to.month, 1);
    while (cur <= last) {
      const { start, end } = monthWindow({ year: cur.getFullYear(), month: cur.getMonth() });
      windows.push({ start, end, key: monthKey(cur) });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return windows;
  }

  console.error("Both arguments must be the same format: YYYY-MM-DD for days or YYYY-MM for months.");
  process.exit(1);
}

function loadExisting() {
  if (!fs.existsSync(DATA_PATH)) {
    return { closedIssues: [], mergedPRs: [], newIssues: [], releases: [], months: [], collectedDays: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
    return {
      closedIssues: parsed.closedIssues || [],
      mergedPRs: parsed.mergedPRs || [],
      newIssues: parsed.newIssues || [],
      releases: parsed.releases || [],
      months: parsed.months || [],
      collectedDays: parsed.collectedDays || [],
    };
  } catch (err) {
    console.warn(`Warning: could not parse existing data.json (${err.message}); starting fresh.`);
    return { closedIssues: [], mergedPRs: [], newIssues: [], releases: [], months: [], collectedDays: [] };
  }
}

// Stable de-duplication key. Real issues/PRs/releases have a url; project-board
// draft issues don't, so fall back to title + date.
function keyFor(item, dateField) {
  return item.url || `draft:${item.title}:${item[dateField] || ""}`;
}

function mergeArray(existing, incoming, dateField) {
  const map = new Map();
  for (const item of existing) map.set(keyFor(item, dateField), item);
  for (const item of incoming) map.set(keyFor(item, dateField), item); // new data wins
  return Array.from(map.values()).sort(
    (a, b) => new Date(b[dateField]) - new Date(a[dateField])
  );
}

async function main() {
  const args = process.argv.slice(2);
  const windows = resolveWindows(args);
  const token = getToken();

  const data = loadExisting();
  const collectedMonths = new Set(data.months);
  const collectedDays = new Set(data.collectedDays);

  for (const { start, end, key } of windows) {
    console.log(`\n📊 Fetching ${key} (${start.toLocaleDateString()} - ${end.toLocaleDateString()})...`);

    const { closedIssues, mergedPRs, newIssues, releases } = await fetchDashboardData(token, start, end);

    data.closedIssues = mergeArray(data.closedIssues, closedIssues, "closedAt");
    data.mergedPRs = mergeArray(data.mergedPRs, mergedPRs, "mergedAt");
    data.newIssues = mergeArray(data.newIssues, newIssues, "createdAt");
    data.releases = mergeArray(data.releases, releases, "publishedAt");

    // Track whether this is a day key (YYYY-MM-DD) or month key (YYYY-MM).
    if (key.length === 10) {
      collectedDays.add(key);
    } else {
      collectedMonths.add(key);
    }

    console.log(`  ✅ ${key}: ${closedIssues.length} closed, ${mergedPRs.length} PRs, ${newIssues.length} new, ${releases.length} releases`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    repos: REPOS.map((r) => `${r.owner}/${r.repo}`),
    releaseRepos: RELEASE_REPOS.map((r) => `${r.owner}/${r.repo}`),
    projectNumber: PROJECT_NUMBER,
    months: Array.from(collectedMonths).sort(),
    collectedDays: Array.from(collectedDays).sort(),
    closedIssues: data.closedIssues,
    mergedPRs: data.mergedPRs,
    newIssues: data.newIssues,
    releases: data.releases,
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n🎉 Wrote ${DATA_PATH}`);
  console.log(`   Months covered: ${output.months.join(", ")}`);
  console.log(`   Days collected: ${output.collectedDays.length}`);
  console.log(`   Totals — closed: ${output.closedIssues.length}, PRs: ${output.mergedPRs.length}, new: ${output.newIssues.length}, releases: ${output.releases.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
