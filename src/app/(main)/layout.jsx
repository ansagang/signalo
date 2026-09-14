import { getUser, getCookie } from "@/actions/auth";
import { DashboardSidebar } from "@/components/navigation/dashboard-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getLanguage } from "@/lib/get-language";
import Providers from "./providers";

export async function generateMetadata() {
    const { data: user } = await getUser()
    const language = await getLanguage({ user })

    return {
        title: {
            template: `%s | ${language.app.meta.title}`
        },
        description: language.app.pages.overview.meta.description,
        keywords: language.app.pages.overview.meta.keywords,
        openGraph: {
            type: "website",
            title: language.app.pages.overview.meta.title,
            description: language.app.pages.overview.meta.description,
            siteName: language.app.meta.title,
            // images: [`${process.env.URL}/images/banner-one.png`]
        },
        twitter: {
            card: "summary_large_image",
            title: language.app.pages.overview.meta.title,
            description: language.app.pages.overview.meta.description,
            // images: [`${process.env.URL}/images/banner-one.png`],    
            creator: "@ansagang",
        },
    }
}


export default async function MainLayout({ children }) {

    const { data: user } = await getUser()
    const language = await getLanguage({ user })
    const sidebarState = await getCookie("sidebar_state")
    const defaultOpen = sidebarState !== null ? sidebarState === "true" : true


    return (
        <Providers>
            <SidebarProvider defaultOpen={defaultOpen}>
                <TooltipProvider>
                    <DashboardSidebar user={user} language={language} />
                    <SidebarInset>
                        {children}
                    </SidebarInset>
                </TooltipProvider>
            </SidebarProvider>
        </Providers>
    )
}