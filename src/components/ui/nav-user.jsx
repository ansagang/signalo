"use client";

import {
  ArrowRight,
  BadgeCheck,
  Bell,

  ChevronsUpDown,

  ChevronsUpDownIcon,

  CreditCard,
  Languages,
  LogOut,
  Sparkles,
  User,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { logOut, updateUserLanguage } from "@/actions/auth";
import { languages } from "@/config/languages";
import { useState, useTransition } from "react";
import { LoaderIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function NavUser({ user, language }) {
  const { isMobile, state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isPending, startTransition] = useTransition();
  const [pendingLang, setPendingLang] = useState(null);

  const initials = user.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

    const router = useRouter()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className={isCollapsed ? "justify-center" : "py-2"}
            >
              <div className="flex size-8 aspect-square shrink-0 items-center justify-center rounded-full bg-hover text-xs font-medium text-secondary">
                {initials}
              </div>
              {!isCollapsed && (
                <>
                  <div className="ml-2 grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate text-fg font-medium">{user.full_name || user.email}</span>
                  </div>
                  <ChevronsUpDownIcon className="size-1 cursor-pointer" />
                </>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => router.push('/dashboard/account')}>
                <User />
                {language.app.pages.account.meta.title}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Languages />
                  {language.app.labels.switchLanguage}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {
                    languages.map((x) => (
                      <DropdownMenuItem disabled={x.code === language.lang || isPending} key={x.code} onSelect={(e) => e.preventDefault()} onClick={() => { setPendingLang(x.code); startTransition(() => updateUserLanguage({ user, lang: x.code }, language.app.res)); }}>
                        {isPending && pendingLang === x.code ? <LoaderIcon className="animate-spin" /> : null}
                        {x.title}
                      </DropdownMenuItem>
                    ))
                  }
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={'text-red-400'} onClick={async () => await logOut(language.app.res)}>
                <LogOut />
                {language.app.labels.logOut}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
