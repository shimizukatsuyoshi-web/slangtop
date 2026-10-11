/* Slang Clip Note service worker: keeps the app and its videos on the device so it opens offline.
   Bump VERSION whenever any file changes so phones pick up the new copy. */
const VERSION = "v4";
const CACHE = "slang-clip-note-" + VERSION;
const FILES = [
  "./", "index.html", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
  "videos/no1-no-cap.mp4", "videos/no2-spill-the-tea.mp4", "videos/no3-lowkey.mp4", "videos/no4-it-slaps.mp4"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("slang-clip-note-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* videos are asked for in byte ranges (iPhone always does this), so answer those from the cached file */
async function rangeResponse(req, res) {
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  let start = m && m[1] ? +m[1] : 0, end = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - +m[2]); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    "Content-Type": res.headers.get("Content-Type") || "video/mp4",
    "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" } });
}

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;   // fonts etc. go straight to the network
  if (req.headers.has("range")) {
    e.respondWith(caches.match(url.pathname.endsWith(".mp4") ? url.href.split("#")[0] : req, { ignoreSearch: true })
      .then(hit => hit ? rangeResponse(req, hit) : fetch(req)));
    return;
  }
  if (req.mode === "navigate") {
    /* page: try the network first so updates show up, fall back to the saved copy offline */
    e.respondWith(fetch(req).then(res => { if (!res.ok) return res; const copy = res.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); return res; })
      .catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});
