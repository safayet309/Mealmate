/* =========================================================
   Mealmate — Service Worker
   File: sw.js

   Phase 1 responsibilities:
   - Cache core application shell
   - Serve cached static assets when possible
   - Provide offline navigation fallback
   - Never cache Supabase API/data responses here

   Future phases can add:
   - Network-first strategies
   - Better offline fallback
   - Background sync
   - Controlled data synchronization
   ========================================================= */

const CACHE_NAME = "mealmate-static-v2";

const CORE_ASSETS = [
  "./",
  "./index.html",

  "./css/variables.css",
  "./css/global.css",
  "./css/components.css",
  "./css/responsive.css",

  "./js/config.js",
  "./js/supabase.js",
  "./js/app.js",

  "./manifest.webmanifest",
];


/* =========================================================
   1. INSTALL
   ========================================================= */

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      /*
       * Cache assets individually instead of allowing one
       * failed asset to abort the complete installation.
       */
      await Promise.allSettled(
        CORE_ASSETS.map(async (asset) => {
          try {
            const request = new Request(asset, {
              cache: "reload",
            });

            const response =
              await fetch(request);

            if (
              response.ok &&
              response.type === "basic"
            ) {
              await cache.put(
                request,
                response.clone()
              );
            }
          } catch (error) {
            console.warn(
              "[Mealmate SW] Could not cache:",
              asset,
              error
            );
          }
        })
      );
    })
  );

  /*
   * Activate the new worker as soon as it is installed.
   * This prevents users from remaining on an older worker
   * unnecessarily during controlled application updates.
   */
  self.skipWaiting();
});


/* =========================================================
   2. ACTIVATE
   ========================================================= */

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      /*
       * Remove stale Mealmate static caches while keeping
       * unrelated browser caches untouched.
       */
      const cacheNames =
        await caches.keys();

      await Promise.all(
        cacheNames
          .filter(
            (name) =>
              name.startsWith("mealmate-static-") &&
              name !== CACHE_NAME
          )
          .map((name) =>
            caches.delete(name)
          )
      );

      /*
       * Allow the new service worker to control already-open
       * pages without requiring an immediate manual refresh.
       */
      await self.clients.claim();
    })()
  );
});


/* =========================================================
   3. FETCH
   ========================================================= */

self.addEventListener("fetch", (event) => {
  const request = event.request;

  /*
   * Only handle GET requests.
   */
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(
    request.url
  );

  /*
   * Do NOT intercept Supabase/API traffic.
   *
   * Database operations must always use the live
   * Supabase connection and RLS-protected API.
   */
  if (
    url.hostname.endsWith(
      ".supabase.co"
    ) ||
    url.pathname.includes("/rest/") ||
    url.pathname.includes("/auth/")
  ) {
    return;
  }

  /*
   * Navigation requests:
   *
   * Network first
   *       ↓
   * if offline/failure
   *       ↓
   * cached index.html
   */
  if (request.mode === "navigate") {
    event.respondWith(
      networkFirstNavigation(request)
    );

    return;
  }

  /*
   * Static assets:
   *
   * Cache first
   *       ↓
   * network fallback
   *
   * Successful network response is added to cache.
   */
  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image" ||
    request.destination === "font" ||
    request.destination === "manifest"
  ) {
    event.respondWith(
      cacheFirstStatic(request)
    );
  }
});


/* =========================================================
   4. NAVIGATION STRATEGY
   ========================================================= */

async function networkFirstNavigation(
  request
) {
  try {
    const response =
      await fetch(request);

    if (response.ok) {
      /*
       * Keep a fresh copy of the app shell.
       */
      const cache =
        await caches.open(
          CACHE_NAME
        );

      await cache.put(
        request,
        response.clone()
      );
    }

    return response;
  } catch (error) {
    const cachedResponse =
      await caches.match(
        request
      );

    if (cachedResponse) {
      return cachedResponse;
    }

    const fallback =
      await caches.match(
        "./index.html"
      );

    if (fallback) {
      return fallback;
    }

    return offlineResponse();
  }
}


/* =========================================================
   5. STATIC ASSET STRATEGY
   ========================================================= */

async function cacheFirstStatic(
  request
) {
  const cachedResponse =
    await caches.match(
      request
    );

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response =
      await fetch(request);

    /*
     * Cache only successful same-origin static responses.
     */
    if (
      response.ok &&
      response.type === "basic"
    ) {
      const cache =
        await caches.open(
          CACHE_NAME
        );

      await cache.put(
        request,
        response.clone()
      );
    }

    return response;
  } catch (error) {
    return offlineResponse();
  }
}


/* =========================================================
   6. OFFLINE RESPONSE
   ========================================================= */

function offlineResponse() {
  return new Response(
    `
      <!doctype html>
      <html lang="bn">
        <head>
          <meta charset="utf-8">
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          >
          <title>Mealmate — Offline</title>

          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              padding: 24px;
              box-sizing: border-box;
              background: #F8FAFC;
              color: #1F2937;
              font-family:
                system-ui,
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                sans-serif;
              text-align: center;
            }

            main {
              width: min(100%, 420px);
              padding: 32px 24px;
              border: 1px solid #E2E8F0;
              border-radius: 20px;
              background: #FFFFFF;
              box-shadow:
                0 16px 40px
                rgba(15, 23, 42, 0.08);
            }

            h1 {
              margin: 0 0 10px;
              color: #0B6B4F;
              font-size: 26px;
            }

            p {
              margin: 0;
              color: #64748B;
              line-height: 1.6;
            }
          </style>
        </head>

        <body>
          <main>
            <h1>Mealmate</h1>
            <p>
              ইন্টারনেট সংযোগ পাওয়া যাচ্ছে না।
              সংযোগ ফিরে এলে আবার চেষ্টা করুন।
            </p>
          </main>
        </body>
      </html>
    `,
    {
      status: 503,
      statusText: "Service Unavailable",
      headers: {
        "Content-Type":
          "text/html; charset=utf-8",
      },
    }
  );
}


/* =========================================================
   7. MESSAGE CHANNEL
   ========================================================= */

self.addEventListener(
  "message",
  (event) => {
    if (
      event.data?.type ===
      "MEALMATE_SKIP_WAITING"
    ) {
      self.skipWaiting();
    }
  }
);
