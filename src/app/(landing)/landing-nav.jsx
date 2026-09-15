"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { MenuIcon, XIcon } from "lucide-react";

/** Sticky header that only grows a border once the hero has scrolled under it. */
export default function LandingNav({ p }) {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#features", label: p.nav.features },
    { href: "#channels", label: p.nav.channels },
    { href: "#how", label: p.nav.how },
    { href: "#faq", label: p.nav.faq },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors",
        stuck ? "bg-bg/85 backdrop-blur-xl border-b border-secondary-transparent" : "bg-transparent",
      )}
    >
      <nav className="mx-auto max-w-[1180px] px-6 h-16 flex items-center gap-8">
        <Link href="/" className="shrink-0 flex items-center" aria-label="Signalo">
          <Image
            src="/images/logo-banner-trans.png"
            alt="Signalo"
            width={132}
            height={32}
            priority
            className="h-7 w-auto object-contain"
          />
        </Link>

        <div className="hidden laptop-2:flex items-center gap-7 text-[13px]">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-secondary hover:text-fg transition-colors">
              {l.label}
            </a>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className="hidden tablet:inline-flex h-9 items-center px-3 rounded-button text-[13px] text-secondary hover:text-fg transition-colors"
          >
            {p.nav.login}
          </Link>
          <Link
            href="/register"
            className="inline-flex h-9 items-center px-4 rounded-button bg-fg text-primary text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            {p.nav.start}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            className="laptop-2:hidden size-9 grid place-items-center rounded-button text-secondary hover:text-fg cursor-pointer"
          >
            {open ? <XIcon className="size-4" /> : <MenuIcon className="size-4" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="laptop-2:hidden border-t border-secondary-transparent bg-bg/95 backdrop-blur-xl">
          <div className="mx-auto max-w-[1180px] px-6 py-3 flex flex-col">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-2.5 text-[14px] text-secondary hover:text-fg transition-colors"
              >
                {l.label}
              </a>
            ))}
            <Link href="/login" className="py-2.5 text-[14px] text-secondary hover:text-fg transition-colors">
              {p.nav.login}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
