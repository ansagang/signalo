import { GitBranch, HelpCircle, MessageSquare, Shield } from "lucide-react";

/**
 * The knowledge base is reference material only.
 *
 * Products and services used to live here as text; they are now real rows in
 * `products` and `services` with stock and bookable durations, managed under
 * Catalogue. What stays here is the prose the bot quotes around them.
 */
export const knowledgeTypes = [
  {
    type: "faq",
    icon: HelpCircle,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    border: "border-purple-500",
  },
  {
    type: "flow",
    icon: GitBranch,
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning",
  },
  {
    type: "policy",
    icon: Shield,
    color: "text-error",
    bg: "bg-error/10",
    border: "border-error",
  },
  {
    type: "template",
    icon: MessageSquare,
    color: "text-muted",
    bg: "bg-muted/10",
    border: "border-muted",
  },
];
