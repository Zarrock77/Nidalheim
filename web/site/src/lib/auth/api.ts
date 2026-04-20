import type { AuthTokens, AuthUser } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_AUTH_URL || "https://api-auth.nidalheim.com";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      (data as { error?: string }).error || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

export async function login(
  username: string,
  password: string,
): Promise<{ user: AuthUser } & AuthTokens> {
  return request("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function register(
  username: string,
  email: string,
  password: string,
): Promise<AuthTokens> {
  return request("/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

export async function logout(refreshToken: string): Promise<void> {
  await request("/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  return request("/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export interface DeviceLookupInfo {
  user_code: string;
  client_name: string;
  expires_in: number;
}

export async function deviceLookup(
  accessToken: string,
  userCode: string,
): Promise<DeviceLookupInfo> {
  return request("/device/lookup", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ user_code: userCode }),
  });
}

export async function deviceApprove(
  accessToken: string,
  userCode: string,
): Promise<{ status: string }> {
  return request("/device/approve", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ user_code: userCode }),
  });
}

export async function deviceDeny(
  accessToken: string,
  userCode: string,
): Promise<{ status: string }> {
  return request("/device/deny", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ user_code: userCode }),
  });
}
