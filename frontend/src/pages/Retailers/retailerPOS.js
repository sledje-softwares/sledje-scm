import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Minus, Trash2, ShoppingCart, Receipt, Tag, X, Check,
  RefreshCw, ChevronDown, ChevronUp, IndianRupee,
} from "lucide-react";
import API from "../../api";
import CreateOrder from "./CreateOrder";

const METHODS = ["cash", "upi", "card"];
const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Map a /sales/sellable row into the shape CreateOrder's catalogue expects. */
const toCatalogue = (rows) =>
  rows.map((r) => ({
    variantId: r.variantId,
    item: r.productName || r.variantName,
    brand: r.variantName && r.variantName !== r.productName ? r.variantName : r.category || "",
    rate: Number(r.price ?? r.retailPrice ?? r.mrp ?? 0),
    unit: r.unit || "unit",
    category: r.category || "",
    stock: Number(r.qty || 0),
    priceIsCustom: r.priceIsCustom,
    mrp: Number(r.mrp || 0),
  }));

export default function RetailerPOS() {
  const [sellable, setSellable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [cart, setCart] = useState([]); // { variantId, item, brand, quantity, rate, unit }
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [discount, setDiscount] = useState(0);
  const [payments, setPayments] = useState([{ method: "cash", amount: "" }]);

  const [showAdd, setShowAdd] = useState(false);
  const [showPrices, setShowPrices] = useState(false);
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const flash = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadSellable = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/sales/sellable");
      setSellable(res.data.items || []);
    } catch {
      flash("Could not load your shelf", "error");
    }
    setLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await API.get("/sales?limit=25");
      setHistory(res.data.sales || []);
    } catch {
      /* history is non-critical */
    }
  }, []);

  useEffect(() => {
    loadSellable();
    loadHistory();
  }, [loadSellable, loadHistory]);

  const catalogue = useMemo(() => toCatalogue(sellable), [sellable]);
  const stockFor = (variantId) =>
    Number(sellable.find((s) => s.variantId === variantId)?.qty || 0);

  const addItems = (items) => {
    setCart((prev) => {
      const next = [...prev];
      for (const it of items) {
        const i = next.findIndex((c) => c.variantId === it.variantId);
        if (i >= 0) next[i] = { ...next[i], quantity: next[i].quantity + it.quantity };
        else next.push({ ...it });
      }
      return next;
    });
  };

  const setQty = (variantId, qty) =>
    setCart((prev) =>
      prev.map((c) => (c.variantId === variantId ? { ...c, quantity: Math.max(1, qty) } : c))
    );
  const removeLine = (variantId) =>
    setCart((prev) => prev.filter((c) => c.variantId !== variantId));

  const subtotal = useMemo(
    () => cart.reduce((s, c) => s + c.quantity * c.rate, 0),
    [cart]
  );
  const total = Math.max(0, subtotal - Number(discount || 0));
  const paid = useMemo(
    () => payments.reduce((s, p) => s + Number(p.amount || 0), 0),
    [payments]
  );
  const balance = total - paid;

  const setPayment = (idx, patch) =>
    setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const addPaymentRow = () =>
    setPayments((prev) => [...prev, { method: "upi", amount: "" }]);
  const removePaymentRow = (idx) =>
    setPayments((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const resetSale = () => {
    setCart([]);
    setCustomer({ name: "", phone: "" });
    setDiscount(0);
    setPayments([{ method: "cash", amount: "" }]);
  };

  const overStock = cart.filter((c) => c.quantity > stockFor(c.variantId));

  const completeSale = async () => {
    if (cart.length === 0) return flash("Add at least one item", "error");
    if (paid + 1e-6 < total) return flash("Payment doesn't cover the total", "error");
    setSubmitting(true);
    try {
      const body = {
        items: cart.map((c) => ({ variantId: c.variantId, quantity: c.quantity })),
        payments: payments
          .filter((p) => Number(p.amount) > 0)
          .map((p) => ({ method: p.method, amount: Number(p.amount) })),
        discount: Number(discount || 0),
      };
      if (customer.name || customer.phone) body.customer = { ...customer };
      const res = await API.post("/sales", body);
      flash(`Sale ${res.data.sale?.billNumber || ""} recorded`);
      resetSale();
      loadSellable();
      loadHistory();
    } catch (e) {
      flash(e.response?.data?.error || "Sale failed", "error");
    }
    setSubmitting(false);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
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

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
          <p className="text-sm text-slate-500">Ring up a customer. Selling stock accrues what you owe your distributor.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPrices(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <Tag className="w-4 h-4" /> Prices
          </button>
          <button
            onClick={loadSellable}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Cart */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <ShoppingCart className="w-5 h-5 text-indigo-600" />
                </div>
                <h2 className="font-semibold text-slate-900">Current sale</h2>
              </div>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4" /> Add items
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-sm">
                No items yet. Hit <span className="font-medium text-slate-600">Add items</span> to
                search your shelf or dictate an order.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {cart.map((c) => {
                  const stock = stockFor(c.variantId);
                  const over = c.quantity > stock;
                  return (
                    <div key={c.variantId} className="p-4 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{c.item}</p>
                        <p className="text-xs text-slate-500">
                          {c.brand || "—"} · {money(c.rate)} / {c.unit} ·{" "}
                          <span className={over ? "text-red-600 font-medium" : ""}>
                            {stock} in stock
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setQty(c.variantId, c.quantity - 1)}
                          className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={c.quantity}
                          onChange={(e) => setQty(c.variantId, parseInt(e.target.value) || 1)}
                          className="w-12 text-center border border-slate-300 rounded-md py-1 text-sm"
                        />
                        <button
                          onClick={() => setQty(c.variantId, c.quantity + 1)}
                          className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="w-20 text-right text-sm font-semibold text-slate-900">
                        {money(c.quantity * c.rate)}
                      </div>
                      <button onClick={() => removeLine(c.variantId)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {overStock.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              Selling more than you hold for {overStock.length} item(s). The sale still goes
              through — units beyond your recorded stock just won't be attributed to a
              distributor bill.
            </div>
          )}

          {/* History */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900">Recent sales</h2>
            </div>
            {history.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No sales yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {history.map((s) => (
                  <div key={s.id} className="p-4">
                    <button
                      onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{s.billNumber}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(s.soldAt).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-900">{money(s.total)}</span>
                        {expanded[s.id] ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>
                    {expanded[s.id] && <SaleDetail id={s.id} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Payment panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4 lg:sticky lg:top-20">
            <h2 className="font-semibold text-slate-900">Checkout</h2>

            <div className="grid grid-cols-2 gap-2">
              <input
                value={customer.name}
                onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                placeholder="Customer name"
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <input
                value={customer.phone}
                onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                placeholder="Phone (optional)"
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Discount</span>
                <div className="flex items-center gap-1">
                  <IndianRupee className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 text-right border border-slate-300 rounded-md py-1 px-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-between font-semibold text-slate-900 text-base pt-1 border-t border-slate-200 mt-1">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Payment</span>
                <button
                  onClick={() =>
                    setPayment(0, { amount: String(Math.max(0, total - (paid - Number(payments[0].amount || 0)))) })
                  }
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Exact
                </button>
              </div>
              {payments.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={p.method}
                    onChange={(e) => setPayment(idx, { method: e.target.value })}
                    className="px-2 py-2 border border-slate-300 rounded-lg text-sm capitalize"
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={p.amount}
                    onChange={(e) => setPayment(idx, { amount: e.target.value })}
                    placeholder="0"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-right"
                  />
                  {payments.length > 1 && (
                    <button onClick={() => removePaymentRow(idx)}>
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addPaymentRow}
                className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> split payment
              </button>
            </div>

            <div
              className={`flex justify-between text-sm font-medium ${
                Math.abs(balance) < 0.01
                  ? "text-slate-500"
                  : balance > 0
                  ? "text-red-600"
                  : "text-emerald-600"
              }`}
            >
              <span>{balance > 0 ? "Still due" : balance < 0 ? "Change" : "Settled"}</span>
              <span>{money(Math.abs(balance))}</span>
            </div>

            <button
              onClick={completeSale}
              disabled={submitting || cart.length === 0 || balance > 0.01}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-slate-300"
            >
              <Check className="w-4 h-4" />
              {submitting ? "Recording…" : "Complete sale"}
            </button>
            {cart.length > 0 && (
              <button
                onClick={resetSale}
                className="w-full text-xs text-slate-500 hover:text-slate-700"
              >
                Clear sale
              </button>
            )}
          </div>
        </div>
      </div>

      <CreateOrder
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onAddItems={addItems}
        products={catalogue}
      />
      {showPrices && (
        <PriceModal
          rows={sellable}
          onClose={() => setShowPrices(false)}
          onSaved={loadSellable}
          flash={flash}
        />
      )}
    </div>
  );
}

function SaleDetail({ id }) {
  const [sale, setSale] = useState(null);
  useEffect(() => {
    API.get(`/sales/${id}`)
      .then((r) => setSale(r.data.sale))
      .catch(() => setSale({ items: [], payments: [] }));
  }, [id]);
  if (!sale) return <p className="text-xs text-slate-400 mt-2">Loading…</p>;
  return (
    <div className="mt-3 bg-slate-50 rounded-lg p-3 text-xs space-y-1">
      {(sale.items || []).map((it) => (
        <div key={it.id} className="flex justify-between text-slate-600">
          <span>
            {it.productName || it.variantName} × {it.quantity}
          </span>
          <span>{money(it.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between pt-1 border-t border-slate-200 text-slate-500">
        <span>{(sale.payments || []).map((p) => `${p.method} ${money(p.amount)}`).join(" · ")}</span>
        <span className="font-semibold text-slate-800">{money(sale.total)}</span>
      </div>
    </div>
  );
}

function PriceModal({ rows, onClose, onSaved, flash }) {
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const changed = Object.entries(edits).filter(
      ([variantId, v]) =>
        v !== "" && Number(v) >= 0 &&
        Number(v) !== Number(rows.find((r) => r.variantId === variantId)?.price)
    );
    if (changed.length === 0) return onClose();
    setSaving(true);
    try {
      await Promise.all(
        changed.map(([variantId, v]) =>
          API.put(`/sales/price/${variantId}`, { price: Number(v) })
        )
      );
      flash(`Updated ${changed.length} price(s)`);
      onSaved();
      onClose();
    } catch (e) {
      flash(e.response?.data?.error || "Could not update prices", "error");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden border border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Selling prices</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-100">
          {rows.length === 0 && (
            <p className="text-sm text-slate-500">Nothing on your shelf yet.</p>
          )}
          {rows.map((r) => (
            <div key={r.variantId} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {r.productName || r.variantName}
                </p>
                <p className="text-xs text-slate-500">
                  {r.variantName} · MRP {money(r.mrp)} ·{" "}
                  {r.priceIsCustom ? "custom price" : "using MRP"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <IndianRupee className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="number"
                  min="0"
                  defaultValue={r.price}
                  onChange={(e) =>
                    setEdits((x) => ({ ...x, [r.variantId]: e.target.value }))
                  }
                  className="w-24 text-right border border-slate-300 rounded-md py-1 px-2 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {saving ? "Saving…" : "Save prices"}
          </button>
        </div>
      </div>
    </div>
  );
}
