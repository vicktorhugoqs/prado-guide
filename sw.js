/* Asset lists and the cache name are generated — run: node build.js */
/* BEGIN GENERATED assets */
// CacheStorage is scoped to the origin, not to this path, and
// github.io hosts every one of this account's projects side by side.
// The prefix is what keeps activate from evicting a neighbour's cache.
const PREFIX = 'prado-guide-';
const CACHE = PREFIX + 'de06aeb7122c9a70';

// Cached during install: the guide has to be usable the moment it loads.
const SHELL = [
  "./",
  "index.html",
  "faq/",
  "highlights-2-hours/",
  "manifest.webmanifest",
  "favicon.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
];

// Fetched in the background once the page is up, so a visitor on hotel
// wi-fi walks into the galleries with all 54 images offline.
const IMAGES = [
  "img/adoration-of-the-shepherds.jpg",
  "img/aesop.jpg",
  "img/anguissola-philip-ii.jpg",
  "img/annunciation.jpg",
  "img/baltasar-carlos.jpg",
  "img/charles-v-at-muhlberg.jpg",
  "img/charon-crossing-the-styx.jpg",
  "img/christ-crucified.jpg",
  "img/clara-peeters.jpg",
  "img/clothed-maja.jpg",
  "img/danae.jpg",
  "img/david-goliath.jpg",
  "img/death-of-the-virgin.jpg",
  "img/descent-from-the-cross.jpg",
  "img/drowning-dog.jpg",
  "img/durer-adam-and-eve.jpg",
  "img/durer-self-portrait.jpg",
  "img/endymion-porter.jpg",
  "img/execution-of-torrijos.jpg",
  "img/family-of-carlos-iv.jpg",
  "img/fight-with-cudgels.jpg",
  "img/fortuny-japanese-room.jpg",
  "img/garden-of-earthly-delights.jpg",
  "img/garden-of-love.jpg",
  "img/haywain.jpg",
  "img/holy-trinity.jpg",
  "img/immaculate-venerables.jpg",
  "img/judith-banquet.jpg",
  "img/las-meninas.jpg",
  "img/mars.jpg",
  "img/martyrdom-saint-philip.jpg",
  "img/milkmaid-of-bordeaux.jpg",
  "img/naked-maja.jpg",
  "img/nastagio.jpg",
  "img/nobleman-hand-on-chest.jpg",
  "img/rubens-adoration.jpg",
  "img/saturn.jpg",
  "img/second-of-may.jpg",
  "img/seven-deadly-sins.jpg",
  "img/surrender-of-breda.jpg",
  "img/the-andrians.jpg",
  "img/the-cardinal.jpg",
  "img/the-parasol.jpg",
  "img/the-spinners.jpg",
  "img/third-of-may.jpg",
  "img/three-graces.jpg",
  "img/triumph-of-bacchus.jpg",
  "img/triumph-of-death.jpg",
  "img/venus-organist.jpg",
  "img/villa-medici.jpg",
  "img/vulcans-forge.jpg",
  "img/washing-of-the-feet.jpg",
  "img/witches-sabbath.jpg",
  "img/zurbaran-still-life.jpg",
];
/* END GENERATED assets */

// Install caches the shell only, so first use never waits on ~5 MB of
// images. allSettled rather than addAll: addAll is all-or-nothing, and one
// missing file must cost that file alone, not the whole install.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

// Drop superseded caches, but only ones this guide made: on github.io
// the origin is shared with every other project the account publishes.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

// Cache-first, and every fetched response is kept. This is also the lazy
// tier for images: anything the visitor scrolls past is stored even if the
// background download below never runs.
// Same-origin only: the analytics ping on another origin must reach its
// server every time, not be answered from this cache.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(hit =>
      hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
    )
  );
});

// The page asks for this once it is idle, so the visitor reaches the
// galleries with every image stored. Capped concurrency: the point is
// to fill the cache without making the tab feel slow.
async function cacheImages() {
  const cache = await caches.open(CACHE);
  const queue = IMAGES.slice();
  let done = 0, failed = 0;

  const post = async () => {
    const cs = await self.clients.matchAll();
    cs.forEach(c => c.postMessage({type: 'cache-progress', done, total: IMAGES.length, failed}));
  };

  const worker = async () => {
    for (let url; (url = queue.shift());) {
      // Already stored — count it and move on, so a second run is cheap.
      if (!(await cache.match(url, {ignoreSearch: true}))) {
        try { await cache.add(url); } catch (err) { failed++; }
      }
      done++;
      if (done % 6 === 0) await post();
    }
  };

  await Promise.all(Array.from({length: 6}, worker));
  await post();
}

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'cache-images') e.waitUntil(cacheImages());
});
