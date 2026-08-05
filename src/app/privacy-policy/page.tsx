import { PrivacyPolicyContent } from "@/components/legal/PrivacyPolicyContent";
import { PageTransition } from "@/components/motion/PageTransition";
import { SITE } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE.name} collects, uses, protects, and discloses personal information.`,
};

export default function PrivacyPolicyPage() {
  return (
    <PageTransition>
      <section className="section-pad pt-[calc(var(--nav-height)+3rem)]">
        <div className="container-shell max-w-3xl">
          <PrivacyPolicyContent />
        </div>
      </section>
    </PageTransition>
  );
}
