"use server";

import { signIn, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const result = await signIn("credentials", {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    redirect: false,
  });

  if (result?.error) {
    redirect("/login?error=invalid");
  }

  redirect("/");
}

export async function logout() {
  await signOut({ redirect: false });
  redirect("/login");
}
