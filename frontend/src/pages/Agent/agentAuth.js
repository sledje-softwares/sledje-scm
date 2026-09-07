import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, ArrowRight } from "lucide-react";
import API from "../../api";
import { useAuth } from "../../components/AuthContext";

/**
 * Delivery-agent auth. Agents are a self-registering platform pool
 * (docs/15-delivery-confirmation.md) — a distinct account type from the
 * retailer/distributor sign-up in components/Login.js, so it gets its own
 * lightweight surface here.
 */
export default function AgentAuth({ mode = "login" }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(mode === "register");
  const [form, setForm] = useState({
    name: "", email: "", password: "", phone: "", vehicleNumber: "", operatingPincode: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const path = isRegister ? "/deliveries/agents/register" : "/deliveries/agents/login";
      const body = isRegister
        ? form
        : { email: form.email, password: form.password };
      const res = await API.post(path, body);
      // AuthContext.login expects { user: <raw login response> }
      login({ user: res.data });
      navigate("/agent");
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Something went wrong");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900">Sledje Delivery</span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">
            {isRegister ? "Become a delivery agent" : "Agent sign in"}
          </h1>
          <p className="text-sm text-slate-500 mb-5">
            {isRegister
              ? "Register once. Any distributor on Sledje can then assign you deliveries."
              : "Sign in to see the runs assigned to you."}
          </p>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            {isRegister && (
              <input
                required value={form.name} onChange={set("name")}
                placeholder="Full name"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            )}
            <input
              required type="email" value={form.email} onChange={set("email")}
              placeholder="Email"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <input
              required type="password" value={form.password} onChange={set("password")}
              placeholder="Password"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {isRegister && (
              <>
                <input
                  required value={form.phone} onChange={set("phone")}
                  placeholder="Phone"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={form.vehicleNumber} onChange={set("vehicleNumber")}
                    placeholder="Vehicle no. (optional)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <input
                    value={form.operatingPincode} onChange={set("operatingPincode")}
                    placeholder="Area pincode"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {loading ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <button
            onClick={() => { setIsRegister((v) => !v); setError(""); }}
            className="mt-4 text-sm text-indigo-600 hover:underline"
          >
            {isRegister ? "Already an agent? Sign in" : "New here? Register as an agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
