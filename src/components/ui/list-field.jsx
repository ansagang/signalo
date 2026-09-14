"use client"

import { useState } from "react"
import { Field } from "./field"
import { Input } from "./input"
import { Button } from "./button"
import { Plus, X } from "lucide-react"

export default function ListField({ label, placeholder, items, onChange, isPending, numbered }) {
    const [draft, setDraft] = useState("")

    function add() {
        const value = draft.trim()
        if (!value) return
        onChange([...(items ?? []), value])
        setDraft("")
    }

    function remove(index) {
        onChange(items.filter((_, i) => i !== index))
    }

    function update(index, value) {
        onChange(items.map((item, i) => (i === index ? value : item)))
    }

    return (
        <Field label={label}>
            <div className="flex flex-col gap-2">
                {items?.map((item, i) => (
                    <div key={i} className="flex gap-2 items-center">
                        {numbered && (
                            <span className="text-xs text-secondary w-5 text-center">{i + 1}.</span>
                        )}
                        <Input
                            type="text"
                            value={item}
                            disabled={isPending}
                            onChange={(e) => update(i, e.target.value)}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={isPending}
                            onClick={() => remove(i)}
                        >
                            <X />
                        </Button>
                    </div>
                ))}
                <div className="flex gap-2">
                    <Input
                        type="text"
                        placeholder={placeholder}
                        value={draft}
                        disabled={isPending}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault()
                                add()
                            }
                        }}
                    />
                    <Button type="button" size="icon" variant="outline" disabled={isPending || !draft.trim()} onClick={add}>
                        <Plus />
                    </Button>
                </div>
            </div>
        </Field>
    )
}