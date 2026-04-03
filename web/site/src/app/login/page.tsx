import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Sign In — Nidalheim",
  description: "Enter the realm of Nidalheim.",
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 pt-24 pb-16">
      <AuthForm mode="login" />
    </main>
  );
}
