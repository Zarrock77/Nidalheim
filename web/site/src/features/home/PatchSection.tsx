import { GameButton } from "@/components/GameButton";
import Link from "next/link";
import { PatchNotesList } from "../patch-notes/components/PatchNoteList";
import { getPatchNotes } from "../patch-notes/lib/getPatchNotes";

export const PatchSection = async () => {
  const patchNotes = await getPatchNotes(3);

  const footer = (
    <div className="text-center">
      <Link href="/patch-notes">
        <GameButton variant="secondary">View All Patch Notes</GameButton>
      </Link>
    </div>
  );
  return (
    <section
      id="patches"
      className="py-24 px-6 bg-gradient-to-b from-background via-card to-background"
    >
      <div className="max-w-5xl mx-auto">
        <PatchNotesList
          title="Latest Updates"
          patchNotes={patchNotes}
          footer={footer}
        />
      </div>
    </section>
  );
};
