#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateHtml } from "./template.js";
import { getToken, fetchDashboardData } from "./lib/fetch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseDate(str) {
  // Handle M/D/YY or M/D/YYYY
  if (str.includes("/")) {
    const [m, d, y] = str.split("/");
    const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    return new Date(year, parseInt(m) - 1, parseInt(d));
  }
  // Handle YYYY-MM-DD
  return new Date(str);
}

function usage() {
  console.log(`
Usage: node index.js <start-date> <end-date>

  Generates a static dashboard.html for a single date window (local preview).
  Dates can be in M/D/YY or YYYY-MM-DD format.

Examples:
  node index.js 6/1/26 6/30/26
  node index.js 2026-06-01 2026-06-30

For the hosted dashboard, use build-data.js instead (see README).
`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) usage();

  const since = parseDate(args[0]);
  const until = parseDate(args[1]);
  // Set end of day for the until date
  until.setHours(23, 59, 59, 999);

  console.log(`📊 Generating iteration dashboard for ${since.toLocaleDateString()} - ${until.toLocaleDateString()}...`);

  const token = getToken();
  const { closedIssues, mergedPRs, newIssues, releases } = await fetchDashboardData(token, since, until);

  const data = {
    dateRange: { start: since, end: until },
    closedIssues,
    mergedPRs,
    newIssues,
    releases,
  };

  console.log(`\n  ✅ Closed issues: ${closedIssues.length}`);
  console.log(`  ✅ Merged PRs: ${mergedPRs.length}`);
  console.log(`  ✅ New issues: ${newIssues.length}`);
  console.log(`  ✅ Releases: ${releases.length}`);

  const html = generateHtml(data);
  const outputPath = path.join(__dirname, "dashboard.html");
  fs.writeFileSync(outputPath, html, "utf-8");
  console.log(`\n🎉 Dashboard generated: ${outputPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
