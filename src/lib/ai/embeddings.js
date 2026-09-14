import OpenAI from "openai";

/**
 * Built on first use, not at import time.
 *
 * The OpenAI SDK throws in its constructor when the key is missing, and this
 * module is reachable from server components — so a build without the key set
 * failed while collecting page data rather than at the point of use.
 */
let _client;

function client() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function generateEmbedding(text) {
  const response = await client().embeddings.create({
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