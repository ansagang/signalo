"use client"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenuButton,
    SidebarSeparator,
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { BookText, BotIcon, CalendarDays, Inbox, LayoutGrid, LucideMessageSquare, PackageIcon, Store, User , WalletIcon } from "lucide-react"
import Link from "next/link"
import DashboardNavigation from "./dashboard-nav"
import { NavUser } from "../ui/nav-user"
import { da } from "zod/v4/locales"
import Image from "next/image"
import Grainient from "../ui/grainient"

export function DashboardSidebar({ user, language }) {

    const dashboardRoutes = [
        {
            title: language.app.labels.menu,
            routes: [
                {
                    id: language.app.pages.overview.meta.title,
                    title: language.app.pages.overview.meta.title,
                    link: "/dashboard",
                    icon: <LayoutGrid size={18} />
                },
                {
                    id: language.app.pages.conversations.meta.title,
                    title: language.app.pages.conversations.meta.title,
                    link: "/dashboard/conversations",
                    icon: <LucideMessageSquare size={18} />
                },
                {
                    id: language.app.pages.catalogue.meta.title,
                    title: language.app.pages.catalogue.meta.title,
                    link: "/dashboard/catalogue",
                    icon: <PackageIcon size={18} />
                },
                {
                    id: language.app.pages.bookings.meta.title,
                    title: language.app.pages.bookings.meta.title,
                    link: "/dashboard/bookings",
                    icon: <CalendarDays size={18} />
                },
                {
                    id: language.app.pages.knowledgeBase.meta.title,
                    title: language.app.pages.knowledgeBase.meta.title,
                    link: "/dashboard/knowledge-base",
                    icon: <BookText size={18} />
                },
                {
                    id: language.app.pages.personas.meta.title,
                    title: language.app.pages.personas.meta.title,
                    link: "/dashboard/personas",
                    icon: <BotIcon size={18} />
                },
                {
                    id: language.app.pages.channels.meta.title,
                    title: language.app.pages.channels.meta.title,
                    link: "/dashboard/channels",
                    icon: <Inbox size={18} />
                }
            ]
        },
        {
            title: language.app.labels.settings,
            routes: [
                {
                    id: language.app.pages.business.meta.title,
                    title: language.app.pages.business.meta.title,
                    link: "/dashboard/business",
                    icon: <Store size={18} />
                },
                {
                    id: language.app.pages.billing.meta.title,
                    title: language.app.pages.billing.meta.title,
                    link: "/dashboard/billing",
                    icon: <WalletIcon size={18} />
                },
                {
                    id: language.app.pages.account.meta.title,
                    title: language.app.pages.account.meta.title,
                    link: "/dashboard/account",
                    icon: <User size={18} />
                }
            ]
        }
    ]

    const { state } = useSidebar()
    const isCollapsed = state === "collapsed"

    return (
        <Sidebar variant="sidebar" collapsible="icon">
            {
                !isCollapsed && (
                    <SidebarTrigger className={cn(
                        "absolute z-10 text-secondary top-0 right-0 hover:bg-transparent!",
                    )} />
                )
            }
            <SidebarHeader
                className={cn(
                    "flex p-0",
                    isCollapsed
                        ? "flex-row items-center justify-between gap-y-4 md:flex-col md:items-start md:justify-start"
                        : "flex-row items-center justify-between"
                )}
            >
                <Link href="/" className="block overflow-hidden bg-secondary-transparent2 relative ">
                    <>
                        {isCollapsed ? (
                            <Image
                                unoptimized
                                src="/images/logo.png"
                                alt="Logo"
                                width={40}
                                height={40}
                                className="w-auto h-auto border-b border-secondary-transparent"
                            />
                        ) : (
                            <Image
                                unoptimized
                                src="/images/logo-banner-trans.png"
                                alt="Logo"
                                width={400}
                                height={400}
                                className="w-auto h-auto border-b object-cover border-secondary-transparent"
                            />
                        )}
                        <Grainient />
                    </>
                </Link>
            </SidebarHeader>
            <SidebarContent className="py-4 px-3">
                {isCollapsed && (
                    <SidebarGroup className="p-0 mb-5">
                        <SidebarMenuButton className={'text-secondary hover:bg-hover'} asChild>
                            <SidebarTrigger />
                        </SidebarMenuButton>
                    </SidebarGroup>
                )}
                {
                    dashboardRoutes.map((group) => (
                        <SidebarGroup className="p-0 mb-5" key={group.title}>
                            {!isCollapsed && (
                                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted">
                                    {group.title}
                                </p>
                            )}
                            <DashboardNavigation routes={group.routes} />
                        </SidebarGroup>
                    ))
                }
            </SidebarContent>
            <SidebarFooter className="p-0 px-3 border-t border-secondary-transparent text-secondary">
                <SidebarSeparator className="mx-3" />
                <NavUser user={user} language={language} />
            </SidebarFooter>
        </Sidebar>
    )
}
