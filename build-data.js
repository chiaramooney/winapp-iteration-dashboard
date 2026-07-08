#!/usr/bin/env node
// Fetches iteration data for one or more months and merges the results into
// docs/data.json. The hosted dashboard reads that file and filters it by the
// date range the viewer selects.
//
// Usage:
//   node build-data.js                 # previous calendar month (default)
//   node build-data.js 2026-06         # a specific month
//   node build-data.js 2026-01 2026-06 # every month in the range (backfill)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getToken, fetchDashboardData, REPOS, RELEASE_REPOS, PROJECT_NUMBER } from "./lib/fetch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "docs", "data.json");

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthArg(str) {
  const m = str.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) {
    console.error(`Invalid month "${str}". Expected YYYY-MM (e.g. 2026-06).`);
    process.exit(1);
  }
  return { year: parseInt(m[1]), month: parseInt(m[2]) - 1 };
}

function monthWindow({ year, month }) {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999); // last day of month
  return { start, end };
}

// Determine the list of months to fetch based on CLI args.
function resolveMonths(args) {
  if (args.length === 0) {
    // Previous calendar month relative to today.
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return [{ year: prev.getFullYear(), month: prev.getMonth() }];
  }
  if (args.length === 1) {
    return [parseMonthArg(args[0])];
  }
  // Range: iterate month-by-month from first to second (inclusive).
  const from = parseMonthArg(args[0]);
  const to = parseMonthArg(args[1]);
  const months = [];
  let cur = new Date(from.year, from.month, 1);
  const last = new Date(to.year, to.month, 1);
  while (cur <= last) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return months;
}

function loadExisting() {
  if (!fs.existsSync(DATA_PATH)) {
    return { closedIssues: [], mergedPRs: [], newIssues: [], releases: [], months: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
    return {
      closedIssues: parsed.closedIssues || [],
      mergedPRs: parsed.mergedPRs || [],
      newIssues: parsed.newIssues || [],
      releases: parsed.releases || [],
      months: parsed.months || [],
    };
  } catch (err) {
    console.warn(`Warning: could not parse existing data.json (${err.message}); starting fresh.`);
    return { closedIssues: [], mergedPRs: [], newIssues: [], releases: [], months: [] };
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
  const months = resolveMonths(args);
  const token = getToken();

  const data = loadExisting();
  const collectedMonths = new Set(data.months);

  for (const m of months) {
    const { start, end } = monthWindow(m);
    const key = monthKey(start);
    console.log(`\n📊 Fetching ${key} (${start.toLocaleDateString()} - ${end.toLocaleDateString()})...`);

    const { closedIssues, mergedPRs, newIssues, releases } = await fetchDashboardData(token, start, end);

    data.closedIssues = mergeArray(data.closedIssues, closedIssues, "closedAt");
    data.mergedPRs = mergeArray(data.mergedPRs, mergedPRs, "mergedAt");
    data.newIssues = mergeArray(data.newIssues, newIssues, "createdAt");
    data.releases = mergeArray(data.releases, releases, "publishedAt");
    collectedMonths.add(key);

    console.log(`  ✅ ${key}: ${closedIssues.length} closed, ${mergedPRs.length} PRs, ${newIssues.length} new, ${releases.length} releases`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    repos: REPOS.map((r) => `${r.owner}/${r.repo}`),
    releaseRepos: RELEASE_REPOS.map((r) => `${r.owner}/${r.repo}`),
    projectNumber: PROJECT_NUMBER,
    months: Array.from(collectedMonths).sort(),
    closedIssues: data.closedIssues,
    mergedPRs: data.mergedPRs,
    newIssues: data.newIssues,
    releases: data.releases,
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n🎉 Wrote ${DATA_PATH}`);
  console.log(`   Months covered: ${output.months.join(", ")}`);
  console.log(`   Totals — closed: ${output.closedIssues.length}, PRs: ${output.mergedPRs.length}, new: ${output.newIssues.length}, releases: ${output.releases.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
