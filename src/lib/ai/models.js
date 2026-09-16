/**
 * Model registry.
 *
 * `key` is what gets stored on personas.model; everything else is resolved
 * here so swapping a model never means touching the database.
 *
 * Opus and GPT-4o were removed deliberately. Measured on real conversations,
 * an average reply costs $0.101 on Opus against $0.020 on Sonnet — five times
 * the price for the same booking, which no subscription a small business would
 * pay can carry. Sonnet handles the tool loop just as well.
 */
export const MODELS = {
  "claude-sonnet": {
    key: "claude-sonnet",
    provider: "anthropic",
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    // Good judgement on bookings and orders at a price that leaves a margin.
    blurb: "Balanced — handles booking, ordering and awkward questions.",
    effort: "low",
  },
  "claude-haiku": {
    key: "claude-haiku",
    provider: "anthropic",
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    blurb: "Fastest and cheapest — best for answering questions.",
    effort: null, // Haiku 4.5 does not accept output_config.effort
  },
};

export const DEFAULT_MODEL = "claude-sonnet";

/** Retired keys still sitting on old personas resolve to the new default. */
const RETIRED = { claude: "claude-sonnet", gpt: "claude-sonnet", "claude-opus": "claude-sonnet" };

export function resolveModel(key) {
  return MODELS[key] || MODELS[RETIRED[key]] || MODELS[DEFAULT_MODEL];
}

export const MODEL_KEYS = Object.keys(MODELS);
