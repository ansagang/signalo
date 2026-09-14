import { getUser } from "@/actions/auth";
import { getLanguage } from "@/lib/get-language";
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
    <div className="px-7 py-10 max-w-6xl">
      <div className="title">
        <h3>{language.app.pages.bookings.meta.title}</h3>
      </div>
      <div className="info-2">
        <p>{language.app.pages.bookings.meta.description}</p>
      </div>
      <BookingsBoard language={language} />
    </div>
  );
}
