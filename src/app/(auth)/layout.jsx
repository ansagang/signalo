import Grainient from "@/components/ui/grainient";
import Image from "next/image";

export default async function AuthLayout({ children }) {

    return (
        <div className="flex h-screen justify-between">
            <div className="w-[60%] relative flex items-center justify-center">
                <Grainient />
                <Image alt="Signalo" unoptimized width={400} height={400} src={'/images/logo-banner-trans.png'} />
            </div>
            {/* min-h-0 lets a flex child actually shrink to fit the row instead
                of growing with its content, which is what overflow-y-auto needs
                to take effect here rather than pushing the whole page (and the
                logo panel with it) down. */}
            <div className="flex flex-1 min-h-0 overflow-y-auto border-l border-secondary-transparent px-15 py-24">
                {children}
            </div>
        </div>
    )
}