import { auth } from "@/lib/auth";
import { logout } from "@/app/login/actions";

export async function UserBadge() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-3 border border-[#d6af36]/30 bg-[#121218] px-3 py-1.5 text-[11px]">
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[#9b9ba8]">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[#4ade80] shadow-[0_0_6px_#4ade80]"
          aria-hidden
        />
        <span className="uppercase tracking-[0.15em]">Connecté</span>
      </span>
      <span className="text-[#eaeaea]">{session.user.email}</span>
      <form action={logout}>
        <button
          type="submit"
          className="uppercase tracking-[0.15em] text-[#d6af36] transition-colors hover:text-[#eaeaea]"
        >
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
