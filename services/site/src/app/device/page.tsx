import type { Metadata } from "next";
import { DeviceApproval } from "@/components/device/DeviceApproval";

export const metadata: Metadata = {
  title: "Authorize Device — Nidalheim",
  description: "Approve a Nidalheim game session sign-in.",
};

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 pt-24 pb-16">
      <DeviceApproval initialCode={code} />
    </main>
  );
}
