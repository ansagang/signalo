"use client";

import { useState } from "react";
import {
  useChannels, useCreateChannel, useUpdateChannel, useDeleteChannel,
  useRotateKey, useConnectTelegram,
} from "@/hooks/use-channels";
import { usePersonas } from "@/hooks/use-personas";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Panel, EmptyState, Loading, Segmented, Toggle, Hint } from "@/components/ui/page";
import BotIcon, { BotIconPicker } from "@/components/ui/bot-icon";
import {
  CheckIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon, GlobeIcon, LoaderIcon, PlusIcon,
  RefreshCwIcon, SendIcon, Trash2Icon,
} from "lucide-react";

const WIDGET_THEMES = {
  dark:  { panelBg: "#0a0a0c", panelText: "#f4f4f6", panelSurface: "#1c1c22", panelBorder: "#2a2a32" },
  light: { panelBg: "#ffffff", panelText: "#14141a", panelSurface: "#f1f1f4", panelBorder: "#e3e3e9" },
};

const WIDGET_DEFAULTS = {
  accent: "#00d26a", position: "right", offset: 20, size: 56, radius: 16,
  launcherLabel: "", title: "", autoOpen: false, autoOpenDelay: 8, greetingBubble: "",
  theme: "dark", panelBg: null, panelText: null, panelSurface: null,
  avatarShape: "bot",
};

/** A colour field with swatches and a native picker. */
function ColorField({ label, value, fallback, onChange, swatches }) {
  const current = value || fallback;
  return (
    <Field label={label}>
      <div className="flex items-center gap-2 flex-wrap">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            style={{ background: c }}
            className={cn(
              "size-7 rounded-full cursor-pointer transition-transform border border-secondary-transparent",
              current?.toLowerCase() === c.toLowerCase()
                ? "ring-2 ring-fg ring-offset-2 ring-offset-[var(--color-card)]"
                : "hover:scale-110",
            )}
          />
        ))}
        <input
          type="color"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          className="size-7 rounded-full bg-transparent border border-secondary-transparent cursor-pointer"
        />
        <code className="text-[11px] font-mono text-secondary">{current}</code>
      </div>
    </Field>
  );
}

const SWATCHES = ["#00d26a", "#0090ff", "#ff5fa2", "#ff6a00", "#7c3aed", "#ededed"];

/**
 * Whole looks, not individual values.
 *
 * Picking a colour at a time meant assembling a coherent window by hand;
 * these set everything at once and remain the starting point for fine-tuning.
 */
const LOOKS = [
  { key: "midnight", theme: "dark",  accent: "#00d26a", panelBg: "#0a0a0c", panelText: "#f4f4f6", panelSurface: "#1c1c22" },
  { key: "ocean",    theme: "dark",  accent: "#0090ff", panelBg: "#0b1622", panelText: "#eaf2fb", panelSurface: "#16293d" },
  { key: "plum",     theme: "dark",  accent: "#c084fc", panelBg: "#14101c", panelText: "#f2edfb", panelSurface: "#241c33" },
  { key: "snow",     theme: "light", accent: "#0090ff", panelBg: "#ffffff", panelText: "#14141a", panelSurface: "#f1f1f4" },
  { key: "sand",     theme: "light", accent: "#ff6a00", panelBg: "#fdfaf6", panelText: "#231a12", panelSurface: "#f2e9df" },
  { key: "mono",     theme: "light", accent: "#14141a", panelBg: "#ffffff", panelText: "#14141a", panelSurface: "#eeeef1" },
];

function looksLike(config, look) {
  return ["accent", "panelBg", "panelText", "panelSurface"].every(
    (k) => (config[k] || "").toLowerCase() === look[k].toLowerCase(),
  );
}

function CopyBox({ value, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label && <p className="text-[11px] font-mono uppercase tracking-wider text-muted mb-1.5">{label}</p>}
      <div className="relative">
        <pre className="bg-primary border border-secondary-transparent rounded-button px-3 py-2.5 pr-11 text-[11px] text-secondary font-mono overflow-x-auto whitespace-pre-wrap break-all">
          {value}
        </pre>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              showError("Could not copy — select the text manually.");
            }
          }}
          aria-label="Copy"
          className={cn(
            "absolute top-2 right-2 size-7 grid place-items-center rounded-button transition-colors cursor-pointer",
            copied ? "text-success" : "text-muted hover:text-fg hover:bg-hover",
          )}
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

export default function ChannelsManager({ language, origin }) {
  const p = language.app.pages.channels;
  const res = language.app.res;

  const { data: channels, isLoading } = useChannels();
  const { data: personas } = usePersonas();
  const createChannel = useCreateChannel();

  const base = origin || (typeof window !== "undefined" ? window.location.origin : "");

  function add(type) {
    const persona = personas?.find((x) => x.is_active) || personas?.[0];
    if (!persona) return showError(p.needPersona);
    createChannel.mutate(
      { type, persona_id: persona.id },
      {
        onSuccess: (r) => (r?.success === false ? showError(r.message) : showSuccess(res.channelCreated)),
        onError: () => showError(res.channelCreateError),
      },
    );
  }

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      {!channels?.length && (
        <EmptyState icon={GlobeIcon} title={p.empty.title} description={p.empty.subtitle} />
      )}

      {channels?.map((channel) => (
        <ChannelCard
          key={channel.id}
          channel={channel}
          personas={personas}
          p={p}
          res={res}
          base={base}
        />
      ))}

      <div className="flex gap-2 pt-1">
        <Button variant="ghost" onClick={() => add("web")} disabled={createChannel.isPending}>
          <PlusIcon className="size-4" />
          {p.types.web.add}
        </Button>
        <Button variant="ghost" onClick={() => add("telegram")} disabled={createChannel.isPending}>
          <PlusIcon className="size-4" />
          {p.types.telegram.add}
        </Button>
      </div>
    </div>
  );
}

function ChannelCard({ channel, personas, p, res, base }) {
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();
  const rotateKey = useRotateKey();
  const connectTelegram = useConnectTelegram();

  const isWeb = channel.type === "web";
  const [tab, setTab] = useState("setup");
  const [token, setToken] = useState("");
  const [editingToken, setEditingToken] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [config, setConfig] = useState({ ...WIDGET_DEFAULTS, ...(channel.config || {}) });
  const themeDefaults = WIDGET_THEMES[config.theme] || WIDGET_THEMES.dark;

  const meta = isWeb ? p.types.web : p.types.telegram;
  const snippet = `<script src="${base}/widget.js" data-key="${channel.public_key}" defer></script>`;

  function patch(updates, successMessage) {
    updateChannel.mutate(
      { id: channel.id, updates },
      {
        onSuccess: (r) =>
          r?.success === false ? showError(r.message) : successMessage && showSuccess(successMessage),
        onError: () => showError(res.channelUpdateError),
      },
    );
  }

  const setCfg = (key, value) => setConfig((c) => ({ ...c, [key]: value }));

  const tabs = isWeb
    ? [
        { value: "setup", label: p.tabs.setup },
        { value: "look", label: p.tabs.look },
        { value: "install", label: p.tabs.install },
      ]
    : [{ value: "setup", label: p.tabs.setup }];

  return (
    <Panel>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-secondary-transparent">
        <div className="size-9 rounded-button bg-secondary-transparent2 grid place-items-center text-secondary shrink-0">
          {isWeb ? <GlobeIcon className="size-4" /> : <SendIcon className="size-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-fg truncate">{channel.name}</span>
            <Badge className={channel.is_active ? "bg-success/10 text-success" : "bg-muted/10 text-muted"}>
              {channel.is_active ? p.active : p.paused}
            </Badge>
            {!isWeb && (
              // Token and webhook are separate states — a channel can have a
              // token saved and still not be receiving anything.
              <Badge
                className={
                  !channel.has_token
                    ? "bg-warning/10 text-warning"
                    : channel.has_webhook
                      ? "bg-info/10 text-info"
                      : "bg-secondary-transparent2 text-secondary"
                }
              >
                {!channel.has_token
                  ? p.tokenMissing
                  : channel.has_webhook
                    ? p.connected
                    : p.notConnected}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted mt-0.5">{meta.desc}</p>
        </div>

        <button
          type="button"
          onClick={() => patch({ is_active: !channel.is_active }, res.channelUpdated)}
          className="text-[11px] text-secondary hover:text-fg transition-colors cursor-pointer px-2 py-1"
        >
          {channel.is_active ? p.pause : p.resume}
        </button>

        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label={p.delete}
          className="size-7 grid place-items-center rounded-button text-muted hover:text-error hover:bg-error/10 cursor-pointer"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>

      {tabs.length > 1 && (
        <div className="px-5 pt-4">
          <Segmented value={tab} onChange={setTab} options={tabs} className="w-fit" />
        </div>
      )}

      <div className="px-5 py-4">
        {tab === "setup" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Field label={p.fields.name} className="flex-1">
                <Input
                  defaultValue={channel.name}
                  onBlur={(e) =>
                    e.target.value !== channel.name && patch({ name: e.target.value }, res.channelUpdated)
                  }
                />
              </Field>
              <Field label={p.fields.persona} className="flex-1">
                <NativeSelect
                  value={channel.persona_id || ""}
                  onChange={(e) => patch({ persona_id: e.target.value }, res.channelUpdated)}
                >
                  <NativeSelectOption value="">{p.fields.personaPlaceholder}</NativeSelectOption>
                  {personas?.map((persona) => (
                    <NativeSelectOption key={persona.id} value={persona.id}>
                      {persona.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Hint>{p.fields.personaHint}</Hint>

            {!isWeb && (
              <>
                <Field label={p.fields.botToken}>
                  {channel.has_token && !editingToken ? (
                    // An empty password box gave no sign a token was saved.
                    // Show which bot it is, and make replacing it deliberate.
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-secondary-transparent2 border border-secondary-transparent rounded-button px-3 h-10 inline-flex items-center text-[12px] font-mono text-secondary truncate">
                        {channel.token_hint}
                      </code>
                      <Button variant="ghost" size="sm" type="button" onClick={() => setEditingToken(true)}>
                        {p.fields.replaceToken}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        className="flex-1"
                        autoFocus={editingToken}
                        placeholder={p.fields.botTokenPlaceholder}
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!token.trim() || updateChannel.isPending}
                        onClick={() => {
                          patch({ bot_token: token.trim() }, res.tokenSaved);
                          setToken("");
                          setEditingToken(false);
                        }}
                      >
                        {p.fields.saveToken}
                      </Button>
                      {channel.has_token && (
                        <Button variant="ghost" size="sm" type="button"
                          onClick={() => { setToken(""); setEditingToken(false); }}>
                          {p.confirmDelete.cancel}
                        </Button>
                      )}
                    </div>
                  )}
                </Field>
                <Hint>{p.telegramHelp}</Hint>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={connectTelegram.isPending || !channel.has_token}
                  onClick={() =>
                    connectTelegram.mutate(channel.id, {
                      onSuccess: (r) =>
                        r?.success === false ? showError(r.message) : showSuccess(res.telegramConnected),
                      onError: () => showError(res.telegramConnectError),
                    })
                  }
                >
                  {connectTelegram.isPending ? (
                    <LoaderIcon className="size-3.5 animate-spin" />
                  ) : (
                    <SendIcon className="size-3.5" />
                  )}
                  {p.connect}
                </Button>
              </>
            )}
          </div>
        )}

        {tab === "look" && (
          <div className="grid gap-6 laptop-2:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-6 min-w-0">
              {/* 1 — the assistant's icon */}
              <div>
                <p className="text-[13px] font-medium text-fg mb-1">{p.look.icon}</p>
                <Hint className="mb-3">{p.look.iconHint}</Hint>
                <div className="flex items-start gap-4">
                  <BotIcon shape={config.avatarShape} accent={config.accent} size={52} />
                  <BotIconPicker
                    shape={config.avatarShape}
                    accent={config.accent}
                    onChange={(shape) => setCfg("avatarShape", shape)}
                    className="flex-1 min-w-0"
                  />
                </div>
              </div>

              {/* 2 — pick a look */}
              <div>
                <p className="text-[13px] font-medium text-fg mb-1">{p.look.presets}</p>
                <Hint className="mb-3">{p.look.presetsHint}</Hint>
                <div className="grid grid-cols-3 tablet:grid-cols-6 gap-2">
                  {LOOKS.map((look) => {
                    const active = looksLike(config, look);
                    return (
                      <button
                        key={look.key}
                        type="button"
                        onClick={() => setConfig((c) => ({ ...c, ...look, key: undefined }))}
                        className={cn(
                          "rounded-module border overflow-hidden transition-colors cursor-pointer",
                          active ? "border-fg" : "border-border hover:border-border-hover",
                        )}
                      >
                        <span className="block h-12 p-1.5" style={{ background: look.panelBg }}>
                          <span className="block h-2 w-3/4 rounded-full mb-1" style={{ background: look.panelSurface }} />
                          <span className="block h-2 w-1/2 rounded-full ml-auto" style={{ background: look.accent }} />
                        </span>
                        <span className="block text-[11px] py-1.5 text-center text-secondary">
                          {p.look.lookNames[look.key]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2 — placement */}
              <div>
                <p className="text-[13px] font-medium text-fg mb-2">{p.look.placement}</p>
                <div className="flex gap-3 flex-wrap">
                  <Field label={p.look.position} className="flex-1 min-w-[150px]">
                    <Segmented
                      value={config.position === "left" ? "left" : "right"}
                      onChange={(v) => setCfg("position", v)}
                      options={[
                        { value: "left", label: p.look.left },
                        { value: "right", label: p.look.right },
                      ]}
                    />
                  </Field>
                  <Field label={p.look.size} className="w-[120px]">
                    <Input type="number" min="44" max="80" value={config.size} onChange={(e) => setCfg("size", e.target.value)} />
                  </Field>
                  <Field label={p.look.offset} className="w-[120px]">
                    <Input type="number" min="0" max="80" value={config.offset} onChange={(e) => setCfg("offset", e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* 3 — words */}
              <div className="space-y-4">
                <p className="text-[13px] font-medium text-fg">{p.look.wording}</p>
                <Field label={p.look.title}>
                  <Input value={config.title} onChange={(e) => setCfg("title", e.target.value)} placeholder={channel.name} />
                </Field>
                <Field label={p.look.launcherLabel}>
                  <Input value={config.launcherLabel} onChange={(e) => setCfg("launcherLabel", e.target.value)} placeholder={p.look.launcherLabelPlaceholder} />
                  <Hint>{p.look.launcherLabelHint}</Hint>
                </Field>
                <Field label={p.look.greetingBubble}>
                  <Input value={config.greetingBubble} onChange={(e) => setCfg("greetingBubble", e.target.value)} placeholder={p.look.greetingBubblePlaceholder} />
                  <Hint>{p.look.greetingBubbleHint}</Hint>
                </Field>
                <Toggle
                  checked={config.autoOpen}
                  onChange={(v) => setCfg("autoOpen", v)}
                  label={p.look.autoOpen}
                  hint={p.look.autoOpenHint}
                />
                {config.autoOpen && (
                  <Field label={p.look.autoOpenDelay} className="w-[160px]">
                    <Input type="number" min="2" max="120" value={config.autoOpenDelay} onChange={(e) => setCfg("autoOpenDelay", e.target.value)} />
                  </Field>
                )}
              </div>

              {/* 4 — exact colours, for anyone who wants them */}
              <details className="group border-t border-secondary-transparent pt-4">
                <summary className="text-[13px] font-medium text-fg cursor-pointer list-none inline-flex items-center gap-1.5">
                  <ChevronDownIcon className="size-3.5 text-muted transition-transform group-open:rotate-180" />
                  {p.look.fineTune}
                </summary>
                <div className="pt-4 space-y-4">
                  <Hint>{p.look.fineTuneHint}</Hint>
                  <ColorField label={p.look.accent} value={config.accent} fallback="#00d26a" onChange={(v) => setCfg("accent", v)} swatches={SWATCHES} />
                  <ColorField label={p.look.panelBg} value={config.panelBg} fallback={themeDefaults.panelBg} onChange={(v) => setCfg("panelBg", v)} swatches={["#0a0a0c", "#14141a", "#0b1622", "#ffffff", "#fdfaf6"]} />
                  <ColorField label={p.look.panelText} value={config.panelText} fallback={themeDefaults.panelText} onChange={(v) => setCfg("panelText", v)} swatches={["#f4f4f6", "#c9c9d1", "#14141a", "#3a3a44"]} />
                  <ColorField label={p.look.panelSurface} value={config.panelSurface} fallback={themeDefaults.panelSurface} onChange={(v) => setCfg("panelSurface", v)} swatches={["#1c1c22", "#16293d", "#f1f1f4", "#eeeef1"]} />
                  <Field label={p.look.theme}>
                    <Segmented
                      value={config.theme || "dark"}
                      onChange={(v) => setCfg("theme", v)}
                      options={[
                        { value: "dark", label: p.look.dark },
                        { value: "light", label: p.look.light },
                      ]}
                      className="w-fit"
                    />
                    <Hint>{p.look.themeHint}</Hint>
                  </Field>
                </div>
              </details>

              <Button
                disabled={updateChannel.isPending}
                onClick={() =>
                  patch(
                    {
                      config: {
                        ...config,
                        size: Number(config.size) || 56,
                        offset: Number(config.offset) || 20,
                        autoOpenDelay: Number(config.autoOpenDelay) || 8,
                        avatarShape: config.avatarShape || "bot",
                      },
                    },
                    res.channelUpdated,
                  )
                }
              >
                {updateChannel.isPending ? <LoaderIcon className="size-4 animate-spin" /> : p.look.save}
              </Button>
            </div>

            <WidgetPreview config={config} channel={channel} p={p} />
          </div>
        )}

        {tab === "install" && (
          <div className="space-y-4">
            <CopyBox label={p.embedLabel} value={snippet} />
            <Hint>{p.installHint}</Hint>
            <CopyBox label={p.keyLabel} value={channel.public_key} />
            <div className="flex items-center gap-4">
              <a
                href={`${base}/c/${channel.public_key}`}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] text-accent hover:underline inline-flex items-center gap-1.5"
              >
                <ExternalLinkIcon className="size-3" />
                {p.testLink}
              </a>
              <button
                type="button"
                onClick={() => rotateKey.mutate(channel.id, { onSuccess: () => showSuccess(res.keyRotated) })}
                className="text-[12px] text-muted hover:text-fg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCwIcon className="size-3" />
                {p.rotateKey}
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{p.confirmDelete.title}</DialogTitle>
          </DialogHeader>
          <p className="px-6 pt-5 pb-1 text-[13px] text-secondary leading-relaxed">{p.confirmDelete.body}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>{p.confirmDelete.cancel}</Button>
            <Button
              onClick={() =>
                deleteChannel.mutate(channel.id, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    showSuccess(res.channelDeleted);
                  },
                  onError: () => showError(res.channelDeleteError),
                })
              }
            >
              {p.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

/** A miniature of the customer's page, showing the panel as it will look. */
function WidgetPreview({ config, channel, p }) {
  const theme = WIDGET_THEMES[config.theme] || WIDGET_THEMES.dark;
  const left = config.position === "left";
  const bg = config.panelBg || theme.panelBg;
  const text = config.panelText || theme.panelText;
  const surface = config.panelSurface || theme.panelSurface;
  const border = theme.panelBorder;
  const accent = config.accent || "#00d26a";
  const size = Math.max(36, Math.min(Number(config.size) || 56, 72)) * 0.6;
  const edge = (Number(config.offset) || 20) * 0.5;

  return (
    <div className="laptop-2:sticky laptop-2:top-4">
      <p className="text-[11px] font-mono uppercase tracking-wider text-muted mb-1.5">{p.look.preview}</p>
      <div className="relative h-[360px] rounded-module border border-secondary-transparent bg-[#f2f2f4] overflow-hidden">
        {/* stand-in for the customer's own page */}
        <div className="p-3 space-y-2 opacity-40">
          <div className="h-2 w-2/3 rounded bg-black/25" />
          <div className="h-2 w-full rounded bg-black/15" />
          <div className="h-2 w-4/5 rounded bg-black/15" />
        </div>

        {/* the chat panel itself */}
        <div
          className="absolute flex flex-col overflow-hidden shadow-xl"
          style={{
            background: bg,
            color: text,
            border: `1px solid ${border}`,
            borderRadius: `${Number(config.radius) || 16}px`,
            width: 168,
            height: 216,
            bottom: edge + size + 8,
            [left ? "left" : "right"]: edge,
          }}
        >
          <div
            className="flex items-center gap-1.5 px-2 py-1.5 shrink-0 min-w-0"
            style={{ borderBottom: `1px solid ${border}` }}
          >
            <BotIcon shape={config.avatarShape} accent={accent} size={18} rounded="rounded-[5px]" />
            <span className="text-[9px] font-semibold truncate min-w-0">
              {config.title || channel.name}
            </span>
          </div>

          <div className="flex-1 p-2 space-y-1.5 overflow-hidden">
            <div
              className="max-w-[80%] px-2 py-1 rounded-[7px] text-[8px] leading-snug"
              style={{ background: surface }}
            >
              {p.look.sampleBot}
            </div>
            <div
              className="max-w-[70%] ml-auto px-2 py-1 rounded-[7px] text-[8px] leading-snug font-medium"
              style={{ background: accent, color: bg }}
            >
              {p.look.sampleUser}
            </div>
          </div>

          <div className="flex items-center gap-1 p-1.5 shrink-0" style={{ borderTop: `1px solid ${border}` }}>
            <div className="flex-1 h-4 rounded-[5px]" style={{ background: surface }} />
            <div className="size-4 rounded-[5px] shrink-0" style={{ background: accent }} />
          </div>
        </div>

        {config.greetingBubble && (
          <div
            className="absolute max-w-[140px] px-2 py-1 rounded-[9px] bg-white text-[#111] text-[9px] leading-snug shadow"
            style={{ bottom: edge + size + 232, [left ? "left" : "right"]: edge }}
          >
            {config.greetingBubble}
          </div>
        )}

        <div
          className="absolute rounded-full grid place-items-center shadow-lg"
          style={{
            background: accent, color: bg, height: size, minWidth: size,
            padding: config.launcherLabel ? "0 10px" : 0,
            bottom: edge, [left ? "left" : "right"]: edge,
          }}
        >
          <span className="text-[10px] font-semibold whitespace-nowrap flex items-center gap-1 px-0.5">
            <BotIcon shape={config.avatarShape} accent={accent} size={16} bare />
            {config.launcherLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
