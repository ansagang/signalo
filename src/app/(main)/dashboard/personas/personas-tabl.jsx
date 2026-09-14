"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select"
import { usePersonas, useCreatePersona, useUpdatePersona, useDeletePersona } from "@/hooks/use-personas"
import { personaSchema } from "@/lib/schemas"
import { showError, showSuccess } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Check, ChevronDown, ChevronLeft, ChevronRight, Eye, LoaderIcon, MessageSquare, Plus, Power, Search, Sparkles, Trash, X } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import ChatPanel from "@/components/chat/chat-panel"

const TONES = ["friendly", "professional", "persuasive", "technical", "custom"]
const MODELS = ["claude", "gpt"]
const LANGUAGES_LIST = ["auto", "kk", "ru", "en"]
const FALLBACKS = ["escalate", "retry", "apologize"]
const EMOJIS = ["😊", "💼", "🎯", "🔧", "🤖", "✨", "🌟", "💬", "🎨", "🚀"]

const TONE_STYLES = {
    friendly: { colorHex: "#00d26a", colorBg: "bg-success/10", color: "text-success" },
    professional: { colorHex: "#0090ff", colorBg: "bg-info/10", color: "text-info" },
    persuasive: { colorHex: "#ff6a00", colorBg: "bg-warning/10", color: "text-warning" },
    technical: { colorHex: "#7c3aed", colorBg: "bg-purple-500/10", color: "text-purple-500" },
    custom: { colorHex: "#ededed", colorBg: "bg-white/5", color: "text-fg" },
}


const PRESETS = [
    { tone: "friendly", emoji: "😊", description: "Warm, casual tone. Uses emoji. Great for retail & hospitality." },
    { tone: "professional", emoji: "💼", description: "Formal, precise. Perfect for finance, legal, B2B." },
    { tone: "persuasive", emoji: "🎯", description: "Persuasive, consultative. E-commerce & SaaS." },
    { tone: "technical", emoji: "🔧", description: "Patient, methodical. Step-by-step troubleshooting." },
]

const emptyPersona = {
    name: "",
    icon: "🤖",
    tone: "friendly",
    greeting: "",
    prompt: "",
    model: "claude",
    temperature: 0.7,
    is_active: false,
    max_tokens: 1024,
    fallback_behavior: "escalate",
    language: "auto",
    blocked_topics: "",
    escalation_triggers: "",
}

function Section({ title, desc, children }) {
    return (
        <div className="border-b border-border pb-6 last:border-b-0 last:pb-0">
            <div className="mb-4">
                <h3 className="text-[14px] font-semibold text-fg">{title}</h3>
                {desc && <p className="text-[12px] text-muted mt-1 leading-relaxed">{desc}</p>}
            </div>
            <div className="space-y-4">{children}</div>
        </div>
    )
}

export default function PersonsManager({ language }) {
    const p = language.app.pages.personas
    const t = p.fields
    const m = p.modals
    const res = language.app.res

    const { data: personas, isLoading } = usePersonas()
    const createPersona = useCreatePersona()
    const updatePersona = useUpdatePersona()
    const deletePersona = useDeletePersona()

    const [selectedId, setSelectedId] = useState(null)
    const [editorTab, setEditorTab] = useState("config")
    const [showNewModal, setShowNewModal] = useState(false)
    const [showPreview, setShowPreview] = useState(true)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
    const [showAgentPicker, setShowAgentPicker] = useState(false)
    const [pickerSearch, setPickerSearch] = useState("")
    const [dirtyMap, setDirtyMap] = useState({})
    const [localEdits, setLocalEdits] = useState({})
    const [isPending, startTransition] = useTransition()
    const chatEndRef = useRef(null)
    const pickerRef = useRef(null)

    // Auto-select first persona when data loads
    useEffect(() => {
        if (personas?.length && !selectedId) {
            setSelectedId(personas[0].id)
        }
    }, [personas])

    const dbPersona = personas?.find((a) => a.id === selectedId)
    const selected = dbPersona ? { ...dbPersona, ...(localEdits[selectedId] || {}) } : null
    const isDirty = dirtyMap[selectedId] || false
    const currentToneStyle = TONE_STYLES[selected?.tone] || TONE_STYLES.custom

    // Close picker on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) {
                setShowAgentPicker(false)
            }
        }
        if (showAgentPicker) document.addEventListener("mousedown", handleClick)
        return () => document.removeEventListener("mousedown", handleClick)
    }, [showAgentPicker])

    useEffect(() => {
        if (selected) setEditorTab("config")
    }, [selectedId])

    const update = (key, value) => {
        setLocalEdits((prev) => ({
            ...prev,
            [selectedId]: { ...(prev[selectedId] || {}), [key]: value }
        }))
        setDirtyMap((prev) => ({ ...prev, [selectedId]: true }))
    }

    const handleSave = () => {
        if (!selected || !isDirty) return

        const edits = localEdits[selectedId]
        if (!edits) return

        const schema = personaSchema(res)
        const merged = { ...dbPersona, ...edits }
        const result = schema.safeParse(merged)

        if (!result.success) {
            for (const issue of result.error.issues) {
                showError(issue.message)
            }
            return
        }

        startTransition(() => {
            updatePersona.mutate(
                { id: selectedId, updates: edits },
                {
                    onSuccess: (data) => {
                        if (data?.success === false) {
                            showError(data.message)
                        } else {
                            setDirtyMap((prev) => ({ ...prev, [selectedId]: false }))
                            setLocalEdits((prev) => {
                                const next = { ...prev }
                                delete next[selectedId]
                                return next
                            })
                            showSuccess(res.personaUpdated)
                        }
                    },
                    onError: () => {
                        showError(res.personaUpdateError)
                    },
                }
            )
        })
    }

    const handleCreateAgent = (presetTone) => {
        const preset = PRESETS.find((x) => x.tone === presetTone)
        const newAgent = presetTone
            ? {
                ...emptyPersona,
                preset_id: presetTone,
                tone: presetTone,
                icon: preset?.emoji || emptyPersona.icon,
                name: `${p.tones[presetTone]} (new)`,
            }
            : { ...emptyPersona, preset_id: "custom", name: "New Agent" }

        startTransition(() => {
            createPersona.mutate(newAgent, {
                onSuccess: (data) => {
                    if (data?.success === false) {
                        showError(data.message)
                    } else {
                        setSelectedId(data.id)
                        setShowNewModal(false)
                        showSuccess(res.personaCreated)
                    }
                },
                onError: () => {
                    showError(res.personaCreateError)
                },
            })
        })
    }

    const handleDelete = (id) => {
        startTransition(() => {
            deletePersona.mutate(id, {
                onSuccess: () => {
                    if (selectedId === id) {
                        const remaining = personas.filter((a) => a.id !== id)
                        setSelectedId(remaining.length ? remaining[0].id : null)
                    }
                    setShowDeleteConfirm(null)
                    showSuccess(res.personaDeleted)
                },
                onError: () => {
                    showError(res.personaDeleteError)
                },
            })
        })
    }

    const handleActivate = (id) => {
        startTransition(() => {
            // Deactivate all others, activate this one
            const others = personas.filter((a) => a.is_active && a.id !== id)
            for (const other of others) {
                updatePersona.mutate({ id: other.id, updates: { is_active: false } })
            }
            updatePersona.mutate(
                { id, updates: { is_active: true } },
                {
                    onSuccess: () => {
                        showSuccess(res.personaUpdated)
                    },
                }
            )
        })
    }

    const switchAgent = (id) => {
        setSelectedId(id)
        setShowAgentPicker(false)
        setPickerSearch("")
    }

    const filteredPickerAgents = personas?.filter((a) =>
        a.name.toLowerCase().includes(pickerSearch.toLowerCase())
    ) || []

    const promptLength = (selected?.prompt || "").length
    const maxPrompt = 2000
    const promptPct = Math.min((promptLength / maxPrompt) * 100, 100)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <LoaderIcon className="animate-spin text-muted" size={24} />
            </div>
        )
    }

    if (!personas?.length) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <p className="text-muted text-sm">{p.entries.other.replace("{count}", "0")}</p>
                <Button onClick={() => setShowNewModal(true)}><Plus />{m.add}</Button>
                <NewAgentModal
                    open={showNewModal}
                    onClose={() => setShowNewModal(false)}
                    onCreate={handleCreateAgent}
                    language={language}
                    isPending={isPending}
                />
            </div>
        )
    }

    if (!selected) return null

    return (
        <div className="flex flex-col" style={{ height: "calc(100vh - 160px)" }}>

            {/* Top Bar */}
            <div className="flex items-center justify-between py-4 border-b border-border">

                {/* Left: Agent Switcher */}
                <div className="flex items-center gap-4 min-w-0">
                    <div>
                        <p className="text-[11px] font-mono text-muted mt-0.5">{personas.length} agents · {personas.filter(a => a.is_active).length} active</p>
                    </div>

                    <div className="w-px h-10 bg-border" />

                    {/* Agent switcher dropdown */}
                    <div className="relative" ref={pickerRef}>
                        <button onClick={() => setShowAgentPicker(!showAgentPicker)}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg border transition-all cursor-pointer",
                                showAgentPicker ? "border-border-hover bg-hover" : "border-border bg-card hover:border-border-hover"
                            )}>
                            <div className={cn("w-8 h-8 rounded-md flex items-center justify-center text-[15px] flex-shrink-0", currentToneStyle.colorBg)}>
                                {selected.icon || "🤖"}
                            </div>
                            <div className="text-left min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-[13px] font-semibold truncate max-w-[180px]">{selected.name}</span>
                                    {selected.is_active && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-success/10 text-success text-[10px] font-mono font-medium flex-shrink-0">
                                            <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
                                            LIVE
                                        </span>
                                    )}
                                    {isDirty && (
                                        <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[10px] font-mono font-medium flex-shrink-0">unsaved</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted mt-0.5">
                                    <span>{p.models[selected.model] || selected.model}</span>
                                    <span>·</span>
                                    <span>temp {selected.temperature}</span>
                                    <span>·</span>
                                    <span>{p.tones[selected.tone] || selected.tone}</span>
                                </div>
                            </div>
                            <ChevronDown size={14} className={cn("text-muted transition-transform", showAgentPicker && "rotate-180")} />
                        </button>

                        {/* Dropdown */}
                        {showAgentPicker && (
                            <div className="absolute top-full left-0 mt-1.5 w-[360px] bg-bg border border-border rounded-lg shadow-box-shadow z-30 overflow-hidden">
                                <div className="p-2 border-b border-border">
                                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-card border border-border rounded-md focus-within:border-border-hover transition-colors">
                                        <Search size={12} className="text-muted" />
                                        <input autoFocus placeholder="Search agents..." value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)}
                                            className="flex-1 bg-transparent text-[12px] text-fg outline-none placeholder:text-muted" />
                                    </div>
                                </div>

                                <div className="max-h-[320px] overflow-y-auto scrollbar-none py-1">
                                    {filteredPickerAgents.map((a) => {
                                        const style = TONE_STYLES[a.tone] || TONE_STYLES.custom
                                        const agentDirty = dirtyMap[a.id]
                                        return (
                                            <button key={a.id} onClick={() => switchAgent(a.id)}
                                                className={cn(
                                                    "w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors cursor-pointer",
                                                    selectedId === a.id ? "bg-hover" : "hover:bg-hover"
                                                )}>
                                                <div className={cn("w-8 h-8 rounded-md flex items-center justify-center text-[14px] flex-shrink-0", style.colorBg)}>
                                                    {a.icon || "🤖"}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[13px] font-medium text-fg truncate">{a.name}</span>
                                                        {agentDirty && <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        {a.is_active ? (
                                                            <span className="inline-flex items-center gap-1 text-success text-[10px] font-mono">
                                                                <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
                                                                LIVE
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-mono text-muted">draft</span>
                                                        )}
                                                        <span className="text-[10px] font-mono text-muted">·</span>
                                                        <span className="text-[10px] font-mono text-muted">{p.models[a.model] || a.model}</span>
                                                    </div>
                                                </div>
                                                {selectedId === a.id && (
                                                    <Check size={14} className="text-fg flex-shrink-0" />
                                                )}
                                            </button>
                                        )
                                    })}
                                    {filteredPickerAgents.length === 0 && (
                                        <div className="px-4 py-6 text-center">
                                            <p className="text-[12px] text-muted">No agents found.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="border-t border-border p-2">
                                    <button onClick={() => { setShowAgentPicker(false); setShowNewModal(true) }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[13px] text-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer font-medium">
                                        <Plus size={14} /> {m.add}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    {!selected.is_active && (
                        <Button variant="outline" size="sm" onClick={() => handleActivate(selected.id)}
                            className="border-success/30 bg-success/10 text-success hover:bg-success/20">
                            <Power size={12} /> Make Active
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
                        {showPreview ? <><ChevronRight size={12} /> Hide Preview</> : <><ChevronLeft size={12} /> Show Preview</>}
                    </Button>
                    {!selected.is_active && (
                        <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(selected.id)}
                            className="text-muted hover:text-error hover:border-error/30">
                            <Trash size={12} />
                        </Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={!isDirty || isPending}>
                        {isPending ? (
                            <LoaderIcon size={14} className="animate-spin" />
                        ) : isDirty ? (
                            <><Sparkles size={12} /> Save Changes</>
                        ) : (
                            <><Check size={12} /> Saved</>
                        )}
                    </Button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex min-h-0">

                {/* Editor */}
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    <div className="flex border-b border-border bg-bg">
                        {[
                            { id: "config", label: "Configuration" },
                            { id: "prompt", label: "System Prompt" },
                            { id: "advanced", label: "Advanced" },
                        ].map((tab) => (
                            <button key={tab.id} onClick={() => setEditorTab(tab.id)}
                                className={cn(
                                    "px-4 py-3 text-[13px] font-medium border-b-2 transition-colors cursor-pointer",
                                    editorTab === tab.id ? "text-fg border-fg" : "text-muted border-transparent hover:text-secondary"
                                )}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto py-6 scrollbar-none">

                        {editorTab === "config" && (
                            <div className="max-w-[680px] space-y-6">
                                <Section title="Basic Info" desc="Identity of this agent.">
                                    <Field label={t.name.label}>
                                        <Input value={selected.name} onChange={(e) => update("name", e.target.value)} placeholder={t.name.placeholder} />
                                    </Field>
                                    <Field label={t.emoji.label}>
                                        <div className="flex gap-1.5 flex-wrap">
                                            {EMOJIS.map((e) => (
                                                <button key={e} onClick={() => update("icon", e)}
                                                    className={cn(
                                                        "w-9 h-9 rounded-md text-[17px] border transition-all cursor-pointer",
                                                        selected.icon === e ? "border-fg bg-hover" : "border-border hover:border-border-hover"
                                                    )}>
                                                    {e}
                                                </button>
                                            ))}
                                        </div>
                                    </Field>
                                </Section>

                                <Section title="Communication Style" desc="How this agent talks to customers.">
                                    <Field label={t.tone.label}>
                                        <div className="flex flex-wrap gap-1.5">
                                            {TONES.map((tone) => (
                                                <button key={tone} onClick={() => update("tone", tone)}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all cursor-pointer",
                                                        selected.tone === tone ? "border-fg bg-white/5 text-fg" : "border-border text-muted hover:border-border-hover"
                                                    )}>
                                                    {p.tones[tone]}
                                                </button>
                                            ))}
                                        </div>
                                    </Field>
                                    <Field label={t.language.label}>
                                        <NativeSelect value={selected.language} onChange={(e) => update("language", e.target.value)}>
                                            {LANGUAGES_LIST.map((l) => <NativeSelectOption key={l} value={l}>{p.languages[l]}</NativeSelectOption>)}
                                        </NativeSelect>
                                    </Field>
                                    <Field label={t.greeting.label}>
                                        <Input value={selected.greeting} onChange={(e) => update("greeting", e.target.value)} placeholder={t.greeting.placeholder} />
                                    </Field>
                                </Section>
                            </div>
                        )}

                        {editorTab === "prompt" && (
                            <div className="max-w-[680px] space-y-6">
                                <Section title={t.systemPrompt.label} desc="The core instruction sent to the AI on every conversation.">
                                    <Field label={t.systemPrompt.label}>
                                        <Textarea
                                            className="font-mono text-[12px] leading-relaxed min-h-[300px]"
                                            value={selected.prompt}
                                            onChange={(e) => update("prompt", e.target.value)}
                                            placeholder={t.systemPrompt.placeholder}
                                        />
                                        <div className="mt-2">
                                            <div className="h-[3px] bg-border rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-300"
                                                    style={{ width: `${promptPct}%`, background: promptPct > 80 ? "#ff6a00" : promptPct > 60 ? "#0090ff" : "#00d26a" }} />
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-[10px] font-mono text-muted">{promptLength} / {maxPrompt} chars</span>
                                            </div>
                                        </div>
                                    </Field>
                                </Section>

                                <Section title="Tips" desc="">
                                    <div className="text-[12px] text-muted leading-relaxed space-y-2">
                                        <div className="flex gap-2"><span className="text-success font-mono text-[11px] mt-0.5 min-w-[30px]">DO</span> Define role clearly, language rules, escalation triggers, tone boundaries.</div>
                                        <div className="flex gap-2"><span className="text-error font-mono text-[11px] mt-0.5 min-w-[30px]">DON'T</span> Include API keys, passwords, or internal company data.</div>
                                        <div className="flex gap-2"><span className="text-info font-mono text-[11px] mt-0.5 min-w-[30px]">TIP</span> Add "If unsure, ask the customer to clarify" to reduce hallucination.</div>
                                    </div>
                                </Section>
                            </div>
                        )}

                        {editorTab === "advanced" && (
                            <div className="max-w-[680px] space-y-6">
                                <Section title="Model Settings" desc="Technical parameters that control the AI's behavior.">
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label={t.model.label}>
                                            <NativeSelect value={selected.model} onChange={(e) => update("model", e.target.value)}>
                                                {MODELS.map((m) => <NativeSelectOption key={m} value={m}>{p.models[m]}</NativeSelectOption>)}
                                            </NativeSelect>
                                        </Field>
                                        <Field label={t.temperature.label}>
                                            <Input type="number" min="0" max="1" step="0.1" className="font-mono"
                                                value={selected.temperature} onChange={(e) => update("temperature", parseFloat(e.target.value) || 0)} />
                                        </Field>
                                        <Field label={t.maxTokens.label}>
                                            <Input type="number" min="100" max="4096" step="100" className="font-mono"
                                                value={selected.max_tokens} onChange={(e) => update("max_tokens", parseInt(e.target.value) || 1024)} />
                                        </Field>
                                        <Field label={t.fallbackBehavior.label}>
                                            <NativeSelect value={selected.fallback_behavior} onChange={(e) => update("fallback_behavior", e.target.value)}>
                                                {FALLBACKS.map((f) => <NativeSelectOption key={f} value={f}>{p.fallbacks[f]}</NativeSelectOption>)}
                                            </NativeSelect>
                                        </Field>
                                    </div>
                                </Section>

                                <Section title="Boundaries" desc="What this agent should avoid and when to hand off.">
                                    <Field label={t.blockedTopics.label}>
                                        <Textarea className="font-mono text-[12px] min-h-[80px]"
                                            value={selected.blocked_topics} onChange={(e) => update("blocked_topics", e.target.value)}
                                            placeholder={t.blockedTopics.placeholder} />
                                    </Field>
                                    <Field label={t.escalationTriggers.label}>
                                        <Input className="font-mono text-[12px]"
                                            value={selected.escalation_triggers} onChange={(e) => update("escalation_triggers", e.target.value)}
                                            placeholder={t.escalationTriggers.placeholder} />
                                    </Field>
                                </Section>
                            </div>
                        )}
                    </div>
                </div>

                {/* Live Preview */}
                {showPreview && (
                    <aside className="w-[360px] flex-shrink-0 border-l border-border bg-bg flex flex-col">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                            <div className="flex items-center gap-2">
                                <Eye size={14} className="text-muted" />
                                <h3 className="text-[13px] font-semibold">Live Preview</h3>
                            </div>
                            <div className="flex items-center gap-1.5 text-success text-[10px] font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                                LIVE
                            </div>
                        </div>

                        <div className="px-4 py-2.5 border-b border-border bg-card flex items-center gap-2">
                            <span className="text-[15px]">{selected.icon || "🤖"}</span>
                            <div>
                                <div className="text-[12px] font-medium">{selected.name}</div>
                                <div className="text-[10px] font-mono text-muted">{p.tones[selected.tone]} · {p.languages[selected.language]}</div>
                            </div>
                        </div>

                        {/* Talks to the real engine: same persona, same
                            catalogue, same tools as a live customer. Turns are
                            saved as a 'playground' conversation. */}
                        <ChatPanel
                            personaId={selectedId}
                            greeting={selected.greeting}
                            personaName={selected.name}
                            personaIcon={selected.icon || "🤖"}
                            placeholder={p.playground.placeholder}
                            className="flex-1 min-h-0"
                        />
                    </aside>
                )}
            </div>

            {/* New Agent Modal */}
            <NewAgentModal
                open={showNewModal}
                onClose={() => setShowNewModal(false)}
                onCreate={handleCreateAgent}
                language={language}
                isPending={isPending}
            />

            {/* Delete Confirmation */}
            <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
                <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Trash size={14} className="text-error" />
                            Delete Agent
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-[13px] text-muted px-5 pb-2">
                        This will permanently delete <span className="text-fg font-medium">{personas?.find((a) => a.id === showDeleteConfirm)?.name}</span>. This action cannot be undone.
                    </p>
                    <DialogFooter className="justify-end">
                        <DialogClose asChild>
                            <Button variant="outline">{m.cancel}</Button>
                        </DialogClose>
                        <Button variant="destructive" onClick={() => handleDelete(showDeleteConfirm)} disabled={isPending}>
                            {isPending ? <LoaderIcon size={14} className="animate-spin" /> : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function NewAgentModal({ open, onClose, onCreate, language, isPending }) {
    const p = language.app.pages.personas


    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent showCloseButton={false} className="sm:max-w-[640px]">
                <DialogHeader>
                    <DialogTitle>Create New Agent</DialogTitle>
                    <p className="text-[12px] text-muted mt-0.5">Start from a preset or create from scratch.</p>
                </DialogHeader>
                <div className="p-6 space-y-4">
                    <div>
                        <span className="text-[11px] font-mono font-medium uppercase tracking-wider text-muted mb-3 block">Start from Preset</span>
                        <div className="grid grid-cols-2 gap-3">
                            {PRESETS.map((preset) => {
                                const style = TONE_STYLES[preset.tone]
                                return (
                                    <button key={preset.tone} onClick={() => onCreate(preset.tone)} disabled={isPending}
                                        className="text-left p-4 rounded-lg border border-border bg-card hover:border-border-hover transition-all cursor-pointer">
                                        <div className="flex items-start gap-3">
                                            <div className={cn("w-10 h-10 rounded-md flex items-center justify-center text-[18px]", style.colorBg)}>
                                                {preset.emoji}
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-[13px] font-semibold">{p.tones[preset.tone]}</div>
                                                <p className="text-[11px] text-muted mt-1 leading-relaxed">{preset.description}</p>
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                    <div className="relative flex items-center gap-3 py-2">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] font-mono text-muted uppercase tracking-wider">or</span>
                        <div className="flex-1 h-px bg-border" />
                    </div>
                    <button onClick={() => onCreate(null)} disabled={isPending}
                        className="w-full p-4 rounded-lg border border-dashed border-border hover:border-border-hover hover:bg-card transition-all cursor-pointer text-left">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-md flex items-center justify-center text-[18px] bg-white/5">✨</div>
                            <div>
                                <div className="text-[13px] font-semibold">Start from Scratch</div>
                                <p className="text-[11px] text-muted mt-1">Build a fully custom agent with your own prompt and settings.</p>
                            </div>
                        </div>
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
