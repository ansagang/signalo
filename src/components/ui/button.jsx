"use client"

import * as React from "react"
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils"

import { useRouter } from "next/navigation";

const buttonVariants = cva(
  "cursor-pointer group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-button font-medium whitespace-nowrap transition-all outline-none select-none active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:transition-all [&_svg]:duration-300 relative overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-fg text-primary hover:bg-fg",
        outline:
          "border border-secondary-transparent text-secondary bg-transparent hover:text-fg",
        ghost:
          "text-muted hover:text-fg hover:bg-secondary-transparent2",
        destructive:
          "bg-red-500/10 text-red-400 hover:bg-red-500/20",
        link: "text-fg underline-offset-4 hover:underline",
        accent:
          "bg-accent text-[var(--color-primary)] hover:opacity-90 tracking-widest uppercase",
      },
      size: {
        default: "h-9 px-4 text-sm",
        sm: "h-9 px-4 text-xs",
        lg: "h-11 px-8",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  to = null,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button"
  const router = useRouter()

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      onClick={() => to && router.push(to)}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props} />
  );
}

export { Button, buttonVariants }
