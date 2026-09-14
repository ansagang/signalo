"use client"

import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const inputVariants = cva(
  "flex w-full h-13 py-3 px-4 text-input text-fg [color-scheme:dark] placeholder:text-muted transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-secondary-transparent2 rounded-button h-10 border border-secondary-transparent focus:border-secondary/50",
        filled: "rounded-button border border-secondary-transparent2 bg-secondary-transparent2 focus:border-secondary/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Input({ className, type, variant, ...props }) {
  return (
    <input
      type={type}
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
