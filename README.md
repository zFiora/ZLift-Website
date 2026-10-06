# ZLift Website

Public website for **ZLift** at https://zlift.online: landing page, Privacy Policy, Terms of Service and Support.

Plain static HTML and CSS. No framework, no JavaScript, no dependencies, no cookies, no analytics and no third-party requests. Hosted on Cloudflare Pages.

This repository must contain **only public website content**. Never add secrets, API keys, credentials, app source code or private data.

## Routes

| URL | File |
|---|---|
| `/` | `public/index.html` |
| `/privacy` | `public/privacy.html` |
| `/terms` | `public/terms.html` |
| `/support` | `public/support.html` |
| any unknown path | `public/404.html` (HTTP 404) |

Cloudflare Pages serves `privacy.html` at `/privacy` and redirects `/privacy.html` and `/privacy/` to `/privacy`, so direct links and page refreshes work without any rewrite rules.

The app links to `https://zlift.online/privacy`, `https://zlift.online/terms` and `https://zlift.online/support`. The support page has a `#delete-account` anchor for the account-deletion URL that stores ask for.

## Structure

```
public/            deployed as-is (Cloudflare Pages output directory)
  index.html, privacy.html, terms.html, support.html, 404.html
  assets/styles.css, assets/favicon.svg
  _headers         security headers (CSP, nosniff, frame-deny, …)
  robots.txt, sitemap.xml
scripts/check-site.mjs   link/asset/metadata checker (the "build")
```

The header and footer are repeated in each page; keep them identical when editing.

## Commands (Node 18+)

```sh
npm run build          # all checks; fails on any error or MANUAL DECISION REQUIRED / TODO marker
npm run check:release  # same as build
npm run check:draft    # same checks, but only lists blocking markers (for work in progress)
npm run preview        # local Cloudflare Pages emulation at http://127.0.0.1:8788 (downloads wrangler via npx)
```

The checker covers: internal links and `#anchors`, assets, metadata, shared navigation, the single
support address `support@zlift.online` (shown on Privacy, Terms and Support; any other address fails),
a real effective date whose text matches its `datetime` on Privacy and Terms, the required sections
(Privacy: who we are, information collected, use, who can see it, providers, retention, account deletion,
rights, minimum age, changes, contact; Terms: acceptance, eligibility, termination, changes, contact;
Support: contact and `#delete-account`), the deletion links between them, and placeholder text
(`TBD`, `[insert …]`, `lorem ipsum`, draft banners, …).

ZLift is run by an individual developer. The checker intentionally does **not** require a company name,
postal address, provider regions or retention periods; don't add checks that could only pass by inventing them.

## Markers

- `MANUAL DECISION REQUIRED`: needs the owner's decision before release. Fails the build.
- `TODO`: unfinished work. Fails the build.
- `OPTIONAL DECISION`: possible later improvements (e.g. lawful basis per purpose, governing law, provider
  regions, change notices). Listed only; not needed to publish.

Change the effective date (`<time datetime="YYYY-MM-DD">` and its text) whenever a policy's content changes.

## Cloudflare Pages settings

- Framework preset: **None**
- Build command: `npm run build`
- Build output directory: `public`
- Root directory: *(empty)*
- Environment variables: **none**

Production branch: `main`.
