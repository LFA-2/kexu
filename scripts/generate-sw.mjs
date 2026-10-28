// Writes out/sw.js with a precache list of every exported file.
// The cache name is a hash of the file contents, so each deploy yields a new
// service worker, which the page surfaces as "有新版本".
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

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
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

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE + "/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(BASE + "/").then((cached) => cached || fetch(request)),
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
