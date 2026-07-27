"use client";

import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/seo";
import { FormEvent, useState } from "react";

const projectTypes = [
  "Bespoke application",
  "Custom software",
  "Website / brand site",
  "SaaS product",
  "Automation / integrations",
  "UI/UX & branding",
  "Not sure yet",
];

type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function validate(form: FormData) {
    const next: Record<string, string> = {};
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const message = String(form.get("message") || "").trim();
    const honey = String(form.get("company_website") || "");

    if (honey) next.honeypot = "bot";
    if (name.length < 2) next.name = "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter a valid email.";
    if (!message) next.message = "Please add a short note about your project.";
    return next;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const nextErrors = validate(form);
    setErrors(nextErrors);
    setErrorMessage(null);
    if (Object.keys(nextErrors).length) return;

    setStatus("submitting");

    const payload = {
      name: String(form.get("name") || "").trim(),
      email: String(form.get("email") || "").trim(),
      company: String(form.get("company") || "").trim(),
      projectType: String(form.get("projectType") || "").trim(),
      message: String(form.get("message") || "").trim(),
      company_website: String(form.get("company_website") || ""),
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(json.error || "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      formEl.reset();
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again or email us directly.");
    }
  }

  if (status === "success") {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center rounded-[1.5rem] border border-border bg-bg-elevated p-6 text-center sm:p-10">
        <h2 className="font-display text-3xl leading-[1.25] tracking-tight pb-[0.1em] sm:text-4xl">
          Message sent
        </h2>
        <p className="mt-3 text-base text-fg-muted sm:text-lg">
          Thanks — we&apos;ll review your note and reply soon, usually within one to two business
          days.
        </p>
        <div className="mt-8 flex justify-center">
          <Button type="button" variant="secondary" onClick={() => setStatus("idle")} className="text-base sm:text-lg">
            Send another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      {/* Fields scroll if needed; submit stays pinned below */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-2 sm:space-y-4 [scrollbar-width:thin]">
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          <Field label="Name" error={errors.name}>
            <input
              name="name"
              required
              className={inputClass}
              placeholder="Alex Rivera"
              autoComplete="name"
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <input
              name="email"
              type="email"
              required
              className={inputClass}
              placeholder="alex@company.com"
              autoComplete="email"
              inputMode="email"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          <Field label="Company">
            <input
              name="company"
              className={inputClass}
              placeholder="Optional"
              autoComplete="organization"
            />
          </Field>
          <Field label="Project type">
            <select name="projectType" className={inputClass} defaultValue={projectTypes[0]}>
              {projectTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Project details" error={errors.message}>
          <textarea
            name="message"
            required
            rows={3}
            className={`${inputClass} min-h-[5.5rem] max-h-[min(34vh,16rem)] resize-y sm:min-h-[7rem] sm:max-h-[min(38vh,18rem)]`}
            placeholder="What are you building? Timeline, goals, and anything critical."
          />
        </Field>

        {status === "error" && (
          <p className="text-base text-red-400">
            {errorMessage || "Something went wrong."} You can also email{" "}
            <a className="underline" href={`mailto:${SITE.email}`}>
              {SITE.email}
            </a>
            .
          </p>
        )}
      </div>

      <div className="shrink-0 bg-[#12141a]/95 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] sm:pt-4 sm:pb-6">
        <Button
          type="submit"
          disabled={status === "submitting"}
          className="min-h-11 w-full text-base sm:min-h-12 sm:w-auto sm:text-lg"
        >
          {status === "submitting" ? "Sending…" : "Send inquiry"}
        </Button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-2xl border border-border bg-bg-elevated/60 px-3.5 py-2.5 text-base text-fg outline-none transition focus:border-accent-blue/50 sm:px-4 sm:py-3 sm:text-lg";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[11px] tracking-[0.2em] text-fg-muted uppercase sm:text-sm">
          {label}
        </span>
        {error ? (
          <span className="text-xs text-red-400 normal-case tracking-normal sm:text-sm">
            {error}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
