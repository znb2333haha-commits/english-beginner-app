// 简单的离线缓存:同源 GET 请求"先看缓存,没有再联网并存下来"。
// 听过的单词音频会被缓存;音频的分段(Range)请求交给浏览器自己处理。
const CACHE = 'english-beginner-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    // 页面和脚本优先用网络,断网再用缓存,这样更新版本能及时看到
    fetch(req)
      .then((res) => {
        if (res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
