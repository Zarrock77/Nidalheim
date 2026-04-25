"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  deviceApprove,
  deviceDeny,
  deviceLookup,
  type DeviceLookupInfo,
} from "@/lib/auth/api";

interface Props {
  initialCode?: string;
}

type ResolvedState = "idle" | "approved" | "denied";

function normalizeUserCode(input: string): string {
  // Strip whitespace and dashes, uppercase, then re-insert the dash after 4
  // chars. Lets the user paste "abcd-efgh", "ABCDEFGH", "abcd efgh"... and
  // always end up with the canonical "ABCD-EFGH" we sent from the server.
  const flat = input.replace(/[\s-]/g, "").toUpperCase();
  if (flat.length <= 4) return flat;
  return `${flat.slice(0, 4)}-${flat.slice(4, 8)}`;
}

export const DeviceApproval: React.FC<Props> = ({ initialCode }) => {
  const { user, accessToken, isReady, authedFetch } = useAuth();
  const [code, setCode] = useState<string>(
    initialCode ? normalizeUserCode(initialCode) : "",
  );
  const [info, setInfo] = useState<DeviceLookupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedState>("idle");

  const lookup = useCallback(
    async (userCode: string) => {
      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        const result = await authedFetch((token) =>
          deviceLookup(token, userCode),
        );
        setInfo(result);
      } catch (err) {
        setInfo(null);
        setError(err instanceof Error ? err.message : "Lookup failed");
      } finally {
        setLoading(false);
      }
    },
    [authedFetch],
  );

  // Auto-lookup once: ready + signed in + we have a code from the URL.
  useEffect(() => {
    if (!isReady || !accessToken || !initialCode) return;
    const normalized = normalizeUserCode(initialCode);
    if (normalized.length !== 9) return; // "XXXX-XXXX"
    void lookup(normalized);
  }, [isReady, accessToken, initialCode, lookup]);

  const onSubmitCode = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const normalized = normalizeUserCode(code);
      setCode(normalized);
      if (normalized.length !== 9) {
        setError("Code format invalide. Attendu: XXXX-XXXX");
        return;
      }
      void lookup(normalized);
    },
    [code, lookup],
  );

  const onApprove = useCallback(async () => {
    if (!info) return;
    setSubmitting("approve");
    setError(null);
    try {
      await authedFetch((token) => deviceApprove(token, info.user_code));
      setResolved("approved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setSubmitting(null);
    }
  }, [info, authedFetch]);

  const onDeny = useCallback(async () => {
    if (!info) return;
    setSubmitting("deny");
    setError(null);
    try {
      await authedFetch((token) => deviceDeny(token, info.user_code));
      setResolved("denied");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deny failed");
    } finally {
      setSubmitting(null);
    }
  }, [info, authedFetch]);

  // ---- Render branches ----------------------------------------------------

  if (!isReady) {
    return <Shell title="Authorize device">…</Shell>;
  }

  // Not signed in — push them through /login then back here with the code.
  if (!user || !accessToken) {
    const returnTo = code ? `/device?code=${encodeURIComponent(code)}` : "/device";
    return (
      <Shell
        title="Authorize device"
        subtitle="Sign in to approve a game session sign-in request."
      >
        <Link
          href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          className="reverse-radius-sm flex h-12 items-center justify-center border border-[#d6af36] bg-[#d6af36] px-6 font-['Cinzel'] text-[13px] uppercase tracking-[0.25em] text-[#0a0a0f] transition-colors duration-200 hover:bg-[#b89520] hover:border-[#b89520]"
        >
          Sign In
        </Link>
      </Shell>
    );
  }

  // Resolved screens — keep the user oriented, no auto-redirect.
  if (resolved === "approved") {
    return (
      <Shell
        title="Device authorized"
        subtitle="You can return to the game. The session should connect within a few seconds."
      />
    );
  }
  if (resolved === "denied") {
    return (
      <Shell
        title="Sign-in denied"
        subtitle="The game session has been refused. You can close this page."
      />
    );
  }

  // No info yet (no URL code, or lookup hasn't run) — show the code form.
  if (!info) {
    return (
      <Shell
        title="Enter your code"
        subtitle="Type the code displayed in the game to approve the sign-in."
      >
        <form onSubmit={onSubmitCode} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Code
            </span>
            <input
              name="code"
              type="text"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              className="h-11 w-full border border-[#d6af36]/30 bg-[#1a1a24] px-3.5 font-mono tracking-[0.2em] text-foreground outline-none transition-colors duration-200 focus:border-[#d6af36] focus:bg-[#1f1f2a]"
            />
          </label>

          {error && <ErrorBox>{error}</ErrorBox>}

          <button
            type="submit"
            disabled={loading}
            className="reverse-radius-sm mt-2 h-12 border border-[#d6af36] bg-[#d6af36] px-6 font-['Cinzel'] text-[13px] uppercase tracking-[0.25em] text-[#0a0a0f] transition-colors duration-200 hover:bg-[#b89520] hover:border-[#b89520] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Checking…" : "Continue"}
          </button>
        </form>
      </Shell>
    );
  }

  // We have a valid pending code — show the confirmation panel.
  return (
    <Shell
      title="Authorize sign-in"
      subtitle={`Approve a session for ${info.client_name} as ${user.username}.`}
    >
      <div className="reverse-radius-sm bg-[#d6af36]/20 p-px">
        <div className="reverse-radius-sm-inner bg-[#1a1a24] px-4 py-5 text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Code
          </div>
          <div className="mt-2 font-mono text-2xl tracking-[0.4em] text-[#d6af36]">
            {info.user_code}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Expires in {Math.max(0, Math.floor(info.expires_in / 60))} min
          </div>
        </div>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={submitting !== null}
          className="reverse-radius-sm h-12 border border-[#d6af36] bg-[#d6af36] px-6 font-['Cinzel'] text-[13px] uppercase tracking-[0.25em] text-[#0a0a0f] transition-colors duration-200 hover:bg-[#b89520] hover:border-[#b89520] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={onDeny}
          disabled={submitting !== null}
          className="reverse-radius-sm h-12 border border-[#7d152c]/60 bg-transparent px-6 font-['Cinzel'] text-[13px] uppercase tracking-[0.25em] text-foreground transition-colors duration-200 hover:bg-[#7d152c]/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting === "deny" ? "Denying…" : "Deny"}
        </button>
      </div>
    </Shell>
  );
};

// -------- Presentational helpers ------------------------------------------

const Shell: React.FC<{
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <div className="reverse-radius w-full max-w-[440px] bg-[#d6af36] p-px">
    <div className="reverse-radius-inner bg-[#121218] p-8 sm:p-10">
      <div className="mb-8 text-center">
        <span className="text-[11px] tracking-[0.35em] uppercase text-[#d6af36]">
          Nidalheim
        </span>
        <div className="mt-3 flex items-center justify-center gap-3">
          <div className="h-px w-10 bg-gradient-to-r from-transparent to-[#d6af36]/50" />
          <div className="h-1.5 w-1.5 rotate-45 border border-[#d6af36]" />
          <div className="h-px w-10 bg-gradient-to-l from-transparent to-[#d6af36]/50" />
        </div>
        <h1 className="mt-4 font-['Cinzel'] text-[28px] leading-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  </div>
);

const ErrorBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="reverse-radius-sm bg-[#7d152c] p-px">
    <div className="reverse-radius-sm-inner bg-[#25131c] px-3 py-2 text-sm text-foreground">
      {children}
    </div>
  </div>
);
