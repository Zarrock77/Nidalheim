"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";

type Mode = "login" | "register";

interface AuthFormProps {
  mode: Mode;
  returnTo?: string;
}

function sanitizeReturnTo(rt: string | undefined): string {
  if (!rt) return "/";
  if (!rt.startsWith("/") || rt.startsWith("//")) return "/";
  return rt;
}

function withReturnTo(path: string, returnTo?: string): string {
  if (!returnTo) return path;
  return `${path}?returnTo=${encodeURIComponent(returnTo)}`;
}

export const AuthForm: React.FC<AuthFormProps> = ({ mode, returnTo }) => {
  const { login, register } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), email.trim(), password);
      }
      router.push(sanitizeReturnTo(returnTo));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const isLogin = mode === "login";

  return (
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
          {isLogin ? "Enter the realm" : "Forge your path"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isLogin
            ? "Return to your saga."
            : "Begin your story in Nidalheim."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          label="Username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={setUsername}
          required
          autoFocus
        />
        {!isLogin && (
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            required
          />
        )}
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          value={password}
          onChange={setPassword}
          required
          minLength={isLogin ? undefined : 8}
          hint={isLogin ? undefined : "At least 8 characters."}
        />

        {error && (
          <div className="reverse-radius-sm bg-[#7d152c] p-px">
            <div className="reverse-radius-sm-inner bg-[#25131c] px-3 py-2 text-sm text-foreground">
              {error}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="reverse-radius-sm mt-2 h-12 border border-[#d6af36] bg-[#d6af36] px-6 font-['Cinzel'] text-[13px] uppercase tracking-[0.25em] text-[#0a0a0f] transition-colors duration-200 hover:bg-[#b89520] hover:border-[#b89520] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Please wait…" : isLogin ? "Sign In" : "Create Account"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {isLogin ? (
          <>
            New to Nidalheim?{" "}
            <Link
              href={withReturnTo("/register", returnTo)}
              className="text-[#d6af36] underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already a villager?{" "}
            <Link
              href={withReturnTo("/login", returnTo)}
              className="text-[#d6af36] underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
      </div>
    </div>
  );
};

interface FieldProps {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  minLength?: number;
  hint?: string;
}

const Field: React.FC<FieldProps> = ({
  label,
  name,
  type,
  autoComplete,
  value,
  onChange,
  required,
  autoFocus,
  minLength,
  hint,
}) => (
  <label className="flex flex-col gap-2">
    <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
      {label}
    </span>
    <input
      name={name}
      type={type}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      minLength={minLength}
      className="h-11 w-full border border-[#d6af36]/30 bg-[#1a1a24] px-3.5 text-foreground outline-none transition-colors duration-200 focus:border-[#d6af36] focus:bg-[#1f1f2a]"
    />
    {hint && (
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    )}
  </label>
);
