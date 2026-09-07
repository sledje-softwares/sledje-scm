// public/sledje-sync-sw.js
//
// Imported into the generated Workbox service worker (see vite.config.js ->
// VitePWA workbox.importScripts).
//
// Its only job is the Background Sync API: when the browser decides the device
// has a connection again, wake any open page and tell it to flush its outbox.
//
// The flush itself deliberately stays IN THE PAGE, not here. The auth token
// lives in localStorage, which a service worker cannot read, and duplicating
// the whole sync client into a second execution context would give us two
// implementations of the money path to keep in step. So this is a doorbell,
// not a second front door.
//
// Chromium only. Safari has never shipped Background Sync and Firefox has not
// either - between them that is most of the phones this will run on. The real
// mechanism is the page's own online/focus/timer triad in src/offline/sync.js;
// this is an optimisation on top of it.

self.addEventListener("sync", (event) => {
  if (event.tag !== "sledje-flush") return;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: "sledje-flush" });
      }
    })()
  );
});
