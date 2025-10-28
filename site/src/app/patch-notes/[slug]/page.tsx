import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { getPatchNoteBySlug } from "@/features/patch-notes/lib/getPatchNoteBySlug";
import { PatchNoteCard } from "@/features/patch-notes/components/PatchNoteCard";
import { Metadata } from "next";

const components = {
  // Titres avec police Cinzel et couleurs thématiques
  h1: ({ children }: { children: React.ReactNode }) => (
    <h1 className="text-4xl md:text-5xl font-['Cinzel'] text-secondary mb-6 mt-8 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-3xl md:text-4xl font-['Cinzel'] text-secondary mb-5 mt-8 border-b border-border pb-2">
      {children}
    </h2>
  ),
  h3: ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-2xl md:text-3xl font-['Cinzel'] text-primary mb-4 mt-6">
      {children}
    </h3>
  ),
  h4: ({ children }: { children: React.ReactNode }) => (
    <h4 className="text-xl md:text-2xl font-['Cinzel'] text-foreground mb-3 mt-4">
      {children}
    </h4>
  ),
  h5: ({ children }: { children: React.ReactNode }) => (
    <h5 className="text-lg md:text-xl font-['Cinzel'] text-foreground mb-3 mt-4">
      {children}
    </h5>
  ),
  h6: ({ children }: { children: React.ReactNode }) => (
    <h6 className="text-base md:text-lg font-['Cinzel'] text-muted-foreground mb-2 mt-3">
      {children}
    </h6>
  ),

  // Paragraphes et texte
  p: ({ children }: { children: React.ReactNode }) => (
    <p className="text-base md:text-lg text-foreground mb-4 leading-relaxed">
      {children}
    </p>
  ),

  // Listes avec espacement et couleurs
  ul: ({ children }: { children: React.ReactNode }) => (
    <ul className="list-disc list-outside ml-6 mb-4 space-y-2 text-foreground marker:text-primary">
      {children}
    </ul>
  ),
  ol: ({ children }: { children: React.ReactNode }) => (
    <ol className="list-decimal list-outside ml-6 mb-4 space-y-2 text-foreground marker:text-primary">
      {children}
    </ol>
  ),
  li: ({ children }: { children: React.ReactNode }) => (
    <li className="text-base md:text-lg leading-relaxed">{children}</li>
  ),

  // Liens avec couleurs du thème
  a: ({ children, href }: { children: React.ReactNode; href?: string }) => (
    <a
      href={href}
      className="text-primary hover:text-secondary underline decoration-primary/50 hover:decoration-secondary transition-colors duration-300"
    >
      {children}
    </a>
  ),

  // Images avec style
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img
      src={src}
      alt={alt}
      className="w-full h-auto rounded-lg border border-border shadow-lg my-6"
    />
  ),

  // Code inline avec thème
  code: ({ children }: { children: React.ReactNode }) => (
    <code className="bg-muted text-primary px-2 py-1 rounded font-mono text-sm">
      {children}
    </code>
  ),

  // Blocs de code
  pre: ({ children }: { children: React.ReactNode }) => (
    <pre className="bg-card border border-border p-4 rounded-lg overflow-x-auto my-6 text-foreground font-mono text-sm leading-relaxed">
      {children}
    </pre>
  ),

  // Citations
  blockquote: ({ children }: { children: React.ReactNode }) => (
    <blockquote className="border-l-4 border-secondary bg-muted/30 pl-6 py-4 my-6 italic text-muted-foreground rounded-r-lg">
      {children}
    </blockquote>
  ),

  // Tables avec style complet
  table: ({ children }: { children: React.ReactNode }) => (
    <div className="overflow-x-auto my-6">
      <table className="w-full border-collapse border border-border rounded-lg">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children: React.ReactNode }) => (
    <thead className="bg-muted text-foreground">{children}</thead>
  ),
  tbody: ({ children }: { children: React.ReactNode }) => (
    <tbody className="divide-y divide-border">{children}</tbody>
  ),
  tr: ({ children }: { children: React.ReactNode }) => (
    <tr className="hover:bg-muted/50 transition-colors">{children}</tr>
  ),
  td: ({ children }: { children: React.ReactNode }) => (
    <td className="border border-border p-3 text-foreground">{children}</td>
  ),
  th: ({ children }: { children: React.ReactNode }) => (
    <th className="border border-border p-3 text-left font-['Cinzel'] text-secondary">
      {children}
    </th>
  ),

  // Séparateurs
  hr: () => <hr className="my-8 border-border" />,

  // Ligne de saut
  br: () => <br />,

  // Strong et emphase
  strong: ({ children }: { children: React.ReactNode }) => (
    <strong className="font-bold text-secondary">{children}</strong>
  ),
  em: ({ children }: { children: React.ReactNode }) => (
    <em className="italic text-primary">{children}</em>
  ),
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const patch = await getPatchNoteBySlug(slug);

  if (!patch) {
    return {
      title: "Patch Note Not Found | Nidalheim",
      description: "This patch note does not exist or has been removed.",
    };
  }

  const { frontmatter } = patch;

  return {
    title: `${frontmatter.title} — Nidalheim Patch Notes`,
    description:
      frontmatter.summary ||
      `Discover what's new in version ${frontmatter.version} of Nidalheim.`,
    openGraph: {
      title: `${frontmatter.title} — Nidalheim Patch Notes`,
      description:
        frontmatter.summary ||
        `Learn about the latest changes, improvements, and new content in Nidalheim.`,
      url: `https://www.nidalheim.com/patch-notes/${slug}`,
      siteName: "Nidalheim",
      // images: [
      //   {
      //     url: `https://www.nidalheim.com/og-patchnotes.jpg`,
      //     width: 1200,
      //     height: 630,
      //     alt: `${frontmatter.title} — Patch Notes`,
      //   },
      // ],
      type: "article",
    },
  };
}

export default async function PatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const patchNote = await getPatchNoteBySlug(slug);

  if (!patchNote) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center">
        <h1 className="text-4xl font-['Cinzel'] text-secondary mb-4">
          Patch Note Not Found
        </h1>
        <Link href="/patch-notes">
          <button className="text-primary hover:text-secondary underline decoration-primary/50 hover:decoration-secondary transition-colors duration-300">
            Back to Patch Notes
          </button>
        </Link>
      </div>
    );
  }

  const { frontmatter, content } = patchNote;

  return (
    <article className="max-w-5xl mx-auto">
      {/* Back Button */}
      <div className="mb-8">
        <Link href="/patch-notes">
          <button className="text-primary hover:text-secondary underline decoration-primary/50 hover:decoration-secondary transition-colors duration-300 text-sm">
            ← Back to Patch Notes
          </button>
        </Link>
      </div>

      {/* Patch Note Header */}
      <PatchNoteCard slug={slug} {...frontmatter} />

      {/* MDX Content */}
      <div className="prose prose-invert max-w-none">
        <MDXRemote source={content} components={components} />
      </div>
    </article>
  );
}
