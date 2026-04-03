import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Sign Up — Nidalheim",
  description: "Begin your story in Nidalheim.",
};

export default function RegisterPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 pt-24 pb-16">
      <AuthForm mode="register" />
    </main>
  );
}
