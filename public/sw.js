self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // 기본적인 페치 핸들러 (PWA 요건 충족용)
  e.respondWith(fetch(e.request));
});
