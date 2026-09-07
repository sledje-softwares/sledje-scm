import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Truck, ClipboardList, User, LogOut } from "lucide-react";
import API from "../../api";
import { useAuth } from "../../components/AuthContext";

const nav = [
  { name: "Runs", to: "/agent/runs", icon: ClipboardList },
  { name: "Profile", to: "/agent/profile", icon: User },
];

export default function AgentLayout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [available, setAvailable] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    API.get("/deliveries/agents/me")
      .then((r) => setAvailable(!!r.data.agent?.isAvailable))
      .catch(() => setAvailable(null));
  }, []);

  const toggle = async () => {
    if (available === null) return;
    setBusy(true);
    try {
      const r = await API.put("/deliveries/agents/me/availability", { isAvailable: !available });
      setAvailable(!!r.data.agent?.isAvailable);
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="fixed top-0 left-0 w-full bg-white border-b border-slate-200 z-40">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">Delivery</span>
          </div>

          <div className="flex items-center gap-1">
            {nav.map(({ name, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{name}</span>
              </NavLink>
            ))}
            <button
              onClick={() => { logout(); navigate("/agent/login"); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {available !== null && (
          <div
            className={`text-xs text-center py-1.5 ${
              available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {available ? "You're available for new deliveries" : "You're offline — distributors can't assign you"}
            <button
              onClick={toggle}
              disabled={busy}
              className="ml-2 underline font-medium disabled:opacity-50"
            >
              {available ? "Go offline" : "Go available"}
            </button>
          </div>
        )}
      </div>

      <div className="pt-16 max-w-3xl mx-auto">
        <div className={available !== null ? "pt-7" : ""}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
