/**
 * Model registry.
 *
 * `key` is what gets stored on personas.model; everything else is resolved
 * here so swapping a model never means touching the database.
 */
export const MODELS = {
  claude: {
    key: "claude",
    provider: "anthropic",
    id: "claude-opus-5",
    label: "Claude Opus 5",
    // Opus 5 thinks by default; effort is the cost/quality dial.
    effort: "low",
  },
  "claude-sonnet": {
    key: "claude-sonnet",
    provider: "anthropic",
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    effort: "low",
  },
  "claude-haiku": {
    key: "claude-haiku",
    provider: "anthropic",
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    effort: null, // Haiku 4.5 does not accept output_config.effort
  },
  gpt: {
    key: "gpt",
    provider: "openai",
    id: "gpt-4o",
    label: "GPT-4o",
    effort: null,
  },
};

export const DEFAULT_MODEL = "claude";

export function resolveModel(key) {
  return MODELS[key] || MODELS[DEFAULT_MODEL];
}

export const MODEL_KEYS = Object.keys(MODELS);
