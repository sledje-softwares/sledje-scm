// src/pages/Retailers/SyncStatusBar.js
//
// The one thing a shopkeeper must be able to answer without asking anyone:
// "is today's money safe?"
//
// So this states the queue depth in plain numbers rather than showing a single
// green dot. Being offline is a NORMAL state here, not an error - it is styled
// as information, and the counter keeps working either way.

import React from "react";
import { CloudOff, Cloud, RefreshCw, AlertTriangle, Check } from "lucide-react";
import { useSyncStatus } from "../../offline/useOffline";

const ago = (ts) => {
  if (!ts) return "never";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
};

export default function SyncStatusBar() {
  const { online, pending, lastSync, lastError, flush } = useSyncStatus();
  const [busy, setBusy] = React.useState(false);

  const syncNow = async () => {
    setBusy(true);
    try { await flush(); } finally { setBusy(false); }
  };

  const opError = lastError?.kind === "op";

  const tone = opError
    ? "bg-red-50 border-red-200 text-red-800"
    : !online
    ? "bg-amber-50 border-amber-200 text-amber-900"
    : pending > 0
    ? "bg-sky-50 border-sky-200 text-sky-900"
    : "bg-emerald-50 border-emerald-200 text-emerald-800";

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${tone}`} data-testid="sync-status">
      {opError ? (
        <AlertTriangle className="w-4 h-4 shrink-0" />
      ) : online ? (
        <Cloud className="w-4 h-4 shrink-0" />
      ) : (
        <CloudOff className="w-4 h-4 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <p className="font-medium">
          {opError
            ? "One queued sale could not be saved"
            : !online
            ? "Offline — billing works as normal"
            : pending > 0
            ? `Syncing ${pending} queued ${pending === 1 ? "change" : "changes"}`
            : "All sales saved"}
        </p>
        <p className="text-xs opacity-80 truncate">
          {opError
            ? lastError.message
            : pending > 0
            ? `${pending} waiting · last synced ${ago(lastSync)}`
            : `Last synced ${ago(lastSync)}`}
        </p>
      </div>

      <span
        data-testid="pending-count"
        className="px-2 py-0.5 rounded-full bg-white/70 text-xs font-semibold tabular-nums"
      >
        {pending}
      </span>

      <button
        onClick={syncNow}
        disabled={busy || !online}
        title={online ? "Sync now" : "Nothing to do until you are back online"}
        className="p-1.5 rounded-md hover:bg-white/60 disabled:opacity-40"
      >
        {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : pending === 0 && online ? <Check className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
      </button>
    </div>
  );
}
