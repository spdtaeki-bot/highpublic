const CACHE_NAME = 'office-v4-assets';
const MAX_HASHED_ASSETS = 48;
const MAX_QUERY_RESPONSES = 4;

self.addEventListener('install', (e) => {
  // 열린 입력 화면을 새 버전이 가로채지 않도록 대기 상태를 유지한다.
  // 새 워커는 사용자가 모든 기존 탭을 닫은 뒤 자연스럽게 활성화된다.
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(async () => {
      const cache = await caches.open(CACHE_NAME);
      await pruneCachedAssets(cache);
    })
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Firestore, API 및 외부 요청은 캐싱하지 않고 즉시 네트워크로 통과
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) {
    return;
  }

  // Vite 해시가 포함된 불변 정적 자산 (/assets/*, 아이콘, 폰트): Cache-First로 즉시 응답 (0초 로딩)
  if (url.pathname.includes('/assets/') || url.pathname.endsWith('.png') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.woff2')) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // HTML 네비게이션: Network-First로 최신 파일 가져오되 네트워크 지연 시 캐시 즉시 활용
  if (e.request.mode === 'navigate' || url.pathname === new URL(self.registration.scope).pathname || url.pathname.endsWith('.html')) {
    e.respondWith(networkFirstNavigation(e.request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  const networkResponse = await fetch(request);
  if (networkResponse && networkResponse.status === 200) {
    await putAndPrune(cache, request, networkResponse.clone());
  }
  return networkResponse;
}

async function networkFirstNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      await putAndPrune(cache, request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match(new URL(self.registration.scope).pathname);
  }
}

async function putAndPrune(cache, request, response) {
  try {
    await cache.put(request, response);
  } catch (error) {
    await pruneCachedAssets(cache, 12);
    try {
      await cache.put(request, response);
    } catch (retryError) {
      console.warn('서비스 워커 캐시 저장 실패:', retryError);
      return;
    }
  }
  await deleteStaleHashes(cache, request);
  await pruneCachedAssets(cache);
}

async function deleteStaleHashes(cache, request) {
  const identity = hashedAssetIdentity(request.url);
  if (!identity) return;
  const keys = await cache.keys();
  await Promise.all(
    keys.map(async (key) => {
      if (key.url === request.url) return;
      if (hashedAssetIdentity(key.url) === identity) {
        await cache.delete(key);
      }
    })
  );
}

async function pruneCachedAssets(cache, hashedAssetLimit = MAX_HASHED_ASSETS) {
  const requests = await cache.keys();
  const identities = new Map();

  requests.forEach((request, index) => {
    const identity = hashedAssetIdentity(request.url);
    if (!identity) return;
    const group = identities.get(identity) || [];
    group.push({ request, index });
    identities.set(identity, group);
  });

  await Promise.all(
    [...identities.values()].map(async (group) => {
      if (group.length <= 1) return;
      // Cache.keys()는 넣은 순서다. 같은 청크의 예전 해시만 지운다.
      group.sort((a, b) => a.index - b.index);
      const stale = group.slice(0, -1);
      await Promise.all(stale.map((entry) => cache.delete(entry.request)));
    })
  );

  const afterIdentityPrune = await cache.keys();
  const hashedAssets = afterIdentityPrune.filter((request) => hashedAssetIdentity(request.url));
  const excessAssets = hashedAssets.length - hashedAssetLimit;
  for (let index = 0; index < excessAssets; index++) {
    await cache.delete(hashedAssets[index]);
  }

  const queryResponses = (await cache.keys()).filter((request) => {
    try {
      return new URL(request.url).search.length > 0;
    } catch {
      return false;
    }
  });
  const excessQueries = queryResponses.length - MAX_QUERY_RESPONSES;
  for (let index = 0; index < excessQueries; index++) {
    await cache.delete(queryResponses[index]);
  }
}

function hashedAssetIdentity(rawUrl) {
  let pathname = '';
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    return null;
  }
  if (!pathname.includes('/assets/')) return null;
  const file = pathname.split('/').pop() || '';
  const match = file.match(/^(.*)-[A-Za-z0-9_-]{8,}\.([a-z0-9]+)$/i);
  if (!match) return null;
  return `${match[1]}.${match[2].toLowerCase()}`;
}
