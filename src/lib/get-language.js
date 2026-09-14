"use server";

import { cookies, headers } from "next/headers";
import languageDefiner from "./language-definer";
import { languages_codes } from "@/config/languages";
import { createClient } from "./supabase/server";

export async function getLanguage({ locale = null, user = null } = {}) {
  if (locale && languages_codes.includes(locale)) {
    return languageDefiner({ locale });
  }

  const headersList = await headers();
  const acceptLanguage = headersList.get("accept-language");
  const headerLang = acceptLanguage?.split(",")[0].split("-")[0];

  if (user) {
    const supabase = await createClient();
    if (user.lang) {
      return languageDefiner({ locale: user.lang });
    } else {
      await supabase
        .from("profiles")
        .update({ lang: headerLang })
        .eq("id", user.id);
      return languageDefiner({
        locale: languages_codes.includes(headerLang) ? headerLang : "en",
      });
    }
  }

  const cookiesList = await cookies();
  const cookieLang = cookiesList.get("lang")?.value;
  if (cookieLang && languages_codes.includes(cookieLang)) {
    return languageDefiner({ locale: cookieLang });
  }

  return languageDefiner({
    locale: languages_codes.includes(headerLang) ? headerLang : "en",
  });
}
