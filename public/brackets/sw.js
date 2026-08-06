/* Service worker: cache the app shell so Brackets works fully offline. */
const CACHE = "brackets-v1";
const ASSETS = [
	"./",
	"./index.html",
	"./styles.css",
	"./app.js",
	"./bracket.js",
	"./manifest.webmanifest",
	"./icons/icon.svg",
	"./icons/icon-192.png",
	"./icons/icon-512.png",
	"./icons/maskable-512.png",
	"./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", (event) => {
	const req = event.request;
	if (req.method !== "GET") return;
	// cache-first for our own assets; fall back to network, then cache the result
	event.respondWith(
		caches.match(req).then((cached) => {
			if (cached) return cached;
			return fetch(req)
				.then((res) => {
					if (res && res.ok && new URL(req.url).origin === self.location.origin) {
						const copy = res.clone();
						caches.open(CACHE).then((c) => c.put(req, copy));
					}
					return res;
				})
				.catch(() => cached);
		})
	);
});
