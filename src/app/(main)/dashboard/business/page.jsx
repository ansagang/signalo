import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import { PageHeader } from "@/components/ui/page";
import { tzOf } from "@/lib/timezone";
import BusinessSettings from "./business-settings";

export async function generateMetadata() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });
  return {
    title: language.app.pages.business.meta.title,
    description: language.app.pages.business.meta.description,
  };
}

export default async function BusinessPage() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });

  return (
    <div className="px-7 py-9">
      <PageHeader
        title={language.app.pages.business.meta.title}
        description={language.app.pages.business.meta.description}
      />
      <BusinessSettings language={language} timezone={tzOf(user)} />
    </div>
  );
}
