import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({
  className,
  ...props
}) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-fixed min-h-16 max-h-30 w-full rounded-button border border-secondary-transparent bg-secondary-transparent2 text-fg text-input px-4 py-2.5 transition-colors outline-none placeholder:text-muted focus:border-secondary/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props} />
  );
}

export { Textarea }
