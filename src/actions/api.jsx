"use server"

import { entryToText, generateEmbedding } from "@/lib/ai/embeddings";
import { readPage } from "@/lib/knowledge/ingest";
import { createClient } from "@/lib/supabase/server"

export async function getPersona(id) {
    if (!id) {
        return null
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
        .from("personas")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle()
    if (error) {
        throw error
    }

    return data
}

export async function getPersonas() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // RLS is bypassed by the service-role key, so scope by hand.
    const { data, error } = await supabase
        .from("personas")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })

    if (error) {
        throw error
    }

    return data
}

export async function createPersona(persona) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return {
        success: false,
        message: "Unauthorized"
    };
    const { data, error } = await supabase
        .from("personas")
        // The server client authenticates with the service role, so the
        // user_id column default (auth.uid()) resolves to NULL and the
        // NOT NULL insert fails. Set it explicitly.
        .insert({ ...persona, user_id: user.id })
        .select()
        .single();

    if (error) throw error
    return data;
}

export async function updatePersona(id, updates) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return {
        success: false,
        message: "Unauthorized"
    };
    const { data, error } = await supabase
        .from("personas")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deletePersona(id) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
        .from("personas")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) throw error;
}

export async function getKnowledgeEntries(filters) {
    const { types, search, active, persona_id } = filters || {};

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
        .from("knowledge_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("priority", { ascending: false })

    if (search) {
        query = query.or(
            `title.ilike.%${search}%,content.ilike.%${search}%,keywords.ilike.%${search}%`
        );
    }

    if (types) {
        query = query.in("type", types);
    }

    if (active) {
        query = query.eq("active", active);
    }

    if (persona_id === "global") {
        query = query.is("persona_id", null);
    } else if (persona_id) {
        query = query.eq("persona_id", persona_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
}

export async function createKnowledgeEntry(entry) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return {
        success: false,
        message: "Unauthorized"
    };
    const embedding = await generateEmbedding(entryToText(entry));
    const { data, error } = await supabase
        .from("knowledge_entries")
        .insert({ ...entry, user_id: user.id, embedding })
        .select()
        .single();

    if (error) throw error
    return data;
}

export async function updateKnowledgeEntry(id, updates) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return {
        success: false,
        message: "Unauthorized"
    };

    const { data: existing, error: fetchError } = await supabase
        .from("knowledge_entries")
        .select("*")
        .eq("id", id)
        .single();
    if (fetchError) throw fetchError;

    const merged = { ...existing, ...updates };
    const embedding = await generateEmbedding(entryToText(merged));

    const { data, error } = await supabase
        .from("knowledge_entries")
        .update({ ...updates, updated_at: new Date().toISOString(), embedding })
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteKnowledgeEntry(id) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
        .from("knowledge_entries")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) throw error;
}

/**
 * Import a page into the knowledge base.
 *
 * One entry per readable chunk, each embedded so retrieval can find it. The
 * page is fetched here rather than in the browser: a seller's site may not
 * allow cross-origin reads, and the URL should never be trusted from a client.
 */
export async function importKnowledgeFromUrl(url, { personaId = null } = {}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, message: "Unauthorized" };

    let page;
    try {
        page = await readPage(url);
    } catch (err) {
        return { success: false, message: err?.message || "Could not read that page." };
    }

    // A page that produced a hundred fragments is a sitemap, not a policy.
    const chunks = page.chunks.slice(0, 40);
    const rows = [];

    for (const [index, content] of chunks.entries()) {
        const title = chunks.length > 1
            ? `${page.title} (${index + 1}/${chunks.length})`
            : page.title;
        const entry = {
            type: "faq",
            title,
            content,
            keywords: "",
            priority: 5,
            metadata: { source: page.url, imported: true },
        };
        rows.push({
            ...entry,
            user_id: user.id,
            persona_id: personaId,
            active: true,
            embedding: await generateEmbedding(entryToText(entry)),
        });
    }

    const { error } = await supabase.from("knowledge_entries").insert(rows);
    if (error) return { success: false, message: error.message };

    return { success: true, imported: rows.length, title: page.title, url: page.url };
}
