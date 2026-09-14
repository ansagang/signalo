"use server";

import { createClient } from "@/lib/supabase/server";
import supabaseErrors from "@/lib/supabase/errors";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { refresh } from "next/cache";

export async function getUser() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
        if (!error) {
            return {
                data: data
            }
        } else {
            return {
                data: null
            }
        }
    } else {
        return {
            data: null
        }
    }
}

export async function updateUser({ user, data }, t) {
    const supabase = await createClient()
    if (user) {
        const { error } = await supabase.from("profiles").update(data).eq("email", user.email)
        if (!error) {
            return {
                success: true
            }
        } else {
            const res = supabaseErrors({ error, t })
            return res
        }
    } else {
        return {
            success: false,
            message: t.accountRequired
        }
    }
}

export async function login({ email, password }, t) {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
        return supabaseErrors({ error, t })
    }
}

export async function logOut(t) {
    const supabase = await createClient()
    const {error} = await supabase.auth.signOut();
    if (error) {
        return supabaseErrors({ error, t })
    } else {
        redirect("/login")
    }
}

export async function setCookie({ name, value, options }) {
    const cookiesList = await cookies();
    cookiesList.set({name, value, httpOnly: false, path: '/'})
}

export async function getCookie(name) {
    const cookiesList = await cookies();
    const cookie = cookiesList.get(name);
    return cookie ? cookie.value : null;
}

export async function updateUserLanguage({ user, lang }, t) {
    const supabase = await createClient()
    if (user) {
        const { error } = await supabase.from("profiles").update({lang: lang}).eq("email", user.email)
        if (!error) {
            refresh()
            return {
                success: true
            }
        } else {
            const res = supabaseErrors({ error, t })
            return res
        }
    } else {
        return {
            success: false,
            message: t.accountRequired
        }
    }
}