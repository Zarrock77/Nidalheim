"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import * as api from "./api";
import type { AuthUser } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isReady: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const STORAGE_KEY = "nidalheim.auth";

const AuthContext = createContext<AuthContextValue | null>(null);

interface StoredAuth {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

function readStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

function writeStoredAuth(value: StoredAuth | null) {
  if (typeof window === "undefined") return;
  if (value) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const stored = readStoredAuth();
    if (stored) {
      setUser(stored.user);
      setAccessToken(stored.accessToken);
      setRefreshToken(stored.refreshToken);
    }
    setIsReady(true);
  }, []);

  const applyAuth = useCallback((data: StoredAuth) => {
    setUser(data.user);
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    writeStoredAuth(data);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api.login(username, password);
      applyAuth({
        user: res.user,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      });
    },
    [applyAuth],
  );

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const tokens = await api.register(username, email, password);
      applyAuth({
        user: {
          id: "",
          username,
          email,
          role: "player",
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    const token = refreshToken;
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    writeStoredAuth(null);
    if (token) {
      try {
        await api.logout(token);
      } catch {
        // server-side revoke best-effort; local state already cleared
      }
    }
  }, [refreshToken]);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, isReady, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
