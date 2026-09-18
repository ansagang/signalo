"use client";

import { useTransition, useState } from "react";
import { loginSchema } from "@/lib/schemas";
import { login } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { showError } from "@/lib/toast";
import { EyeIcon, EyeOffIcon, LoaderIcon } from "lucide-react";
import Link from "next/link";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useRouter } from "next/navigation";

export default function LoginForm({ language }) {

    const router = useRouter();
    const t = language.app.pages.login;
    const [isPending, startTransition] = useTransition();
    const [formData, setFormData] = useState({ email: "", password: "" })
    const [passwordType, setPasswordType] = useState(true)

    function handleChange(e) {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    function handleSubmit(e) {
        e.preventDefault();

        const schema = loginSchema(language.app.res);
        const result = schema.safeParse(formData);

        if (!result.success) {
            for (const issue of result.error.issues) {
                showError(issue.message)
            }
            return;
        }

        startTransition(async () => {
            const res = await login(formData, language.app.res);
            if (res?.success === false) {
                showError(res.message)
            } else {
                router.push("/dashboard")
            }
        });
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <Field label={t.fields.email.label}>
                <Input
                    variant="filled"
                    id="email"
                    name="email"
                    type="email"
                    placeholder={t.fields.email.placeholder}
                    autoComplete="email"
                    disabled={isPending}
                    onChange={handleChange}
                    value={formData.email}
                />
            </Field>
            <Field label={t.fields.password.label}>
                <InputGroup variant="filled">
                    <InputGroupInput
                        id="password"
                        name="password"
                        type={passwordType ? "password" : "text"}
                        placeholder={t.fields.password.placeholder}
                        autoComplete="current-password"
                        disabled={isPending}
                        onChange={handleChange}
                        value={formData.password}
                    />
                    <InputGroupAddon align="inline-end" className="text-secondary cursor-pointer">
                        {
                            passwordType ?
                                <EyeIcon onClick={(e) => {
                                    e.stopPropagation()
                                    setPasswordType(false)
                                }} />
                                :
                                <EyeOffIcon onClick={(e) => {
                                    e.stopPropagation()
                                    setPasswordType(true)
                                }} />
                        }
                    </InputGroupAddon>
                </InputGroup>
            </Field>
            <Button size="lg" className='w-full mb-5' type="submit" disabled={isPending || !formData.email || !formData.password}>
                {isPending ? (
                    <LoaderIcon className="animate-spin" />
                ) : (
                    t.submit
                )}
            </Button>
            <p className="text-[13px] text-secondary text-center">
                <Link href="/forgot-password" className="text-center block text-secondary">
                    {t.forgotPassword}
                </Link>
            </p>
            <p className="text-[13px] text-secondary text-center">
                {t.noAccount}{" "}
                <Link href="/register" className="text-accent hover:underline">{t.toRegister}</Link>
            </p>
        </form>
    );
}
