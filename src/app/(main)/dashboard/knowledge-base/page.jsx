import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import KnowledgeTypes from "./knowledge-types";
import KnowledgeBaseTable from "./knowledge-table";

export async function generateMetadata() {
  const { data: user } = await getUser()
  const language = await getLanguage({ user })

  return {
    title: language.app.pages.knowledgeBase.meta.title,
    description: language.app.pages.knowledgeBase.meta.description,
    keywords: language.app.pages.knowledgeBase.meta.keywords
  }
}

export default async function KnowledgeBasePage({ searchParams }) {

  const { data: user } = await getUser()
  const language = await getLanguage({ user })

  const searchQuery = await searchParams

  return (
    <div className="px-7 py-10">
      <div className="title">
        <h3>{language.app.pages.knowledgeBase.meta.title}</h3>
      </div>
      <div className="info-2">
        <p>{language.app.pages.knowledgeBase.meta.description}</p>
      </div>
      <KnowledgeTypes language={language} searchParams={searchQuery} />
      <KnowledgeBaseTable language={language} searchParams={searchQuery} />
    </div>
  );
}
