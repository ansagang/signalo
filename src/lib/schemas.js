import { z } from "zod";

export function loginSchema(t) {
  return z.object({
    email: z
      .string()
      .min(1, { error: t.emailRequired })
      .email({ error: t.emailInvalid }),
    password: z
      .string()
      .min(1, { error: t.passwordRequired })
      .min(6, { error: t.passwordMin }),
  });
}

export function personaSchema(t) {
  return z.object({
    name: z
      .string()
      .min(1, { error: t.nameRequired })
      .min(2, { error: t.nameMin }),
    greeting: z
      .string()
      .min(1, { error: t.greetingRequired }),
    // Matches the personas.prompt column — validating `system_prompt` here
    // meant every save failed the required check.
    prompt: z
      .string()
      .min(1, { error: t.systemPromptRequired })
      .min(10, { error: t.systemPromptMin }),
  });
}

export function entrySchema(t) {
  return z.object({
    type: z.string().min(1, { error: t.typeRequired }),
    title: z
      .string()
      .min(1, { error: t.titleRequired })
      .min(6, { error: t.titleMin }),
    content: z
      .string()
      .min(1, { error: t.contentRequired })
      .min(6, { error: t.contentMin }),
    keywords: z
      .string()
      .min(1, { error: t.keywordsRequired })
      .min(6, { error: t.keywordsMin }),
    priority: z.coerce.number().min(1, {error: t.priorityMin}).max(10, {message: t.priorityMax}),
    active: z.boolean()
  });
}
