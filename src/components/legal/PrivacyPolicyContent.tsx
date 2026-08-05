import { SITE } from "@/lib/seo";
import Link from "next/link";

const linkClass = "text-fg underline decoration-border underline-offset-4 hover:text-accent-teal";

export function PrivacyPolicyContent() {
  return (
    <div className="space-y-8">
      <header className="legal-page-header space-y-4 border-b border-border pb-8 overflow-visible">
        <h1 className="legal-page-title">Privacy Policy</h1>
        <p className="text-lg text-fg-muted leading-relaxed">
          How Ragusto collects, uses, protects, and discloses personal information
        </p>
        <p className="text-sm text-fg-muted">Effective date: August 5, 2026</p>
        <p className="text-sm text-fg-muted">Version: 1.4</p>
        <p className="text-sm text-fg-muted">Operator: Ragusto</p>
        <p className="text-xs tracking-[0.3em] text-fg-muted uppercase">RAGUSTO</p>
      </header>

      <div className="rounded-lg border border-border bg-bg-muted/40 p-5 text-sm text-fg-muted leading-relaxed">
        This Privacy Policy applies to personal information controlled by Ragusto. When
        Ragusto processes information solely on behalf of a customer through that customer&apos;s
        website or application, the customer generally determines the purposes of collection
        and use.
      </div>

      <section className="space-y-4">
        <h2 className="legal-section-title">1. Who We Are</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) provides website design,
          development, hosting, maintenance, application, domain-management, and related digital
          services.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Questions about this Privacy Policy may be directed to Ragusto&apos;s Privacy Officer at{" "}
          <a className={linkClass} href={`mailto:${SITE.email}`}>jacob@ragusto.com</a>.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">2. Scope of This Policy</h2>
        <p className="text-fg-muted leading-relaxed">
          This Policy applies when you visit{" "}
          <a className={linkClass} href={SITE.url}>https://ragusto.com</a>, contact Ragusto, request a
          consultation or preview, receive or purchase services, use a Ragusto billing or support
          process, or otherwise interact with Ragusto.
        </p>
        <p className="text-fg-muted leading-relaxed">
          This Policy also describes Ragusto&apos;s role when personal information is submitted
          through websites or applications that Ragusto hosts or supports for customers. Those
          customers may have their own privacy policies and may independently control the
          information collected through their services.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">3. Personal Information We May Collect</h2>

        <h3 className="legal-subsection-title">3.1 Contact and identity information</h3>
        <ul className="list-disc space-y-2 pl-5 text-fg-muted leading-relaxed">
          <li>
            Name, business name, job title, email address, telephone number, and preferred contact
            method.
          </li>
          <li>
            Billing address, business address, and other information used to identify or administer
            a customer relationship.
          </li>
        </ul>

        <h3 className="legal-subsection-title">3.2 Inquiry, project, and service information</h3>
        <ul className="list-disc space-y-2 pl-5 text-fg-muted leading-relaxed">
          <li>
            Information about a business, project goals, website or application requirements,
            desired features, timelines, and budgets.
          </li>
          <li>
            Messages, meeting notes, support requests, approvals, revisions, instructions, and
            records of electronic acceptance.
          </li>
          <li>
            Logos, text, photographs, videos, credentials, account details, and other materials
            supplied for a project.
          </li>
        </ul>

        <h3 className="legal-subsection-title">3.3 Billing and transaction information</h3>
        <ul className="list-disc space-y-2 pl-5 text-fg-muted leading-relaxed">
          <li>
            Selected services, prices, subscription status, invoice and receipt details, payment
            status, transaction identifiers, and tax information where applicable.
          </li>
          <li>
            Payment-card information is processed by payment providers such as Stripe. Ragusto does
            not intend to store complete card numbers or security codes.
          </li>
        </ul>

        <h3 className="legal-subsection-title">3.4 Domain and technical account information</h3>
        <ul className="list-disc space-y-2 pl-5 text-fg-muted leading-relaxed">
          <li>
            Requested domain names, registrant and administrative contact details, registrar
            information, renewal dates, authorization details, DNS records, and nameserver settings.
          </li>
          <li>
            Hosting, deployment, database, email-delivery, analytics, or other account information
            that a customer authorizes Ragusto to access.
          </li>
        </ul>

        <h3 className="legal-subsection-title">3.5 Website and application usage information</h3>
        <ul className="list-disc space-y-2 pl-5 text-fg-muted leading-relaxed">
          <li>
            IP address, browser and device type, operating system, referring page, pages visited,
            date and time of access, error logs, security logs, and similar technical information.
          </li>
          <li>Cookie or similar identifiers where those technologies are implemented.</li>
        </ul>

        <h3 className="legal-subsection-title">3.6 Customer Website and Application Data</h3>
        <p className="text-fg-muted leading-relaxed">
          Customer websites and applications may collect names, email addresses, telephone numbers,
          messages, appointment information, account information, uploaded content, usage
          information, or other data (&quot;Customer Service Data&quot;). The applicable customer
          generally determines why that information is collected and how it is used. Ragusto may
          process, transmit, temporarily store, or access Customer Service Data to host, secure,
          maintain, troubleshoot, and support the applicable service.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">4. How We Collect Information</h2>
        <ul className="list-disc space-y-2 pl-5 text-fg-muted leading-relaxed">
          <li>Directly from you, your business, or an authorized representative.</li>
          <li>Through contact forms, email, calls, meetings, support communications, and project-management processes.</li>
          <li>Through Stripe and other payment or billing providers.</li>
          <li>Through hosting, domain, email, database, security, analytics, and infrastructure providers.</li>
          <li>From publicly available business sources when reasonably relevant to a prospective or existing business relationship.</li>
          <li>Automatically through our website and technical systems.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">5. How We Use Personal Information</h2>
        <ul className="list-disc space-y-2 pl-5 text-fg-muted leading-relaxed">
          <li>Respond to inquiries and evaluate potential engagements.</li>
          <li>Prepare proposals, previews, estimates, product descriptions, invoices, and service confirmations.</li>
          <li>Design, develop, host, maintain, secure, and support websites and applications.</li>
          <li>Register, configure, renew, manage, and transfer domains.</li>
          <li>Process payments, subscriptions, one-time charges, invoices, refunds, and failed-payment recovery.</li>
          <li>Communicate about projects, launches, maintenance, security, billing, support, and contractual matters.</li>
          <li>Verify identity, authority, approvals, and payment instructions.</li>
          <li>Prevent fraud, abuse, unauthorized access, and security incidents.</li>
          <li>Diagnose errors, monitor performance, and improve services and workflows.</li>
          <li>Maintain accounting, tax, insurance, legal, and business records.</li>
          <li>Enforce agreements and establish, exercise, or defend legal claims.</li>
          <li>Comply with legal obligations and protect Ragusto, customers, users, and third parties.</li>
          <li>Send promotional communications where permitted and where any required consent has been obtained.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">6. Consent and Choices</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto obtains express or implied consent as appropriate to the sensitivity of the
          information and the circumstances. We identify relevant purposes at or before collection
          and seek additional consent where required for a materially different purpose.
        </p>
        <p className="text-fg-muted leading-relaxed">
          You may withdraw consent, subject to legal, contractual, security, and operational
          restrictions and reasonable notice. Withdrawal may prevent Ragusto from providing services
          that require the information.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Service, billing, security, legal, and account-administration communications are not
          promotional messages and may continue while required for an active or recently concluded
          relationship.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">7. Information Submitted Through Customer Websites and Applications</h2>
        <p className="text-fg-muted leading-relaxed">
          When an individual submits information through a customer&apos;s website or application,
          the customer generally decides what is collected, why it is collected, how it is used,
          who may access it, and how long it is retained. The customer&apos;s privacy policy or
          notice governs the customer&apos;s handling of that information.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Ragusto acts as a technical service provider when it processes Customer Service Data
          solely to host, transmit, secure, maintain, troubleshoot, or support a customer service.
          Ragusto does not use Customer Service Data for its own independent advertising or
          marketing unless the individual separately provides information directly to Ragusto and
          appropriate consent has been obtained.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Questions about a customer&apos;s use of information should generally be directed to that
          customer. Questions about Ragusto&apos;s handling of information as a service provider
          may be directed to Ragusto&apos;s Privacy Officer.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">8. Cookies and Similar Technologies</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto&apos;s website may use cookies, local storage, pixels, or similar technologies to
          operate essential features, maintain security, prevent abuse, remember preferences,
          measure traffic, and understand performance.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Where required, Ragusto will request consent before using non-essential analytics,
          advertising, or tracking technologies. Browser settings may allow you to restrict
          cookies, although disabling essential technologies may affect functionality.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">9. Service Providers, Contractors, and Disclosures</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto may disclose personal information to service providers and contractors that
          support payment processing, cloud hosting, databases, software development, email delivery,
          domain registration, analytics, security, accounting, legal advice, insurance, and
          customer support. The providers used may change over time and depend on the applicable
          service. Ragusto limits disclosure to information reasonably required for the provider&apos;s
          function and uses contractual, organizational, or other reasonable measures to require
          appropriate protection.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Ragusto may also disclose information when reasonably necessary to comply with law,
          respond to lawful process, investigate fraud or security incidents, enforce agreements,
          protect rights or safety, obtain professional advice, or complete a financing, sale,
          reorganization, or transfer of the business.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Ragusto does not sell personal information to data brokers.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">10. Processing Outside Canada</h2>
        <p className="text-fg-muted leading-relaxed">
          Some service providers may process or store information outside Ontario or outside Canada.
          Information processed in another jurisdiction may be subject to that jurisdiction&apos;s
          laws and may be accessible to courts, law-enforcement bodies, or governmental authorities.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Ragusto remains accountable for personal information under its control that is transferred
          to service providers for processing and uses contractual, organizational, and other
          reasonable measures to require appropriate protection.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">11. AI-Assisted and Automated Tools</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto may use AI-assisted tools for limited development, design, testing, research,
          drafting, or support activities. Ragusto applies human review appropriate to the task and
          does not represent that automated output is always accurate, complete, or suitable for a
          particular purpose.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Unless separately authorized in writing and subject to an appropriate privacy and security
          arrangement, Ragusto will not intentionally submit Customer Service Data, access
          credentials, complete payment information, or sensitive confidential personal information
          to a generative-AI service. Customers and users should not submit highly sensitive
          information through a general inquiry or unapproved workflow.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">12. Marketing Communications</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto may send promotional electronic messages where permitted by law and where any
          required consent has been obtained. You may unsubscribe using the mechanism in the message
          or by contacting Ragusto.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Unsubscribing from promotional communications does not prevent Ragusto from sending
          invoices, payment notices, project communications, security notices, or other
          non-promotional messages relating to an active or prior service relationship.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">13. Retention and Disposal</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto retains personal information only for as long as reasonably necessary for the
          identified purposes and applicable contractual, legal, accounting, tax, insurance, security,
          and dispute-resolution requirements.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Retention periods vary according to the type of information and relationship. Residual
          copies may remain temporarily in routine backups until overwritten or deleted through normal
          retention cycles.
        </p>
        <p className="text-fg-muted leading-relaxed">
          When personal information is no longer reasonably required, Ragusto will delete, destroy,
          or anonymize it, subject to lawful retention obligations and technical limitations.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">14. Safeguards</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto uses reasonable administrative, technical, and organizational safeguards
          appropriate to the sensitivity, quantity, format, and use of the information. Safeguards
          may include access controls, secure third-party providers, authentication measures,
          encryption where appropriate, backups, software updates, monitoring, and confidentiality
          obligations.
        </p>
        <p className="text-fg-muted leading-relaxed">
          No system or transmission method is completely secure. Ragusto cannot guarantee absolute
          security.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">15. Privacy and Security Incidents</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto assesses and responds to actual or reasonably suspected loss, unauthorized access,
          disclosure, alteration, or misuse of personal information in accordance with applicable
          law, including applicable investigation, recordkeeping, reporting, and notification
          requirements.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Where an actual or reasonably suspected incident materially affects Customer Service Data
          processed on behalf of a customer, Ragusto will notify the affected customer without undue
          delay after becoming aware of the incident, subject to lawful restrictions and the
          information reasonably available. Ragusto may provide updates as the investigation
          develops. The customer remains responsible for determining and completing its own notices,
          regulatory filings, and remedial obligations unless the parties agree otherwise in writing.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">16. Access and Correction Requests</h2>
        <p className="text-fg-muted leading-relaxed">
          You may make a written request to access personal information under Ragusto&apos;s control,
          learn how it has been used or disclosed, or request correction of inaccurate information
          by emailing{" "}
          <a className={linkClass} href={`mailto:${SITE.email}`}>jacob@ragusto.com</a>.{" "}
          Ragusto may need
          to verify identity before responding.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Ragusto will respond within the time required by applicable law, subject to permitted
          extensions. Access may be limited where permitted or required by law, including where
          disclosure would reveal another person&apos;s information, confidential commercial
          information, or legally privileged information.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">17. Children</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto&apos;s own services are intended for businesses and adults who have authority to
          enter commercial relationships. Ragusto does not knowingly collect personal information
          directly from children through its own website.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">18. Third-Party Websites and Services</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto&apos;s website and services may link to third-party websites or use third-party
          platforms. Ragusto does not control and is not responsible for their independent content,
          security, availability, or privacy practices. Review their policies separately.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">19. Changes to This Policy</h2>
        <p className="text-fg-muted leading-relaxed">
          Ragusto may update this Privacy Policy as services, technologies, providers, or legal
          obligations change. The revised version will be posted with a new effective date. Material
          changes may also be communicated by email or another reasonable method where appropriate.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">20. Nature of This Policy</h2>
        <p className="text-fg-muted leading-relaxed">
          This Privacy Policy describes Ragusto&apos;s current privacy practices. It does not create
          contractual rights or warranties beyond those required by applicable law or expressly
          stated in a separate written agreement. If a customer agreement or data-processing
          schedule imposes a more specific obligation on Ragusto, that obligation governs the
          applicable customer relationship.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="legal-section-title">21. Contact and Complaints</h2>
        <p className="text-fg-muted leading-relaxed">
          Privacy questions, access requests, correction requests, and complaints may be sent to
          Ragusto&apos;s Privacy Officer at{" "}
          <a className={linkClass} href={`mailto:${SITE.email}`}>jacob@ragusto.com</a>.
        </p>
        <p className="text-fg-muted leading-relaxed">
          Ragusto will investigate privacy complaints and respond within a reasonable period. You
          may also contact the Office of the Privacy Commissioner of Canada where applicable.
        </p>
      </section>

      {"\n"}
      <footer className="border-t border-border pt-6 text-xs text-fg-muted">
        Website:{" "}
        <a className={linkClass} href={SITE.url}>https://ragusto.com</a>
        {"   |   "}Email:{" "}
        <a className={linkClass} href={`mailto:${SITE.email}`}>jacob@ragusto.com</a>
      </footer>

      {" "}
      <Link href="/" className="inline-block text-sm text-fg-muted hover:text-fg">
        ← Back home
      </Link>
    </div>
  );
}
