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
npm run build          # check links, anchors, assets, metadata; list TODO placeholders
npm run check:release  # same, but fails while any TODO placeholder remains
npm run preview        # local Cloudflare Pages emulation at http://127.0.0.1:8788 (downloads wrangler via npx)
```

## Before production

Search for `TODO` (`npm run build` lists every one). These include the support email, the legal entity, effective dates, retention periods and legal review. Then run `npm run check:release`.

## Cloudflare Pages settings

- Framework preset: **None**
- Build command: `npm run build`
- Build output directory: `public`
- Root directory: *(empty)*
- Environment variables: **none**

Production branch: `main`.
