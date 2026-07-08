# Iteration Review Dashboard

A GitHub Pages–hosted dashboard for leadership iteration reviews. Data is pulled
from GitHub by a monthly GitHub Actions workflow into a static `docs/data.json`,
and the web page lets you **select a date range** and view the matching issues,
PRs, and releases entirely client-side (no token needed by viewers).

## Data Sources

- **Closed Issues** — from [microsoft/projects/2041](https://github.com/orgs/microsoft/projects/2041) + repos
- **Merged PRs** — from `microsoft/WinAppCli`, `microsoft/electron-on-windows-gallery`, and `microsoft/WinAppVSCE`
- **New Issues** — created in these repos during the period
- **Releases** — published from `microsoft/WinAppCli` and `microsoft/WinAppVSCE`

Repos and the project number are configured in [`lib/fetch.js`](lib/fetch.js).

## How it works

```
GitHub Actions (monthly, 1st)  ──►  build-data.js  ──►  docs/data.json (committed)
                                                             │
                                              GitHub Pages serves docs/
                                                             │
                              docs/index.html + app.js  ──►  date-range picker filters the data
```

- On the **1st of every month at 06:00 UTC** the workflow runs, fetches the
  **previous month's** data, and merges it into `docs/data.json`. History
  accumulates over time, so the picker can span any collected month.
- You can also run it manually (**Actions → Build & Deploy Dashboard → Run
  workflow**) and optionally pass a month or range to (re)fetch.

## One-time setup

1. **Push this repo to GitHub.**
2. **Add a token secret.** The default `GITHUB_TOKEN` can't read the other repos
   or the org project board, so create a PAT with `repo` + `read:project` scope
   and add it as a repository secret named **`DASHBOARD_TOKEN`**
   (Settings → Secrets and variables → Actions → New repository secret).
3. **Enable GitHub Pages** with **Source = GitHub Actions**
   (Settings → Pages). The workflow deploys the `docs/` folder.
4. **Seed the data** (optional, recommended): run the workflow manually with a
   range to backfill, e.g. `2026-01 2026-06`. Without a seed, the first
   scheduled run only contains the previous month.

The published site will be at `https://<owner>.github.io/<repo>/`.

## Local development

```bash
npm install
```

Authenticate with a token that has `repo` + `read:project` scope (or be logged
in via `gh auth login`):

```bash
$env:GITHUB_TOKEN = "ghp_your_token_here"   # PowerShell
```

### Build / update the hosted data (`docs/data.json`)

```bash
node build-data.js                 # previous calendar month
node build-data.js 2026-06         # a specific month
node build-data.js 2026-01 2026-06 # backfill a range, month by month
```

### Preview the site locally

`data.json` is fetched over HTTP, so serve the `docs/` folder rather than
opening the file directly:

```bash
cd docs
python -m http.server 8137
# open http://localhost:8137/
```

### One-off static HTML export (no picker)

`index.js` still generates a single self-contained `dashboard.html` for a fixed
window — handy for emailing a snapshot:

```bash
node index.js 6/1/26 6/30/26
```

## Project layout

| Path | Purpose |
| --- | --- |
| `lib/fetch.js` | Shared GitHub data fetching (repos, project board, releases) |
| `build-data.js` | Fetches month(s) and merges into `docs/data.json` |
| `docs/index.html` | Hosted page shell with the date-range picker |
| `docs/app.js` | Loads `data.json`, filters by range, renders sections |
| `docs/styles.css` | Dashboard styling |
| `docs/data.json` | Accumulated data (generated; committed by the workflow) |
| `index.js` + `template.js` | Local one-off static HTML export |
| `.github/workflows/build-dashboard.yml` | Monthly build + Pages deploy |
