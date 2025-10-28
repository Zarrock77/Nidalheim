export default function PatchNotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="mt-24">{children}</div>
    </>
  );
}
