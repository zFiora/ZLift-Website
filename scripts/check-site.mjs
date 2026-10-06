#!/usr/bin/env node
// Static checks for the ZLift website. No dependencies; Node 18+.
//
//   node scripts/check-site.mjs --strict  fail on any error or blocking marker (npm run build)
//   node scripts/check-site.mjs           same checks, but blocking markers are only listed (drafting)
//
// Markers in the HTML (visible spans or source comments):
//   MANUAL DECISION REQUIRED  needs the owner's decision; blocks --strict
//   TODO                      unfinished work; blocks --strict
//   OPTIONAL DECISION         nice to have, not needed to publish; listed for information only
//
// Checks: every internal link and #fragment resolves (using Cloudflare Pages'
// clean-URL rules: /privacy -> privacy.html), every referenced asset exists, no
// external scripts/styles/images, no duplicate ids, required metadata, one <h1>,
// the shared navigation on every page, a single support address that every
// legal/support page shows, a valid effective date on the legal pages, the
// sections the Privacy Policy, Terms and Support page must have (including the
// account-deletion URL the app and stores link to), and no placeholder text.
//
// It deliberately does not require a company name, postal address, provider
// regions or retention periods: ZLift is run by an individual and those values
// aren't needed to publish. Don't add a check that can only pass by inventing them.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const strict = process.argv.includes('--strict');

const ROUTES = ['/', '/privacy', '/terms', '/support'];
const SUPPORT_EMAIL = 'support@zlift.online';
// Sections (<h2 id>) each page must have. Some ids are also linked from outside
// the site: /support#delete-account is the store listings' deletion URL.
// `needs` are strings the section must contain.
const MAILTO = `href="mailto:${SUPPORT_EMAIL}"`;
const REQUIRED_SECTIONS = {
  'privacy.html': {
    'who-we-are': [MAILTO],
    'information-we-collect': [],
    'how-we-use': [],
    'who-can-see': [],
    'service-providers': [],
    retention: [],
    'account-deletion': ['password', 'href="/support#delete-account"', MAILTO],
    'your-rights': [],
    children: [],
    changes: [],
    contact: [MAILTO],
  },
  'terms.html': {
    acceptance: ['href="/privacy"'],
    eligibility: [],
    termination: ['href="/support#delete-account"'],
    changes: [],
    contact: [MAILTO],
  },
  'support.html': {
    contact: [MAILTO],
    'delete-account': ['password', MAILTO, 'href="/privacy#account-deletion"'],
  },
};
// Pages that must show the support address.
const CONTACT_PAGES = ['privacy.html', 'terms.html', 'support.html'];
const DATED_PAGES = ['privacy.html', 'terms.html'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];
// Placeholder text that must never be published (checked outside HTML comments).
const PLACEHOLDERS = [
  [/class="todo(?:-banner)?"/, 'draft/TODO marker element'],
  [/lorem ipsum/i, '"lorem ipsum"'],
  [/\b(?:TBD|TBA|FIXME|XXX+)\b/, 'TBD/FIXME/XXX'],
  [/\[(?:insert|your|company|name|address|date|email)\b[^\]]*\]/i, '[bracketed placeholder]'],
  [/\b(?:your|company) (?:name|address)\b/i, '"your/company name/address"'],
  [/\bexample\.(?:com|org|net)\b/i, 'example.com address'],
];
const errors = [];
const todos = [];
const optional = [];

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const files = walk(root);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const rel = (f) => relative(root, f).replaceAll('\\', '/');

// Cloudflare Pages: "/" -> index.html, "/x" -> x.html or x/index.html, "/a.css" -> a.css.
function resolvePath(urlPath) {
  const clean = decodeURIComponent(urlPath.replace(/\/+$/, '')) || '/';
  if (clean === '/') return join(root, 'index.html');
  const direct = join(root, clean);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  if (existsSync(direct + '.html')) return direct + '.html';
  if (existsSync(join(direct, 'index.html'))) return join(direct, 'index.html');
  return null;
}

const idsOf = new Map();
const sources = new Map();
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  sources.set(file, html);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${rel(file)}: duplicate id "${id}"`);
    seen.add(id);
  }
  idsOf.set(file, seen);
}

for (const [file, html] of sources) {
  const name = rel(file);
  const is404 = name === '404.html';
  const lineOf = (index) => html.slice(0, index).split('\n').length;

  // Open items (visible spans and source comments).
  const marker = /(MANUAL DECISION REQUIRED|OPTIONAL DECISION|TODO)\s*(?:\(([\w-]+)[^)]*\))?:?\s*([^<\n]*)/g;
  for (const m of html.matchAll(marker)) {
    const text = m[3].trim().replace(/-->$/, '').trim() || '(draft notice banner)';
    const line = `${name}:${lineOf(m.index)}  ${m[2] ? `[${m[2]}] ` : ''}${text}`;
    (m[1] === 'OPTIONAL DECISION' ? optional : todos).push(line);
  }

  // One support address everywhere.
  for (const m of html.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) {
    if (m[0] !== SUPPORT_EMAIL) errors.push(`${name}:${lineOf(m.index)}: email ${m[0]} (use ${SUPPORT_EMAIL})`);
  }
  for (const m of html.matchAll(/href="mailto:([^"?]*)/g)) {
    if (m[1] !== SUPPORT_EMAIL) errors.push(`${name}:${lineOf(m.index)}: mailto must be ${SUPPORT_EMAIL}`);
  }

  if (CONTACT_PAGES.includes(name) && !html.includes(MAILTO)) {
    errors.push(`${name}: no support contact (${MAILTO})`);
  }

  // Effective date: present, a real date, and the visible text matches it ("6 October 2026").
  if (DATED_PAGES.includes(name)) {
    const d = html.match(/Effective date: <time datetime="(\d{4})-(\d{2})-(\d{2})">([^<]+)<\/time>/);
    if (!d) {
      errors.push(`${name}: missing effective date (Effective date: <time datetime="YYYY-MM-DD">)`);
    } else {
      const [y, mo, day] = [+d[1], +d[2], +d[3]];
      const date = new Date(Date.UTC(y, mo - 1, day));
      if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== day) {
        errors.push(`${name}: effective date ${d[1]}-${d[2]}-${d[3]} is not a real date`);
      } else if (d[4].trim() !== `${day} ${MONTHS[mo - 1]} ${y}`) {
        errors.push(`${name}: effective date text "${d[4]}" doesn't match datetime ${d[1]}-${d[2]}-${d[3]}`);
      }
    }
  }

  // Required sections and what they must contain.
  const headings = [...html.matchAll(/<h2 id="([^"]+)"/g)];
  for (const [id, needs] of Object.entries(REQUIRED_SECTIONS[name] ?? {})) {
    const at = headings.findIndex((h) => h[1] === id);
    if (at < 0) {
      errors.push(`${name}: missing required section <h2 id="${id}">`);
      continue;
    }
    const end = headings[at + 1]?.index ?? html.indexOf('</article>', headings[at].index);
    const body = html.slice(headings[at].index, end).replace(/<!--[\s\S]*?-->/g, '');
    for (const need of needs) {
      if (!body.includes(need)) errors.push(`${name}: section #${id} must contain ${need}`);
    }
  }

  // Placeholder text in what visitors see.
  const visible = html.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
  for (const [re, what] of PLACEHOLDERS) {
    const m = visible.match(re);
    if (m) errors.push(`${name}:${lineOf(m.index)}: placeholder text (${what}): "${m[0]}"`);
  }

  // Required document structure and metadata.
  const need = [
    [/<html lang="en">/, 'lang attribute'],
    [/<meta charset="utf-8">/, 'charset'],
    [/<meta name="viewport" content="width=device-width, initial-scale=1">/, 'viewport meta'],
    [/<title>[^<]{5,}<\/title>/, '<title>'],
    [/<link rel="icon" href="\/assets\/favicon\.svg"/, 'favicon'],
    [/<a class="skip-link" href="#main">/, 'skip link'],
    [/<main id="main">/, '<main id="main">'],
  ];
  if (!is404) {
    need.push(
      [/<meta name="description" content="[^"]{50,}">/, 'meta description (50+ chars)'],
      [/<link rel="canonical" href="https:\/\/zlift\.online\/[a-z]*">/, 'canonical URL'],
      [/<meta property="og:title"/, 'og:title'],
      [/<meta property="og:description"/, 'og:description'],
      [/<meta property="og:url" content="https:\/\/zlift\.online\/[a-z]*">/, 'og:url'],
    );
  }
  for (const [re, what] of need) if (!re.test(html)) errors.push(`${name}: missing ${what}`);

  const h1s = html.match(/<h1[\s>]/g) ?? [];
  if (h1s.length !== 1) errors.push(`${name}: expected exactly one <h1>, found ${h1s.length}`);

  // Shared navigation: header and footer both link to every route.
  for (const region of ['site-header', 'site-footer']) {
    const block = html.match(new RegExp(`class="${region}"[\\s\\S]*?</(header|footer)>`));
    if (!block) {
      errors.push(`${name}: missing .${region}`);
      continue;
    }
    for (const route of ROUTES) {
      if (!block[0].includes(`href="${route}"`)) errors.push(`${name}: .${region} has no link to ${route}`);
    }
  }
  const current = [...html.matchAll(/<a href="([^"]+)" aria-current="page"/g)].map((m) => m[1]);
  if (!is404) {
    const own = name === 'index.html' ? '/' : '/' + name.replace(/\.html$/, '');
    if (!current.length || current.some((c) => c !== own)) {
      errors.push(`${name}: aria-current should mark ${own} (found ${current.join(', ') || 'none'})`);
    }
  }

  // Images need alt text (inline decorative SVGs use aria-hidden instead).
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) errors.push(`${name}:${lineOf(m.index)}: <img> without alt`);
  }

  // Links and resources.
  for (const m of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    const [, attr, url] = m;
    const where = `${name}:${lineOf(m.index)}`;
    const tag = html.slice(html.lastIndexOf('<', m.index), m.index);

    if (/^https?:\/\//.test(url)) {
      // Only canonical links may point at an absolute URL; nothing is loaded from elsewhere.
      if (!/<link rel="canonical"/.test(tag)) errors.push(`${where}: external ${attr} ${url}`);
      continue;
    }
    if (url.startsWith('mailto:')) continue;
    if (url === '' || /^(javascript|data):/.test(url)) {
      errors.push(`${where}: invalid ${attr} "${url}"`);
      continue;
    }

    const [path, fragment] = url.split('#');
    let target = file;
    if (path) {
      if (!path.startsWith('/')) {
        errors.push(`${where}: use root-relative URLs (got "${url}")`);
        continue;
      }
      if (path.endsWith('.html')) errors.push(`${where}: link to a clean URL instead of ${path}`);
      target = resolvePath(path);
      if (!target) {
        errors.push(`${where}: broken ${attr} ${url}`);
        continue;
      }
    }
    if (fragment && target.endsWith('.html') && !idsOf.get(target)?.has(fragment)) {
      errors.push(`${where}: missing anchor #${fragment} in ${rel(target)}`);
    }
  }
}

// Every route must resolve to a page.
for (const route of ROUTES) {
  if (!resolvePath(route)) errors.push(`route ${route} does not resolve to a file`);
}
for (const required of ['404.html', '_headers', 'robots.txt', 'sitemap.xml', 'assets/styles.css', 'assets/favicon.svg']) {
  if (!existsSync(join(root, required))) errors.push(`missing public/${required}`);
}

// CSS url() references must exist.
for (const css of files.filter((f) => f.endsWith('.css'))) {
  for (const m of readFileSync(css, 'utf8').matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (/^(data:|#)/.test(m[1])) continue;
    if (/^https?:/.test(m[1]) || !resolvePath(m[1])) errors.push(`${rel(css)}: bad url(${m[1]})`);
  }
}

console.log(`Checked ${htmlFiles.length} pages, ${files.length} files in public/.`);
if (todos.length) {
  console.log(`\n${todos.length} open item(s) to resolve before production:`);
  for (const t of todos) console.log(`  ${t}`);
}
if (optional.length) {
  console.log(`\n${optional.length} optional decision(s), not blocking:`);
  for (const t of optional) console.log(`  ${t}`);
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
if (strict && todos.length) {
  console.error('\n--strict: MANUAL DECISION REQUIRED / TODO items remain.');
  process.exit(1);
}
console.log('\nAll checks passed.');
