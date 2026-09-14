import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export function entryToText(entry) {
  const parts = [entry.title, entry.content];

  if (entry.keywords) {
    parts.push(`Keywords: ${entry.keywords}`);
  }

  // Type-specific context
  parts.push(`Type: ${entry.type}`);

  if (entry.metadata) {
    const m = entry.metadata;

    // Product
    if (m.price) parts.push(`Price: ${m.price}`);
    if (m.currency) parts.push(`Currency: ${m.currency}`)

    // FAQ
    if (m.category) parts.push(`Category: ${m.category}`);
    if (m.related_questions?.length) parts.push(`Related: ${m.related_questions.join(", ")}`);

    // Flow
    if (m.steps?.length) parts.push(`Steps: ${m.steps.join(", ")}`);

    // Template
    if (m.language) parts.push(`Language: ${m.language}`);

    // Policy
    if (m.valid_until) parts.push(`Valid until: ${m.valid_until}`);
  }

  return parts.filter(Boolean).join(" — ");
}