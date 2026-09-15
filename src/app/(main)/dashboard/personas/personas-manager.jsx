"use client";

import { useEffect, useMemo, useState } from "react";
import {
  usePersonas, useCreatePersona, useUpdatePersona, useDeletePersona,
} from "@/hooks/use-personas";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Section, Panel, Loading, EmptyState, Hint, Segmented } from "@/components/ui/page";
import PersonaAvatar, { AvatarPicker, DEFAULT_ICON, buildIcon } from "@/components/ui/persona-avatar";
import ChatPanel from "@/components/chat/chat-panel";
import { MODEL_KEYS, MODELS } from "@/lib/ai/models";
import {
  BotIcon, CheckIcon, LoaderIcon, MessageSquareIcon, PlusIcon,
  ShieldIcon, SlidersIcon, SparklesIcon, Trash2Icon, UserRoundIcon,
} from "lucide-react";

const TONES = ["friendly", "professional", "persuasive", "technical", "custom"];
const LANGUAGES = ["auto", "kk", "ru", "en"];
const FALLBACKS = ["escalate", "retry", "apologize"];

/** Reply length as three plain choices instead of a raw token count. */
const LENGTHS = [
  { key: "short", tokens: 400 },
  { key: "medium", tokens: 1024 },
  { key: "long", tokens: 2048 },
];
const lengthOf = (tokens) =>
  LENGTHS.reduce((best, l) => (Math.abs(l.tokens - (tokens || 1024)) < Math.abs(best.tokens - (tokens || 1024)) ? l : best)).key;

const emptyPersona = {
  name: "", icon: DEFAULT_ICON, tone: "friendly", greeting: "", prompt: "",
  traits: "", model: "claude", is_active: false, max_tokens: 1024,
  fallback_behavior: "escalate", language: "auto",
  blocked_topics: "", escalation_triggers: "", preset_id: "custom",
};

export default function PersonasManager({ language }) {
  const p = language.app.pages.personas;
  const res = language.app.res;

  const { data: personas, isLoading } = usePersonas();
  const createPersona = useCreatePersona();
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (personas?.length && !personas.some((x) => x.id === selectedId)) {
      setSelectedId(personas.find((x) => x.is_active)?.id || personas[0].id);
    }
  }, [personas, selectedId]);

  const selected = personas?.find((x) => x.id === selectedId) || null;

  function addPersona(preset) {
    createPersona.mutate(
      { ...emptyPersona, ...preset },
      {
        onSuccess: (data) => {
          if (data?.success === false) return showError(data.message);
          setSelectedId(data?.id);
          setCreating(false);
          showSuccess(res.personaCreated);
        },
        onError: () => showError(res.personaCreateError),
      },
    );
  }

  if (isLoading) return <Loading />;

  if (!personas?.length) {
    return (
      <>
        <EmptyState
          icon={BotIcon}
          title={p.empty.title}
          description={p.empty.subtitle}
          action={<Button onClick={() => setCreating(true)}><PlusIcon className="size-4" />{p.modals.add}</Button>}
        />
        {creating && <NewPersonaDialog p={p} onCreate={addPersona} onClose={() => setCreating(false)} pending={createPersona.isPending} />}
      </>
    );
  }

  return (
    <div className="flex gap-6 items-start">
      {/* ── who you have ── */}
      <aside className="w-[236px] shrink-0 space-y-2">
        {personas.map((persona) => (
          <button
            key={persona.id}
            onClick={() => setSelectedId(persona.id)}
            className={cn(
              "w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-module border transition-colors cursor-pointer",
              persona.id === selectedId
                ? "bg-card border-border-hover"
                : "bg-transparent border-transparent hover:bg-hover",
            )}
          >
            <PersonaAvatar icon={persona.icon} name={persona.name} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-fg truncate">{persona.name}</span>
              <span className="block text-[11px] text-muted truncate">
                {p.tones[persona.tone] || persona.tone}
              </span>
            </span>
            {persona.is_active && <span className="size-1.5 rounded-full bg-success shrink-0" />}
          </button>
        ))}

        <Button variant="ghost" className="w-full justify-start" onClick={() => setCreating(true)}>
          <PlusIcon className="size-4" />
          {p.modals.add}
        </Button>
      </aside>

      {selected && (
        <PersonaEditor key={selected.id} persona={selected} p={p} res={res} language={language} />
      )}

      {creating && (
        <NewPersonaDialog p={p} onCreate={addPersona} onClose={() => setCreating(false)} pending={createPersona.isPending} />
      )}
    </div>
  );
}

/* ─────────────────────────────── editor ──────────────────────────────── */

function PersonaEditor({ persona, p, res, language }) {
  const updatePersona = useUpdatePersona();
  const deletePersona = useDeletePersona();
  const [form, setForm] = useState(persona);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = useMemo(
    () => Object.keys(form).some((k) => form[k] !== persona[k]),
    [form, persona],
  );

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  function save() {
    if (!form.name?.trim()) return showError(res.nameRequired);
    if (!form.prompt?.trim() || form.prompt.trim().length < 10) {
      return showError(res.systemPromptMin);
    }

    const { id, user_id, created_at, updated_at, ...updates } = form;
    updatePersona.mutate(
      { id: persona.id, updates },
      {
        onSuccess: (r) =>
          r?.success === false ? showError(r.message) : showSuccess(res.personaUpdated),
        onError: () => showError(res.personaUpdateError),
      },
    );
  }

  return (
    <div className="flex-1 min-w-0 grid gap-6 laptop:grid-cols-[minmax(0,1fr)_340px] items-start">
      <div className="min-w-0">
        {/* sticky action bar so Save is always reachable */}
        <div className="flex items-center gap-3 mb-6 sticky top-0 z-10 bg-bg py-2 -my-2">
          <PersonaAvatar icon={form.icon} name={form.name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-fg truncate">{form.name || p.fields.name.placeholder}</p>
            <p className="text-[12px] text-secondary">
              {p.tones[form.tone] || form.tone} · {MODELS[form.model]?.label || form.model}
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer mr-1">
            <input
              type="checkbox"
              checked={Boolean(form.is_active)}
              onChange={(e) => set("is_active", e.target.checked)}
              className="size-4 accent-[var(--color-accent)] cursor-pointer"
            />
            <span className="text-[12px] text-secondary">{p.fields.status.active}</span>
          </label>

          <Button onClick={save} disabled={!dirty || updatePersona.isPending}>
            {updatePersona.isPending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : dirty ? (
              p.modals.update
            ) : (
              <><CheckIcon className="size-4" />{p.saved}</>
            )}
          </Button>

          <button
            onClick={() => setConfirmDelete(true)}
            aria-label={p.delete}
            className="size-10 grid place-items-center rounded-button text-muted hover:text-error hover:bg-error/10 cursor-pointer shrink-0"
          >
            <Trash2Icon className="size-4" />
          </button>
        </div>

        <Section title={p.sections.identity.title} description={p.sections.identity.help} icon={UserRoundIcon}>
          <Panel padded className="space-y-4">
            <Field label={p.fields.name.label}>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={p.fields.name.placeholder} />
              <Hint>{p.sections.identity.nameHint}</Hint>
            </Field>

            <div>
              <p className="text-[13px] text-fg mb-2">{p.fields.avatar}</p>
              <AvatarPicker value={form.icon} onChange={(v) => set("icon", v)} />
            </div>
          </Panel>
        </Section>

        <Section title={p.sections.voice.title} description={p.sections.voice.help} icon={SparklesIcon}>
          <Panel padded className="space-y-4">
            <div>
              <p className="text-[13px] text-fg mb-2">{p.fields.tone.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("tone", t)}
                    className={cn(
                      "px-3 py-2 rounded-button text-[12px] font-medium transition-colors cursor-pointer text-left",
                      form.tone === t ? "bg-fg text-primary" : "bg-secondary-transparent2 text-secondary hover:text-fg",
                    )}
                  >
                    {p.tones[t]}
                  </button>
                ))}
              </div>
              <Hint className="mt-2">{p.toneHints[form.tone]}</Hint>
            </div>

            <Field label={p.fields.language.label}>
              <NativeSelect value={form.language} onChange={(e) => set("language", e.target.value)}>
                {LANGUAGES.map((l) => (
                  <NativeSelectOption key={l} value={l}>{p.languages[l]}</NativeSelectOption>
                ))}
              </NativeSelect>
              <Hint>{p.sections.voice.languageHint}</Hint>
            </Field>

            <Field label={p.fields.greeting.label}>
              <Input value={form.greeting || ""} onChange={(e) => set("greeting", e.target.value)} placeholder={p.fields.greeting.placeholder} />
              <Hint>{p.sections.voice.greetingHint}</Hint>
            </Field>
          </Panel>
        </Section>

        <Section title={p.sections.brief.title} description={p.sections.brief.help} icon={MessageSquareIcon}>
          <Panel padded className="space-y-4">
            <Field label={p.fields.systemPrompt.label}>
              <Textarea
                rows={6}
                value={form.prompt || ""}
                onChange={(e) => set("prompt", e.target.value)}
                placeholder={p.sections.brief.promptPlaceholder}
                className="max-h-none"
              />
              <Hint>{p.sections.brief.promptHint}</Hint>
            </Field>

            <Field label={p.fields.traits}>
              <Input value={form.traits || ""} onChange={(e) => set("traits", e.target.value)} placeholder={p.sections.brief.traitsPlaceholder} />
            </Field>
          </Panel>
        </Section>

        <Section title={p.sections.limits.title} description={p.sections.limits.help} icon={ShieldIcon}>
          <Panel padded className="space-y-4">
            <Field label={p.fields.blockedTopics.label}>
              <Input value={form.blocked_topics || ""} onChange={(e) => set("blocked_topics", e.target.value)} placeholder={p.fields.blockedTopics.placeholder} />
              <Hint>{p.sections.limits.blockedHint}</Hint>
            </Field>

            <Field label={p.fields.escalationTriggers.label}>
              <Input value={form.escalation_triggers || ""} onChange={(e) => set("escalation_triggers", e.target.value)} placeholder={p.fields.escalationTriggers.placeholder} />
              <Hint>{p.sections.limits.escalationHint}</Hint>
            </Field>

            <Field label={p.fields.fallbackBehavior.label}>
              <NativeSelect value={form.fallback_behavior} onChange={(e) => set("fallback_behavior", e.target.value)}>
                {FALLBACKS.map((f) => (
                  <NativeSelectOption key={f} value={f}>{p.fallbacks[f]}</NativeSelectOption>
                ))}
              </NativeSelect>
              <Hint>{p.sections.limits.fallbackHint}</Hint>
            </Field>
          </Panel>
        </Section>

        <Section title={p.sections.engine.title} description={p.sections.engine.help} icon={SlidersIcon}>
          <Panel padded className="space-y-4">
            <Field label={p.fields.model.label}>
              <NativeSelect value={form.model} onChange={(e) => set("model", e.target.value)}>
                {MODEL_KEYS.map((k) => (
                  <NativeSelectOption key={k} value={k}>{MODELS[k].label}</NativeSelectOption>
                ))}
              </NativeSelect>
              <Hint>{p.sections.engine.modelHint}</Hint>
            </Field>

            <div>
              <p className="text-[13px] text-fg mb-2">{p.sections.engine.lengthLabel}</p>
              <Segmented
                value={lengthOf(form.max_tokens)}
                onChange={(v) => set("max_tokens", LENGTHS.find((l) => l.key === v).tokens)}
                options={LENGTHS.map((l) => ({ value: l.key, label: p.lengths[l.key] }))}
                className="w-fit"
              />
              <Hint className="mt-2">{p.sections.engine.lengthHint}</Hint>
            </div>
          </Panel>
        </Section>
      </div>

      {/* ── try it ── */}
      <div className="laptop:sticky laptop:top-4">
        <p className="text-[13px] font-semibold text-fg mb-1">{p.playground.title}</p>
        <Hint className="mb-3">{p.playground.help}</Hint>
        <Panel className="h-[560px] flex flex-col overflow-hidden">
          <ChatPanel
            personaId={persona.id}
            greeting={persona.greeting}
            personaName={persona.name}
            personaIcon={persona.icon}
            placeholder={p.playground.placeholder}
            className="flex-1 min-h-0"
          />
        </Panel>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{p.confirmDelete.title}</DialogTitle></DialogHeader>
          <p className="px-6 pt-5 pb-1 text-[13px] text-secondary leading-relaxed">{p.confirmDelete.body}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>{p.modals.cancel}</Button>
            <Button
              onClick={() =>
                deletePersona.mutate(persona.id, {
                  onSuccess: () => showSuccess(res.personaDeleted),
                  onError: () => showError(res.personaDeleteError),
                })
              }
            >
              {p.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────────────────────── new persona ───────────────────────────── */

const PRESETS = [
  { tone: "friendly", icon: buildIcon("smile", "mint") },
  { tone: "professional", icon: buildIcon("headset", "ocean") },
  { tone: "persuasive", icon: buildIcon("sparkles", "rose") },
  { tone: "technical", icon: buildIcon("wrench", "slate") },
];

function NewPersonaDialog({ p, onCreate, onClose, pending }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{p.modals.addTitle}</DialogTitle></DialogHeader>

        <div className="px-6 pt-5 pb-3">
          <Hint className="mb-4">{p.modals.addHelp}</Hint>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.tone}
                disabled={pending}
                onClick={() =>
                  onCreate({
                    ...preset,
                    preset_id: preset.tone,
                    name: p.tones[preset.tone],
                    prompt: p.toneHints[preset.tone],
                  })
                }
                className="text-left p-3 rounded-module border border-border hover:border-border-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                <PersonaAvatar icon={preset.icon} name={p.tones[preset.tone]} size={32} className="mb-2" />
                <p className="text-[13px] font-semibold text-fg">{p.tones[preset.tone]}</p>
                <p className="text-[11px] text-muted mt-0.5 leading-relaxed line-clamp-2">
                  {p.toneHints[preset.tone]}
                </p>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{p.modals.cancel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
