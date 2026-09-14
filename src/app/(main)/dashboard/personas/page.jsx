import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import PersonasManager from "./personas-tabl";

export async function generateMetadata() {
  const { data: user } = await getUser()
  const language = await getLanguage({ user })

  return {
    title: language.app.pages.personas.meta.title,
    description: language.app.pages.personas.meta.description,
  }
}

export default async function PersonasPage() {
  const { data: user } = await getUser()
  const language = await getLanguage({ user })

  return (
    <div className="px-7 py-10">
      <div className="title">
        <h3>{language.app.pages.personas.meta.title}</h3>
      </div>
      <div className="info-2">
        <p>{language.app.pages.personas.meta.description}</p>
      </div>
      <PersonasManager language={language} />
    </div>
  );
}
