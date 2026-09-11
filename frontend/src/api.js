import axios from "axios";

// The backend mounts most routers at the root (a few sit under /api). The axios
// baseURL must therefore NOT carry an /api suffix - individual calls that need
// it (e.g. /api/distributor-inventory) spell it out. Override per environment
// with VITE_API_URL.
//
// Deliberately NOT defaulting to a hardcoded production host here: an
// earlier version fell back to "https://sledjeweb-2.onrender.com", which
// doesn't even match render.yaml's actual service name and would silently
// point a misconfigured local build at a live production backend. Fail
// loud instead - a local dev fallback plus a console warning, never a
// silent hit to prod.
const configuredBaseURL = import.meta.env.VITE_API_URL;
if (!configuredBaseURL) {
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_API_URL is not set - falling back to http://localhost:5000. " +
    "Set VITE_API_URL in your .env to point at the intended backend."
  );
}
const API = axios.create({
  baseURL: configuredBaseURL || "http://localhost:5000",
});

// If you want to attach token for logged-in routes later:
API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

// A 401 means the token this app is holding is no longer valid (expired,
// revoked, or never was). Clear the same localStorage keys
// AuthContext.logout() clears and send the user back to /login. This file
// is a plain axios instance (not a React component), so it has no access
// to the AuthContext hook or React Router's navigate - a direct
// localStorage clear + window.location redirect is the simplest robust
// equivalent from here.
API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("isAuthenticated");
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default API;
