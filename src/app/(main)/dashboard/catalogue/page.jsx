import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import { PageHeader } from "@/components/ui/page";
import CatalogueManager from "./catalogue-manager";

export async function generateMetadata() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });
  return {
    title: language.app.pages.catalogue.meta.title,
    description: language.app.pages.catalogue.meta.description,
  };
}

export default async function CataloguePage() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });

  return (
    <div className="px-7 py-9 max-w-6xl">
      <PageHeader
        title={language.app.pages.catalogue.meta.title}
        description={language.app.pages.catalogue.meta.description}
      />
      <CatalogueManager language={language} />
    </div>
  );
}
