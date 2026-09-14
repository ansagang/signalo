import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import AccountForm from "./account-form";

export async function generateMetadata() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });

  return {
    title: language.app.pages.account.meta.title,
    description: language.app.pages.account.meta.description,
  };
}

export default async function AccountPage() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });

  return (
    <div className="px-7 py-10">
      <div className="title">
        <h3>{language.app.pages.account.meta.title}</h3>
      </div>
      <div className="info-2">
        <p>{language.app.pages.account.meta.description}</p>
      </div>
      <AccountForm user={user} language={language} />
    </div>
  );
}
