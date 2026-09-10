import React, { useCallback, useEffect, useState } from "react";
import { MapPin, Phone, Package, RefreshCw, KeyRound, XCircle } from "lucide-react";
import API from "../../api";
import { SkeletonList } from "../../components/Skeleton";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const pretty = (s) => (s || "").replace(/_/g, " ");

const STATUS_STYLE = {
  assigned: "bg-amber-50 text-amber-700 border-amber-200",
  picked_up: "bg-indigo-50 text-indigo-700 border-indigo-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

export default function AgentRuns() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [confirmFor, setConfirmFor] = useState(null);
  const [failFor, setFailFor] = useState(null);

  const flash = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/deliveries/mine");
      setRuns(res.data.deliveries || []);
    } catch {
      flash("Could not load your runs", "error");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickup = async (run) => {
    try {
      await API.put(`/deliveries/${run.id}/pickup`);
      flash("Marked as picked up");
      load();
    } catch (e) {
      flash(e.response?.data?.error || "Could not update", "error");
    }
  };

  const active = runs.filter((r) => ["assigned", "picked_up"].includes(r.status));
  const done = runs.filter((r) => ["delivered", "failed"].includes(r.status));

  return (
    <div className="p-4">
      {toast && (
        <div
          className={`fixed top-28 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg shadow-lg border text-sm ${
            toast.type === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-700"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900">Your runs</h1>
        <button
          onClick={load}
          className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : runs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">
          No runs assigned yet. Make sure you're marked available.
        </div>
      ) : (
        <div className="space-y-5">
          <Section title="Active" runs={active} empty="Nothing to deliver right now.">
            {(run) => (
              <RunCard
                key={run.id}
                run={run}
                onPickup={() => pickup(run)}
                onConfirm={() => setConfirmFor(run)}
                onFail={() => setFailFor(run)}
              />
            )}
          </Section>
          {done.length > 0 && (
            <Section title="Completed" runs={done}>
              {(run) => <RunCard key={run.id} run={run} readOnly />}
            </Section>
          )}
        </div>
      )}

      {confirmFor && (
        <ConfirmModal
          run={confirmFor}
          onClose={() => setConfirmFor(null)}
          onDone={() => { setConfirmFor(null); load(); }}
          flash={flash}
        />
      )}
      {failFor && (
        <FailModal
          run={failFor}
          onClose={() => setFailFor(null)}
          onDone={() => { setFailFor(null); load(); }}
          flash={flash}
        />
      )}
    </div>
  );
}

function Section({ title, runs, empty, children }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        {title} ({runs.length})
      </h2>
      {runs.length === 0 ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <div className="space-y-3">{runs.map(children)}</div>
      )}
    </div>
  );
}

function RunCard({ run, onPickup, onConfirm, onFail, readOnly }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-900">{run.retailerBusinessName}</p>
          <p className="text-xs text-slate-500">{run.orderNumber} · {money(run.totalAmount)}</p>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${
            STATUS_STYLE[run.status] || "bg-slate-50 text-slate-600 border-slate-200"
          }`}
        >
          {pretty(run.status)}
        </span>
      </div>

      <div className="space-y-1.5 text-sm text-slate-600 mb-3">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <span>
            {run.retailerAddress || "No address on file"}
            {run.retailerPincode ? ` — ${run.retailerPincode}` : ""}
          </span>
        </div>
        {run.retailerPhone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-slate-400" />
            <a href={`tel:${run.retailerPhone}`} className="text-indigo-600">
              {run.retailerPhone}
            </a>
          </div>
        )}
      </div>

      {run.failureReason && (
        <p className="text-xs text-red-600 mb-2">Failed: {run.failureReason}</p>
      )}

      {!readOnly && (
        <div className="flex gap-2 pt-3 border-t border-slate-100">
          {run.status === "assigned" && (
            <button
              onClick={onPickup}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
            >
              <Package className="w-4 h-4" /> Picked up
            </button>
          )}
          <button
            onClick={onConfirm}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            <KeyRound className="w-4 h-4" /> Confirm with code
          </button>
          <button
            onClick={onFail}
            className="px-3 py-2 border border-slate-300 text-slate-500 rounded-lg text-sm hover:bg-slate-50"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function ConfirmModal({ run, onClose, onDone, flash }) {
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    setSaving(true);
    try {
      await API.put(`/deliveries/${run.id}/confirm`, { code: code.trim() });
      flash(`Delivered to ${run.retailerBusinessName}`);
      onDone();
    } catch (e) {
      setErr(e.response?.data?.error || e.response?.data?.message || "Wrong code");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-5 h-5 text-indigo-600" />
          <h2 className="font-semibold text-slate-900">Confirm delivery</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Ask {run.retailerBusinessName} for the 6-digit code shown on their order, and enter it
          here. This is what actually hands the stock over.
        </p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          placeholder="••••••"
          className="w-full text-center text-2xl tracking-[0.4em] py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || code.length < 4}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {saving ? "Checking…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FailModal({ run, onClose, onDone, flash }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await API.put(`/deliveries/${run.id}/fail`, { reason: reason.trim() || "Not specified" });
      flash("Marked as failed");
      onDone();
    } catch (e) {
      flash(e.response?.data?.error || "Could not update", "error");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-1">Delivery failed</h2>
        <p className="text-sm text-slate-500 mb-4">
          Nobody there, or the shop refused it. Nothing is billed.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="What happened?"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-slate-300"
          >
            {saving ? "Saving…" : "Mark failed"}
          </button>
        </div>
      </div>
    </div>
  );
}
