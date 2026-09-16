import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import { PageHeader } from "@/components/ui/page";
import SetupWizard from "./setup-wizard";

export async function generateMetadata() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });
  return {
    title: language.app.pages.setup.meta.title,
    description: language.app.pages.setup.meta.description,
  };
}

export default async function SetupPage() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });

  return (
    <div className="px-7 py-9">
      <PageHeader
        title={language.app.pages.setup.meta.title}
        description={language.app.pages.setup.meta.description}
      />
      <SetupWizard language={language} days={language.app.global.weekdaysFull} />
    </div>
  );
}
