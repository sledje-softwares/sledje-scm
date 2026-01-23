import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Package, Users, ShoppingCart, TrendingUp, AlertCircle, Clock, CheckCircle2 } from "lucide-react";

export default function DistributorOverview() {
  // Dummy data — replace with backend data fetching later
  const stats = [
    { label: "Total Products", value: 56, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Total Retailers", value: 24, icon: Users, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Orders Today", value: 12, icon: ShoppingCart, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Pending Shipments", value: 7, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Revenue This Month", value: "₹2,40,000", icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-50" },
  ];

  const retailerActivities = [
    { name: "Retail Mart", value: "₹10,200", date: "5 June", status: "Delivered" },
    { name: "QuickBuy", value: "₹3,500", date: "4 June", status: "Pending" },
    { name: "MegaStore", value: "₹12,000", date: "3 June", status: "On Way" },
  ];

  const topRetailers = [
    { name: "MegaStore", total: "₹1,20,000" },
    { name: "Retail Mart", total: "₹90,000" },
    { name: "QuickBuy", total: "₹75,000" },
  ];

  const lowStockProducts = [
    { name: "Parle-G", stock: 12 },
    { name: "Amul Milk", stock: 5 },
    { name: "Colgate", stock: 7 },
  ];

  const chartData = [
    { name: "1 Jun", revenue: 5000 },
    { name: "2 Jun", revenue: 12000 },
    { name: "3 Jun", revenue: 8000 },
    { name: "4 Jun", revenue: 18000 },
    { name: "5 Jun", revenue: 15000 },
  ];

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            Distributor Overview
          </h1>
          <p className="text-slate-500 mt-1">Welcome back, here's what's happening today.</p>
        </header>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Activity + Top Retailers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">
                Recent Retailer Orders
              </h2>
            </div>
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
                  {retailerActivities.map((act, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-none hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{act.name}</td>
                      <td className="px-6 py-4 text-slate-600">{act.value}</td>
                      <td className="px-6 py-4 text-slate-500">{act.date}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${act.status === "Delivered"
                              ? "bg-emerald-100 text-emerald-800"
                              : act.status === "Pending"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                        >
                          {act.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">
                Top Retailers by Revenue
              </h2>
            </div>
            <div className="p-0">
              {topRetailers.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-6 py-4 border-b border-slate-100 last:border-none hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                      {i + 1}
                    </span>
                    <span className="font-medium text-slate-900">{r.name}</span>
                  </div>
                  <span className="font-semibold text-slate-900">{r.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Low Stock + Revenue Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">Low Stock Products</h2>
            </div>
            <div className="p-0">
              {lowStockProducts.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-6 py-4 border-b border-slate-100 last:border-none hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-full bg-red-100 text-red-600">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-slate-900">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-red-600 font-medium text-sm bg-red-50 px-2 py-1 rounded-md">
                      {p.stock} left
                    </span>
                    <button className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline">
                      Restock
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Revenue Trend</h2>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    dot={{ fill: '#4f46e5', strokeWidth: 2, r: 4, stroke: '#fff' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
