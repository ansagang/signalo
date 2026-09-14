"use client"

import Link from "next/link"
import Image from "next/image"

import { useEffect, useState } from "react"

import NavLink from "@/components/ui/nav-link"

import useScrollPosition from "@/hooks/use-scroll-position"
import useScrollMovement from "@/hooks/use-scroll-movement"

import { metadata } from "@/lib/metadata"
import { Button } from "../ui/button"
import { cn } from "@/lib/utils"
import useDebounce from "@/hooks/use-debounce"
import { Menu, MenuIcon } from "lucide-react"

export default function Header() {

    const [active, isActive] = useState(false)
    const [sticky, setSticky] = useState(true)
    const [show, setShow] = useState(false)
    const debouncedActive = useDebounce(active, 200)

    const scroll = useScrollPosition()

    useScrollMovement(
        ({ prevPos, currPos }) => {
            const isShow = currPos.y > prevPos.y
            if (isShow !== sticky) setSticky(isShow)
        },
        [sticky]
    )

    useEffect(() => {
        if (scroll.scrollY == 0) {
            isActive(false)
            setSticky(true)
        } else {
            isActive(true)
        }
    }, [scroll])

    return (
        <>
            <header className={cn(
                "fixed top-0 left-0 right-0 w-full z-101",
                "bg-transparent pt-6",
                "transition-all duration-600 ease-[ease]",
                sticky ? "translate-y-0" : "-translate-y-full",
                show && "max-[1100px]:translate-y-0"
            )}>

                <div className="container-fluid">
                    <div className={cn(
                        "flex items-center justify-between px-14 py-3.5 max-[1100px]:px-3.5",
                        "rounded-module border-2 border-transparent group",
                        debouncedActive ? "bg-secondary-transparent backdrop-blur-md border-secondary-transparent2" : "bg-transparent",
                        "transition-all duration-200 ease",
                        show && "max-[1100px]:bg-transparent max-[1100px]:border-0"
                    )}>
                        <nav className="flex items-center justify-center">
                            <Link onClick={() => setShow(false)} href="/" className="flex items-center justify-center gap-4 font-bold no-underline">
                                <Image unoptimized width={45} height={45} alt="logo" src="/images/logo.png" className="w-10 h-10" />
                                <span>{metadata.title}</span>
                            </Link>
                        </nav>
                        <nav className="flex items-center justify-center max-[1100px]:hidden">
                            <ol className="flex items-center justify-between gap-20">
                                <li>
                                    <NavLink href="/product"><span>{metadata.pages.product.title}</span></NavLink>
                                </li>
                                <li>
                                    <NavLink href="/integrations"><span>{metadata.pages.integrations.title}</span></NavLink>
                                </li>
                                <li>
                                    <NavLink href="/pricing"><span>{metadata.pages.pricing.title}</span></NavLink>
                                </li>
                                <li>
                                    <NavLink href="/contact"><span>{metadata.pages.contact.title}</span></NavLink>
                                </li>
                            </ol>
                        </nav>
                        <nav className="flex items-center justify-center">
                            <ol className="flex items-center justify-between gap-6">
                                <li className="max-[1100px]:hidden">
                                    <Button to={metadata.app.signin} size="sm" variant="secondary"><Link href={metadata.app.signin}>Sign in</Link></Button>
                                </li>
                                <li className="max-[1100px]:hidden">
                                    <Button to={metadata.app.book} size="sm" variant="default">Book a demo</Button>
                                </li>
                                <li onClick={() => setShow(!show)} className="hidden max-[1100px]:block cursor-pointer">
                                    <MenuIcon className="size-9 p-2 rounded-button border border-secondary-transparent bg-secondary-transparent text-bg" />
                                </li>
                            </ol>
                        </nav>
                    </div>
                </div>
            </header>
            <div className={cn(
                "fixed top-0 right-0 w-full ease-in h-full translate-x-full transition-all duration-200 backdrop-blur-2xl z-100 bg-primary",
                show && "translate-x-0"
                
            )}>
                <div className="menu__inner w-full h-full">
                    <nav className="flex items-center justify-center h-full py-40">
                        <ol className="flex flex-col items-center justify-between gap-20 h-full">
                            <li className="flex items-center gap-4">
                                <Button onClick={() => setShow(false)} to={metadata.app.signin} size="sm" variant="secondary"><Link href={metadata.app.signin}>Sign in</Link></Button>
                                <Button onClick={() => setShow(false)} to={metadata.app.book} size="sm" variant="default">Book a demo</Button>
                            </li>
                            <li>
                                <NavLink onClick={() => setShow(false)} href="/product"><span>{metadata.pages.product.title}</span></NavLink>
                            </li>
                            <li>
                                <NavLink onClick={() => setShow(false)} href="/integrations"><span>{metadata.pages.integrations.title}</span></NavLink>
                            </li>
                            <li>
                                <NavLink onClick={() => setShow(false)} href="/pricing"><span>{metadata.pages.pricing.title}</span></NavLink>
                            </li>
                            <li>
                                <NavLink onClick={() => setShow(false)} href="/contact"><span>{metadata.pages.contact.title}</span></NavLink>
                            </li>
                        </ol>
                    </nav>
                </div>
            </div>
        </>
    )
}
