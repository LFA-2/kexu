// Writes out/sw.js with a precache list of every exported file.
// The cache name is a hash of the file contents, so each deploy yields a new
// service worker. It activates as soon as it has cached everything; the page reloads
// or shows "有新版本" only if it is still running an older build.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("out");
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(OUT)
  .map((full) => path.relative(OUT, full).split(path.sep).join("/"))
  .filter((rel) => rel !== "sw.js" && !rel.endsWith(".map"))
  .sort();

const hash = createHash("sha256");
for (const rel of files) hash.update(rel).update(readFileSync(path.join(OUT, rel)));
const version = hash.digest("hex").slice(0, 12);

const urls = files.map((rel) => {
  if (rel === "index.html") return `${BASE}/`;
  if (rel.endsWith("/index.html")) return `${BASE}/${rel.slice(0, -"index.html".length)}`;
  return `${BASE}/${rel}`;
});

const sw = `const CACHE = "kexu-${version}";
const BASE = ${JSON.stringify(BASE)};
const ASSETS = ${JSON.stringify(urls)};
const NAV_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  // GitHub Pages sends max-age=600; bypass the HTTP cache so a fresh deploy
  // never gets precached together with stale HTML that points at removed chunks.
  // A half-propagated deploy can still serve an HTML page that references chunks
  // from another build; failing the install keeps the previous version instead.
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })));
      const html = await (await cache.match(BASE + "/")).text();
      const chunks = html.match(/\\/_next\\/static\\/[^"'\\s]+?\\.(?:js|css)/g) ?? [];
      for (const chunk of chunks) {
        if (!ASSETS.includes(BASE + chunk)) {
          await caches.delete(CACHE);
          throw new Error("stale page in precache: " + chunk);
        }
      }
      // Pages always load fresh HTML when online, so the new cache can take over right away.
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("kexu-") && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// iOS only delivers pushes to a home-screen app, and every push has to show a
// notification or the subscription is revoked, so there is no silent path here.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(payload.title || "你也許有點聰明", {
      body: payload.body || "",
      tag: payload.tag || "kexu",
      data: { url: payload.url || BASE + "/" },
      icon: BASE + "/icons/icon-192.png",
      badge: BASE + "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || BASE + "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.includes(BASE + "/"));
      return open ? open.focus() : self.clients.openWindow(target);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE + "/")) return;

  // Pages: network first so a deploy shows up on the next launch; the cached copy is the
  // offline fallback, also used when the network is too slow to answer.
  if (request.mode === "navigate") {
    const cached = () => caches.open(CACHE).then((cache) => cache.match(BASE + "/"));
    const network = fetch(request.url, { cache: "no-cache", credentials: "same-origin" }).then((res) => {
      if (!res.ok) throw new Error("navigation " + res.status);
      return res;
    });
    network.catch(() => {});
    const slow = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS)).then(cached);
    event.respondWith(
      Promise.race([network, slow.then((res) => res || network)]).catch(() =>
        cached().then((res) => res || network),
      ),
    );
    return;
  }

  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(request, { ignoreSearch: true }))
      .then((cached) => cached || fetch(request)),
  );
});
`;

writeFileSync(path.join(OUT, "sw.js"), sw);
console.log(`sw.js: cache kexu-${version}, ${urls.length} files`);
