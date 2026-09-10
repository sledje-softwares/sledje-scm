import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronUp, Package, Wallet, X, RefreshCw, CheckCircle2,
  Clock, IndianRupee,
} from "lucide-react";
import API from "../../api";
import { SkeletonList } from "../../components/Skeleton";

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = (n) => Number(n || 0);

export default function RetailerPayment() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [payFor, setPayFor] = useState(null); // a bill row
  const [toast, setToast] = useState(null);

  const flash = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/product-bills?role=retailer");
      setBills(res.data.data || res.data.bills || []);
    } catch {
      flash("Could not load your bills", "error");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Group bills by distributor. Key on `id` — the mock code keyed on `_id`.
  const groups = useMemo(() => {
    const byDist = new Map();
    for (const b of bills) {
      const key = b.distributorId;
      if (!byDist.has(key)) {
        byDist.set(key, {
          distributorId: key,
          distributorName: b.distributorName || "Distributor",
          bills: [],
        });
      }
      byDist.get(key).bills.push(b);
    }
    return [...byDist.values()].map((g) => ({
      ...g,
      due: g.bills.reduce((s, b) => s + num(b.outstandingBalance), 0),
      consignment: g.bills.reduce((s, b) => s + num(b.amountReceivedNotDue), 0),
      paid: g.bills.reduce((s, b) => s + num(b.totalAmountPaid), 0),
    }));
  }, [bills]);

  const totals = useMemo(
    () => ({
      due: groups.reduce((s, g) => s + g.due, 0),
      consignment: groups.reduce((s, g) => s + g.consignment, 0),
      paid: groups.reduce((s, g) => s + g.paid, 0),
    }),
    [groups]
  );

  const settleAllDue = async (group) => {
    const owing = group.bills.filter((b) => num(b.outstandingBalance) > 0);
    if (owing.length === 0) return;
    if (
      !window.confirm(
        `Pay ${money(group.due)} across ${owing.length} product bill(s) for ${group.distributorName}?`
      )
    )
      return;
    try {
      for (const b of owing) {
        await API.post(`/product-bills/${b.id}/pay`, {
          amount: num(b.outstandingBalance),
          paymentMethod: "upi",
          note: "Settle all due",
        });
      }
      flash(`Settled ${money(group.due)} with ${group.distributorName}`);
      load();
    } catch (e) {
      flash(e.response?.data?.error || "Payment failed", "error");
      load();
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {toast && (
        <div
          className={`fixed top-24 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg border text-sm ${
            toast.type === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-700"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-sm text-slate-500 max-w-xl">
            What you owe each distributor, per product. Delivered stock sits as{" "}
            <span className="font-medium text-slate-700">consignment</span> until you sell it —
            only sold stock becomes <span className="font-medium text-slate-700">due</span>.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard label="Due now" value={money(totals.due)} tone="due" icon={Clock} />
        <SummaryCard
          label="Consignment (not yet due)"
          value={money(totals.consignment)}
          tone="consignment"
          icon={Package}
        />
        <SummaryCard label="Paid to date" value={money(totals.paid)} tone="paid" icon={CheckCircle2} />
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : groups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">
          No product bills yet. They appear once a distributor delivers to you.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.distributorId} className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-semibold">
                      {g.distributorName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{g.distributorName}</h3>
                      <p className="text-xs text-slate-500">{g.bills.length} product bill(s)</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Due</p>
                        <p className="text-lg font-bold text-rose-600">{money(g.due)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">
                          Consignment
                        </p>
                        <p className="text-lg font-semibold text-slate-500">
                          {money(g.consignment)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [g.distributorId]: !e[g.distributorId] }))}
                    className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    {expanded[g.distributorId] ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    {expanded[g.distributorId] ? "Hide" : "View"} products
                  </button>
                  {g.due > 0 && (
                    <button
                      onClick={() => settleAllDue(g)}
                      className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                    >
                      <Wallet className="w-4 h-4" /> Settle {money(g.due)}
                    </button>
                  )}
                </div>
              </div>

              {expanded[g.distributorId] && (
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {g.bills.map((b) => (
                    <div key={b.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {b.productName || b.variantName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {b.variantName}
                          {b.sku ? ` · ${b.sku}` : ""} · {num(b.qtySold)} sold /{" "}
                          {num(b.qtyReceivedUnsold)} unsold
                        </p>
                      </div>
                      <div className="flex items-center gap-5">
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Due</p>
                          <p className="text-sm font-bold text-rose-600">
                            {money(b.outstandingBalance)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            Consignment
                          </p>
                          <p className="text-sm font-medium text-slate-500">
                            {money(b.amountReceivedNotDue)}
                          </p>
                        </div>
                        <button
                          onClick={() => setPayFor(b)}
                          disabled={num(b.outstandingBalance) <= 0}
                          className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Pay
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {payFor && (
        <PayModal
          bill={payFor}
          onClose={() => setPayFor(null)}
          onPaid={() => {
            setPayFor(null);
            load();
          }}
          flash={flash}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone, icon: Icon }) {
  const tones = {
    due: "text-rose-600",
    consignment: "text-slate-500",
    paid: "text-emerald-600",
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-slate-400 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-xl font-bold ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function PayModal({ bill, onClose, onPaid, flash }) {
  const outstanding = num(bill.outstandingBalance);
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState("upi");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const a = Number(amount);
    if (!a || a <= 0) return flash("Enter an amount", "error");
    setSaving(true);
    try {
      const res = await API.post(`/product-bills/${bill.id}/pay`, {
        amount: a,
        paymentMethod: method,
      });
      flash(`Paid ${money(res.data.amountPaid ?? a)} — outstanding ${money(res.data.outstandingBalance)}`);
      onPaid();
    } catch (e) {
      flash(e.response?.data?.error || "Payment failed", "error");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Pay bill</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              {bill.productName || bill.variantName}
            </p>
            <p className="text-xs text-slate-500">
              {bill.distributorName} · outstanding {money(outstanding)}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount</label>
            <div className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-slate-400" />
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <button
                onClick={() => setAmount(String(outstanding))}
                className="text-xs text-indigo-600 hover:underline"
              >
                Full
              </button>
            </div>
            {Number(amount) > outstanding && (
              <p className="text-xs text-amber-600 mt-1">
                More than outstanding — the extra is ignored (payment clamps to {money(outstanding)}).
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm capitalize"
            >
              {["upi", "cash", "card", "bank_transfer"].map((m) => (
                <option key={m} value={m}>
                  {m.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {saving ? "Paying…" : "Confirm payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
