import Link from "next/link"
import Image from "next/image"
import { metadata } from "@/lib/metadata"
import { ArrowRight } from "lucide-react"
import { Button } from "../ui/button"

const footerLinks = {
    Product: [
        { label: "Home", href: "/" },
        { label: "Features", href: "/product" },
        { label: "Integrations", href: "/integrations" },
        { label: "Pricing", href: "/pricing" },
    ],
    Company: [
        { label: "Signup", href: metadata.app.signin },
        { label: "Contact", href: "/contact" },
        { label: "Book a demo", href: metadata.app.book },
    ],
    Legal: [
         { label: "Data processing", href: "/data-processing" },
        { label: "Refund Policy", href: "/refund" },
        { label: "Security & Compliance", href: "/security-compliance" },
    ],
}

export default function Footer() {
    return (
        <footer className="bg-primary">
            <div className="container">
                <div className="py-16">
                    <div className="flex max-[850px]:flex-col justify-between gap-16">
                        <div className="max-w-xs">
                            <Link href="/" className="flex items-center gap-3 font-bold mb-5">
                                <Image unoptimized width={40} height={40} alt="logo" src="/images/logo.png" className="w-10 h-10" />
                                <span className="text-lg">{metadata.title}</span>
                            </Link>
                            <div className="info-2 opacity-40 mb-5">
                                <p>{metadata.description}</p>
                            </div>
                            <Button to={metadata.app.book} size="sm" variant="secondary">Book a demo <ArrowRight /></Button>
                        </div>

                        {Object.entries(footerLinks).map(([category, links]) => (
                            <div key={category}>
                                <h4 className="text-white/80 font-medium text-sm mb-5 uppercase tracking-wider">{category}</h4>
                                <ul className="flex flex-col gap-3">
                                    {links.map((link) => (
                                        <li key={link.label}>
                                            <Link href={link.href} className="text-white/40 text-sm hover:text-white transition-colors duration-200">
                                                {link.label}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="border-t border-secondary-transparent2 py-6 flex max-[850px]:items-start max-[850px]:flex-col max-[850px]:gap-6 items-center justify-between">
                    <div className="info-2 opacity-30">
                        <p className="mb-2">
                            &copy; {new Date().getFullYear()} {metadata.title}. All rights reserved.
                        </p>
                        <p> {metadata.license}</p>
                    </div>
                    <div className="flex items-center gap-6">
                        <Link href="/privacy" className="text-white/30 text-sm hover:text-white transition-colors duration-200">Privacy Policy</Link>
                        <span className="text-white/30">&</span>
                        <Link href="/terms" className="text-white/30 text-sm hover:text-white transition-colors duration-200">Terms of Service</Link>
                    </div>
                </div>
            </div>
        </footer>
    )
}
