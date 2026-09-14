import Grainient from "@/components/ui/grainient";
import Image from "next/image";

export default async function AuthLayout({ children }) {

    return (
        <div className="flex min-h-screen">
            <div className="w-[60%] relative flex items-center justify-center">
                <Grainient />
                <Image alt="Signalo" unoptimized width={400} height={400} src={'/images/logo-banner-trans.png'} />
            </div>
            <div className="flex border-l border-secondary-transparent flex-1 items-center justify-center px-15 py-24">
                {children}
            </div>
        </div>
    )
}