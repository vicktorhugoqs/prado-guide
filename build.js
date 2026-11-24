#!/usr/bin/env node
/*
 * build.js — renders data.js into the static HTML that ships.
 *
 * data.js is the single source of truth for all content. This script
 * writes the work cards, section headings, the route table and the ticket
 * line straight into the pages, so the guide reads with JavaScript off;
 * the runtime script only runs the seen/unseen checklist and the offline
 * download.
 *
 * Nothing is generated from scratch. Each target file keeps its
 * hand-written shape and the build only replaces the bytes between
 * sentinel comments, so prose, CSS and markup outside those regions are
 * copied through untouched.
 *
 *   node build.js                 write index.html, subpages, sw.js, sitemap.xml
 *   node build.js --check         exit 1 if any file is out of date
 *   node build.js --report-links  help wire subpage names to work anchors
 *
 * Run it after every edit to data.js and before every commit.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = __dirname;
const p = (...a) => path.join(ROOT, ...a);
const read = f => fs.readFileSync(p(f), 'utf8');

const SITE = 'https://vicktorhugoqs.github.io/prado-guide/';

/* ---------------------------------------------------------------- data */

// data.js is a browser-style file: it assigns to window.GUIDE. Run it in a
// vm with a stub window rather than regex-stripping the assignment.
function loadGuide() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('data.js'), ctx, { filename: 'data.js' });
  const G = ctx.window.GUIDE;
  if (!G || !G.sections || !G.works) throw new Error('data.js did not define window.GUIDE');
  checkData(G);
  return G;
}

// Fields with no visible fallback are checked on every load rather than
// left to review: alt text nobody sighted will read, ids the anchors and
// the checklist depend on, and the room each card sends a visitor to.
const ALT_MAX = 150;
function checkData(G) {
  const bad = [];
  const secs = new Set(G.sections.map(s => s.id));
  const ids = new Set();
  for (const w of G.works) {
    if (ids.has(w.id)) bad.push(`${w.id}: duplicate id`);
    ids.add(w.id);
    if (!/^[a-z0-9-]+$/.test(w.id)) bad.push(`${w.id}: id must be [a-z0-9-]`);
    if (!secs.has(w.sec)) bad.push(`${w.id}: unknown section ${w.sec}`);
    for (const k of ['title', 'maker', 'mat', 'inv', 'room', 'url', 'img', 'blurb'])
      if (!w[k]) bad.push(`${w.id}: missing ${k}`);
    if (!fs.existsSync(p(w.img || ''))) bad.push(`${w.id}: image ${w.img} not found`);
    if (!w.alt) bad.push(`${w.id}: no alt`);
    else if (w.alt.length > ALT_MAX) bad.push(`${w.id}: alt is ${w.alt.length} chars (max ${ALT_MAX})`);
    else if (!/[.!?]$/.test(w.alt)) bad.push(`${w.id}: alt does not end in a full stop`);
    if (w.look && !/[.!?]$/.test(w.look)) bad.push(`${w.id}: look does not end in a full stop`);
  }
  for (const s of G.sections) {
    if (!G.works.some(w => w.sec === s.id)) bad.push(`section ${s.id}: no works`);
    if (!['0', '1', '2'].includes(s.floor)) bad.push(`section ${s.id}: floor must be 0, 1 or 2`);
  }
  if (bad.length) throw new Error(`data.js:\n  ${bad.join('\n  ')}`);
}

/* ------------------------------------------------------------ escaping */

// data.js holds plain text, never markup, so escape unconditionally.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');

/* -------------------------------------------------------- jpeg reading */

// Intrinsic size straight out of the file, so <img> can carry width and
// height and the page stops reflowing as images load. Walks the segment
// chain rather than scanning for FFC0, which would false-positive on any
// byte pair inside the entropy-coded data.
function jpegSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt16BE(0) !== 0xffd8) throw new Error(`${file}: not a JPEG`);
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) throw new Error(`${file}: lost segment alignment at ${i}`);
    while (buf[i + 1] === 0xff) i++; // fill bytes
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // standalone, no length field
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end of image
    const len = buf.readUInt16BE(i + 2);
    const isSOF = marker >= 0xc0 && marker <= 0xcf &&
                  marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error(`${file}: no frame header found`);
}

/* ------------------------------------------------------------ emitters */

// The chip label is the section name up to its first colon:
// "Velázquez II: Painter to the King" rides in the nav as "Velázquez II".
const chipLabel = name => name.split(':')[0].trim();
const floorName = f => ({ '0': 'Floor 0', '1': 'Floor 1', '2': 'Floor 2' })[f];
const roomList = rooms => rooms.split(',').map(r => r.trim());

function renderChips(G) {
  return G.sections
    .map((s, i) => `  <a class="chip" href="#s-${s.id}"><span class="fl">${s.floor}</span>${i + 1}. ${esc(chipLabel(s.name))}</a>`)
    .join('\n');
}

// The route at a glance: one row per section, in walking order, so a
// visitor holding the museum's paper plan can see where each stop is.
function renderRoute(G) {
  const rows = G.sections.map((s, i) =>
    `      <tr><td>${i + 1}</td><td><a href="#s-${s.id}">${esc(s.name)}</a></td>` +
    `<td>${s.floor}</td><td>${roomList(s.rooms).map(esc).join(', ')}</td></tr>`);
  return [
    `    <table class="route">`,
    `      <thead><tr><th scope="col">#</th><th scope="col">Stop</th><th scope="col">Floor</th><th scope="col">Rooms</th></tr></thead>`,
    `      <tbody>`,
    ...rows,
    `      </tbody>`,
    `    </table>`,
  ].join('\n');
}

function renderWork(w, ind) {
  const { w: iw, h: ih } = jpegSize(p(w.img));
  const meta = `${esc(w.mat)} · ${esc(w.inv)}`;
  const out = [
    `${ind}<article class="work" id="w-${w.id}">`,
    `${ind}<img src="${escAttr(w.img)}" width="${iw}" height="${ih}" loading="lazy" decoding="async" alt="${escAttr(w.alt)}">`,
    `${ind}<div class="workbody">`,
    `${ind}  <div class="workhead"><div>`,
    `${ind}    <p class="room">Room ${esc(w.room)}</p>`,
    `${ind}    <h3>${esc(w.title)}</h3>`,
    `${ind}    <p class="maker">${esc(w.maker)}</p>`,
    // Visible link text stays short — the card is dense — so the
    // destination is named for screen readers instead.
    `${ind}    <p class="meta">${meta} · <a href="${escAttr(w.url)}" aria-label="${escAttr(w.title)} on museodelprado.es">museum page</a></p>`,
    // Cards ship unseen; the runtime script applies .seen from localStorage.
    `${ind}  </div><button class="seenbtn" aria-label="Mark ${escAttr(w.title)} as seen" aria-pressed="false" data-id="${escAttr(w.id)}">✓</button></div>`,
    `${ind}  <p class="blurb">${esc(w.blurb)}</p>`,
  ];
  if (w.look) out.push(`${ind}  <p class="look"><b>Look for</b> ${esc(w.look)}</p>`);
  out.push(`${ind}</div>`, `${ind}</article>`);
  return out.join('\n');
}

function renderSections(G) {
  const bySec = {};
  G.works.forEach(w => (bySec[w.sec] = bySec[w.sec] || []).push(w));
  return G.sections.map((s, i) => [
    `  <section class="gallery">`,
    `  <p class="where"><span>${i + 1} of ${G.sections.length}</span> ${floorName(s.floor)} · Rooms ${roomList(s.rooms).map(esc).join(', ')}</p>`,
    `  <h2 id="s-${s.id}">${esc(s.name)}</h2>`,
    `  <p class="intro">${esc(s.intro)}</p>`,
    ...bySec[s.id].map(w => renderWork(w, '  ')),
    `  </section>`,
  ].join('\n')).join('\n');
}

/* ---------------------------------------------------------- admission */

// The ticket price would otherwise be written by hand in four places —
// including the FAQ's JSON-LD, where a drifting copy is invisible until a
// search engine quotes it. All four are rendered from data.js/admission.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const fmtDateShort = iso => fmtDate(iso).replace(/ (\w{3})\w* /, ' $1 ');

function admission(G) {
  const a = G.admission;
  if (!a || !a.price || !a.reduced || !a.checked)
    throw new Error('data.js: admission needs price, reduced and checked');

  const checked = fmtDate(a.checked);
  const free = 'free for everyone in the last two hours (Monday to Saturday 18:00–20:00, Sundays and holidays 17:00–19:00), and always free for under-18s';

  return {
    // index.html — the practical box.
    index:
      `€${a.price} general, €${a.reduced} reduced; ${free}. Checked ${fmtDateShort(a.checked)} — ` +
      `<a href="${escAttr(a.ticketsUrl)}">confirm on museodelprado.es</a>.`,

    // faq/index.html — the full answer. Only the volatile claim is bold.
    faq:
      `General admission is <b>€${a.price}</b>; the reduced ticket is €${a.reduced}. Entry is ${free}. ` +
      `Free hours mean queues, and the same timed tickets apply, so expect to wait at the door. ` +
      `Prices change — checked ${checked}, so confirm on the ` +
      `<a href="${escAttr(a.ticketsUrl)}">official prices page</a>, and buy only from museodelprado.es: resellers charge more.`,

    // The same answer as plain text for the FAQPage structured data.
    // Currency spelled out because assistants read this string aloud.
    faqJson:
      `General admission is ${a.price} euros and the reduced ticket ${a.reduced} euros. Entry is ${free}. ` +
      `Prices change — checked ${checked}, so confirm on the official prices page at museodelprado.es.`,

    // highlights-2-hours/index.html — one clause inside a longer bullet.
    route: `Tickets €${a.price}; the last two hours each day are free (and crowded).`,
  };
}

// The FAQ's JSON-LD cannot carry HTML comment markers — they would make the
// JSON invalid — so its answer is located by question text instead, with
// an exactly-once check so it can never silently match the wrong entry.
function replaceJsonAnswer(src, question, text) {
  const re = new RegExp(
    `("name": ${JSON.stringify(question).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, ` +
    `"acceptedAnswer": \\{"@type": "Answer", "text": )"(?:[^"\\\\]|\\\\.)*"`, 'g');
  const hits = src.match(re);
  if (!hits || hits.length !== 1)
    throw new Error(`JSON-LD answer for ${JSON.stringify(question)}: expected exactly one match, found ${hits ? hits.length : 0}`);
  return src.replace(re, (_, head) => head + JSON.stringify(text));
}

/* ------------------------------------------------------------ regions */

// A region is replaced only when both of its markers are present exactly
// once. Anything else means the file drifted from what the build expects,
// and guessing would risk eating hand-written prose.
function replaceRegion(src, name, body, open, close) {
  const a = open.replace('NAME', name), b = close.replace('NAME', name);
  const count = t => src.split(t).length - 1;
  if (count(a) !== 1 || count(b) !== 1)
    throw new Error(`marker "${name}": expected exactly one ${a} and one ${b}`);
  const i = src.indexOf(a) + a.length, j = src.indexOf(b);
  if (j < i) throw new Error(`marker "${name}": end marker precedes start marker`);
  return src.slice(0, i) + '\n' + body + '\n' + src.slice(j);
}
const htmlRegion = (src, name, body) =>
  replaceRegion(src, name, body, '<!--BEGIN GENERATED NAME-->', '<!--END GENERATED NAME-->');
const jsRegion = (src, name, body) =>
  replaceRegion(src, name, body, '/* BEGIN GENERATED NAME */', '/* END GENERATED NAME */');

/* -------------------------------------------------------------- lastmod */

// Honest dates without churn: a page is stamped today only while its
// source is actually modified, otherwise it keeps the date git recorded.
const TODAY = new Date().toISOString().slice(0, 10);
function lastmodFor(file) {
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', file], { cwd: ROOT }).toString().trim();
    if (dirty) return TODAY;
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT }).toString().trim();
    return d || TODAY;
  } catch {
    return TODAY; // no git available — a fresh date is the safe answer
  }
}

/* --------------------------------------------------------------- build */

const SHELL = [
  './', 'index.html', 'faq/', 'highlights-2-hours/', 'manifest.webmanifest',
  'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
];

// SHELL entries are request URLs, and three of them are directories the
// server resolves to an index. Cache-busting reads the file behind the URL.
const SHELL_FILE = {
  './': 'index.html',
  'faq/': 'faq/index.html',
  'highlights-2-hours/': 'highlights-2-hours/index.html',
};

// The cache name changes whenever any cached byte changes, so a visitor can
// never keep a stale copy. Pages are hashed from the bytes this run is about
// to write, not from the copies still on disk.
function cacheHash(urls, pending) {
  const h = crypto.createHash('sha256');
  for (const url of urls) {
    const file = SHELL_FILE[url] || url;
    const bytes = file in pending ? Buffer.from(pending[file], 'utf8') : fs.readFileSync(p(file));
    h.update(`${url}\0${bytes.length}\0`).update(bytes);
  }
  return h.digest('hex').slice(0, 16);
}

const PAGES = [
  [SITE, 'index.html'],
  [SITE + 'highlights-2-hours/', 'highlights-2-hours/index.html'],
  [SITE + 'faq/', 'faq/index.html'],
];

function build() {
  const G = loadGuide();
  const adm = admission(G);
  const out = {};

  let index = read('index.html');
  index = htmlRegion(index, 'chips', renderChips(G));
  index = htmlRegion(index, 'route', renderRoute(G));
  index = htmlRegion(index, 'sections', renderSections(G));
  index = htmlRegion(index, 'admission', adm.index);
  index = htmlRegion(index, 'count', String(G.works.length));
  out['index.html'] = index;

  let faq = read('faq/index.html');
  faq = htmlRegion(faq, 'admission', adm.faq);
  faq = replaceJsonAnswer(faq, TICKETS_QUESTION, adm.faqJson);
  out['faq/index.html'] = faq;

  let route = read('highlights-2-hours/index.html');
  route = htmlRegion(route, 'admission', adm.route);
  out['highlights-2-hours/index.html'] = route;

  const images = [...new Set(G.works.map(w => w.img))].sort();
  const hash = cacheHash([...SHELL, ...images], {
    'index.html': index,
    'faq/index.html': faq,
    'highlights-2-hours/index.html': route,
  });
  const list = a => a.map(s => `  ${JSON.stringify(s)},`).join('\n');
  let sw = read('sw.js');
  sw = jsRegion(sw, 'assets', [
    `// CacheStorage is scoped to the origin, not to this path, and`,
    `// github.io hosts every one of this account's projects side by side.`,
    `// The prefix is what keeps activate from evicting a neighbour's cache.`,
    `const PREFIX = 'prado-guide-';`,
    `const CACHE = PREFIX + '${hash}';`,
    ``,
    `// Cached during install: the guide has to be usable the moment it loads.`,
    `const SHELL = [`,
    list(SHELL),
    `];`,
    ``,
    `// Fetched in the background once the page is up, so a visitor on hotel`,
    `// wi-fi walks into the galleries with all ${images.length} images offline.`,
    `const IMAGES = [`,
    list(images),
    `];`,
  ].join('\n'));
  out['sw.js'] = sw;

  const urls = PAGES.map(([loc, file]) =>
    `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmodFor(file)}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>`
  ).join('\n');
  out['sitemap.xml'] =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return out;
}

/* ------------------------------------------------------- link reporting */

const SUBPAGES = ['highlights-2-hours/index.html', 'faq/index.html'];

// Identifies the one FAQPage entry rendered from data.js. Matched verbatim,
// so editing this question in faq/index.html means editing it here too.
const TICKETS_QUESTION = 'How much are Prado tickets, and when is it free?';
const STOP = new Set(['the', 'of', 'a', 'an', 'and', 'in', 'to', 'from', 'with', 'at', 'on', 's', 'or']);
const tokens = s => (s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) || []).filter(t => !STOP.has(t));

function reportLinks() {
  const G = loadGuide();
  const ids = new Set(G.works.map(w => w.id));
  let bad = 0;
  for (const f of SUBPAGES) {
    const src = read(f);
    console.log(`\n=== ${f} ===\n`);
    const NAMES = /<a href="[^"]*#w-[^"]*">([^<]{4,})<\/a>|<(b|i)>([^<]{4,})<\/\2>/g;
    for (const m of src.matchAll(NAMES)) {
      const linked = m[1] !== undefined;
      const phrase = linked ? m[1] : m[3];
      const want = tokens(phrase);
      if (!want.length) continue;
      const ranked = G.works.map(w => {
        const have = new Set([...tokens(w.title), ...tokens(w.maker), ...tokens(w.id)]);
        return { id: w.id, title: w.title, score: want.filter(t => have.has(t)).length };
      }).filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      console.log(`${linked ? '[linked] ' : '         '}${phrase}`);
      if (!linked) ranked.forEach(c => console.log(`             ~ ${c.id}  (${c.title})`));
    }
    for (const m of src.matchAll(/#w-([a-z0-9-]+)/g)) {
      if (!ids.has(m[1])) { console.error(`  BROKEN ANCHOR: #w-${m[1]}`); bad++; }
    }
  }
  if (bad) { console.error(`\n${bad} anchor(s) point at works that do not exist.`); process.exit(1); }
  console.log('\nAll existing work anchors resolve.');
}

/* ---------------------------------------------------------------- main */

function main() {
  const arg = process.argv[2];
  if (arg === '--report-links') return reportLinks();

  const out = build();
  const changed = Object.entries(out).filter(([f, body]) => !fs.existsSync(p(f)) || read(f) !== body).map(([f]) => f);

  if (arg === '--check') {
    if (changed.length) {
      console.error(`Out of date — run: node build.js\n  ${changed.join('\n  ')}`);
      process.exit(1);
    }
    console.log('Up to date.');
    return;
  }

  changed.forEach(f => fs.writeFileSync(p(f), out[f]));
  console.log(changed.length ? `Wrote ${changed.join(', ')}` : 'No changes.');
}

main();
