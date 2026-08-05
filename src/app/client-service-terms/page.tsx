import { ClientServiceTermsContent } from "@/components/legal/ClientServiceTermsContent";
import { PageTransition } from "@/components/motion/PageTransition";
import { SITE } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Website and Application Services Agreement",
  description: `Managed websites, hosted applications, domains, maintenance, and related digital services for ${SITE.name}.`,
};

export default function ClientServiceTermsPage() {
  return (
    <PageTransition>
      <section className="section-pad pt-[calc(var(--nav-height)+3rem)]">
        <div className="container-shell max-w-3xl">
          <ClientServiceTermsContent />
        </div>
      </section>
    </PageTransition>
  );
}
