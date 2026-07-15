// ============================================================
// Service Worker для BioSina.
// Кэширует статику (HTML/CSS/JS/иконки/изображения/видео) для
// офлайн-работы и быстрой повторной загрузки. Запросы к Supabase
// (REST и Edge Functions) НИКОГДА не кэшируются — всегда идут в сеть,
// чтобы данные (товары, отзывы, админ-действия) всегда были свежими.
// ============================================================

const CACHE_VERSION = 'biosina-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMG_CACHE = `${CACHE_VERSION}-images`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './supabase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './videos/intro-bg-poster.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('biosina-') && key !== STATIC_CACHE && key !== IMG_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isSupabaseRequest(url){
  return url.hostname.endsWith('.supabase.co');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase (данные и Edge Functions) — всегда только из сети, без кэша
  if (isSupabaseRequest(url)) {
    return;
  }

  // Изображения и видео — cache-first со фоновым обновлением
  if (req.destination === 'image' || req.destination === 'video' || /\.(jpg|jpeg|png|webp|mp4|svg)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const networkFetch = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Остальная статика (html/css/js/manifest) — cache-first, обновление в фоне
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
