import { DM_Sans, Geist_Mono, Geist } from "next/font/google";
import "@/styles/globals.css";
import { getLanguage } from "@/lib/get-language";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  metadataBase: new URL(process.env.URL),
  authors: [{ name: "ansagang", url: "https://github.com/ansagang" }],
  creator: "ansagang",
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
    googleBot: "index, follow"
  },
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/apple-icon.png", sizes: "57x57", type: "image/png" }]
  }
}

export default async function RootLayout({ children }) {

  const language = await getLanguage({})

  return (
    <html lang={language.lang} className={cn("font-sans", geist.variable)}>
      <body className={`font-sans ${dmSans.variable} ${geistMono.variable}`}>
        {children}
        <Toaster
          position="bottom-right"
        />
      </body>
    </html>
  )
}
