import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  Box,
  HelpCircle,
  GitBranch,
  Shield,
  MessageSquare,
  Wrench,
} from "lucide-react";
import { useCallback } from "react";

export const knowledgeTypesStyles = {
  faq: { icon: HelpCircle, color: "text-purple-500", bg: "bg-purple-500/10" },
  flow: { icon: GitBranch, color: "text-warning", bg: "bg-warning/10" },
  policy: { icon: Shield, color: "text-error", bg: "bg-error/10" },
  template: { icon: MessageSquare, color: "text-muted", bg: "bg-muted/10" },
  // Catalogue rows render with their own icons, but keep a fallback so a
  // stale type never crashes a table cell.
  product: { icon: Box, color: "text-info", bg: "bg-info/10" },
  service: { icon: Wrench, color: "text-success", bg: "bg-success/10" },
};

export function getTypeStyle(type) {
  return knowledgeTypesStyles[type] || knowledgeTypesStyles.faq;
}

export function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[\/\s]+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function unslugify(str) {
  return str.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isDev() {
  return process.env && process.env.NODE_ENV === "development";
}

export function createdAtDecode(createdAt) {
  const date = new Date(createdAt).toLocaleDateString();
  const time = new Date(createdAt).toLocaleTimeString();

  return {
    time,
    date,
  };
}

export function formatDate(inputDate, language) {
  const parts = inputDate.split(".");

  const dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);

  const monthNames = language.app.global.months;
  const monthIndex = dateObj.getMonth();
  const monthName = monthNames[monthIndex];

  const day = dateObj.getDate();
  const year = dateObj.getFullYear();

  const formattedDate = `${monthName} ${day}, ${year}`;

  return formattedDate;
}

export function yearsSince(sinceYear) {
  const currentYear = new Date().getFullYear();
  return currentYear - sinceYear;
}

export function rateLimit(ip, limit = 5, cache) {
  const count = (cache.get(ip) ?? 0) + 1;
  cache.set(ip, count);
  return count > limit;
}

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}