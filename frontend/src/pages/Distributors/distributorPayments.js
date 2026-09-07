import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Package, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import API from "../../api";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = (n) => Number(n || 0);

export default function DistributorPayments() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/product-bills?role=distributor");
      setBills(res.data.data || res.data.bills || []);
    } catch {
      setError("Could not load retailer balances");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    const byRetailer = new Map();
    for (const b of bills) {
      const key = b.retailerId;
      if (!byRetailer.has(key)) {
        byRetailer.set(key, { retailerId: key, retailerName: b.retailerName || "Retailer", bills: [] });
      }
      byRetailer.get(key).bills.push(b);
    }
    return [...byRetailer.values()]
      .map((g) => ({
        ...g,
        due: g.bills.reduce((s, b) => s + num(b.outstandingBalance), 0),
        consignment: g.bills.reduce((s, b) => s + num(b.amountReceivedNotDue), 0),
        paid: g.bills.reduce((s, b) => s + num(b.totalAmountPaid), 0),
      }))
      .sort((a, b) => b.due - a.due);
  }, [bills]);

  const totals = useMemo(
    () => ({
      due: groups.reduce((s, g) => s + g.due, 0),
      consignment: groups.reduce((s, g) => s + g.consignment, 0),
      paid: groups.reduce((s, g) => s + g.paid, 0),
      exposure: groups.reduce((s, g) => s + g.due + g.consignment, 0),
    }),
    [groups]
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Retailer balances</h1>
          <p className="text-sm text-slate-500 max-w-xl">
            Per-product credit exposure to each retailer.{" "}
            <span className="font-medium text-slate-700">Due</span> is what they owe on stock
            they've sold; <span className="font-medium text-slate-700">consignment</span> is stock
            of yours still on their shelf, financed but not yet payable.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Stat label="Due from retailers" value={money(totals.due)} tone="text-rose-600" icon={Clock} />
        <Stat label="Out on consignment" value={money(totals.consignment)} tone="text-slate-500" icon={Package} />
        <Stat label="Collected to date" value={money(totals.paid)} tone="text-emerald-600" icon={CheckCircle2} />
        <Stat label="Total exposure" value={money(totals.exposure)} tone="text-slate-900" icon={Package} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">
          No product bills yet. These appear once you've delivered to a retailer.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.retailerId} className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-semibold">
                      {g.retailerName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{g.retailerName}</h3>
                      <p className="text-xs text-slate-500">{g.bills.length} product bill(s)</p>
                    </div>
                  </div>
                  <div className="flex gap-5 text-right">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">Due</p>
                      <p className="text-lg font-bold text-rose-600">{money(g.due)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">Consignment</p>
                      <p className="text-lg font-semibold text-slate-500">{money(g.consignment)}</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [g.retailerId]: !e[g.retailerId] }))}
                  className="mt-4 flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  {expanded[g.retailerId] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {expanded[g.retailerId] ? "Hide" : "View"} products
                </button>
              </div>

              {expanded[g.retailerId] && (
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
                          <p className="text-sm font-bold text-rose-600">{money(b.outstandingBalance)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Consignment</p>
                          <p className="text-sm font-medium text-slate-500">{money(b.amountReceivedNotDue)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Paid</p>
                          <p className="text-sm font-medium text-emerald-600">{money(b.totalAmountPaid)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, icon: Icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-slate-400 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
