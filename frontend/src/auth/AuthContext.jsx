import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authLogin, authMe, setAuthToken } from "../api";
import { normalizeRole, ROLES } from "./rolePermissions";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("mdqm_token"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("mdqm_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    let disposed = false;
    const boot = async () => {
      if (!token) {
        setReady(true);
        return;
      }
      try {
        const res = await authMe();
        if (!disposed) {
          setUser(res.data.user);
          localStorage.setItem("mdqm_user", JSON.stringify(res.data.user));
        }
      } catch {
        if (!disposed) logout();
      } finally {
        if (!disposed) setReady(true);
      }
    };
    boot();
    return () => {
      disposed = true;
    };
  }, [token]);

  const login = async (email, password) => {
    const res = await authLogin(email, password);
    const nextToken = res.data.access_token;
    const nextUser = res.data.user;
    localStorage.setItem("mdqm_token", nextToken);
    localStorage.setItem("mdqm_user", JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
    return nextUser;
  };

  const logout = () => {
    localStorage.removeItem("mdqm_token");
    localStorage.removeItem("mdqm_user");
    setToken(null);
    setUser(null);
    setAuthToken(null);
  };

  const value = useMemo(
    () => ({
      token,
      user,
      ready,
      role: normalizeRole(user?.role),
      isAdmin: normalizeRole(user?.role) === ROLES.ADMIN,
      isViewer: normalizeRole(user?.role) === ROLES.VIEWER,
      login,
      logout,
    }),
    [token, user, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
