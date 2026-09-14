"use client"

import * as React from "react"
import { format } from "date-fns"
import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

export function DatePicker({ locale, lang, value, onChange, placeholder = "Pick a date", disabled, className }) {
    const [open, setOpen] = React.useState(false)
    const date = value ? (value instanceof Date ? value : new Date(value)) : undefined
    const isValid = date && !isNaN(date.getTime())

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    data-empty={!isValid}
                    disabled={disabled}
                    className={"w-full justify-between text-left font-normal " + (className ?? "")}
                >
                    {isValid ? format(date, "PPP") : <span>{placeholder}</span>}
                    <ChevronDownIcon />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    locale={locale}
                    lang={lang}
                    mode="single"
                    selected={isValid ? date : undefined}
                    onSelect={(d) => {
                        onChange?.(d ? format(d, "yyyy-MM-dd") : "")
                        if (d) setOpen(false)
                    }}
                    defaultMonth={isValid ? date : undefined}
                />
            </PopoverContent>
        </Popover>
    )
}

export { DatePicker as DatePickerDemo }
