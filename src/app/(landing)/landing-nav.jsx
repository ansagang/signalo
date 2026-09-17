"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { MenuIcon, XIcon } from "lucide-react";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { languages } from "@/config/languages";
import { updateUserLanguage } from "@/actions/auth";

export default function LandingNav({ p, language }) {
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
        "fixed top-0 z-50 w-full bg-transparent border-secondary-transparent transition-colors",
        stuck ? "border-b backdrop-blur-xl" : ""
      )}
    >
      <nav
        className={cn(
          "mx-auto flex items-center gap-8 px-6 transition-all duration-500",
          stuck ? "max-w-295 h-16" : "max-w-full h-24"
        )}
      >
        <Link
          href="/"
          className="flex shrink-0 items-center"
          aria-label="Signalo"
        >
          <Image
            src="/images/logo-trans.png"
            alt="Signalo"
            width={132}
            height={32}
            priority
            className="h-7 w-auto object-contain"
          />
        </Link>

        <NavigationMenu viewport={false} className="relative flex-none">
          <NavigationMenuList className="laptop-2:flex items-center gap-7 text-[13px]">
            {links.map((l) => (
              <NavigationMenuItem key={l.href}>
                <NavigationMenuLink
                  href={l.href}
                  className="text-secondary transition-colors hover:text-fg"
                >
                  {l.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}

            <NavigationMenuItem>
              <NavigationMenuTrigger className="text-secondary transition-colors hover:text-fg">
                {language.lang.toUpperCase()}
              </NavigationMenuTrigger>

              <NavigationMenuContent>
                <ul className="w-30 p-2">
                  {
                    languages.map((x) => (
                      <li key={x.code}>
                        <NavigationMenuLink className={cn(
                          language.lang === x.code && "bg-secondary-transparent2"
                        )} onClick={() => updateUserLanguage({lang: x.code})}>
                          {x.title}
                        </NavigationMenuLink>
                      </li>
                    ))
                  }
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className="hidden h-9 items-center rounded-button px-3 text-[13px] text-secondary transition-colors hover:text-fg tablet:inline-flex"
          >
            {p.nav.login}
          </Link>

          <Link
            href="/register"
            className="inline-flex h-9 items-center rounded-button bg-fg px-4 text-[13px] font-medium text-primary transition-opacity hover:opacity-90"
          >
            {p.nav.start}
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            className="grid size-9 cursor-pointer place-items-center rounded-button text-secondary hover:text-fg laptop-2:hidden"
          >
            {open ? (
              <XIcon className="size-4" />
            ) : (
              <MenuIcon className="size-4" />
            )}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-secondary-transparent bg-bg/95 backdrop-blur-xl laptop-2:hidden">
          <div className="mx-auto flex max-w-[1180px] flex-col px-6 py-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-2.5 text-[14px] text-secondary transition-colors hover:text-fg"
              >
                {l.label}
              </a>
            ))}

            <Link
              href="/login"
              className="py-2.5 text-[14px] text-secondary transition-colors hover:text-fg"
            >
              {p.nav.login}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}