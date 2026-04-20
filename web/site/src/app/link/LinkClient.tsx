"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import * as api from "@/lib/auth/api";

interface LinkClientProps {
  initialCode: string;
}

type Phase =
  | "loading"
  | "consent"
  | "approving"
  | "approved"
  | "denied"
  | "error";

const CLICK_DELAY_MS = 400;

export const LinkClient: React.FC<LinkClientProps> = ({ initialCode }) => {
  const { user, isReady, logout, authedFetch } = useAuth();
  const router = useRouter();
  const code = normalizeCode(initialCode);

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [clientName, setClientName] = useState<string>("Nidalheim Game");
  const [expiresIn, setExpiresIn] = useState<number>(0);
  const [canApprove, setCanApprove] = useState(false);
  const lookedUp = useRef(false);

  useEffect(() => {
    if (!isReady) return;

    if (!code) {
      setPhase("error");
      setErrorMessage("Missing or malformed device code.");
      return;
    }

    if (!user) {
      const rt = encodeURIComponent(`/link?code=${encodeURIComponent(code)}`);
      router.replace(`/login?returnTo=${rt}`);
      return;
    }

    if (lookedUp.current) return;
    lookedUp.current = true;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    authedFetch((token) => api.deviceLookup(token, code))
      .then((info) => {
        if (cancelled) return;
        setClientName(info.client_name || "Nidalheim Game");
        setExpiresIn(info.expires_in);
        setPhase("consent");
        timer = setTimeout(() => {
          if (!cancelled) setCanApprove(true);
        }, CLICK_DELAY_MS);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setPhase("error");
        setErrorMessage(humanizeLookupError(err.message));
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isReady, user, code, router, authedFetch]);

  async function onApprove() {
    if (!canApprove) return;
    setPhase("approving");
    try {
      await authedFetch((token) => api.deviceApprove(token, code));
      setPhase("approved");
    } catch (err) {
      setPhase("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Approval failed",
      );
    }
  }

  async function onDeny() {
    try {
      await authedFetch((token) => api.deviceDeny(token, code));
      setPhase("denied");
    } catch (err) {
      setPhase("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Denial failed",
      );
    }
  }

  async function onSwitchAccount() {
    await logout();
    const rt = encodeURIComponent(`/link?code=${encodeURIComponent(code)}`);
    router.replace(`/login?returnTo=${rt}`);
  }

  if (phase === "loading") {
    return (
      <Shell>
        <StatusMessage label="Loading…" />
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell>
        <StatusMessage label={errorMessage} tone="error" />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          You can close this window and try again from the game.
        </p>
      </Shell>
    );
  }

  if (phase === "approved") {
    return (
      <Shell>
        <StatusMessage label="Device connected." tone="success" />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Return to the game — this window can be closed.
        </p>
      </Shell>
    );
  }

  if (phase === "denied") {
    return (
      <Shell>
        <StatusMessage label="Authorization denied." />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          You can close this window.
        </p>
      </Shell>
    );
  }

  if (!user) return null;
  const initial = (user.username || "?").charAt(0).toUpperCase();

  return (
    <Shell>
      <div className="mb-8 text-center">
        <span className="text-[11px] tracking-[0.35em] uppercase text-[#d6af36]">
          Nidalheim
        </span>
        <div className="mt-3 flex items-center justify-center gap-3">
          <div className="h-px w-10 bg-gradient-to-r from-transparent to-[#d6af36]/50" />
          <div className="h-1.5 w-1.5 rotate-45 border border-[#d6af36]" />
          <div className="h-px w-10 bg-gradient-to-l from-transparent to-[#d6af36]/50" />
        </div>
        <h1 className="mt-4 font-['Cinzel'] text-[26px] leading-tight text-foreground">
          Connect {clientName}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Authorize this device to sign in with your account.
        </p>
      </div>

      <div className="reverse-radius-sm mb-6 bg-[#d6af36]/25 p-px">
        <div className="reverse-radius-sm-inner flex items-center gap-3 bg-[#1a1a24] p-4">
          <div
            className="reverse-radius-sm-inner grid h-12 w-12 shrink-0 place-items-center bg-[#d6af36] font-['Cinzel'] text-lg text-[#0a0a0f]"
            style={{ "--rr": "7px" } as React.CSSProperties}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-['Cinzel'] uppercase tracking-[0.15em] text-[#d6af36]">
              {user.username}
            </div>
            {user.email && (
              <div className="truncate text-xs text-muted-foreground">
                {user.email}
              </div>
            )}
            <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {user.role}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Code:{" "}
        <span className="font-mono tracking-[0.3em] text-foreground">
          {code}
        </span>
        {expiresIn > 0 && (
          <span className="ml-2 text-muted-foreground/70">
            (expires in {Math.max(1, Math.floor(expiresIn / 60))} min)
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={!canApprove || phase === "approving"}
          onClick={onApprove}
          className="reverse-radius-sm h-12 border border-[#d6af36] bg-[#d6af36] px-6 font-['Cinzel'] text-[13px] uppercase tracking-[0.25em] text-[#0a0a0f] transition-colors duration-200 hover:bg-[#b89520] hover:border-[#b89520] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase === "approving" ? "Connecting…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={onDeny}
          disabled={phase === "approving"}
          className="reverse-radius-sm h-11 border border-destructive/55 bg-transparent px-6 font-['Cinzel'] text-[12px] uppercase tracking-[0.25em] text-destructive transition-colors duration-200 hover:bg-black/50 disabled:opacity-60"
        >
          Deny
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Not you?{" "}
        <button
          type="button"
          onClick={onSwitchAccount}
          className="text-[#d6af36] underline-offset-4 hover:underline"
        >
          Switch account
        </button>
      </p>
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="reverse-radius w-full max-w-[460px] bg-[#d6af36] p-px">
    <div className="reverse-radius-inner bg-[#121218] p-8 sm:p-10">
      {children}
    </div>
  </div>
);

const StatusMessage: React.FC<{
  label: string;
  tone?: "success" | "error" | "info";
}> = ({ label, tone = "info" }) => (
  <div className="text-center">
    <div
      className={`font-['Cinzel'] text-[20px] leading-tight ${
        tone === "error"
          ? "text-destructive"
          : tone === "success"
            ? "text-[#d6af36]"
            : "text-foreground"
      }`}
    >
      {label}
    </div>
  </div>
);

function normalizeCode(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (compact.length !== 8) return "";
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}`;
}

function humanizeLookupError(msg: string): string {
  if (msg.includes("not_found")) return "Unknown or expired device code.";
  if (msg.includes("already_resolved"))
    return "This device code has already been used.";
  if (msg.includes("invalid_user_code"))
    return "Invalid device code format.";
  if (msg.toLowerCase().includes("invalid or expired")) {
    return "Your session expired. Please sign in again.";
  }
  return msg || "Unable to look up device code.";
}
