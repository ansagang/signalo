import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import { PageHeader } from "@/components/ui/page";
import PersonasManager from "./personas-manager";

export async function generateMetadata() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });
  return {
    title: language.app.pages.personas.meta.title,
    description: language.app.pages.personas.meta.description,
  };
}

export default async function PersonasPage() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });

  return (
    <div className="px-7 py-9">
      <PageHeader
        title={language.app.pages.personas.meta.title}
        description={language.app.pages.personas.meta.description}
      />
      <PersonasManager language={language} />
    </div>
  );
}
