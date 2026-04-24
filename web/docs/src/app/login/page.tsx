import type { Metadata } from "next";
import { login, logout } from "./actions";

export const metadata: Metadata = {
  title: "Admin Access — Nidalheim Docs",
  description: "Restricted documentation for Nidalheim maintainers.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const isForbidden = error === "forbidden";

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(214, 175, 54, 0.08), transparent 55%), #0a0a0f",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(214, 175, 54, 0.4), transparent)",
        }}
      />

      <div className="reverse-radius w-full max-w-[440px] bg-[#d6af36] p-px">
        <div className="reverse-radius-inner bg-[#121218] p-8 sm:p-10">
          <div className="mb-8 text-center">
            <span className="text-[11px] uppercase tracking-[0.35em] text-[#d6af36]">
              Nidalheim · Docs
            </span>
            <div className="mt-3 flex items-center justify-center gap-3">
              <div className="h-px w-10 bg-gradient-to-r from-transparent to-[#d6af36]/50" />
              <div className="h-1.5 w-1.5 rotate-45 border border-[#d6af36]" />
              <div className="h-px w-10 bg-gradient-to-l from-transparent to-[#d6af36]/50" />
            </div>
            <h1
              className="mt-4 text-[26px] leading-tight text-[#eaeaea]"
              style={{ fontFamily: "Cinzel, serif", fontWeight: 500 }}
            >
              Keeper&apos;s Gate
            </h1>
            <p className="mt-2 text-sm text-[#9b9ba8]">
              Admin credentials required to enter.
            </p>
          </div>

          {error && (
            <div className="reverse-radius-sm mb-6 bg-[#7d152c] p-px">
              <div className="reverse-radius-sm-inner bg-[#25131c] px-3.5 py-2.5 text-sm text-[#eaeaea]">
                {isForbidden
                  ? "This account isn't allowed in the keep. Sign out and try an admin account."
                  : "Invalid email or password."}
              </div>
            </div>
          )}

          {isForbidden && (
            <form action={logout} className="mb-6">
              <button
                type="submit"
                className="reverse-radius-sm h-11 w-full border border-[#d6af36]/40 bg-[#1a1a24] text-[12px] uppercase tracking-[0.25em] text-[#eaeaea] transition-colors hover:border-[#d6af36] hover:bg-[#1f1f2a]"
                style={{ fontFamily: "Cinzel, serif" }}
              >
                Sign Out
              </button>
            </form>
          )}

          <form action={login} className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-[#9b9ba8]">
                Email
              </span>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                className="h-11 w-full border border-[#d6af36]/30 bg-[#1a1a24] px-3.5 text-[#eaeaea] outline-none transition-colors duration-200 focus:border-[#d6af36] focus:bg-[#1f1f2a]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-[#9b9ba8]">
                Password
              </span>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="h-11 w-full border border-[#d6af36]/30 bg-[#1a1a24] px-3.5 text-[#eaeaea] outline-none transition-colors duration-200 focus:border-[#d6af36] focus:bg-[#1f1f2a]"
              />
            </label>

            <button
              type="submit"
              className="reverse-radius-sm mt-2 h-12 border border-[#d6af36] bg-[#d6af36] px-6 text-[13px] uppercase tracking-[0.25em] text-[#0a0a0f] transition-colors duration-200 hover:border-[#b89520] hover:bg-[#b89520]"
              style={{ fontFamily: "Cinzel, serif" }}
            >
              Unseal
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] uppercase tracking-[0.25em] text-[#9b9ba8]">
            Only maintainers may pass
          </p>
        </div>
      </div>
    </main>
  );
}
