"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  authedFetch: <T>(fn: (token: string) => Promise<T>) => Promise<T>;
}

const STORAGE_KEY = "nidalheim.auth";
const EXPIRED_TOKEN_MESSAGES = [
  "Invalid or expired access token",
  "Missing or invalid Authorization header",
  "Missing access token",
];

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

function isExpiredAccessTokenError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return EXPIRED_TOKEN_MESSAGES.some((m) => msg.includes(m));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Refs mirror the latest state for use inside async closures without stale capture.
  const userRef = useRef<AuthUser | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    const stored = readStoredAuth();
    if (stored) {
      setUser(stored.user);
      setAccessToken(stored.accessToken);
      setRefreshToken(stored.refreshToken);
      userRef.current = stored.user;
      accessTokenRef.current = stored.accessToken;
      refreshTokenRef.current = stored.refreshToken;
    }
    setIsReady(true);
  }, []);

  const applyAuth = useCallback((data: StoredAuth) => {
    setUser(data.user);
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    userRef.current = data.user;
    accessTokenRef.current = data.accessToken;
    refreshTokenRef.current = data.refreshToken;
    writeStoredAuth(data);
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    userRef.current = null;
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    writeStoredAuth(null);
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
    const token = refreshTokenRef.current;
    clearAuth();
    if (token) {
      try {
        await api.logout(token);
      } catch {
        // server-side revoke best-effort; local state already cleared
      }
    }
  }, [clearAuth]);

  // Transparent refresh: if an access-token-expired error fires, run /refresh once
  // and retry. Concurrent callers share a single in-flight refresh.
  const authedFetch = useCallback(
    async <T,>(fn: (token: string) => Promise<T>): Promise<T> => {
      const token = accessTokenRef.current;
      if (!token) throw new Error("Not authenticated");

      try {
        return await fn(token);
      } catch (err) {
        if (!isExpiredAccessTokenError(err)) throw err;

        const currentRefresh = refreshTokenRef.current;
        if (!currentRefresh) {
          clearAuth();
          throw err;
        }

        let refreshPromise = refreshInFlightRef.current;
        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              const next = await api.refresh(currentRefresh);
              const keptUser =
                userRef.current ?? {
                  id: "",
                  username: "",
                  email: "",
                  role: "player",
                };
              applyAuth({
                user: keptUser,
                accessToken: next.accessToken,
                refreshToken: next.refreshToken,
              });
              return next.accessToken;
            } finally {
              refreshInFlightRef.current = null;
            }
          })();
          refreshInFlightRef.current = refreshPromise;
        }

        let fresh: string;
        try {
          fresh = await refreshPromise;
        } catch (refreshErr) {
          clearAuth();
          throw refreshErr;
        }
        return await fn(fresh);
      }
    },
    [applyAuth, clearAuth],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isReady,
        login,
        register,
        logout,
        authedFetch,
      }}
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
