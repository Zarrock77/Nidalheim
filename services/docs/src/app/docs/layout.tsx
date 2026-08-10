import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { getPageMap } from "nextra/page-map";
import { SessionProvider } from "next-auth/react";
import { UserBadge } from "@/components/user-badge";
import "nextra-theme-docs/style.css";

export const metadata = {
  title: "Nidalheim - Documentation",
  description: "Documentation for Nidalheim development",
};

const navbar = (
  <Navbar logo={<b>Nidalheim</b>}>
    <UserBadge />
  </Navbar>
);
const footer = (
  <Footer className="flex flex-wrap items-center justify-between gap-3">
    <span>MIT {new Date().getFullYear()} © Nidalheim.</span>
    <a
      href="https://www.nidalheim.com"
      className="text-[#d6af36] transition-colors hover:text-current"
    >
      Site vitrine ↗
    </a>
  </Footer>
);

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <Layout
        navbar={navbar}
        pageMap={await getPageMap('/docs')}
        docsRepositoryBase="https://github.com/EpitechPromo2027/G-EIP-600-PAR-6-1-eip-merwan.korkmaz"
        footer={footer}
      >
        {children}
      </Layout>
    </SessionProvider>
  );
}
