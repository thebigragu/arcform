import { SITE } from "@/lib/seo";
import Link from "next/link";

const linkClass =
  "text-fg underline decoration-border underline-offset-4 hover:text-accent-teal";

export function PublicTermsOfUseContent() {
  return (
    <div className="space-y-8">
      <header className="legal-page-header space-y-4 border-b border-border pb-8 overflow-visible">
        <h1 className="legal-page-title">Public Website Terms of Use</h1>
        <p className="text-lg text-fg-muted leading-relaxed">Terms governing visitors to ragusto.com</p>
        <p className="text-sm text-fg-muted">Effective date: August 5, 2026</p>
        <p className="text-sm text-fg-muted">Version: 1.4</p>
        <p className="text-sm text-fg-muted">Operator: Ragusto</p>
        <p className="text-xs tracking-[0.3em] text-fg-muted uppercase">RAGUSTO</p>
      </header>
      <div className="rounded-lg border border-border bg-bg-muted/40 p-5 text-sm text-fg-muted leading-relaxed">
        <p className="text-sm text-fg-muted leading-relaxed">These Terms govern public use of ragusto.com. Paid customer services are governed by the separate Ragusto Website and Application Services Agreement together with the applicable Stripe product description, checkout or hosted invoice page, and invoice.</p>
      </div>
      <section className="space-y-4">
        <h2 className="legal-section-title">1. Operator and Acceptance</h2>
        <p className="text-fg-muted leading-relaxed">
          These Terms of Use ("Terms") govern your access to and use of 
          <a className={linkClass} href={SITE.url}>https://ragusto.com</a>
           and any public pages, materials, forms, or features made available through it (the "Site"). The Site is operated by Ragusto ("we," "us," or "our").
        </p>
        <p className="text-fg-muted leading-relaxed">By accessing or using the Site, you agree to these Terms. If you do not agree, do not use the Site. Browsing the Site or submitting a general inquiry does not by itself create a paid subscription, minimum commitment, or payment obligation. Those obligations arise only when a customer affirmatively accepts the applicable customer agreement and completes checkout or pays an invoice that links to or expressly references that agreement.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">2. Purpose of the Site and Separate Customer Agreements</h2>
        <p className="text-fg-muted leading-relaxed">The Site provides information about Ragusto, its website, application, domain, hosting, maintenance, and related digital services. Site content is general information and marketing material, not a binding offer or guarantee.</p>
        <p className="text-fg-muted leading-relaxed">A proposal, estimate, consultation, preview, demonstration, or discussion does not create a paid customer relationship. A paid relationship begins only when the customer affirmatively accepts the Ragusto Website and Application Services Agreement or another written agreement and completes the applicable checkout or pays the first invoice. The applicable Stripe product description and payment page identify the Service and price. Customer-specific unpaid preview work may also require acceptance of a separate Pre-Subscription Preview Authorization.</p>
        <p className="text-fg-muted leading-relaxed">Paid customer services, minimum commitments, fees, ownership, domains, Applications, data processing, and cancellation are governed by the applicable customer agreement, not these public Terms.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">3. Permitted Use</h2>
        <p className="text-fg-muted leading-relaxed">You may access and use the Site for lawful personal or business evaluation of Ragusto&apos;s services and for communicating with Ragusto.</p>
        <p className="text-fg-muted leading-relaxed">Ragusto grants you a limited, revocable, non-exclusive, non-transferable permission to view the Site through a standard web browser. No other right or licence is granted.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">4. Prohibited Conduct</h2>
        <ul className="list-disc space-y-2 pl-5 text-fg-muted leading-relaxed">
          <li>Use the Site unlawfully, fraudulently, or in a manner that harms Ragusto, customers, users, or third parties.</li>
          <li>Attempt to gain unauthorized access to the Site, servers, accounts, databases, source code, or infrastructure.</li>
          <li>Probe, scan, test, bypass, disable, or interfere with security, rate limits, authentication, or access controls.</li>
          <li>Introduce malware, automated attacks, excessive traffic, scraping, spam, or disruptive code.</li>
          <li>Copy, reproduce, publish, sell, sublicense, reverse engineer, or commercially exploit Site content, design, code, or functionality except as permitted by law or written authorization.</li>
          <li>Use automated tools to harvest personal information, contact details, or Site content without written permission.</li>
          <li>Impersonate another person or misrepresent affiliation, authority, identity, or the origin of a message.</li>
          <li>Submit unlawful, infringing, abusive, deceptive, defamatory, or highly sensitive information through public forms.</li>
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">5. Intellectual Property</h2>
        <p className="text-fg-muted leading-relaxed">The Site and its text, graphics, branding, logos, layouts, photographs, videos, code, interactions, animations, software, and other content are owned by Ragusto or used under licence and are protected by intellectual-property laws.</p>
        <p className="text-fg-muted leading-relaxed">Ragusto and related names, logos, and branding may not be used without written permission. Third-party names and marks belong to their respective owners.</p>
        <p className="text-fg-muted leading-relaxed">Nothing on the Site transfers ownership or grants a licence to Ragusto source code, design systems, Applications, frameworks, or other proprietary materials.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">6. Inquiries, Forms, and Materials You Submit</h2>
        <p className="text-fg-muted leading-relaxed">When you submit an inquiry, you confirm that the information is accurate, that you are authorized to provide it, and that your submission does not violate law or third-party rights.</p>
        <p className="text-fg-muted leading-relaxed">You grant Ragusto a limited permission to use, reproduce, review, and communicate about submitted information as reasonably necessary to respond, evaluate an engagement, prepare a preview or proposal, describe available services, provide requested services, protect security, or comply with law.</p>
        <p className="text-fg-muted leading-relaxed">Do not submit confidential trade secrets, passwords, complete payment-card details, medical information, government identification numbers, or other highly sensitive information through a general public contact form.</p>
        <p className="text-fg-muted leading-relaxed">A public inquiry does not create a confidential, fiduciary, professional, or customer relationship. Confidentiality obligations arise only under an applicable written agreement, accepted Preview Authorization, or separate confidentiality agreement.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">7. Previews, Concepts, and Demonstrations</h2>
        <p className="text-fg-muted leading-relaxed">Any concept, prototype, mockup, staging site, demonstration, audit, sample, or preview supplied before a paid engagement remains Ragusto property unless a separate written agreement states otherwise.</p>
        <p className="text-fg-muted leading-relaxed">Preview materials are for evaluation only and may not be copied, published, commercially used, distributed, provided to another developer, reverse engineered, or recreated without written permission.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">8. No Professional Advice or Guaranteed Results</h2>
        <p className="text-fg-muted leading-relaxed">Site content is not legal, tax, accounting, financial, privacy, cybersecurity, accessibility, regulatory, or other professional advice. You should obtain appropriate professional advice for your circumstances.</p>
        <p className="text-fg-muted leading-relaxed">Examples, case studies, demonstrations, performance statements, design concepts, estimates, and projected outcomes are illustrative and do not guarantee rankings, traffic, leads, sales, conversions, uptime, security, accessibility certification, or other results.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">9. Third-Party Links, Content, and Services</h2>
        <p className="text-fg-muted leading-relaxed">The Site may link to or display content from third-party websites, social platforms, payment providers, hosting providers, registrars, software services, or customer websites. Links are provided for convenience and do not imply endorsement unless expressly stated.</p>
        <p className="text-fg-muted leading-relaxed">Ragusto does not control and is not responsible for third-party content, availability, security, terms, privacy practices, products, or services. Your use of them is governed by their terms.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">10. Availability and Changes</h2>
        <p className="text-fg-muted leading-relaxed">Ragusto may modify, suspend, restrict, or discontinue any part of the Site at any time. The Site may be unavailable because of maintenance, errors, third-party outages, security events, Internet failures, or circumstances outside Ragusto&apos;s control.</p>
        <p className="text-fg-muted leading-relaxed">Ragusto does not guarantee that the Site will be uninterrupted, secure, current, complete, compatible with every device or browser, or free of errors or harmful components.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">11. Privacy</h2>
        <p className="text-fg-muted leading-relaxed">Ragusto&apos;s collection, use, disclosure, and protection of personal information through the Site are described in the Ragusto Privacy Policy. The Privacy Policy describes Ragusto&apos;s practices and does not create contractual warranties beyond applicable law or a separate written agreement.</p>
        <p className="text-fg-muted leading-relaxed">Customer websites displayed in a portfolio or linked from the Site may have their own privacy practices. Contact the applicable customer about information submitted directly through its website.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">12. Disclaimer of Warranties</h2>
        <p className="text-fg-muted leading-relaxed">To the maximum extent permitted by law, the Site and its content are provided "as is" and "as available" without representations, warranties, or conditions of any kind, whether express, implied, statutory, or collateral.</p>
        <p className="text-fg-muted leading-relaxed">Ragusto disclaims implied warranties and conditions of merchantability, fitness for a particular purpose, non-infringement, accuracy, availability, security, and error-free operation. Nothing in these Terms excludes rights or liability that cannot legally be excluded.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">13. Limitation of Liability</h2>
        <p className="text-fg-muted leading-relaxed">To the maximum extent permitted by law, Ragusto and its contractors will not be liable for indirect, incidental, special, exemplary, punitive, or consequential damages; lost profits, revenue, data, opportunities, or goodwill; business interruption; or costs arising from use of or inability to use the Site.</p>
        <p className="text-fg-muted leading-relaxed">Ragusto&apos;s total aggregate liability arising from public use of the Site will not exceed CAD $100. This limit does not apply to fraud, wilful misconduct, or liability that cannot legally be limited.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">14. Indemnity</h2>
        <p className="text-fg-muted leading-relaxed">To the extent caused by your conduct, you will defend, indemnify, and hold harmless Ragusto and its personnel from third-party claims, damages, liabilities, judgments, settlements, and reasonable legal costs arising from your unlawful use of the Site, materials you submit, infringement of third-party rights, impersonation, fraud, or security attacks initiated or knowingly facilitated by you.</p>
        <p className="text-fg-muted leading-relaxed">Ragusto will provide reasonable notice of an indemnified claim. You may not settle a claim in a way that admits wrongdoing by or imposes obligations on Ragusto without Ragusto&apos;s prior written consent. This indemnity does not apply to the extent a claim is finally determined to have been caused by Ragusto&apos;s fraud, wilful misconduct, or liability that cannot legally be excluded.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">15. Suspension and Enforcement</h2>
        <p className="text-fg-muted leading-relaxed">Ragusto may restrict or block access, remove submissions, preserve evidence, and cooperate with service providers or authorities where reasonably necessary to investigate or respond to suspected unlawful conduct, security threats, abuse, infringement, or breach of these Terms.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">16. Changes to These Terms</h2>
        <p className="text-fg-muted leading-relaxed">Ragusto may update these Terms by posting a revised version with a new effective date. Changes apply prospectively from the posted effective date. Continued use of the Site after a change means you accept the revised Terms.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">17. Governing Law and Jurisdiction</h2>
        <p className="text-fg-muted leading-relaxed">These Terms are governed by the laws of Ontario and the federal laws of Canada applicable in Ontario, without regard to conflict-of-law rules.</p>
        <p className="text-fg-muted leading-relaxed">You submit to the exclusive jurisdiction of the courts of Ontario sitting in the judicial region in which Ragusto principally carries on business, except where applicable law requires otherwise.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">18. General</h2>
        <p className="text-fg-muted leading-relaxed">If a provision is unenforceable, it will be modified to the minimum extent necessary or severed, and the remaining provisions continue. Failure to enforce a provision is not a waiver.</p>
        <p className="text-fg-muted leading-relaxed">These Terms and the Privacy Policy are the entire agreement concerning public use of the Site. A separate customer agreement controls paid Services.</p>
        <p className="text-fg-muted leading-relaxed">Headings are for convenience only. Provisions that logically should survive termination or cessation of use will survive.</p>
      </section>
      <section className="space-y-4">
        <h2 className="legal-section-title">19. Contact</h2>
        <p className="text-fg-muted leading-relaxed">
          Questions about these Terms may be sent to Ragusto at 
          <a className={linkClass} href={`mailto:${SITE.email}`}>jacob@ragusto.com</a>
          .
        </p>
        <p className="text-fg-muted leading-relaxed">
          Website: 
          <a className={linkClass} href={SITE.url}>https://ragusto.com</a>
             |   Email: 
          <a className={linkClass} href={`mailto:${SITE.email}`}>jacob@ragusto.com</a>
        </p>
      </section>
      <Link href="/" className="inline-block text-sm text-fg-muted hover:text-fg">
        ← Back home
      </Link>
    </div>
  );
}
