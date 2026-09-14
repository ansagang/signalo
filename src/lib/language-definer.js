"use server";

const languages = {
  en: () => import("../config/lang/en.json").then((module) => module.default),
  ru: () => import("../config/lang/ru.json").then((module) => module.default),
  kk: () => import("../config/lang/kk.json").then((module) => module.default),
};

export default async function languageDefiner({ locale }) {
  return languages[locale]();
}