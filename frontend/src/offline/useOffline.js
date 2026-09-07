// src/offline/useOffline.js
//
// React bindings for the offline layer. Live queries, so the POS re-renders
// the moment anything lands - a local sale, or a pull from the server.

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getMeta } from "./db.js";
import { shelfWithPending, recentSales, pendingOpCount } from "./pos.js";
import { onSyncChange, flush, startSync } from "./sync.js";

/** The shelf as the counter should see it: server cache minus queued sales. */
export function useShelf() {
  return useLiveQuery(
    () => shelfWithPending(),
    [],
    undefined // undefined while loading, so callers can tell "empty" from "not yet"
  );
}

export function useRecentSales(limit = 25) {
  return useLiveQuery(() => recentSales(limit), [limit], []);
}

/**
 * Connection and queue status for the strip at the top of the POS.
 *
 * A shopkeeper needs to be able to answer "is my day's takings safe?" without
 * asking anyone, so this is deliberately explicit about the queue depth rather
 * than showing a single reassuring dot.
 */
export function useSyncStatus() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [tick, setTick] = useState(0);
  const [meta, setMetaState] = useState({ lastSync: null, lastError: null });

  const pending = useLiveQuery(() => pendingOpCount(), [tick], 0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      const [lastSync, lastError] = await Promise.all([
        getMeta("lastSync", null),
        getMeta("lastError", null),
      ]);
      if (alive) setMetaState({ lastSync, lastError });
    };
    read();
    const unsubscribe = onSyncChange(() => { read(); setTick((t) => t + 1); });
    const poll = setInterval(read, 5000);
    return () => { alive = false; unsubscribe(); clearInterval(poll); };
  }, []);

  return {
    online,
    pending: pending ?? 0,
    lastSync: meta.lastSync,
    lastError: meta.lastError,
    flush,
  };
}

/** Start the flush loop once, from whichever screen mounts first. */
export function useSyncLoop() {
  useEffect(() => { startSync(); }, []);
}

/** Sales the server accepted but could not fully attribute to stock. */
export function useReconciliationNeeded() {
  return useLiveQuery(
    () => db.sales.filter((s) => Number(s.needsReconciliation) > 0).toArray(),
    [],
    []
  );
}
