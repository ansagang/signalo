import { getLanguage } from "@/lib/get-language";
import LoginForm from "./login-form";

export async function generateMetadata() {
  const language = await getLanguage()

  return {
    title: {
      default: language.app.pages.login.meta.title,
      template: `%s | ${language.app.pages.login.meta.title}`
    },
    description: language.app.pages.login.meta.description,
    keywords: language.app.pages.login.meta.keywords,
    openGraph: {
      type: "website",
      title: language.app.pages.login.meta.title,
      description: language.app.pages.login.meta.description,
      siteName: language.app.meta.title,
    },
    twitter: {
      card: "summary_large_image",
      title: language.app.pages.login.meta.title,
      description: language.app.pages.login.meta.description,
      creator: "@ansagang",
    },
  }
}

export default async function Login() {
  const language = await getLanguage()

  return (
    <div className="w-full h-full flex flex-col gap-20">
      <div className="">
        <div className="title">
          <h3>{language.app.pages.login.title}</h3>
        </div>
        <div className="info">
          <p>{language.app.pages.login.subtitle}</p>
        </div>
      </div>
      <LoginForm language={language} />
    </div>
  )
}
