import React, { createContext, useState, useContext, useEffect } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  // Check authentication status from localStorage on app load
  useEffect(() => {
  
    const storedAuth = localStorage.getItem("isAuthenticated");
    const storedUser = localStorage.getItem("user");
    setIsAuthenticated(storedAuth === "true");
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
    setIsAuthenticated(true);
    localStorage.setItem("isAuthenticated", "true"); // Persist login state
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem("isAuthenticated"); // Clear login state
    localStorage.removeItem("user");
  localStorage.removeItem("token");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);