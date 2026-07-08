import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";
import { execSync } from "child_process";

// --- Configuration ---
export const REPOS = [
  { owner: "microsoft", repo: "WinAppCli" },
  { owner: "microsoft", repo: "electron-on-windows-gallery" },
  { owner: "microsoft", repo: "WinAppVSCE" },
];

// Repos that publish releases we care about
export const RELEASE_REPOS = [
  { owner: "microsoft", repo: "WinAppCli" },
  { owner: "microsoft", repo: "WinAppVSCE" },
];

export const PROJECT_NUMBER = 2041;
export const PROJECT_ORG = "microsoft";

export function getToken() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) return token;

  // Try to get token from gh CLI
  try {
    const ghToken = execSync("gh auth token", { encoding: "utf-8" }).trim();
    if (ghToken) return ghToken;
  } catch {
    // gh CLI not available or not logged in
  }

  console.error("Error: No GitHub token found. Either set GITHUB_TOKEN/GH_TOKEN or log in with `gh auth login`.");
  process.exit(1);
}

async function fetchClosedIssuesFromRepos(octokit, since, until) {
  const issues = [];
  for (const { owner, repo } of REPOS) {
    let page = 1;
    while (true) {
      const { data } = await octokit.issues.listForRepo({
        owner,
        repo,
        state: "closed",
        since: since.toISOString(),
        per_page: 100,
        page,
      });
      if (data.length === 0) break;
      for (const issue of data) {
        if (issue.pull_request) continue; // skip PRs
        const closedAt = new Date(issue.closed_at);
        if (closedAt >= since && closedAt <= until) {
          issues.push({
            title: issue.title,
            number: issue.number,
            url: issue.html_url,
            repo: `${owner}/${repo}`,
            closedAt: issue.closed_at,
            assignee: issue.assignee?.login || "Unassigned",
            labels: issue.labels.map((l) => l.name),
            state: "closed",
          });
        }
      }
      if (data.length < 100) break;
      page++;
    }
  }
  return issues;
}

async function fetchProjectItems(graphqlAuth, since, until) {
  const items = [];
  const draftItems = [];
  let cursor = null;
  const sinceTime = since.getTime();
  const untilTime = until.getTime();

  while (true) {
    const query = `
      query($org: String!, $number: Int!, $cursor: String) {
        organization(login: $org) {
          projectV2(number: $number) {
            items(first: 50, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                createdAt
                content {
                  ... on Issue {
                    title
                    number
                    url
                    state
                    closedAt
                    repository { nameWithOwner }
                    assignees(first: 5) { nodes { login } }
                    labels(first: 10) { nodes { name } }
                  }
                  ... on PullRequest {
                    title
                    number
                    url
                    state
                    mergedAt
                    repository { nameWithOwner }
                    assignees(first: 5) { nodes { login } }
                    labels(first: 10) { nodes { name } }
                  }
                  ... on DraftIssue {
                    title
                    createdAt
                    updatedAt
                    assignees(first: 5) { nodes { login } }
                  }
                }
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2SingleSelectField { name } }
                    }
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      field { ... on ProjectV2Field { name } }
                    }
                    ... on ProjectV2ItemFieldIterationValue {
                      title
                      field { ... on ProjectV2IterationField { name } }
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      date
                      field { ... on ProjectV2Field { name } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const result = await graphqlAuth(query, {
        org: PROJECT_ORG,
        number: PROJECT_NUMBER,
        cursor,
      });

      const project = result.organization.projectV2;
      if (!project) {
        console.warn("Warning: Could not access project board. You may need project read permissions.");
        break;
      }

      const nodes = project.items.nodes;
      for (const node of nodes) {
        const content = node.content;
        if (!content) continue;

        // Extract custom fields (priority, status, iteration)
        const fields = {};
        for (const fv of node.fieldValues.nodes) {
          if (fv.field?.name && (fv.name || fv.text || fv.title || fv.date)) {
            fields[fv.field.name] = fv.name || fv.text || fv.title || fv.date;
          }
        }

        const status = fields["Status"] || fields["status"] || "";

        // Draft issues — no closedAt, no url, no number
        if (!content.url && content.title && !content.number) {
          const createdAt = new Date(content.createdAt || node.createdAt);
          const updatedAt = new Date(content.updatedAt || node.createdAt);
          // Include if created or updated/closed within the window
          const isDone = status.toLowerCase().includes("done") || status.toLowerCase().includes("closed");
          if (createdAt.getTime() >= sinceTime && createdAt.getTime() <= untilTime) {
            draftItems.push({
              title: content.title,
              createdAt: content.createdAt || node.createdAt,
              updatedAt: content.updatedAt || node.createdAt,
              assignee: content.assignees?.nodes?.map((a) => a.login).join(", ") || "Unassigned",
              priority: fields["Priority"] || fields["priority"] || "",
              status,
              iteration: fields["Iteration"] || fields["iteration"] || "",
              isDone,
            });
          } else if (isDone && updatedAt.getTime() >= sinceTime && updatedAt.getTime() <= untilTime) {
            draftItems.push({
              title: content.title,
              createdAt: content.createdAt || node.createdAt,
              updatedAt: content.updatedAt || node.createdAt,
              assignee: content.assignees?.nodes?.map((a) => a.login).join(", ") || "Unassigned",
              priority: fields["Priority"] || fields["priority"] || "",
              status,
              iteration: fields["Iteration"] || fields["iteration"] || "",
              isDone,
            });
          }
          continue;
        }

        // Regular issues with closedAt
        if (!content.closedAt) continue;

        const closedAt = new Date(content.closedAt);
        if (closedAt.getTime() >= sinceTime && closedAt.getTime() <= untilTime) {
          items.push({
            title: content.title,
            number: content.number,
            url: content.url,
            repo: content.repository?.nameWithOwner || "unknown",
            closedAt: content.closedAt,
            assignee: content.assignees?.nodes?.map((a) => a.login).join(", ") || "Unassigned",
            labels: content.labels?.nodes?.map((l) => l.name) || [],
            state: content.state?.toLowerCase(),
            priority: fields["Priority"] || fields["priority"] || "",
            status,
            iteration: fields["Iteration"] || fields["iteration"] || "",
          });
        }
      }

      if (!project.items.pageInfo.hasNextPage) break;
      cursor = project.items.pageInfo.endCursor;
    } catch (err) {
      console.warn("Warning: Could not fetch project board data:", err.message);
      break;
    }
  }
  return { items, draftItems };
}

async function fetchMergedPRs(octokit, since, until) {
  const prs = [];
  for (const { owner, repo } of REPOS) {
    let page = 1;
    while (true) {
      const { data } = await octokit.pulls.list({
        owner,
        repo,
        state: "closed",
        sort: "updated",
        direction: "desc",
        per_page: 100,
        page,
      });
      if (data.length === 0) break;

      let anyInRange = false;
      for (const pr of data) {
        if (!pr.merged_at) continue;
        const mergedAt = new Date(pr.merged_at);
        if (mergedAt >= since && mergedAt <= until) {
          anyInRange = true;
          prs.push({
            title: pr.title,
            number: pr.number,
            url: pr.html_url,
            repo: `${owner}/${repo}`,
            mergedAt: pr.merged_at,
            author: pr.user?.login || "Unknown",
            assignee: pr.assignee?.login || pr.user?.login || "Unassigned",
            labels: pr.labels.map((l) => l.name),
          });
        }
        // Stop pagination if we've gone past the window
        if (mergedAt < since) break;
      }
      if (data.length < 100 || !anyInRange) break;
      page++;
    }
  }
  return prs;
}

async function fetchNewIssues(octokit, since, until) {
  const issues = [];
  for (const { owner, repo } of REPOS) {
    let page = 1;
    while (true) {
      const { data } = await octokit.issues.listForRepo({
        owner,
        repo,
        state: "all",
        since: since.toISOString(),
        sort: "created",
        direction: "desc",
        per_page: 100,
        page,
      });
      if (data.length === 0) break;
      for (const issue of data) {
        if (issue.pull_request) continue;
        const createdAt = new Date(issue.created_at);
        if (createdAt >= since && createdAt <= until) {
          issues.push({
            title: issue.title,
            number: issue.number,
            url: issue.html_url,
            repo: `${owner}/${repo}`,
            createdAt: issue.created_at,
            author: issue.user?.login || "Unknown",
            assignee: issue.assignee?.login || "Unassigned",
            labels: issue.labels.map((l) => l.name),
            state: issue.state,
          });
        }
      }
      if (data.length < 100) break;
      page++;
    }
  }
  return issues;
}

async function fetchReleases(octokit, since, until) {
  const releases = [];
  for (const { owner, repo } of RELEASE_REPOS) {
    let page = 1;
    while (true) {
      const { data } = await octokit.repos.listReleases({
        owner,
        repo,
        per_page: 100,
        page,
      });
      if (data.length === 0) break;
      for (const release of data) {
        const publishedAt = new Date(release.published_at || release.created_at);
        if (publishedAt >= since && publishedAt <= until) {
          releases.push({
            name: release.name || release.tag_name,
            tagName: release.tag_name,
            url: release.html_url,
            repo: `${owner}/${repo}`,
            publishedAt: release.published_at || release.created_at,
            author: release.author?.login || "Unknown",
            prerelease: release.prerelease,
            body: release.body?.substring(0, 500) || "",
          });
        }
        if (publishedAt < since) break;
      }
      if (data.length < 100) break;
      page++;
    }
  }
  return releases;
}

/**
 * Fetch all dashboard data for a date window.
 * Returns { closedIssues, mergedPRs, newIssues, releases }.
 */
export async function fetchDashboardData(token, since, until) {
  const octokit = new Octokit({ auth: token });
  const graphqlAuth = graphql.defaults({ headers: { authorization: `token ${token}` } });

  console.log("  Fetching closed issues from repos...");
  const closedIssuesFromRepos = await fetchClosedIssuesFromRepos(octokit, since, until);

  console.log("  Fetching project board items...");
  const { items: projectItems, draftItems: draftIssues } = await fetchProjectItems(graphqlAuth, since, until);

  // Deduplicate: merge project items with repo issues (project items have richer metadata)
  const closedIssueMap = new Map();
  for (const item of projectItems) {
    closedIssueMap.set(item.url, item);
  }
  for (const issue of closedIssuesFromRepos) {
    if (!closedIssueMap.has(issue.url)) {
      closedIssueMap.set(issue.url, issue);
    }
  }
  const closedIssues = Array.from(closedIssueMap.values());

  console.log("  Fetching merged pull requests...");
  const mergedPRs = await fetchMergedPRs(octokit, since, until);

  console.log("  Fetching new issues...");
  const newIssues = await fetchNewIssues(octokit, since, until);

  console.log("  Fetching releases...");
  const releases = await fetchReleases(octokit, since, until);

  // Merge draft issues into closed/new issues
  for (const draft of draftIssues) {
    if (draft.isDone) {
      closedIssues.push({
        title: draft.title,
        number: null,
        url: null,
        repo: "Project Board",
        closedAt: draft.updatedAt,
        assignee: draft.assignee,
        labels: [],
        state: "closed",
        priority: draft.priority,
        status: draft.status,
        iteration: draft.iteration,
        isDraft: true,
      });
    } else {
      newIssues.push({
        title: draft.title,
        number: null,
        url: null,
        repo: "Project Board",
        createdAt: draft.createdAt,
        author: draft.assignee,
        assignee: draft.assignee,
        labels: [],
        state: "open",
        isDraft: true,
      });
    }
  }

  return { closedIssues, mergedPRs, newIssues, releases };
}
