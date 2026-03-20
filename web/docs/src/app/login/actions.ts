"use server";

import { signIn } from "@/lib/auth";
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
