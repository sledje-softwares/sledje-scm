import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  Package, Users, ShoppingCart, Clock, AlertCircle, Truck, IndianRupee,
} from "lucide-react";
import API from "../../api";
import { Skeleton, SkeletonStatGrid } from "../../components/Skeleton";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const num = (n) => Number(n || 0);

export default function DistributorOverview() {
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [bills, setBills] = useState([]);
  const [retailers, setRetailers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const results = await Promise.allSettled([
        API.get("/orders/distributor/orders"),
        API.get("/api/distributor-inventory/mine"),
        API.get("/product-bills?role=distributor"),
        API.get("/connections/distributor/retailers"),
      ]);
      const [o, inv, b, r] = results;
      if (o.status === "fulfilled") setOrders(o.value.data.data || []);
      if (inv.status === "fulfilled") setInventory(inv.value.data.items || []);
      if (b.status === "fulfilled") setBills(b.value.data.data || b.value.data.bills || []);
      if (r.status === "fulfilled") setRetailers(r.value.data.retailers || r.value.data || []);
      setLoading(false);
    })();
  }, []);

  const openStatuses = ["pending", "processing", "dispatched", "out_for_delivery"];

  const stats = useMemo(() => {
    const todayStr = new Date().toDateString();
    const ordersToday = orders.filter((o) => new Date(o.createdAt).toDateString() === todayStr).length;
    const openOrders = orders.filter((o) => openStatuses.includes(o.status)).length;
    const totalDue = bills.reduce((s, b) => s + num(b.outstandingBalance), 0);
    const unitsOut = inventory.reduce((s, i) => s + num(i.outForDelivery), 0);
    return [
      { label: "Connected retailers", value: retailers.length, icon: Users },
      { label: "Products stocked", value: inventory.length, icon: Package },
      { label: "Orders today", value: ordersToday, icon: ShoppingCart },
      { label: "Open orders", value: openOrders, icon: Clock },
      { label: "Units out for delivery", value: unitsOut, icon: Truck },
      { label: "Due from retailers", value: money(totalDue), icon: IndianRupee },
    ];
  }, [orders, inventory, bills, retailers]);

  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 6),
    [orders]
  );

  const lowStock = useMemo(
    () =>
      inventory
        .filter((i) => num(i.stock) - num(i.outForDelivery) <= num(i.lowStockThreshold ?? 5))
        .sort((a, b) => num(a.stock) - num(b.stock))
        .slice(0, 6),
    [inventory]
  );

  const topRetailers = useMemo(() => {
    const map = new Map();
    for (const b of bills) {
      const k = b.retailerId;
      const cur = map.get(k) || { name: b.retailerName || "Retailer", exposure: 0 };
      cur.exposure += num(b.outstandingBalance) + num(b.amountReceivedNotDue);
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.exposure - a.exposure).slice(0, 5);
  }, [bills]);

  const chartData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: d.toDateString(), name: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), value: 0 });
    }
    const idx = Object.fromEntries(days.map((d, i) => [d.key, i]));
    for (const o of orders) {
      const k = new Date(o.createdAt).toDateString();
      if (k in idx) days[idx[k]].value += num(o.totalAmount);
    }
    return days;
  }, [orders]);

  const statusStyle = (s) =>
    ({
      delivered: "bg-emerald-100 text-emerald-800",
      pending: "bg-amber-100 text-amber-800",
      processing: "bg-blue-100 text-blue-800",
      dispatched: "bg-indigo-100 text-indigo-800",
      out_for_delivery: "bg-violet-100 text-violet-800",
      cancelled: "bg-red-100 text-red-800",
      modified: "bg-orange-100 text-orange-800",
    }[s] || "bg-slate-100 text-slate-800");

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Distributor Overview</h1>
          <p className="text-slate-500 mt-1">
            {loading ? "Loading your numbers…" : "Live from your orders, inventory and product bills."}
          </p>
        </header>

        {loading ? (
          <SkeletonStatGrid count={6} className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8" />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
            {stats.map((stat, i) => (
              <div key={i} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="p-2 rounded-lg bg-indigo-50 w-fit mb-3">
                  <stat.icon className="w-5 h-5 text-indigo-600" />
                </div>
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">Recent retailer orders</h2>
            </div>
            {loading ? (
              <div className="p-6 space-y-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : recentOrders.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">No orders yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 font-medium">Retailer</th>
                      <th className="px-6 py-3 font-medium">Amount</th>
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((o) => (
                      <tr key={o.id} className="border-b border-slate-100 last:border-none">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {o.retailer?.businessName || "—"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{money(o.totalAmount)}</td>
                        <td className="px-6 py-4 text-slate-500">
                          {new Date(o.createdAt).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusStyle(o.status)}`}>
                            {(o.status || "").replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">Retailers by exposure</h2>
            </div>
            {loading ? (
              <div className="p-6 space-y-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : topRetailers.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">No product bills yet.</p>
            ) : (
              topRetailers.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-6 py-4 border-b border-slate-100 last:border-none">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                      {i + 1}
                    </span>
                    <span className="font-medium text-slate-900">{r.name}</span>
                  </div>
                  <span className="font-semibold text-slate-900">{money(r.exposure)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">Low stock (available to sell)</h2>
            </div>
            {loading ? (
              <div className="p-6 space-y-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                ))}
              </div>
            ) : lowStock.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">Nothing running low.</p>
            ) : (
              lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-6 py-4 border-b border-slate-100 last:border-none">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-full bg-red-100 text-red-600">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-slate-900">{p.variant?.name || p.product?.name}</span>
                  </div>
                  <span className="text-red-600 font-medium text-sm bg-red-50 px-2 py-1 rounded-md">
                    {Math.max(0, num(p.stock) - num(p.outForDelivery))} left
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Order value — last 7 days</h2>
            <div className="h-[250px] w-full">
              {loading ? (
                <Skeleton className="h-full w-full" rounded="rounded-lg" />
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip
                    formatter={(v) => money(v)}
                    contentStyle={{ backgroundColor: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    dot={{ fill: "#4f46e5", strokeWidth: 2, r: 4, stroke: "#fff" }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
