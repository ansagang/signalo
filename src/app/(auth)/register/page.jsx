import { getLanguage } from "@/lib/get-language";
import RegisterForm from "./register-form";

export async function generateMetadata() {
  const language = await getLanguage();
  return {
    title: language.app.pages.register.meta.title,
    description: language.app.pages.register.meta.description,
  };
}

export default async function Register() {
  const language = await getLanguage();
  const t = language.app.pages.register;

  return (
    <div className="w-full h-full flex flex-col gap-12">
      <div>
        <div className="title"><h3>{t.title}</h3></div>
        <div className="info"><p>{t.subtitle}</p></div>
      </div>
      <RegisterForm language={language} />
    </div>
  );
}
