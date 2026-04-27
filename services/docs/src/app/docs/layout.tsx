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
      pageMap={await getPageMap('/docs')}
      docsRepositoryBase="https://github.com/EpitechPromo2027/G-EIP-600-PAR-6-1-eip-merwan.korkmaz"
      footer={footer}
    >
      {children}
    </Layout>
  );
}
