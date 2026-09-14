import { Suspense } from "react";
import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import Inbox from "./inbox";
import { LoaderIcon } from "lucide-react";

export async function generateMetadata() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });

  return {
    title: language.app.pages.conversations.meta.title,
    description: language.app.pages.conversations.meta.description,
  };
}

export default async function ConversationsPage() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });

  return (
    // Inbox reads the ?c search param, which needs a Suspense boundary.
    <Suspense
      fallback={
        <div className="h-dvh grid place-items-center">
          <LoaderIcon className="animate-spin text-muted size-5" />
        </div>
      }
    >
      <Inbox language={language} />
    </Suspense>
  );
}
