import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";

export const metadata = {
  title: "Nidalheim - Documentation",
  description: "Documentation for Nidalheim development",
};

const navbar = <Navbar logo={<b>Nidalheim</b>} />;
const footer = <Footer>MIT {new Date().getFullYear()} © Nidalheim.</Footer>;

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Layout
      navbar={navbar}
      pageMap={await getPageMap()}
      docsRepositoryBase="https://github.com/nidalheim/nidalheim/tree/main/docs"
      footer={footer}
    >
      {children}
    </Layout>
  );
}
