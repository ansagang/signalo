import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
import { PageHeader } from "@/components/ui/page";
import BookingsBoard from "./bookings-board";

export async function generateMetadata() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });
  return {
    title: language.app.pages.bookings.meta.title,
    description: language.app.pages.bookings.meta.description,
  };
}

export default async function BookingsPage() {
  const { data: user } = await getUser();
  const language = await getLanguage({ user });

  return (
    <div className="px-7 py-9">
      <PageHeader
        title={language.app.pages.bookings.meta.title}
        description={language.app.pages.bookings.meta.description}
      />
      <BookingsBoard language={language} />
    </div>
  );
}
