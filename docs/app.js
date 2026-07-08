// Client-side dashboard: loads the prebuilt data.json, lets the viewer pick a
// date range, and renders the filtered results. No GitHub token needed here —
// the data is fetched ahead of time by the monthly GitHub Actions workflow.

let DATA = null;

// --- helpers ---
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatLongDate(d) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function repoShortName(repo) {
  return String(repo || "").split("/").pop();
}

function labelBadges(labels) {
  if (!labels || labels.length === 0) return "";
  return labels
    .slice(0, 3)
    .map((l) => {
      const isBug = l.toLowerCase() === "bug";
      const cls = isBug ? "label label-bug" : "label";
      return `<span class="${cls}">${escapeHtml(l)}</span>`;
    })
    .join("");
}

function priorityBadge(priority) {
  if (!priority) return "";
  const p = priority.toLowerCase();
  const cls =
    p.includes("high") || p.includes("p0") || p.includes("p1")
      ? "priority-high"
      : p.includes("medium") || p.includes("p2")
      ? "priority-medium"
      : "priority-low";
  return `<span class="priority ${cls}">${escapeHtml(priority)}</span>`;
}

// --- date helpers ---
function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoDay(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Parse a yyyy-mm-dd string as a local date at start-of-day.
function parseInputDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function monthBounds(key) {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

function inRange(dateStr, start, end) {
  const t = new Date(dateStr).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

// --- rendering ---
function renderReleases(releases) {
  if (releases.length === 0) {
    return `<p class="empty-state">No releases published during this period.</p>`;
  }
  return releases
    .map(
      (r) => `
      <div class="release-card">
        <div class="release-header">
          <a href="${escapeHtml(r.url)}" target="_blank" class="release-name">🏷️ ${escapeHtml(r.name)}</a>
          ${r.prerelease ? '<span class="prerelease-badge">Pre-release</span>' : '<span class="stable-badge">Stable</span>'}
        </div>
        <div class="release-meta">
          <span><span class="repo-badge">${escapeHtml(repoShortName(r.repo || ""))}</span></span>
          <span>Tag: <code>${escapeHtml(r.tagName)}</code></span>
          <span>Published: ${formatDate(r.publishedAt)}</span>
          <span>By: ${escapeHtml(r.author)}</span>
        </div>
        ${r.body ? `<div class="release-notes">${escapeHtml(r.body.substring(0, 300))}${r.body.length > 300 ? "..." : ""}</div>` : ""}
      </div>`
    )
    .join("");
}

function renderClosedIssues(closedIssues) {
  const rows = closedIssues
    .slice()
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))
    .map((issue) => {
      const titleHtml = issue.url
        ? `<a href="${escapeHtml(issue.url)}" target="_blank" class="item-link"><span class="issue-icon">●</span> #${issue.number} ${escapeHtml(issue.title)}</a>`
        : `<span class="item-link"><span class="draft-icon">📝</span> ${escapeHtml(issue.title)} <span class="label">draft</span></span>`;
      return `
      <tr>
        <td>${titleHtml}</td>
        <td><span class="repo-badge">${escapeHtml(repoShortName(issue.repo))}</span></td>
        <td>${escapeHtml(issue.assignee)}</td>
        <td>${priorityBadge(issue.priority || "")}</td>
        <td>${labelBadges(issue.labels)}</td>
        <td>${formatDate(issue.closedAt)}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="section">
      <div class="section-header">
        <h2><span style="color: var(--accent-green)">●</span> Closed Issues</h2>
        <span class="section-count">${closedIssues.length}</span>
      </div>
      ${closedIssues.length === 0 ? '<p class="empty-state">No issues closed during this period.</p>' : `
      <table>
        <thead>
          <tr>
            <th>Issue</th><th>Repo</th><th>Assignee</th><th>Priority</th><th>Labels</th><th>Closed</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`}
    </div>`;
}

function renderMergedPRs(mergedPRs) {
  const rows = mergedPRs
    .slice()
    .sort((a, b) => new Date(b.mergedAt) - new Date(a.mergedAt))
    .map(
      (pr) => `
      <tr>
        <td><a href="${escapeHtml(pr.url)}" target="_blank" class="item-link"><span class="pr-icon">⑂</span> #${pr.number} ${escapeHtml(pr.title)}</a></td>
        <td><span class="repo-badge">${escapeHtml(repoShortName(pr.repo))}</span></td>
        <td>${escapeHtml(pr.author)}</td>
        <td>${labelBadges(pr.labels)}</td>
        <td>${formatDate(pr.mergedAt)}</td>
      </tr>`
    )
    .join("");

  return `
    <div class="section">
      <div class="section-header">
        <h2><span style="color: var(--accent-purple)">⑂</span> Merged Pull Requests</h2>
        <span class="section-count">${mergedPRs.length}</span>
      </div>
      ${mergedPRs.length === 0 ? '<p class="empty-state">No pull requests merged during this period.</p>' : `
      <table>
        <thead>
          <tr>
            <th>Pull Request</th><th>Repo</th><th>Author</th><th>Labels</th><th>Merged</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`}
    </div>`;
}

function renderNewIssues(newIssues) {
  const rows = newIssues
    .slice()
    .sort((a, b) => {
      if (a.state === "open" && b.state !== "open") return -1;
      if (a.state !== "open" && b.state === "open") return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    })
    .map((issue) => {
      const statusCls = issue.state === "open" ? "status-open" : "status-closed";
      const statusLabel = issue.state === "open" ? "Open" : "Closed";
      const titleHtml = issue.url
        ? `<a href="${escapeHtml(issue.url)}" target="_blank" class="item-link"><span class="issue-icon new">◉</span> #${issue.number} ${escapeHtml(issue.title)}</a>`
        : `<span class="item-link"><span class="draft-icon">📝</span> ${escapeHtml(issue.title)} <span class="label">draft</span></span>`;
      return `
      <tr>
        <td>${titleHtml}</td>
        <td><span class="repo-badge">${escapeHtml(repoShortName(issue.repo))}</span></td>
        <td><span class="${statusCls}">${statusLabel}</span></td>
        <td>${escapeHtml(issue.author)}</td>
        <td>${escapeHtml(issue.assignee)}</td>
        <td>${labelBadges(issue.labels)}</td>
        <td>${formatDate(issue.createdAt)}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="section">
      <div class="section-header">
        <h2><span style="color: var(--accent-blue)">◉</span> New Issues Created</h2>
        <span class="section-count">${newIssues.length}</span>
      </div>
      ${newIssues.length === 0 ? '<p class="empty-state">No new issues created during this period.</p>' : `
      <table>
        <thead>
          <tr>
            <th>Issue</th><th>Repo</th><th>Status</th><th>Created By</th><th>Assignee</th><th>Labels</th><th>Created</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`}
    </div>`;
}

function render(start, end) {
  const closedIssues = DATA.closedIssues.filter((i) => inRange(i.closedAt, start, end));
  const mergedPRs = DATA.mergedPRs.filter((p) => inRange(p.mergedAt, start, end));
  const newIssues = DATA.newIssues.filter((i) => inRange(i.createdAt, start, end));
  const releases = DATA.releases.filter((r) => inRange(r.publishedAt, start, end));

  const content = `
    <p class="date-range" style="text-align:center; margin: -8px 0 24px;">${formatLongDate(start)} – ${formatLongDate(end)}</p>

    <div class="stats-bar">
      <div class="stat-card"><div class="stat-value">${closedIssues.length}</div><div class="stat-label">Issues Closed</div></div>
      <div class="stat-card"><div class="stat-value">${mergedPRs.length}</div><div class="stat-label">PRs Merged</div></div>
      <div class="stat-card"><div class="stat-value">${newIssues.length}</div><div class="stat-label">New Issues</div></div>
      <div class="stat-card"><div class="stat-value">${releases.length}</div><div class="stat-label">Releases Shipped</div></div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2>🚀 Releases Shipped</h2>
        <span class="section-count">${releases.length}</span>
      </div>
      ${renderReleases(releases)}
    </div>

    ${renderClosedIssues(closedIssues)}
    ${renderMergedPRs(mergedPRs)}
    ${renderNewIssues(newIssues)}
  `;

  document.getElementById("content").innerHTML = content;
}

// --- controls wiring ---
function applyFromInputs() {
  const startStr = document.getElementById("startDate").value;
  const endStr = document.getElementById("endDate").value;
  if (!startStr || !endStr) return;
  const start = parseInputDate(startStr);
  const end = parseInputDate(endStr);
  end.setHours(23, 59, 59, 999);
  render(start, end);
}

function selectMonth(key) {
  const { start, end } = monthBounds(key);
  document.getElementById("startDate").value = isoDay(start);
  document.getElementById("endDate").value = isoDay(end);
  document.getElementById("preset").value = key;
  render(start, end);
}

function setupControls() {
  const preset = document.getElementById("preset");
  const months = (DATA.months || []).slice().sort().reverse();

  preset.innerHTML =
    months.map((k) => `<option value="${k}">${monthLabel(k)}</option>`).join("") +
    `<option value="custom">Custom range…</option>`;

  preset.addEventListener("change", () => {
    if (preset.value !== "custom") selectMonth(preset.value);
  });

  document.getElementById("startDate").addEventListener("change", () => {
    preset.value = "custom";
  });
  document.getElementById("endDate").addEventListener("change", () => {
    preset.value = "custom";
  });

  document.getElementById("applyBtn").addEventListener("click", applyFromInputs);

  document.getElementById("resetBtn").addEventListener("click", () => {
    if (months.length) selectMonth(months[0]);
  });

  // Default to the most recent collected month.
  if (months.length) {
    selectMonth(months[0]);
  } else {
    document.getElementById("content").innerHTML =
      '<p class="empty-state">No data has been collected yet. Run the build workflow to populate data.json.</p>';
  }
}

async function init() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch (err) {
    document.getElementById("content").innerHTML =
      `<p class="empty-state">Could not load data.json (${escapeHtml(err.message)}).</p>`;
    return;
  }

  const repos = (DATA.repos || []).join(" • ");
  document.getElementById("repoLine").textContent =
    repos + (DATA.projectNumber ? ` • Project #${DATA.projectNumber}` : "");

  const generated = DATA.generatedAt
    ? new Date(DATA.generatedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })
    : "unknown";
  document.getElementById("footer").innerHTML =
    `Data last refreshed: ${escapeHtml(generated)} • Sourced from GitHub API`;

  setupControls();
}

init();
