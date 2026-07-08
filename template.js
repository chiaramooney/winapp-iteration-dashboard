export function generateHtml(data) {
  const { dateRange, closedIssues, mergedPRs, newIssues, releases } = data;
  const startDate = dateRange.start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const endDate = dateRange.end.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
    const cls = priority.toLowerCase().includes("high") || priority.toLowerCase().includes("p0") || priority.toLowerCase().includes("p1")
      ? "priority-high"
      : priority.toLowerCase().includes("medium") || priority.toLowerCase().includes("p2")
      ? "priority-medium"
      : "priority-low";
    return `<span class="priority ${cls}">${escapeHtml(priority)}</span>`;
  }

  function repoShortName(repo) {
    return repo.split("/").pop();
  }

  // --- Closed Issues Table ---
  const closedIssuesRows = closedIssues
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))
    .map(
      (issue) => {
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
      }
    )
    .join("");

  // --- Merged PRs Table ---
  const mergedPRsRows = mergedPRs
    .sort((a, b) => new Date(b.mergedAt) - new Date(a.mergedAt))
    .map(
      (pr) => `
      <tr>
        <td><a href="${escapeHtml(pr.url)}" target="_blank" class="item-link">
          <span class="pr-icon">⑂</span> #${pr.number} ${escapeHtml(pr.title)}
        </a></td>
        <td><span class="repo-badge">${escapeHtml(repoShortName(pr.repo))}</span></td>
        <td>${escapeHtml(pr.author)}</td>
        <td>${labelBadges(pr.labels)}</td>
        <td>${formatDate(pr.mergedAt)}</td>
      </tr>`
    )
    .join("");

  // --- New Issues Table ---
  const newIssuesRows = newIssues
    .sort((a, b) => {
      // Open issues first, then closed; within each group sort by date descending
      if (a.state === "open" && b.state !== "open") return -1;
      if (a.state !== "open" && b.state === "open") return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    })
    .map(
      (issue) => {
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
      }
    )
    .join("");

  // --- Releases Section ---
  const releasesHtml = releases.length === 0
    ? `<p class="empty-state">No releases published during this period.</p>`
    : releases
        .map(
          (r) => `
        <div class="release-card">
          <div class="release-header">
            <a href="${escapeHtml(r.url)}" target="_blank" class="release-name">
              🏷️ ${escapeHtml(r.name)}
            </a>
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Iteration Review Dashboard | ${startDate} – ${endDate}</title>
  <style>
    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f6f8fa;
      --bg-tertiary: #eef1f5;
      --border: #d1d9e0;
      --text-primary: #1f2328;
      --text-secondary: #656d76;
      --text-link: #0969da;
      --accent-green: #1a7f37;
      --accent-purple: #8250df;
      --accent-blue: #0969da;
      --accent-orange: #9a6700;
      --accent-red: #cf222e;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      padding: 24px;
    }

    .dashboard {
      max-width: 1400px;
      margin: 0 auto;
    }

    .header {
      text-align: center;
      padding: 32px 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: 32px;
    }

    .header h1 {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .header .date-range {
      color: var(--text-secondary);
      font-size: 16px;
    }

    .stats-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .stat-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }

    .stat-card .stat-value {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .stat-card .stat-label {
      color: var(--text-secondary);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stat-card:nth-child(1) .stat-value { color: var(--accent-green); }
    .stat-card:nth-child(2) .stat-value { color: var(--accent-purple); }
    .stat-card:nth-child(3) .stat-value { color: var(--accent-blue); }
    .stat-card:nth-child(4) .stat-value { color: var(--accent-orange); }

    .section {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 24px;
      overflow: hidden;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-tertiary);
    }

    .section-header h2 {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-count {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2px 10px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      text-align: left;
      padding: 10px 16px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
    }

    td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
      vertical-align: middle;
    }

    tr:last-child td { border-bottom: none; }

    tr:hover { background: var(--bg-tertiary); }

    .item-link {
      color: var(--text-primary);
      text-decoration: none;
      font-weight: 500;
    }

    .item-link:hover {
      color: var(--text-link);
      text-decoration: underline;
    }

    .issue-icon { color: var(--accent-green); margin-right: 4px; }
    .issue-icon.new { color: var(--accent-blue); }
    .pr-icon { color: var(--accent-purple); margin-right: 4px; font-weight: 700; }

    .repo-badge {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 12px;
      color: var(--text-secondary);
      font-family: monospace;
    }

    .label {
      display: inline-block;
      background: #ddf4ff;
      border: 1px solid #54aeff66;
      border-radius: 12px;
      padding: 1px 8px;
      font-size: 11px;
      color: var(--accent-blue);
      margin-right: 4px;
    }

    .label-bug {
      background: #ffebe9;
      border: 1px solid #cf222e44;
      color: var(--accent-red);
    }

    .status-open {
      display: inline-block;
      background: #dafbe1;
      border: 1px solid #1a7f3744;
      color: var(--accent-green);
      border-radius: 12px;
      padding: 1px 8px;
      font-size: 11px;
      font-weight: 600;
    }

    .status-closed {
      display: inline-block;
      background: #e8dcf5;
      border: 1px solid #8250df44;
      color: var(--accent-purple);
      border-radius: 12px;
      padding: 1px 8px;
      font-size: 11px;
      font-weight: 600;
    }

    .priority {
      display: inline-block;
      border-radius: 12px;
      padding: 1px 8px;
      font-size: 11px;
      margin-right: 4px;
      font-weight: 600;
    }

    .priority-high {
      background: #ffebe9;
      border: 1px solid #cf222e44;
      color: var(--accent-red);
    }

    .priority-medium {
      background: #fff8c5;
      border: 1px solid #9a670044;
      color: var(--accent-orange);
    }

    .priority-low {
      background: #dafbe1;
      border: 1px solid #1a7f3744;
      color: var(--accent-green);
    }

    .release-card {
      padding: 20px;
      border-bottom: 1px solid var(--border);
    }

    .release-card:last-child { border-bottom: none; }

    .release-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .release-name {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
      text-decoration: none;
    }

    .release-name:hover { color: var(--text-link); }

    .stable-badge {
      background: #dafbe1;
      border: 1px solid #1a7f3744;
      color: var(--accent-green);
      border-radius: 12px;
      padding: 2px 10px;
      font-size: 12px;
      font-weight: 600;
    }

    .prerelease-badge {
      background: #fff8c5;
      border: 1px solid #9a670044;
      color: var(--accent-orange);
      border-radius: 12px;
      padding: 2px 10px;
      font-size: 12px;
      font-weight: 600;
    }

    .release-meta {
      display: flex;
      gap: 16px;
      color: var(--text-secondary);
      font-size: 13px;
      margin-bottom: 8px;
    }

    .release-meta code {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0 4px;
      font-size: 12px;
    }

    .release-notes {
      color: var(--text-secondary);
      font-size: 13px;
      white-space: pre-wrap;
      max-height: 80px;
      overflow: hidden;
      margin-top: 8px;
      padding: 8px;
      background: var(--bg-primary);
      border-radius: 4px;
      border: 1px solid var(--border);
    }

    .empty-state {
      padding: 32px;
      text-align: center;
      color: var(--text-secondary);
      font-style: italic;
    }

    .footer {
      text-align: center;
      padding: 24px;
      color: var(--text-secondary);
      font-size: 12px;
      border-top: 1px solid var(--border);
      margin-top: 16px;
    }

    @media (max-width: 768px) {
      body { padding: 12px; }
      .stats-bar { grid-template-columns: repeat(2, 1fr); }
      table { font-size: 12px; }
      td, th { padding: 8px; }
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <div class="header">
      <h1>📋 Iteration Review Dashboard</h1>
      <p class="date-range">${startDate} – ${endDate}</p>
      <p class="date-range" style="margin-top: 4px; font-size: 13px;">
        microsoft/WinAppCli • microsoft/electron-on-windows-gallery • Project #2041
      </p>
    </div>

    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-value">${closedIssues.length}</div>
        <div class="stat-label">Issues Closed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${mergedPRs.length}</div>
        <div class="stat-label">PRs Merged</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${newIssues.length}</div>
        <div class="stat-label">New Issues</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${releases.length}</div>
        <div class="stat-label">Releases Shipped</div>
      </div>
    </div>

    <!-- Releases Section -->
    <div class="section">
      <div class="section-header">
        <h2>🚀 Releases Shipped</h2>
        <span class="section-count">${releases.length}</span>
      </div>
      ${releasesHtml}
    </div>

    <!-- Closed Issues Section -->
    <div class="section">
      <div class="section-header">
        <h2><span style="color: var(--accent-green)">●</span> Closed Issues</h2>
        <span class="section-count">${closedIssues.length}</span>
      </div>
      ${closedIssues.length === 0 ? '<p class="empty-state">No issues closed during this period.</p>' : `
      <table>
        <thead>
          <tr>
            <th>Issue</th>
            <th>Repo</th>
            <th>Assignee</th>
            <th>Priority</th>
            <th>Labels</th>
            <th>Closed</th>
          </tr>
        </thead>
        <tbody>${closedIssuesRows}</tbody>
      </table>`}
    </div>

    <!-- Merged PRs Section -->
    <div class="section">
      <div class="section-header">
        <h2><span style="color: var(--accent-purple)">⑂</span> Merged Pull Requests</h2>
        <span class="section-count">${mergedPRs.length}</span>
      </div>
      ${mergedPRs.length === 0 ? '<p class="empty-state">No pull requests merged during this period.</p>' : `
      <table>
        <thead>
          <tr>
            <th>Pull Request</th>
            <th>Repo</th>
            <th>Author</th>
            <th>Labels</th>
            <th>Merged</th>
          </tr>
        </thead>
        <tbody>${mergedPRsRows}</tbody>
      </table>`}
    </div>

    <!-- New Issues Section -->
    <div class="section">
      <div class="section-header">
        <h2><span style="color: var(--accent-blue)">◉</span> New Issues Created</h2>
        <span class="section-count">${newIssues.length}</span>
      </div>
      ${newIssues.length === 0 ? '<p class="empty-state">No new issues created during this period.</p>' : `
      <table>
        <thead>
          <tr>
            <th>Issue</th>
            <th>Repo</th>
            <th>Status</th>
            <th>Created By</th>
            <th>Assignee</th>
            <th>Labels</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>${newIssuesRows}</tbody>
      </table>`}
    </div>

    <!-- Draft Issues Section -->
    <div class="footer">
      Generated on ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
      • Data sourced from GitHub API
    </div>
  </div>
</body>
</html>`;
}
