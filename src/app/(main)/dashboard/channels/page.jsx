import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import { PageHeader } from "@/components/ui/page";
import ChannelsManager from "./channels-manager";

export async function generateMetadata() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });
  return {
    title: language.app.pages.channels.meta.title,
    description: language.app.pages.channels.meta.description,
  };
}

export default async function ChannelsPage() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });

  // Embed snippets must point at the deployed origin, not the browser's.
  const origin = process.env.URL?.replace(/\/$/, "") || "";

  return (
    <div className="px-7 py-9 max-w-4xl">
      <PageHeader
        title={language.app.pages.channels.meta.title}
        description={language.app.pages.channels.meta.description}
      />
      <ChannelsManager language={language} origin={origin} />
    </div>
  );
}
