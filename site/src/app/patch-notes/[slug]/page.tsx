import { MDXRemote } from "next-mdx-remote/rsc";
import { createClient } from "@/lib/supabase/server";

const components = {
  h1: ({ children }: { children: React.ReactNode }) => (
    <h1 className="text-2xl font-bold">{children}</h1>
  ),
  h2: ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-xl font-bold">{children}</h2>
  ),
  h3: ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-lg font-bold">{children}</h3>
  ),
  h4: ({ children }: { children: React.ReactNode }) => (
    <h4 className="text-base font-bold">{children}</h4>
  ),
  p: ({ children }: { children: React.ReactNode }) => (
    <p className="text-base">{children}</p>
  ),
  ul: ({ children }: { children: React.ReactNode }) => (
    <ul className="list-disc list-inside">{children}</ul>
  ),
  ol: ({ children }: { children: React.ReactNode }) => (
    <ol className="list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }: { children: React.ReactNode }) => (
    <li className="list-item">{children}</li>
  ),
  a: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href} className="text-blue-500 hover:text-blue-700">
      {children}
    </a>
  ),
  img: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} className="w-full h-auto" />
  ),
  code: ({ children }: { children: React.ReactNode }) => (
    <code className="bg-gray-100 p-1 rounded-md">{children}</code>
  ),
  pre: ({ children }: { children: React.ReactNode }) => (
    <pre className="bg-gray-100 p-4 rounded-md">{children}</pre>
  ),
  blockquote: ({ children }: { children: React.ReactNode }) => (
    <blockquote className="border-l-4 border-muted pl-4">{children}</blockquote>
  ),
  table: ({ children }: { children: React.ReactNode }) => (
    <table className="w-full">{children}</table>
  ),
  thead: ({ children }: { children: React.ReactNode }) => (
    <thead className="bg-muted">{children}</thead>
  ),
  tbody: ({ children }: { children: React.ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  tr: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  td: ({ children }: { children: React.ReactNode }) => (
    <td className="border border-gray-300 p-2">{children}</td>
  ),
  th: ({ children }: { children: React.ReactNode }) => (
    <th className="border border-gray-300 p-2">{children}</th>
  ),
  hr: () => <hr className="my-4" />,
  br: () => <br />,
  inlineCode: ({ children }: { children: React.ReactNode }) => (
    <code className="bg-muted p-1 rounded-md">{children}</code>
  ),
};

export default async function PatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("patch-notes")
    .download(`${slug}.mdx`);

  if (error || !data) return <p>Not found</p>;

  const content = await data.text();

  return (
    <article className="prose prose-invert mx-auto p-8">
      <MDXRemote source={content} components={components} />
    </article>
  );
}
