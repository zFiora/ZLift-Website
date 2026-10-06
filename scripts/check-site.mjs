#!/usr/bin/env node
// Static checks for the ZLift website. No dependencies; Node 18+.
//
//   node scripts/check-site.mjs           check; list TODO placeholders (warnings)
//   node scripts/check-site.mjs --strict  also fail while any TODO placeholder remains
//
// Checks: every internal link and #fragment resolves (using Cloudflare Pages'
// clean-URL rules: /privacy -> privacy.html), every referenced asset exists, no
// external scripts/styles/images, no duplicate ids, required metadata, one <h1>,
// and the shared navigation on every page.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const strict = process.argv.includes('--strict');

const ROUTES = ['/', '/privacy', '/terms', '/support'];
const errors = [];
const todos = [];

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

  // TODO placeholders (visible spans and source comments).
  for (const m of html.matchAll(/TODO(?:\(([\w-]+)\))?:?\s*([^<\n]*)/g)) {
    const text = m[2].trim().replace(/-->$/, '').trim() || '(draft notice banner)';
    todos.push(`${name}:${lineOf(m.index)}  ${m[1] ? `[${m[1]}] ` : ''}${text}`);
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
  console.log(`\n${todos.length} TODO placeholder(s) to resolve before production:`);
  for (const t of todos) console.log(`  ${t}`);
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
if (strict && todos.length) {
  console.error('\n--strict: TODO placeholders remain.');
  process.exit(1);
}
console.log('\nAll checks passed.');
