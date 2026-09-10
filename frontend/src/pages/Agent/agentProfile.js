import React, { useEffect, useState } from "react";
import { User, Phone, Truck, MapPin } from "lucide-react";
import API from "../../api";
import { Skeleton } from "../../components/Skeleton";

export default function AgentProfile() {
  const [agent, setAgent] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    API.get("/deliveries/agents/me")
      .then((r) => setAgent(r.data.agent))
      .catch(() => setError("Could not load your profile"));
  }, []);

  if (error) return <p className="p-4 text-sm text-red-600">{error}</p>;
  if (!agent) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold text-slate-900 mb-4">Profile</h1>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 p-4">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const rows = [
    { icon: User, label: "Name", value: agent.name },
    { icon: Phone, label: "Phone", value: agent.phone },
    { icon: Truck, label: "Vehicle", value: agent.vehicleNumber || "—" },
    { icon: MapPin, label: "Operating pincode", value: agent.operatingPincode || "—" },
  ];

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-slate-900 mb-4">Profile</h1>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 p-4">
            <Icon className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-500 w-40">{label}</span>
            <span className="text-sm font-medium text-slate-900">{value}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 p-4">
          <span
            className={`w-2 h-2 rounded-full ${agent.isAvailable ? "bg-emerald-500" : "bg-slate-300"}`}
          />
          <span className="text-sm text-slate-500 w-40">Availability</span>
          <span className="text-sm font-medium text-slate-900">
            {agent.isAvailable ? "Available" : "Offline"}
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Toggle availability from the banner at the top of the app.
      </p>
    </div>
  );
}
