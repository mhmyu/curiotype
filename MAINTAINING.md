# Maintainer guide

A step-by-step handbook for the owner of this repository. It assumes you can follow instructions carefully, but **not** that you are a programmer or know GitHub well. Commands are written exactly as you should type them; clicks are written as **Bold > Bold**.

> **Menu names change.** GitHub and Cloudflare rename and move buttons from time to time. If a name below is slightly different on your screen, look for the closest one nearby. The *settings and values* (branch `main`, build command `pnpm build`, output folder `dist`, and so on) are what matter.

## Contents

1. [First-time setup](#1-first-time-setup)
2. [Deploy](#2-deploy)
3. [After the site is live](#3-after-the-site-is-live)
4. [Add content yourself](#4-add-content-yourself)
5. [Review content pull requests](#5-review-content-pull-requests)
6. [Handle reports](#6-handle-reports)
7. [Routine](#7-routine)
8. [Release and rollback](#8-release-and-rollback)
9. [Troubleshooting](#9-troubleshooting)
10. [Checklist before the public release](#10-checklist-before-the-public-release)

## Words used in this guide

| Word | Meaning |
| --- | --- |
| Repository ("repo") | The project folder stored on GitHub, with its full history. |
| Branch | A separate line of work. `main` is the official one; the live site is built from it. |
| Commit | One saved change in the history. |
| Pull request ("PR") | A proposal to merge a branch into `main`. Others (and the automatic checks) can review it first. |
| Merge | Accept a pull request: its changes become part of `main`. |
| CI | The automatic checks GitHub runs on every pull request (`.github/workflows/ci.yml`). Green = passed, red = failed. |
| Deploy | Publish the built site to the internet. Here it happens automatically after a merge to `main`. |

---

## 1. First-time setup

### 1.1 Tools on your computer

You need, once:

- **Git** (<https://git-scm.com/downloads>).
- **Node.js 22.23.4 or newer**; Node 24 is what CI and the host use (<https://nodejs.org>).
- **pnpm 12.15.0** (<https://pnpm.io/installation>). Check with `pnpm --version`.
- A free **GitHub account**.

Open a terminal in the project folder and check that everything works before you publish anything:

```bash
pnpm install
pnpm check && pnpm test:run && pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check`, `pnpm test:run` and `pnpm build` must finish without errors. `pnpm test:e2e` runs the browser tests against the build you just made (run `pnpm build` first; it needs the Chromium download once). For a quick check while you work, `pnpm test:e2e:smoke` runs only the tests tagged `@smoke` (about 30 of them, under a minute); the full run stays the one that counts.

### 1.2 Create the repository on GitHub

1. Sign in to GitHub, click **+** (top right) **> New repository**.
2. **Repository name:** your choice (for example `typing`). **Visibility: Public** (contributors and free branch protection need it).
3. Leave **Add a README**, **.gitignore** and **license** *unchecked*: the project already has them.
4. Click **Create repository**. Keep the page open; it shows the repository address, like `https://github.com/<owner>/<repo>.git`.

### 1.3 Push the code

In the terminal, inside the project folder (replace the address with yours):

```bash
git init -b main
git add .
git status
git commit -m "Initial commit"
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

Before `git commit`, read the `git status` list. It must **not** contain `node_modules/`, `dist/`, `.env` or `docs/` (they are ignored by `.gitignore`). It **should** contain `pnpm-lock.yaml`. If you skipped `git init` because the folder is already a repository, just add the remote and push.

**The lockfile.** `pnpm-lock.yaml` pins the exact versions of every package, so CI and the host install the same thing you tested. Confirm it is in the repository:

```bash
git ls-files pnpm-lock.yaml
```

It must print the file name. If it prints nothing, run `git add pnpm-lock.yaml`, `git commit -m "Add lockfile"` and `git push`.

If `pnpm install` stops with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, see [Troubleshooting](#9-troubleshooting).

### 1.4 Check that CI is green

1. On GitHub open the **Actions** tab. A run called **CI** starts by itself after the push.
2. Wait a few minutes. The run lists four jobs: **Check and build**, **End-to-end tests (shard 1 of 2)**, **End-to-end tests (shard 2 of 2)** and **End-to-end tests**. The two shards each run half of the browser tests in parallel; the last job only turns green when both shards are green. All of them must finish with a green check.
3. If one is red, click it, open the red step and read the message (see [Troubleshooting](#9-troubleshooting)). Fix it before continuing.

Note the two exact job names; you need them in 1.6.

### 1.5 Repository settings

Open the repository, then **Settings** (the tab on the far right).

1. **Issues.** **Settings > General > Features:** tick **Issues**.
2. **Private vulnerability reporting.** **Settings > Code security** (older name: *Code security and analysis*): find **Private vulnerability reporting** and click **Enable**. This is what `SECURITY.md` tells people to use.
3. **Dependabot.** On the same page enable **Dependabot alerts** and **Dependabot security updates**. The weekly update schedule is already in `.github/dependabot.yml` and starts by itself.
4. **Labels.** **Issues > Labels > New label.** Create these (colors do not matter):
   - `content`: sentence suggestions and source-link problems. The "Sentence suggestion" form puts this label on new issues, **but only if the label already exists**, so create it first.
   - `fact-report`: reports of a wrong fact.
   - `needs-source`: a suggestion or report that still lacks a public source.
   - `good first issue`: GitHub usually has it already; create it if it is missing.
5. **How pull requests are merged.** **Settings > General > Pull Requests:** keep only **Allow squash merging** ticked (untick merge commits and rebase merging), and tick **Automatically delete head branches**. Squash merging turns a pull request into one tidy commit.
6. **Pull requests from strangers.** **Settings > Actions > General > Fork pull request workflows from outside collaborators:** keep **Require approval for first-time contributors** (the default). A first-time contributor's pull request then waits for you to click **Approve and run workflows** before CI runs. CI uses a read-only token, so this is a safety net, not the only protection.
7. **Description and topics.** On the repository home page click the gear next to **About**, write a one-line description (for example "Typing practice with sentences that teach you something"), and add topics such as `typing-test`, `astro`, `svelte`, `education`.

### 1.6 Protect the `main` branch

This stops anyone (including you by mistake) from pushing broken changes straight to `main`. Do it **after** the first push and the first green CI run: the status checks only appear in the picker after they have run once.

1. **Settings > Rules > Rulesets > New ruleset > New branch ruleset.**
2. **Ruleset name:** `Protect main`. **Enforcement status:** **Active**.
3. **Target branches > Add target > Include default branch.**
4. Tick these rules:
   - **Restrict deletions** (usually ticked already).
   - **Block force pushes** (usually ticked already).
   - **Require a pull request before merging.** Set **Required approvals** to `0` while you are the only maintainer (GitHub does not let you approve your own pull request, so `1` would block you). Raise it when you have a second maintainer.
   - **Require status checks to pass.** Click **Add checks** and add **Check and build** and **End-to-end tests** (the one without "shard" in its name: it stands for both shards, so the rule keeps working if the number of shards changes). Tick **Require branches to be up to date before merging** if offered.
5. Click **Create**.

From now on, changes reach `main` only through a pull request whose two checks are green. You can still edit files in the browser: GitHub will make a branch and a pull request for you.

> If you ever lock yourself out (for example a check was renamed), open the ruleset, fix the check name, and save. Do not delete the protection to get around a red check.

### 1.7 Optional hardening

- **Pin the actions to a commit.** Now that the repository exists, replace the version tags in `.github/workflows/ci.yml` with full commit hashes so a moved tag cannot change what runs: open each action's page (for example <https://github.com/actions/checkout/releases>), copy the commit hash of the release you use, and write `uses: actions/checkout@<hash> # v4.x.y`. Dependabot keeps hash-pinned actions up to date and shows the new version in its pull request. Do this for `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` and `actions/upload-artifact`.
- **CODEOWNERS.** When you want GitHub to ask a specific person to review specific files, create `.github/CODEOWNERS`, for example `* @your-username` and `/src/content/ @your-username @another-reviewer`, then tick **Require review from Code Owners** in the ruleset. Skip this while you work alone.

---

## 2. Deploy

The site is static: `pnpm build` writes it to the `dist` folder. The recommended host is **Cloudflare Pages** (free for static sites, global CDN, automatic HTTPS, a preview for every pull request, custom headers; see also `README.md`, "Deploy"). Netlify reads the same `public/_headers` file and also works; the settings below are the same there (build command, output folder, variables).

### 2.1 Create the project

1. Create or sign in to a free account at <https://dash.cloudflare.com>.
2. **Workers & Pages > Create application > Pages > Connect to Git** (the wording may be "Import an existing Git repository").
3. Authorize GitHub when asked, choose your account, and select **only this repository**. Click **Begin setup**.
4. Fill in:

| Field | Value |
| --- | --- |
| Project name | your choice; it becomes `<name>.pages.dev` |
| Production branch | `main` |
| Framework preset | **None** (or Astro; the next two fields decide) |
| Build command | `pnpm build` |
| Build output directory | `dist` |

5. Open **Environment variables (advanced)** and add:

| Variable | Value | Why |
| --- | --- | --- |
| `NODE_VERSION` | `24` | The build image's default Node is older. |
| `PNPM_VERSION` | `12.15.0` | The build image does not read `packageManager`, and its default pnpm is older. |

6. Click **Save and Deploy**. The first build takes a few minutes. When it finishes, Cloudflare shows the address `https://<name>.pages.dev`. Open it: `/` must open `/id/` or `/en/`, depending on the language of your browser (a browser that lists no language the site has gets `/en/`). If it always lands on `/id/` after an earlier deploy, your browser cached the old permanent redirect: clear the site data or try a private window.

> If the dashboard only offers "Workers" with static assets and no "Pages", use that flow with the same build command and output folder `dist`; the `_headers` file works there too. Cloudflare's own documentation is the reference if the screens differ.

### 2.2 Environment variables of the site

Open the project, **Settings > Variables and Secrets** (or **Environment variables**). There are two tabs, **Production** and **Preview**; the live site uses Production.

| Variable | Production | Preview |
| --- | --- | --- |
| `NODE_VERSION`, `PNPM_VERSION` | as above | as above |
| `SITE_URL` | the final address, no trailing path: `https://<name>.pages.dev` now, your own domain later | leave **empty** |
| `PUBLIC_REPO_URL` | `https://github.com/<owner>/<repo>` | same, or empty |
| `PUBLIC_ANALYTICS_CLOUDFLARE_TOKEN` | see [3.2](#32-analytics) | empty |

Why `SITE_URL` stays empty for previews: with it set, every preview page would announce the real site as its canonical address and add itself to the sitemap. Without it those tags are simply left out, which is what you want for a throwaway preview.

After you change a variable, **redeploy**: **Deployments > the latest one > ⋯ > Retry deployment** (variables are read at build time, not at run time).

### 2.3 Custom domain and HTTPS

1. **Custom domains > Set up a custom domain**, type the domain you own and follow the steps. If the domain's DNS is already at Cloudflare this is automatic; otherwise Cloudflare shows the DNS record to add at your registrar.
2. HTTPS is issued automatically; wait until the domain shows **Active**.
3. Change `SITE_URL` (Production) to the new domain and redeploy, so canonical links, the sitemap and the sharing image use it.

### 2.4 Previews for pull requests

Every pull request gets its own preview address. Cloudflare posts it as a comment on the pull request (or in its check list) once the build finishes. Use it to look at a change in a real browser, on your phone as well.

### 2.5 Check the security headers

`public/_headers` is applied by the host only (`pnpm dev` ignores it). After the first deploy:

```bash
curl -sI https://<your-domain>/id/
```

The answer must contain `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `x-frame-options: DENY`, a `permissions-policy` line and `content-security-policy: frame-ancestors 'none'`. Then:

Then open the page source of `/id/` (right-click, **View page source**), find a file name that starts with `/_astro/` (a `.css` or `.js` file), and request it the same way (`curl -sI https://<your-domain>/_astro/<file name>`): it must carry `cache-control: public, max-age=31536000, immutable`.

In a browser, open DevTools (F12) > **Console** on `/id/`: there must be no message that mentions "Content Security Policy". The script and style rules live in a `<meta>` tag in each page (see `README.md`, "Deploy").

---

## 3. After the site is live

### 3.1 Fill in the public values

Set `SITE_URL` and `PUBLIC_REPO_URL` for Production (see [2.2](#22-environment-variables-of-the-site)) and redeploy. Then check:

- `https://<domain>/robots.txt` ends with a `Sitemap:` line.
- `https://<domain>/sitemap-index.xml` opens.
- Viewing the page source of `/id/` shows `<link rel="canonical"` and `hreflang` lines.
- The footer shows the GitHub link.
- Finish a sentence test: each sentence in "What you just typed" has a **Report a wrong fact** link, and it opens the form on GitHub with the sentence id already in the title and the first field.
- In the same list, tap **Save to collection** (the star), then open **Collection** in the navigation: the sentence is listed there, also with a **Report a wrong fact** link.
- Open **Statistics** in the navigation: after a few tests it shows the number of tests, the typing time, the WPM trend and the accuracy per category; the sentence coverage counts the sentences you typed to the end.
- Open **Settings**, choose a **Daily goal** (for example 1 test), go back to **Home** and finish a test: a small badge above the controls shows "1-day streak" and "1 of 1 tests today". The streak continues when you finish at least one test on the next day and starts over after a skipped day.

### 3.2 Analytics

Analytics is optional and off until you set a token.

1. Cloudflare dashboard > **Analytics & Logs > Web Analytics > Add a site**. Enter your domain and choose the **manual JavaScript snippet** setup (not "automatic").
2. In the snippet, copy the `token` value (the 32 characters after `"token":`).
3. Pages project > **Settings > Variables and Secrets > Production:** add `PUBLIC_ANALYTICS_CLOUDFLARE_TOKEN` with that value. Redeploy.
4. **Do not** switch on the "Web Analytics" toggle of the Pages project. The site loads the script itself (so it can respect Do Not Track and the security policy); the toggle would add a second, blocked one.
5. Check: open the live site, DevTools > **Network**: one request to `beacon.min.js?token=...`. With Do Not Track turned on in your browser there must be none. Ad blockers also block it, so counts are a lower bound.

The privacy page changes its analytics paragraph by itself depending on whether a token was set at build time.

### 3.3 Search engines

0. The statistics, collection and settings pages are deliberately `noindex` and not in the sitemap; Search Console will list them under "Excluded by noindex tag". That is expected, not a problem. The typing guide pages (`/id/guide/` and `/en/guide/`) are indexed: after deploy, check that both are listed in `sitemap-0.xml` (this needs `SITE_URL`) and that the home page shows the hint line under the tagline. The root address `/` is a small page that sends the visitor to `/id/` or `/en/` by browser language, so `curl -sI https://<your-domain>/` answers `200`, not a redirect.
1. **Google Search Console** (<https://search.google.com/search-console>): add your site as a property, verify it (Cloudflare DNS or the HTML tag method), then **Sitemaps > Add** `sitemap-index.xml`.
2. **Bing Webmaster Tools** (<https://www.bing.com/webmasters>): add the site (you can import it from Search Console), then submit the same sitemap.

Results appear after days or weeks; that is normal.

### 3.4 Sharing preview

Paste the home page address into a chat app or a post draft and check the title, description and image (`/og/id.png`, `/og/en.png`). Social networks cache previews for a long time. If you see an old one, use the network's debugger tool (for example Facebook's Sharing Debugger or LinkedIn's Post Inspector) to refresh it.

### 3.5 Install and offline test

1. On a phone, open the live address in Chrome (Android) or Safari (iPhone) and use the browser menu: **Install app** or **Add to Home Screen** (on iPhone: Share, then **Add to Home Screen**). The icon should be the green "T"; the app opens without the browser bar, on the home page of the language you installed it from.
2. Open the app once while online, wait a few seconds, then switch on airplane mode and open the app again. It must open, and you must be able to finish a test.
3. On a computer, you can do the same in Chrome: open the site, press **F12**, go to **Application > Service Workers** and tick **Offline**, then reload.
4. After you deploy a change, open the installed app while online. Within a minute or after the next time you bring it back to the foreground, a message "A new version is available" appears at the bottom with **Reload** and **Later**. The page never reloads by itself in the middle of a test.

If step 2 fails, see [Troubleshooting](#9-troubleshooting).

### 3.6 Lighthouse

In Chrome open the live page, DevTools > **Lighthouse**, choose **Mobile**, and run it. Read the scores for Performance, Accessibility, Best Practices and SEO. A very low Accessibility or SEO score on a page is worth a bug report (an issue with the page address and the failed items).

---

## 4. Add content yourself

From idea to live site. `CONTENT_GUIDE.md` has the writing rules and a worked example; this is the workflow.

1. **Pick the file:** `src/content/sentences/<lang>/<category>.json` (for example `id/science.json`). For a **new category**, run `pnpm content:add-category <name> --id "<label>" --en "<label>"` first (for example `pnpm content:add-category geography --id Geografi --en Geography`): it adds the category to `src/content/categories.json` and creates a placeholder file for each language, which you then fill in (the build fails while a `REPLACE_ME` is left). Add `--langs id` to create the file for one language only; `--dry-run` shows what it would do without writing.
2. **Find the next id:** it continues from the highest number in the file (`id-science-006` follows `id-science-005`).
3. **Write the item** (copy an existing one as a template): one fact, your own words, a public source that states it, and the difficulty its score gives (`pnpm content:stats --scores` shows it; the build rejects a label that does not match).
4. **Test it on your computer:**

   ```bash
   git checkout -b content/id-science-astronomy
   pnpm build
   ```

   A rule violation fails the build with a message naming the sentence and the rule; fix it and run again.
5. **Open a pull request:**

   ```bash
   git add src/content
   git commit -m "Add 5 astronomy sentences (id/science)"
   git push -u origin content/id-science-astronomy
   ```

   GitHub shows a yellow bar **Compare & pull request**; click it, fill in the checklist.
6. **Wait for the green checks**, look at the preview address if you like, then **Squash and merge**.
7. **It goes live by itself** within a few minutes (see [8](#8-release-and-rollback)).

You can also edit a file directly on GitHub (pencil icon); the protected `main` makes GitHub create the branch and pull request for you.

Targets before the public release: at least **100 sentences per category per language**, with roughly 50% easy and 50% hard.

---

## 5. Review content pull requests

Quick checklist, in this order:

1. **CI is green** (both jobs). A red check means the author must fix something; the message names the sentence and the rule.
2. **Check three random facts** against their source: open the source link and find the statement. If a source does not say it, ask for a better one or remove the sentence.
3. **No copied wording.** Search a distinctive phrase of the sentence in a search engine; wording lifted from the source is not accepted.
4. **Ids are right:** continue the numbering, no duplicates, and the language and category match the file.
5. **Scope:** one language and one category, at most 20 sentences, and no unrelated edits.
6. **Content rules** from `CONTRIBUTING.md` ("What will be rejected"): no medical, legal or financial advice, nothing disputed or promotional, no unverified AI text.

**Id conflicts.** If two pull requests chose the same id, the second shows a conflict or a build error "Duplicate sentence id". Ask the author to pull the latest `main` and renumber, or do it yourself: open the pull request, **Files changed**, and edit the file in the browser.

**When to ask for changes and when to decline.**

- *Ask for changes:* a fixable problem (length, characters, id numbers, a weak source, wording too close to the source). Comment on the exact line; be specific and friendly.
- *Decline (close with a short, kind explanation):* copied text, facts that cannot be supported, sensitive or advertising content, or an author who does not respond for a long time (you can say they are welcome to reopen).

**Merge** with **Squash and merge**. Edit the proposed commit title if it is unclear. For a first-time contributor's pull request, GitHub may ask you to click **Approve and run workflows** before CI starts.

---

## 6. Handle reports

> Each sentence in the results list has a **Report a wrong fact** link. It opens the "Wrong fact report" form on GitHub with the sentence id filled in; the visitor needs a GitHub account to send it. The link only appears when `PUBLIC_REPO_URL` is set for the build. A weekly automatic check of all source links also reports broken ones (see below), and the steps work for both.

**A reported wrong fact (`fact-report`).** The issue title is `[Fact] <sentence id>` and it carries the label `fact-report` (if the label is missing on the issue, create it as in [1.5](#15-repository-settings)). The form asks: what is wrong, what is correct (optional) and a source link (optional).

1. Open the sentence: on GitHub press `/` or use the search box, and search for the id in quotes, for example `"id-science-003"`; it is the `id` line of an entry in a file under `src/content/sentences/`. Then open its source.
2. If the report is right, **correct the sentence in place and keep its id** (open a pull request as in [4](#4-add-content-yourself)). Only remove the sentence when it cannot be fixed.
3. **Never give a removed sentence's id to a new sentence.** Visitors' browsers remember ids (favorites, "already typed"); a reused id would show up as already seen. New sentences continue from the highest number ever used, which may be higher than the highest number left in the file (look at the file's history if unsure).
4. If the report has no source for the correction, add `needs-source`, ask for one, and leave the sentence as it is until you can verify it yourself.
5. Thank the reporter and close the issue with a link to the fixing pull request.

**A broken source link** (reported by a person, or by the automatic weekly check, which opens or updates one issue titled "Broken source links found by the link check" with the label `content`; the table lists each broken URL and the sentence ids that cite it). Open the link yourself first: some sites block automatic checks but work for people (that is "uncertain", not broken). If it is really gone, search for the same page on an archive or find another public source that states the fact; replace `source.title` and `source.url`; if you cannot find any source, the sentence has to go (see step 3 above for its id). When every link in the issue is fixed, close it; the next weekly run opens a new one only if links are broken again. To check right away, open **Actions > Link check > Run workflow**, or run `pnpm content:check-sources` on your computer.

**A sentence suggestion** (label `content`). Check it like a pull request ([5](#5-review-content-pull-requests)); if it is good, add it yourself using [4](#4-add-content-yourself) and thank the person (mention their name in the pull request if they agree).

**A security report** arrives privately under **Security > Advisories**, not as an issue. Read it, reply there, and see `SECURITY.md`.

---

## 7. Routine

**Weekly (about 10 minutes)**

- Open pull requests and issues: review, merge or reply to each.
- Look at new `fact-report` and `needs-source` items.
- Run `pnpm content:stats` to see sentence counts per language, category and difficulty and where they drift from 50/50 or below the 100 target (it only prints; warnings do not mean anything is broken).
- Glance at the **Actions** tab for red runs on `main`.

**Monthly**

- **Dependabot pull requests.** Each week it may open one grouped pull request for minor and patch updates, and a separate pull request for every major update. For a grouped one: CI green, then merge. For a major one: read the "Release notes" in the description, check that CI is green, try the preview if the change touches the page, then merge or close with a note.
- The automatic source-link check: it runs every Monday. A red **Link check** run in the **Actions** tab, or an open issue with the label `content` titled "Broken source links...", means a source needs fixing (see [6](#6-handle-reports)). The "uncertain" list in the job summary needs no action unless you notice a real problem when you open the link yourself.
- Once, after Dependabot's first run: open **Insights > Dependency graph > Dependabot** and make sure it shows no error. If it reports that it cannot read `pnpm-lock.yaml`, the dependency updates are not running; open an issue in this repository describing the message so it can be fixed.

---

## 8. Release and rollback

**Release.** Merging a pull request into `main` triggers a build and a deploy on the host automatically; nothing else is needed. Watch it under **Workers & Pages > your project > Deployments**; a green deployment is live.

**Rollback**, when a change turns out to be bad. Two parts:

1. *Right now:* Cloudflare dashboard > the project > **Deployments**, find the last good **Production** deployment, **⋯ > Rollback to this deployment**.
2. *For good:* the bad change is still in `main`, so the next merge would deploy it again. On GitHub open the bad pull request (**Pull requests > Closed**) and click **Revert**. It creates a new pull request that undoes the change; merge it after the checks pass.

---

## 9. Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Build or CI fails with a message naming a sentence id and a rule | A content rule was broken (length, difficulty label, characters, id, source, duplicate) | Read the message, fix that sentence following `CONTENT_GUIDE.md` ("Automatic checks" and "Common mistakes"), run `pnpm build` again |
| `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` on `pnpm install` | pnpm 12 refuses packages published too recently, and an old lockfile asks for one | Delete `pnpm-lock.yaml`, run `pnpm install`, test, commit the new lockfile. For a Dependabot pull request: wait a day, then comment `@dependabot rebase` on it |
| **End-to-end tests** is red | One of the two shards failed: a real browser test fails, or the browser could not start | Open the run, see which **shard** is red, download its **playwright-report-shard-1** or **playwright-report-shard-2** file at the bottom (kept 7 days), and read the failed test. Reproduce with `pnpm build && pnpm test:e2e` |
| CI is green locally but red on GitHub | Different Node or pnpm version, or a missing file | Compare with Node 24 and pnpm 12.15.0; check that every changed file was committed (`git status`) |
| Cloudflare build fails at install: "pnpm" or "lockfile" | `PNPM_VERSION` missing, or `pnpm-lock.yaml` not committed | Set `PNPM_VERSION=12.15.0`, commit the lockfile, retry the deployment |
| Cloudflare build fails with a Node version message | `NODE_VERSION` missing or too old | Set `NODE_VERSION=24` for both Production and Preview, retry |
| 404 on the live site, or the page is empty | The output directory is wrong, or the last build failed and an old one is shown | Check **Build output directory** is `dist`; open **Deployments** and read the failed build's log |
| Canonical and `hreflang` tags, sitemap or the sharing image are missing | `SITE_URL` is empty for that build | Set `SITE_URL` (Production), redeploy |
| Sharing preview shows no image or an old one | `SITE_URL` was empty at build time, or the network cached the old preview | Fix `SITE_URL` and redeploy, confirm `/og/id.png` opens, then refresh the preview with the network's debugger tool |
| No analytics numbers | No token at build time, Do Not Track or an ad blocker on your own browser, or the Pages toggle was switched on | Follow [3.2](#32-analytics); wait a few hours for the first numbers |
| Console shows a "Content Security Policy" message | A change added a script, style or outside address the policy does not allow | Run `pnpm build && pnpm test:e2e` (`csp.spec.ts` names the problem); see `README.md`, "Deploy", for how to extend the policy |
| Headers are missing on the live site | `public/_headers` was not deployed (it is ignored by `pnpm dev` and `pnpm preview`) | Check `dist/_headers` exists after `pnpm build`, redeploy, and repeat [2.5](#25-check-the-security-headers) |
| No "Report a wrong fact" link under the sentences | `PUBLIC_REPO_URL` is empty or invalid for that build | Set `PUBLIC_REPO_URL` (Production) to `https://github.com/<owner>/<repo>` and redeploy |
| The report form opens without the id filled in, or without the label | The form file or its field was renamed, or the label `fact-report` does not exist | Keep `.github/ISSUE_TEMPLATE/fact-report.yml` with a field `id: sentence_id`; create the label ([1.5](#15-repository-settings)); run `pnpm test:run` (`report.test.ts` checks the link against the form) |
| An installed app or offline copy does not update | The app was not brought back online, the browser has not yet checked (it checks when the app returns to the foreground, at most once an hour), or `sw.js` is served from a cache | Open the app online and wait a minute; close it fully and open it again. Check that `/sw.js` answers with `Cache-Control: no-cache` (the `/sw.js` rule in `public/_headers`) and that the build log of the deployment says `sw.js written`. As a last resort: DevTools > Application > Service Workers > Unregister, then reload |
| **Link check** is red, or an issue "Broken source links..." was opened | A source page was removed or moved (404, 410, or the site no longer exists) | Open the issue's table, follow [6](#6-handle-reports), then close the issue |
| **Link check** fails with "label ... not found" when creating the issue | The label `content` does not exist | Create it as in [1.5](#15-repository-settings), then run the workflow again from **Actions > Link check > Run workflow** |
| Dependabot opens nothing | It runs only on its schedule, or it cannot read the lockfile | See the one-time check at the end of [7](#7-routine) |

---

## 10. Checklist before the public release

Tick each item before you announce the site.

- [ ] **Verify or replace the sample sentences** (40 in `id` and `en`, and 20 draft sentences in `es`). The shipped sentences only exercise the flow: every fact must be checked and every source (currently English Wikipedia pages) replaced by a proper one (see `CONTENT_GUIDE.md`, section 4).
- [ ] **At least 100 sentences per category per language**, roughly 50% easy and 50% hard. (A language still in `DRAFT_LANGUAGES` is not offered to visitors; see [10.1](#101-launch-a-draft-language) for what it needs before you launch it.)
- [ ] **Recalibrate the difficulty thresholds** (`DIFFICULTY_THRESHOLDS` in `src/lib/difficulty.ts`) once a language nears 100 sentences per category: run `pnpm content:stats`, compare each threshold with the median score it prints, and if you move one, relabel the sentences with `pnpm content:stats --scores` (the build lists any label that no longer matches).
- [ ] **Copyright line.** `LICENSE` says "The typing contributors"; replace it with your own name if you prefer. Leave `LICENSE-CONTENT` as it is.
- [ ] **Review the privacy text** on `/id/privacy/` and `/en/privacy/`, including the sentences about hosting logs and analytics. It describes what the app really does but has not been reviewed as a legal text; have it checked if you need it to be one.
- [ ] **Read the typing guide text** (`/id/guide/`, `/en/guide/`; the text is in the dictionary section `guide.page`) and the home page hint and card (`home.guideHint`, `home.guideCard`). It gives general posture advice and a few claims about how long learning takes; make sure you agree with every sentence, and keep it free of medical claims.
- [ ] **Test on real phones:** iOS Safari and Android Chrome. Type a full sentence, close the keyboard in the middle (the "Tap to continue" overlay must appear and work), rotate the phone, switch the theme, and use the language switches.
- [ ] `SITE_URL` and `PUBLIC_REPO_URL` are set for Production, and [3.1](#31-fill-in-the-public-values) passes.
- [ ] Security headers verified ([2.5](#25-check-the-security-headers)), no Content Security Policy message in the console.
- [ ] CI is green on `main`; branch protection is on ([1.6](#16-protect-the-main-branch)); private vulnerability reporting is on; labels exist.
- [ ] Analytics decided: either a token is set and checked ([3.2](#32-analytics)), or it stays off on purpose.
- [ ] `pnpm-lock.yaml` is committed and Dependabot shows no error.

### 10.1 Launch a draft language

The languages `es`, `pt-br`, `fr` and `de` are **drafts**: the build checks them, but the sentence language select on the live site does not list them (it lists them when you run `pnpm dev`). A language is launched by deleting its code from one line in `src/config/languages.ts`. Do that only when every box below is ticked for that language.

- [ ] **Enough sentences.** At least about 20 per category (the final target is 100). `pnpm content:stats` prints the counts and marks draft languages.
- [ ] **Facts and sources verified** by you or someone who knows the language, with a source in that language where one exists. `pnpm content:check-sources` tells which links do not open. The `es` sentences that ship with the project are samples and are **not** verified.
- [ ] **Difficulty calibrated.** Run `pnpm content:stats --scores`: the median score it prints for the language should be close to its threshold (`DIFFICULTY_THRESHOLDS` in `src/lib/difficulty.ts`), so about half the sentences are easy. If you move the threshold, relabel the sentences with the levels the command shows; the build lists every label that no longer matches. Check the length range (`TEXT_LENGTH` in `src/lib/content-rules.ts`) the same way.
- [ ] **Accents typed by hand.** On a computer with the **keyboard layout of that language** (add it in the system settings if needed), run `pnpm dev`, choose the language, and type a few accented sentences: no false error marks, the cursor never sticks, a dead key (press the accent key, then the letter) gives the right letter. Repeat on a real **phone**. Look also that the accented letters are drawn in the same serif font as the others. (The automated test only simulates input; this check cannot be automated.)
- [ ] **Heat map layout.** Open the statistics page in that language: the keys should follow its keyboard (AZERTY for French, QWERTZ for German). `KEYBOARD_ROWS` in `src/features/stats/weak-keys.ts` is where a layout is defined.
- [ ] **Launch.** Delete the code from `DRAFT_LANGUAGES`, run `pnpm check && pnpm test:run && pnpm build`, open a pull request and merge. After the deploy, the language appears in the select.
