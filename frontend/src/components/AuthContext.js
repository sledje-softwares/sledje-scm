import React, { createContext, useState, useContext, useEffect } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  // Check authentication status from localStorage on app load.
  // isAuthenticated is derived from whether a token is present, not read
  // back as its own independently-stored flag - a separate flag can drift
  // out of sync with the actual token (e.g. cleared by one code path but
  // not the other). A full JWT-expiry check is out of scope for this pass;
  // presence is enough.
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    setIsAuthenticated(!!storedToken);
    setUser(storedUser ? JSON.parse(storedUser) : null);
  }, []);

  const login = (data) => {
    // Login.js calls this as login({ user: response.data }), where
    // response.data is the raw backend login response:
    // { token, user: { id, email, role, retailer|distributor } }.
    // Storing that whole object as "user" double-nests the profile
    // (user.user.role instead of user.role), which is why nothing in the
    // app could previously read the logged-in role - PrivateRoute included
    // (P1-7). Flatten it here once, at the source.
    const profile = data.user?.user ?? data.user;
    setUser(profile);
    localStorage.setItem("token", data.user.token);
    localStorage.setItem("user", JSON.stringify(profile));
    // isAuthenticated is derived from token presence (see the load-time
    // effect above); "token" is the source of truth, no separate flag.
    setIsAuthenticated(true);
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    // Legacy key from a prior localStorage-flag scheme; harmless to clear
    // if it's still lying around from before this fix.
    localStorage.removeItem("isAuthenticated");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);