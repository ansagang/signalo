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
    <div className="w-full h-full flex flex-col gap-10">
      <div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-transparent2 text-[11px] font-medium text-secondary mb-4">
          <span className="size-1.5 rounded-full bg-accent" />
          {language.app.pages.setup.stepLabel}
        </span>
        <div className="title"><h3>{language.app.pages.setup.meta.title}</h3></div>
        <div className="info"><p>{language.app.pages.setup.meta.description}</p></div>
      </div>
      <SetupWizard language={language} days={language.app.global.weekdaysFull} />
    </div>
  );
}
