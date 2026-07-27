const APP_CACHE = "magic-map-app-v2";
const RUNTIME_CACHE = "magic-map-runtime-v2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./west-coast-aus-route-map.html",
  "./manifest.webmanifest",
  "./assets/icons/magic-map.svg",
  "./assets/vendor/leaflet/leaflet.css",
  "./assets/vendor/leaflet/leaflet.js",
  "./assets/vendor/leaflet/images/layers.png",
  "./assets/vendor/leaflet/images/layers-2x.png",
  "./assets/vendor/leaflet/images/marker-icon.png",
  "./assets/vendor/leaflet/images/marker-shadow.png"
];

const TILE_FALLBACK = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
    <rect width="256" height="256" fill="#dfe8e7"/>
    <path d="M-20 170c36-22 75-28 116-12 45 18 72 7 112-22 30-22 58-29 88-22v162H-20z" fill="#0f7b83" opacity=".12"/>
    <path d="M24 52h208M24 104h208M24 156h208M24 208h208M52 24v208M104 24v208M156 24v208M208 24v208" stroke="#10242a" stroke-opacity=".07"/>
  </svg>
`;

const IMAGE_FALLBACK = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#d7e7e8"/>
        <stop offset=".58" stop-color="#eef3ed"/>
        <stop offset="1" stop-color="#eadfd4"/>
      </linearGradient>
    </defs>
    <rect width="960" height="540" fill="url(#bg)"/>
    <path d="M0 370c95-44 166-62 248-49 92 15 150 79 242 91 128 17 215-68 349-76 48-3 87 3 121 12v192H0z" fill="#0f7b83" opacity=".26"/>
    <circle cx="760" cy="132" r="74" fill="#f2bd4b" opacity=".75"/>
    <text x="50%" y="50%" text-anchor="middle" fill="#10242a" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="34" font-weight="800">照片离线不可用</text>
    <text x="50%" y="59%" text-anchor="middle" fill="#60747a" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="22">行程信息和路线仍可查看</text>
  </svg>
`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => ![APP_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isRuntimeAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(request, url));
  }
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (await cache.match(request))
      || (await cache.match(new URL("./index.html", self.registration.scope)))
      || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const cache = await caches.open(APP_CACHE);
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, url) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => fallbackFor(request, url));

  return cached || fresh;
}

function isRuntimeAsset(request, url) {
  return request.destination === "image"
    || url.hostname.includes("arcgisonline.com")
    || url.hostname.includes("wikimedia.org")
    || url.hostname.includes("wikipedia.org");
}

function fallbackFor(request, url) {
  if (url.hostname.includes("arcgisonline.com") || url.pathname.includes("/tile/")) {
    return svgResponse(TILE_FALLBACK);
  }

  if (request.destination === "image") {
    return svgResponse(IMAGE_FALLBACK);
  }

  return Response.error();
}

function svgResponse(svg) {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
