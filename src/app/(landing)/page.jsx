import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { getLanguage } from "@/lib/get-language";
import LandingNav from "./landing-nav";
import FaqList from "./faq-list";
import ChatPreview from "./chat-preview";
import {
  ArrowRightIcon, BookOpenIcon, BoxIcon, CalendarCheckIcon, CheckIcon,
  GlobeIcon, LanguagesIcon, MailIcon, MessageCircleIcon, ScrollTextIcon,
  SendIcon, UserRoundIcon, ZapIcon,
} from "lucide-react";

export async function generateMetadata() {
  const language = await getLanguage();
  const p = language.app.pages.landing;
  return {
    title: p.meta.title,
    description: p.meta.description,
    keywords: p.meta.keywords,
    openGraph: { type: "website", title: p.meta.title, description: p.meta.description, siteName: "Signalo" },
    twitter: { card: "summary_large_image", title: p.meta.title, description: p.meta.description },
  };
}

const FEATURE_ICONS = [BoxIcon, CalendarCheckIcon, BookOpenIcon, ScrollTextIcon];
const CHANNEL_ICONS = [GlobeIcon, SendIcon, MessageCircleIcon, MailIcon];
const PROOF_ICONS = [ZapIcon, LanguagesIcon, UserRoundIcon];

/** Section heading, so every band on the page is spaced the same way. */
function Heading({ eyebrow, title, subtitle, center }) {
  return (
    <div className={center ? "text-center max-w-[58ch] mx-auto" : "max-w-[58ch]"}>
      {eyebrow && (
        <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted mb-3">{eyebrow}</p>
      )}
      <h2 className="text-[30px] tablet:text-[38px] font-semibold tracking-[-0.02em] leading-[1.12] text-fg">
        {title}
      </h2>
      {subtitle && <p className="mt-4 text-[15px] text-secondary leading-relaxed">{subtitle}</p>}
    </div>
  );
}

export default async function LandingPage() {
  const language = await getLanguage();
  const p = language.app.pages.landing;

  // The live assistant is opt-in: without a key the page shows the still only,
  // so a fresh deployment never ships a launcher wired to nothing.
  const demoKey = process.env.NEXT_PUBLIC_DEMO_WIDGET_KEY;

  const proof = [
    { title: p.proof.replies, body: p.proof.repliesBody },
    { title: p.proof.languages, body: p.proof.languagesBody },
    { title: p.proof.handoff, body: p.proof.handoffBody },
  ];

  return (
    <>
      <LandingNav p={p} />

      {/* ── hero ── */}
      <section className="relative overflow-hidden">
        {/* One soft wash behind the fold; cheaper and calmer than a canvas. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[620px] opacity-[0.16]"
          style={{
            background:
              "radial-gradient(60% 55% at 50% 40%, var(--color-accent) 0%, transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-[1180px] px-6 pt-16 tablet:pt-24 pb-16">
          <div className="grid gap-12 laptop:grid-cols-[minmax(0,1fr)_420px] laptop:gap-16 items-center">
            <div>
              <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-secondary-transparent bg-secondary-transparent2 text-[11px] font-mono uppercase tracking-[0.14em] text-secondary">
                {p.hero.badge}
              </span>

              <h1 className="mt-6 text-[40px] tablet:text-[56px] laptop:text-[62px] font-semibold tracking-[-0.03em] leading-[1.03] text-fg">
                {p.hero.title}
                <br />
                <span className="text-accent">{p.hero.titleAccent}</span>
              </h1>

              <p className="mt-6 text-[16px] tablet:text-[17px] text-secondary leading-relaxed max-w-[56ch]">
                {p.hero.subtitle}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex h-11 items-center gap-2 px-5 rounded-button bg-fg text-primary text-[14px] font-medium hover:opacity-90 transition-opacity"
                >
                  {p.hero.cta}
                  <ArrowRightIcon className="size-4" />
                </Link>
                <a
                  href="#demo"
                  className="inline-flex h-11 items-center px-5 rounded-button border border-border text-[14px] text-fg hover:border-border-hover transition-colors"
                >
                  {p.hero.ctaSecondary}
                </a>
              </div>

              <p className="mt-4 text-[12px] text-muted">{p.hero.note}</p>
            </div>

            <div className="laptop:pl-4">
              <ChatPreview label={p.hero.badge} />
            </div>
          </div>

          {/* three short claims, kept to one line each */}
          <div className="mt-16 tablet:mt-20 grid gap-px bg-[var(--color-secondary-transparent)] border border-secondary-transparent rounded-module overflow-hidden tablet:grid-cols-3">
            {proof.map((item, i) => {
              const Icon = PROOF_ICONS[i];
              return (
                <div key={item.title} className="bg-bg p-6">
                  <Icon className="size-4 text-accent mb-3" />
                  <p className="text-[14px] font-medium text-fg">{item.title}</p>
                  <p className="mt-1 text-[13px] text-secondary leading-relaxed">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── what it does ── */}
      <section id="features" className="scroll-mt-20 mx-auto max-w-[1180px] px-6 py-20 tablet:py-28">
        <Heading title={p.features.title} subtitle={p.features.subtitle} />
        <div className="mt-12 grid gap-4 tablet:grid-cols-2">
          {p.features.items.map((item, i) => {
            const Icon = FEATURE_ICONS[i] || BoxIcon;
            return (
              <div
                key={item.title}
                className="rounded-module border border-border bg-card p-6 hover:border-border-hover transition-colors"
              >
                <span className="size-9 rounded-button bg-secondary-transparent2 grid place-items-center">
                  <Icon className="size-4 text-accent" />
                </span>
                <h3 className="mt-4 text-[16px] font-semibold text-fg">{item.title}</h3>
                <p className="mt-2 text-[14px] text-secondary leading-relaxed">{item.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── channels ── */}
      <section id="channels" className="scroll-mt-20 border-y border-secondary-transparent bg-card/40">
        <div className="mx-auto max-w-[1180px] px-6 py-20 tablet:py-28">
          <Heading title={p.channels.title} subtitle={p.channels.subtitle} center />
          <div className="mt-12 grid gap-4 tablet:grid-cols-2 laptop:grid-cols-4">
            {p.channels.items.map((item, i) => {
              const Icon = CHANNEL_ICONS[i] || GlobeIcon;
              return (
                <div key={item.name} className="rounded-module border border-border bg-bg p-6 text-center">
                  <span className="size-10 rounded-full bg-secondary-transparent2 grid place-items-center mx-auto">
                    <Icon className="size-4 text-fg" />
                  </span>
                  <h3 className="mt-4 text-[14px] font-semibold text-fg">{item.name}</h3>
                  <p className="mt-1.5 text-[13px] text-secondary leading-relaxed">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── live demo ── */}
      <section id="demo" className="scroll-mt-20 mx-auto max-w-[1180px] px-6 py-20 tablet:py-28">
        <div className="rounded-module border border-border bg-card p-8 tablet:p-12 relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 size-[320px] rounded-full opacity-[0.12]"
            style={{ background: "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)" }}
          />
          <div className="relative max-w-[62ch]">
            <h2 className="text-[26px] tablet:text-[32px] font-semibold tracking-[-0.02em] leading-[1.15] text-fg">
              {p.demo.title}
            </h2>
            <p className="mt-4 text-[15px] text-secondary leading-relaxed">{p.demo.subtitle}</p>
            <p className="mt-6 inline-flex items-center gap-2 h-9 px-3.5 rounded-button border border-secondary-transparent bg-secondary-transparent2 text-[13px] text-fg font-mono">
              {p.demo.hint}
            </p>
            {!demoKey && (
              <p className="mt-4 text-[12px] text-muted">
                Set NEXT_PUBLIC_DEMO_WIDGET_KEY to put a live assistant on this page.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── how ── */}
      <section id="how" className="scroll-mt-20 border-t border-secondary-transparent">
        <div className="mx-auto max-w-[1180px] px-6 py-20 tablet:py-28">
          <Heading title={p.how.title} />
          <ol className="mt-12 grid gap-6 tablet:grid-cols-3">
            {p.how.steps.map((step, i) => (
              <li key={step.title} className="relative pl-12">
                <span className="absolute left-0 top-0 size-8 rounded-full border border-border bg-card grid place-items-center text-[12px] font-mono text-accent">
                  {i + 1}
                </span>
                <h3 className="text-[15px] font-semibold text-fg">{step.title}</h3>
                <p className="mt-2 text-[14px] text-secondary leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── who it's for ── */}
      <section className="border-t border-secondary-transparent bg-card/40">
        <div className="mx-auto max-w-[1180px] px-6 py-20 tablet:py-28">
          <Heading title={p.who.title} center />
          <div className="mt-12 grid gap-4 tablet:grid-cols-3">
            {p.who.items.map((item) => (
              <div key={item.name} className="rounded-module border border-border bg-bg p-6">
                <CheckIcon className="size-4 text-accent" />
                <h3 className="mt-3 text-[15px] font-semibold text-fg">{item.name}</h3>
                <p className="mt-2 text-[14px] text-secondary leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── faq ── */}
      <section id="faq" className="scroll-mt-20 mx-auto max-w-[1180px] px-6 py-20 tablet:py-28">
        <div className="grid gap-12 laptop:grid-cols-[320px_minmax(0,1fr)]">
          <Heading title={p.faq.title} />
          <FaqList items={p.faq.items} />
        </div>
      </section>

      {/* ── closing ── */}
      <section className="border-t border-secondary-transparent">
        <div className="mx-auto max-w-[1180px] px-6 py-20 tablet:py-28 text-center">
          <h2 className="mx-auto max-w-[24ch] text-[32px] tablet:text-[44px] font-semibold tracking-[-0.03em] leading-[1.08] text-fg">
            {p.cta.title}
          </h2>
          <p className="mx-auto mt-5 max-w-[54ch] text-[15px] text-secondary leading-relaxed">
            {p.cta.subtitle}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex h-11 items-center gap-2 px-6 rounded-button bg-fg text-primary text-[14px] font-medium hover:opacity-90 transition-opacity"
            >
              {p.cta.button}
              <ArrowRightIcon className="size-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center px-6 rounded-button border border-border text-[14px] text-fg hover:border-border-hover transition-colors"
            >
              {p.cta.secondary}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-secondary-transparent">
        <div className="mx-auto max-w-[1180px] px-6 py-10 flex flex-col tablet:flex-row items-center gap-4">
          <Image
            src="/images/logo-banner-trans.png"
            alt="Signalo"
            width={110}
            height={26}
            className="h-6 w-auto object-contain"
          />
          <p className="text-[13px] text-muted">{p.footer.tagline}</p>
          <p className="tablet:ml-auto text-[12px] text-muted">
            © {new Date().getFullYear()} Signalo. {p.footer.rights}
          </p>
        </div>
      </footer>

      {/* The product itself, embedded exactly the way a customer would. */}
      {demoKey && <Script src="/widget.js" data-key={demoKey} strategy="afterInteractive" />}
    </>
  );
}
