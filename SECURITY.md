# Security policy

## Reporting a vulnerability

Please report security problems **privately**. Do not open a public issue or pull request that describes the problem.

1. Open the **Security** tab of this repository on GitHub.
2. Click **Report a vulnerability**.
3. Describe what you found, how to reproduce it, and what it could allow. A short description is enough; we will ask if we need more.

You can write in English or Indonesian. We will read the report and reply as soon as the maintainers can; there is no fixed response time, and there is no bug bounty.

If the **Report a vulnerability** button is not shown, private reporting has not been switched on yet. In that case open a public issue that says only "I would like to report a security problem privately" (no details) and a maintainer will arrange a private channel.

## Supported versions

Only the current state of the `main` branch is supported. Fixes are made there and deployed from there; older commits are not patched.

## What this project is, and what that means for security

The site is **static and runs entirely in the visitor's browser**. There is no server code, no database, no accounts, and no login. Everything a visitor saves (history, personal bests, settings) stays in that browser's storage and is never sent to us. The only data the site can send anywhere is the page-view statistics of the optional analytics service, which sets no cookies and is skipped for visitors who send Do Not Track or Global Privacy Control (see `README.md`, "Analytics", and the privacy page of the site).

Examples of what is in scope:

- Cross-site scripting (XSS) or another way to run script that the site did not ship, for example through the data import, the sentence files, or a URL.
- A weakness in the Content Security Policy or the security headers that lets an attacker bypass them.
- A vulnerable dependency that is actually reachable in the shipped site.
- Anything that makes the site send a visitor's saved data to a third party.

Examples of what is **not** a security problem (please use a normal issue instead):

- A wrong fact, a broken source link, or a typo in a sentence.
- A bug that only affects the visitor's own browser data (for example a failed import).
- Missing features, or reports from automated scanners that point at settings the site does not use (cookies, login forms, server software).

Thank you for helping keep the site safe.
