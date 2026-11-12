/* Гримуар: работа без сети. Страница (зашифрованная), значки и звуки хранятся в кэше телефона.
   Страница открывается сразу из кэша, свежая версия скачивается в фоне; если она другая,
   открытая вкладка получает 'grimuar-update' и предлагает перезапуститься.
   Здесь нет ни текста книг, ни ключа: всё содержимое сайта остаётся зашифрованным. */
const C = 'grimuar-v1';
const PAGE = './';
const CORE = [PAGE, 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
let fresh = false;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('grimuar-') && k !== C).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function tell() {
  for (const w of await self.clients.matchAll({ type: 'window' })) w.postMessage('grimuar-update');
}
/* фоновая проверка страницы: сравнить с тем, что в кэше */
async function refreshPage(c, old) {
  try {
    const r = await fetch(PAGE, { cache: 'no-cache' });
    if (!r.ok) return;
    const t = await r.clone().text();
    if (old !== null && t === old) return;
    await c.put(PAGE, r);
    if (old !== null) { fresh = true; await tell(); }
  } catch (e) { /* нет сети — остаёмся на сохранённой копии */ }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url), scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(C), hit = await c.match(PAGE);
      if (hit) {
        fresh = false;
        e.waitUntil(hit.clone().text().then(old => refreshPage(c, old)));
        return hit;
      }
      const r = await fetch(req);
      if (r.ok) e.waitUntil(c.put(PAGE, r.clone()));
      return r;
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(C), hit = await c.match(req, { ignoreSearch: true });
    /* звуки: имя файла меняется вместе с именем звука, проверять их заново не нужно */
    if (hit) {
      if (!url.pathname.includes('/sounds/'))
        e.waitUntil(fetch(req, { cache: 'no-cache' }).then(r => r.ok && c.put(req, r)).catch(() => {}));
      return hit;
    }
    const r = await fetch(req);
    if (r.ok) e.waitUntil(c.put(req, r.clone()));
    return r;
  })());
});

/* вкладка спрашивает при открытии: не скачалась ли уже новая версия */
self.addEventListener('message', e => {
  if (e.data === 'grimuar-ask' && fresh && e.source) e.source.postMessage('grimuar-update');
});
