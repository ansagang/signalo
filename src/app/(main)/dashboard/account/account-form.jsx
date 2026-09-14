"use client";

import { useState, useTransition } from "react";
import { updateUser, updateUserLanguage, logOut } from "@/actions/auth";
import { languages } from "@/config/languages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { showError, showSuccess } from "@/lib/toast";
import { LoaderIcon, LogOutIcon } from "lucide-react";

export default function AccountForm({ user, language }) {
  const p = language.app.pages.account;
  const res = language.app.res;

  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    username: user?.username || "",
  });
  const [isPending, startTransition] = useTransition();

  function change(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function save(e) {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateUser({ user, data: form }, res);
      if (r?.success === false) showError(r.message);
      else showSuccess(res.accountUpdated);
    });
  }

  function changeLanguage(code) {
    startTransition(async () => {
      const r = await updateUserLanguage({ user, lang: code }, res);
      if (r?.success === false) showError(r.message);
    });
  }

  return (
    <div className="mt-8 max-w-lg space-y-8">
      <form onSubmit={save} className="space-y-5">
        <Field label={p.fields.fullName}>
          <Input
            name="full_name"
            value={form.full_name}
            onChange={change}
            placeholder={p.fields.fullNamePlaceholder}
            disabled={isPending}
          />
        </Field>

        <Field label={p.fields.username}>
          <Input
            name="username"
            value={form.username}
            onChange={change}
            placeholder={p.fields.usernamePlaceholder}
            disabled={isPending}
          />
        </Field>

        <Field label={p.fields.email}>
          {/* Changing the login email needs an auth-level confirmation flow,
              so it is read-only here. */}
          <Input value={user?.email || ""} disabled readOnly />
        </Field>

        <Field label={p.fields.language}>
          <NativeSelect
            value={language.lang}
            onChange={(e) => changeLanguage(e.target.value)}
            disabled={isPending}
          >
            {languages.map((l) => (
              <NativeSelectOption key={l.code} value={l.code}>
                {l.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <Button type="submit" disabled={isPending}>
          {isPending ? <LoaderIcon className="size-4 animate-spin" /> : p.save}
        </Button>
      </form>

      <div className="border-t border-secondary-transparent pt-6">
        <Button variant="ghost" onClick={() => logOut(res)} className="text-error">
          <LogOutIcon className="size-4" />
          {language.app.labels.logOut}
        </Button>
      </div>
    </div>
  );
}
