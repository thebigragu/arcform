import { PublicTermsOfUseContent } from "@/components/legal/PublicTermsOfUseContent";
import { PageTransition } from "@/components/motion/PageTransition";
import { SITE } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Public Website Terms of Use",
  description: `Terms governing visitors to ${SITE.url}.`,
};

export default function PublicTermsOfUsePage() {
  return (
    <PageTransition>
      <section className="section-pad pt-[calc(var(--nav-height)+3rem)]">
        <div className="container-shell max-w-3xl">
          <PublicTermsOfUseContent />
        </div>
      </section>
    </PageTransition>
  );
}
