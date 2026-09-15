import { generateEmbedding } from "./embeddings";

/**
 * Everything the bot is allowed to speak from, for one customer message.
 *
 * Three sources, all vector-searched against the same embedding:
 *   - products          — physical goods, with stock
 *   - services          — bookable work, with duration and price
 *   - knowledge_entries — FAQs, policies, flows, reply templates
 *
 * Anything not returned here does not exist as far as the bot is concerned.
 */
export async function retrieveContext({
  supabase,
  userId,
  personaId = null,
  query,
  limit = 8,
}) {
  if (!query?.trim()) return { entries: [], products: [], services: [] };

  const embedding = await generateEmbedding(query);

  const [kb, products, services] = await Promise.all([
    supabase.rpc("match_knowledge_base", {
      query_embedding: embedding,
      match_count: limit,
      filter_user_id: userId,
      filter_persona_id: personaId,
    }),
    supabase.rpc("match_products", {
      query_embedding: embedding,
      match_count: 6,
      filter_user_id: userId,
    }),
    supabase.rpc("match_services", {
      query_embedding: embedding,
      match_count: 6,
      filter_user_id: userId,
    }),
  ]);

  if (kb.error) throw kb.error;
  if (products.error) throw products.error;
  if (services.error) throw services.error;

  return {
    entries: kb.data || [],
    products: products.data || [],
    services: services.data || [],
  };
}

const TYPE_LABELS = {
  faq: "FAQ",
  flow: "FLOW",
  policy: "POLICY",
  template: "REPLY TEMPLATE",
};

function money(price, currency) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return "price on request";
  return `${n.toLocaleString("en-US")} ${String(currency || "kzt").toUpperCase()}`;
}

function formatMetadata(metadata) {
  if (!metadata) return "";
  const m = metadata;
  const bits = [];

  if (m.category) bits.push(`category: ${m.category}`);
  if (m.valid_until) bits.push(`valid until: ${m.valid_until}`);
  if (m.language) bits.push(`language: ${m.language}`);
  if (Array.isArray(m.steps) && m.steps.length) bits.push(`steps: ${m.steps.join(" → ")}`);
  if (Array.isArray(m.related_questions) && m.related_questions.length) {
    bits.push(`related: ${m.related_questions.join("; ")}`);
  }

  return bits.length ? `\n  (${bits.join(" | ")})` : "";
}

/**
 * Render the retrieved rows as the catalogue block of the system prompt.
 * Ids are included so the model can name them back through the tools.
 */
export function formatContext({ entries, products, services }) {
  const sections = [];

  if (products?.length) {
    sections.push(
      "### Products you can sell\n" +
        products
          .map((p) => {
            const stock = !p.track_stock
              ? "always available"
              : p.stock > 0
                ? `${p.stock} in stock`
                : "OUT OF STOCK — do not sell, offer an alternative";
            return `- [product_id:${p.id}] ${p.name} — ${money(p.price, p.currency)} · ${stock}${
              p.image_url ? " · has a photo" : ""
            }${p.description ? `\n  ${p.description}` : ""}`;
          })
          .join("\n"),
    );
  }

  if (services?.length) {
    sections.push(
      "### Services customers can book\n" +
        services
          .map((s) => {
            // Tell the model what KIND of booking this is, so it knows whether
            // to ask how many people before checking times.
            const party =
              s.booking_mode === "appointment"
                ? "one person"
                : s.max_party > 1
                  ? `${s.min_party}\u2013${s.max_party} people — ASK how many before checking times`
                  : "one person";
            const kind =
              s.booking_mode === "seating"
                ? "reserved for a group"
                : s.booking_mode === "class"
                  ? "shared session, seats sold individually"
                  : "one-to-one appointment";

            return `- [service_id:${s.id}] ${s.name} — ${money(s.price, s.currency)} · ${s.duration_min} min${
              s.category ? ` · ${s.category}` : ""
            } · ${kind} · ${party}${s.masters ? ` · available with ${s.masters}` : ""}${
              s.image_url ? " · has a photo" : ""
            }${s.description ? `\n  ${s.description}` : ""}`;
          })
          .join("\n"),
    );
  }

  if (entries?.length) {
    sections.push(
      "### Reference\n" +
        entries
          .map((e) => {
            const label = TYPE_LABELS[e.type] || e.type?.toUpperCase() || "ENTRY";
            return `- [${label}] ${e.title}\n  ${e.content}${formatMetadata(e.metadata)}`;
          })
          .join("\n"),
    );
  }

  if (!sections.length) {
    return "Nothing in the catalogue matched this question.";
  }

  return sections.join("\n\n");
}
