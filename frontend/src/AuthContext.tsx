import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const TOKEN_STORAGE_KEY = "snip_token";

type AuthContextValue = {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// api.ts is a plain module, not a React component, so it can't call
// useAuth() directly. AuthProvider registers its logout function here on
// mount so api.ts can call it when a request comes back 401, without the
// caller having to handle that case itself.
let sharedLogout: (() => void) | null = null;

export function triggerLogout() {
  sharedLogout?.();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  // Restore a previously saved token on first load. This only proves a
  // token was saved before, not that it's still valid — the backend is
  // the source of truth and will reject it with 401 if it has expired.
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (savedToken) {
      setToken(savedToken);
    }
  }, []);

  function login(newToken: string) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  }

  useEffect(() => {
    sharedLogout = logout;
    return () => {
      sharedLogout = null;
    };
  }, []);

  return <AuthContext.Provider value={{ token, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
