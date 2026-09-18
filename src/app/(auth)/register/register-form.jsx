"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerSchema } from "@/lib/schemas";
import { register } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { showError, showSuccess } from "@/lib/toast";
import { EyeIcon, EyeOffIcon, LoaderIcon } from "lucide-react";

export default function RegisterForm({ language }) {
  const router = useRouter();
  const t = language.app.pages.register;
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({ business: "", email: "", password: "" });
  const [hidden, setHidden] = useState(true);
  const [confirm, setConfirm] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();

    const result = registerSchema(language.app.res).safeParse(formData);
    if (!result.success) {
      for (const issue of result.error.issues) showError(issue.message);
      return;
    }

    startTransition(async () => {
      const res = await register(formData, language.app.res);
      if (res?.success === false) return showError(res.message);
      // Some projects require an emailed confirmation before a session exists.
      if (res?.confirm) return setConfirm(true);
      showSuccess(t.welcome);
      router.push("/register/setup");
    });
  }

  if (confirm) {
    return (
      <div className="space-y-4">
        <div className="title"><h3>{t.check.title}</h3></div>
        <div className="info"><p>{t.check.body.replace("{email}", formData.email)}</p></div>
        <Link href="/login" className="text-[13px] text-accent hover:underline">{t.toLogin}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Field label={t.fields.business.label}>
        <Input
          variant="filled"
          name="business"
          placeholder={t.fields.business.placeholder}
          autoComplete="organization"
          value={formData.business}
          onChange={handleChange}
        />
      </Field>

      <Field label={t.fields.email.label}>
        <Input
          variant="filled"
          name="email"
          type="email"
          placeholder={t.fields.email.placeholder}
          autoComplete="email"
          value={formData.email}
          onChange={handleChange}
        />
      </Field>

      <Field label={t.fields.password.label}>
        <InputGroup variant="filled">
          <InputGroupInput
            name="password"
            type={hidden ? "password" : "text"}
            placeholder={t.fields.password.placeholder}
            autoComplete="new-password"
            value={formData.password}
            onChange={handleChange}
          />
          <InputGroupAddon align="inline-end">
            <button
              type="button"
              onClick={() => setHidden((v) => !v)}
              aria-label={t.fields.password.label}
              className="text-muted hover:text-fg cursor-pointer"
            >
              {hidden ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
            </button>
          </InputGroupAddon>
        </InputGroup>
      </Field>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <LoaderIcon className="size-4 animate-spin" /> : t.submit}
      </Button>

      <p className="text-[12px] text-muted text-center">{t.freeNote}</p>

      <p className="text-[13px] text-secondary text-center">
        {t.haveAccount}{" "}
        <Link href="/login" className="text-accent hover:underline">{t.toLogin}</Link>
      </p>
    </form>
  );
}
