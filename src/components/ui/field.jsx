import * as React from "react"
import { cn } from "@/lib/utils"
import { Label } from "./label"

function Field({ className, label, error, children, ...props }) {
  return (
    <div className={cn("flex relative flex-col gap-2", className)} {...props}>
      {label && <Label>{label}</Label>}
      {children}
      {error && (
        <p className="text-xs text-red-400 font-light absolute -bottom-5">{error}</p>
      )}
    </div>
  )
}

export { Field }