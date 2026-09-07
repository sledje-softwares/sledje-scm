import axios from "axios";

// The backend mounts most routers at the root (a few sit under /api). The axios
// baseURL must therefore NOT carry an /api suffix - individual calls that need
// it (e.g. /api/distributor-inventory) spell it out. Override per environment
// with VITE_API_URL; default to the deployed host.
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "https://sledjeweb-2.onrender.com",
});

// If you want to attach token for logged-in routes later:
API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

export default API;
