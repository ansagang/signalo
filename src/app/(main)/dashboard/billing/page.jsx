import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import { PageHeader } from "@/components/ui/page";
import { getBilling } from "@/actions/billing";
import BillingView from "./billing-view";

export async function generateMetadata() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });
  return {
    title: language.app.pages.billing.meta.title,
    description: language.app.pages.billing.meta.description,
  };
}

export default async function BillingPage() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });
  const data = await getBilling({ days: 30 });

  return (
    <div className="px-7 py-9">
      <PageHeader
        title={language.app.pages.billing.meta.title}
        description={language.app.pages.billing.meta.description}
      />
      <BillingView language={language} data={data} />
    </div>
  );
}
