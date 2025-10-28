import { PatchNotesDrawer } from "@/components/PatchNotesDrawer";

const patchNotes = [
  {
    version: "v1.2.0",
    title: "New Realm: The Frozen Wastes",
    date: "Oct 20, 2025",
    slug: "test",
  },
  {
    version: "v1.1.5",
    title: "Combat Balance & Bug Fixes",
    date: "Oct 10, 2025",
    slug: "combat-balance-bug-fixes",
  },
  {
    version: "v1.1.0",
    title: "Legendary Weapons Update",
    date: "Sep 28, 2025",
    slug: "legendary-weapons-update",
  },
  {
    version: "v1.0.0",
    title: "Initial Release",
    date: "Sep 15, 2025",
    slug: "initial-release",
  },
  {
    version: "v0.9.0",
    title: "New Features",
    date: "Sep 15, 2025",
    slug: "new-features",
  },
];

export default function PatchNotesSingleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PatchNotesDrawer patchNotes={patchNotes} />
      {children}
    </>
  );
}
