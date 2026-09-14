"use client"

import Grainient from "@/components/ui/grainient"
import { knowledgeTypes } from "@/config/knowledgeTypes"
import { useKnowledgeEntries } from "@/hooks/use-knowledge"
import { useSyncSearchParam } from "@/hooks/use-sync-search-param"
import { cn } from "@/lib/utils"
import { useState } from "react"

function KnowledgeTypeCard({ data, language, onToggle, active }) {
    const { type, icon: Icon, color, count } = data

    return (
        <div key={type} onClick={() => onToggle(type)} className={cn(
            "p-3 overflow-hidden relative cursor-pointer rounded-md border border-secondary-transparent2 bg-secondary-transparent2 hover:border-secondary-transparent",
            color,
            active && "bg-secondary-transparent"
        )}>
            {/* <Grainient /> */}
            <hr className={
                cn("absolute h-1 border-t-2 w-full top-0 left-0 hidden", color, active && "block")
            } />
            <span className="flex gap-2 items-center mb-2">
                <Icon size={16} />
                <div className="capital">
                    <p>{language.app.pages.knowledgeBase.types[type].plural}</p>
                </div>
            </span>
            <div className="title">
                <h3>{count}</h3>
            </div>
        </div>
    )
}

export default function KnowledgeTypes({ language, searchParams }) {

    const { data: entries } = useKnowledgeEntries({})
    const initialTypes = searchParams?.types ? searchParams?.types?.split(',') : []

    const [typesQ, setTypesQ] = useState(initialTypes)

    useSyncSearchParam('types', typesQ.join(','))

    function updateType(type) {
        setTypesQ((prev) =>
            prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
        )
    }

    return (
        <div className="grid grid-cols-2 tablet:grid-cols-4 gap-3 mt-8 mb-4">
            {knowledgeTypes.map((item, key) => {
                const count = entries?.filter((e) => e.type === item.type).length || 0
                return (
                    <KnowledgeTypeCard
                        key={key}
                        active={typesQ.includes(item.type)}
                        onToggle={updateType}
                        language={language}
                        data={{ ...item, count }}
                    />
                )
            })}
        </div>
    )
}
