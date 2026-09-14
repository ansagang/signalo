"use client";

import { cn } from "@/lib/utils";
import { LoaderIcon } from "lucide-react";

/**
 * Shared page furniture.
 *
 * Every dashboard screen was inventing its own header, spacing, empty state
 * and toolbar, so nothing lined up and each page had to be relearned. These
 * are the pieces they all use now.
 */

export function PageHeader({ title, description, children }) {
  return (
    <header className="flex items-start gap-4 flex-wrap mb-7">
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-fg leading-tight">{title}</h1>
        {description && (
          <p className="text-[13px] text-secondary mt-1 leading-relaxed max-w-[60ch]">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </header>
  );
}

/** A labelled block with an explanation of what the setting actually does. */
export function Section({ title, description, icon: Icon, children, actions, className }) {
  return (
    <section className={cn("mb-8", className)}>
      <div className="flex items-start gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-fg inline-flex items-center gap-2">
            {Icon && <Icon className="size-3.5 text-muted" />}
            {title}
          </h2>
          {description && (
            <p className="text-[12px] text-muted mt-1 leading-relaxed max-w-[70ch]">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Panel({ className, children, padded = false }) {
  return (
    <div
      className={cn(
        "border border-border rounded-module bg-card overflow-hidden",
        padded && "p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="border border-dashed border-border rounded-module px-6 py-14 text-center">
      {Icon && <Icon className="size-6 text-muted mx-auto mb-3" />}
      <p className="text-[14px] text-fg mb-1.5">{title}</p>
      {description && (
        <p className="text-[12px] text-muted max-w-[46ch] mx-auto leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Loading({ className }) {
  return (
    <div className={cn("flex justify-center py-16", className)}>
      <LoaderIcon className="animate-spin text-muted size-5" />
    </div>
  );
}

/** Segmented control — the tab pattern used across Catalogue and elsewhere. */
export function Segmented({ value, onChange, options, className }) {
  return (
    <div className={cn("flex gap-1 p-1 rounded-button bg-secondary-transparent2 shrink-0", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap",
            value === o.value ? "bg-fg text-primary" : "text-secondary hover:text-fg",
          )}
        >
          {o.icon && <o.icon className="size-3.5" />}
          {o.label}
          {o.count !== undefined && (
            <span className={cn("text-[11px] tabular-nums", value === o.value ? "text-primary/60" : "text-muted")}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className, icon: Icon }) {
  return (
    <div className={cn("relative", className)}>
      {Icon && <Icon className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full bg-secondary-transparent2 border border-secondary-transparent rounded-button pr-3 py-2 text-[13px] text-fg placeholder:text-muted outline-none focus:border-secondary/50 transition-colors",
          Icon ? "pl-9" : "pl-3",
        )}
      />
    </div>
  );
}

/** Checkbox with a label and the explanation of what turning it on means. */
export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={cn("flex items-start gap-2.5", disabled ? "opacity-50" : "cursor-pointer")}>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 mt-0.5 accent-[var(--color-accent)] cursor-pointer disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span className="block text-[13px] text-fg leading-tight">{label}</span>
        {hint && <span className="block text-[11px] text-muted mt-0.5 leading-relaxed">{hint}</span>}
      </span>
    </label>
  );
}

export function Hint({ children, className }) {
  return (
    <p className={cn("text-[11px] text-muted leading-relaxed", className)}>{children}</p>
  );
}
