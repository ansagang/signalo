"use client";

import { useState } from "react";
import {
  useChannels, useCreateChannel, useUpdateChannel, useDeleteChannel,
  useRotateKey, useConnectTelegram, useVerifyWhatsApp, useVerifyEmail, useVerifyInstagram,
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
import Orb from "@/components/chat/orb";
import { panelTheme, WIDGET_THEMES as BASE_THEMES } from "@/lib/widget-theme";
import { languages as LANGUAGES } from "@/config/languages";
import { LABEL_PRESETS, resolveLauncherLabel } from "@/lib/widget-language";
import WhatsAppConnect from "./whatsapp-connect";
import InstagramConnect from "./instagram-connect";
import {
  CheckIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon, GlobeIcon, LoaderIcon,
  MailIcon, PlusIcon, RefreshCwIcon, Trash2Icon,
} from "lucide-react";
import {
  InstagramIcon, TelegramIcon, WhatsAppIcon, WidgetIcon,
} from "@/components/ui/brand-icons";

const TYPE_ICON = {
  web: WidgetIcon,
  telegram: TelegramIcon,
  whatsapp: WhatsAppIcon,
  instagram: InstagramIcon,
  email: MailIcon,
};

/**
 * A saved credential, shown as a masked hint with a deliberate "replace" step.
 *
 * An empty password box gave no sign a secret was already stored, so every
 * channel looked unconfigured.
 */
/** Hides advanced setup unless it is the only way in. */
function Collapse({ open, label, children }) {
  const [shown, setShown] = useState(open);
  if (open) return <div className="space-y-4">{children}</div>;
  return (
    <div>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="text-[12px] text-secondary hover:text-fg transition-colors cursor-pointer inline-flex items-center gap-1.5"
      >
        <ChevronDownIcon className={cn("size-3 transition-transform", shown && "rotate-180")} />
        {label}
      </button>
      {shown && <div className="space-y-4 mt-3">{children}</div>}
    </div>
  );
}

function SecretField({ label, placeholder, saved, hint, onSave, pending, p }) {
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);

  if (saved && !editing) {
    return (
      <Field label={label}>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-secondary-transparent2 border border-secondary-transparent rounded-button px-3 h-10 inline-flex items-center text-[12px] font-mono text-secondary truncate">
            {hint}
          </code>
          <Button variant="ghost" size="sm" type="button" onClick={() => setEditing(true)}>
            {p.fields.replaceToken}
          </Button>
        </div>
      </Field>
    );
  }

  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <Input
          className="flex-1"
          autoFocus={editing}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          disabled={!value.trim() || pending}
          onClick={() => {
            onSave(value.trim());
            setValue("");
            setEditing(false);
          }}
        >
          {p.fields.saveToken}
        </Button>
        {saved && (
          <Button variant="ghost" size="sm" type="button"
            onClick={() => { setValue(""); setEditing(false); }}>
            {p.confirmDelete.cancel}
          </Button>
        )}
      </div>
    </Field>
  );
}

const WIDGET_DEFAULTS = {
  accent: "#c9ced6", position: "right", offset: 20, size: 56, radius: 20,
  launcherLabel: "", title: "", autoOpen: false, autoOpenDelay: 8, greetingBubble: "",
  theme: "dark", panelBg: null, panelText: null, panelSurface: null,
  avatarShape: "",
  launcherStyle: "orb", accent2: "", orbMotion: "alive", orbGlow: true,
  headerStyle: "full", density: "cosy", starters: "", language: "auto",
};

/**
 * Ready-made orb colourways.
 *
 * The orb is two colours that have to agree with each other, which is a worse
 * thing to ask of a salon owner than "pick one". An empty second colour means
 * the widget derives it from the first — right for a single-colour brand.
 */
const ORB_PRESETS = [
  { key: "silver",  accent: "#c9ced6", accent2: "" },
  { key: "aurora",  accent: "#5ce1e6", accent2: "#a78bfa" },
  { key: "sunset",  accent: "#ff8a3d", accent2: "#ff4d8d" },
  { key: "ocean",   accent: "#3b82f6", accent2: "#22d3ee" },
  { key: "orchid",  accent: "#a855f7", accent2: "#ec4899" },
  { key: "ink",     accent: "#3a3a44", accent2: "#8b8b96" },
];

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

// The brand silver first; the rest for sellers with a colour of their own.
const SWATCHES = ["#c9ced6", "#8d93a0", "#0090ff", "#ff5fa2", "#ff6a00", "#7c3aed"];

/**
 * Whole looks, not individual values.
 *
 * Picking a colour at a time meant assembling a coherent window by hand;
 * these set everything at once and remain the starting point for fine-tuning.
 */
const LOOKS = [
  { key: "midnight", theme: "dark",  accent: "#c9ced6", panelBg: "#0a0a0c", panelText: "#f4f4f6", panelSurface: "#1c1c22" },
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

export default function ChannelsManager({ language, origin, signup, igSignup }) {
  const p = language.app.pages.channels;
  // The widget's own dictionary, so preset labels are named in the language
  // the seller is reading the dashboard in.
  const widgetWords = language.widget || {};
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
          signup={signup}
          igSignup={igSignup}
          widgetWords={widgetWords}
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
        <Button variant="ghost" onClick={() => add("whatsapp")} disabled={createChannel.isPending}>
          <PlusIcon className="size-4" />
          {p.types.whatsapp.add}
        </Button>
        <Button variant="ghost" onClick={() => add("instagram")} disabled={createChannel.isPending}>
          <PlusIcon className="size-4" />
          {p.types.instagram.add}
        </Button>
        <Button variant="ghost" onClick={() => add("email")} disabled={createChannel.isPending}>
          <PlusIcon className="size-4" />
          {p.types.email.add}
        </Button>
      </div>
    </div>
  );
}

function ChannelCard({ channel, personas, p, res, base, signup, igSignup, widgetWords }) {
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();
  const rotateKey = useRotateKey();
  const connectTelegram = useConnectTelegram();
  const verifyWhatsApp = useVerifyWhatsApp();
  const verifyEmail = useVerifyEmail();
  const verifyInstagram = useVerifyInstagram();

  const type = channel.type;
  const isWeb = type === "web";
  const [tab, setTab] = useState("setup");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [config, setConfig] = useState({ ...WIDGET_DEFAULTS, ...(channel.config || {}) });
  // The finished palette, exactly as the widget will resolve it — so the
  // fine-tune fields show the colour that ships, not the one that was typed.
  const resolved = panelTheme(config);
  const themeDefaults = {
    panelBg: (BASE_THEMES[config.theme] || BASE_THEMES.dark).bg,
    panelText: (BASE_THEMES[config.theme] || BASE_THEMES.dark).fg,
    panelSurface: resolved.surface,
  };

  const meta = p.types[type] || p.types.web;
  const TypeIcon = TYPE_ICON[type] || GlobeIcon;
  // Where the provider should post inbound messages.
  const webhookUrl =
    type === "whatsapp" ? `${base}/api/channels/whatsapp/${channel.id}`
    : type === "instagram" ? `${base}/api/channels/instagram/${channel.id}`
    : type === "email" ? `${base}/api/channels/email/${channel.id}?secret=${channel.inbound_secret || ""}`
    : null;
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
          <TypeIcon className="size-4" />
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

            {type === "telegram" && (
              <>
                <SecretField
                  label={p.fields.botToken}
                  placeholder={p.fields.botTokenPlaceholder}
                  saved={channel.has_token}
                  hint={channel.token_hint}
                  pending={updateChannel.isPending}
                  p={p}
                  onSave={(v) => patch({ bot_token: v }, res.tokenSaved)}
                />
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
                    <TelegramIcon className="size-3.5" />
                  )}
                  {p.connect}
                </Button>
              </>
            )}

            {type === "whatsapp" && (
              <>
                {/* One button beats five pasted fields, but the manual path
                    has to stay for anyone already set up and for deployments
                    without a verified Meta app. */}
                {signup?.available && <WhatsAppConnect channel={channel} signup={signup} p={p} />}

                <Collapse open={!signup?.available} label={p.whatsappSignup.manual}>
                  <SecretField
                    label={p.fields.waToken}
                    placeholder={p.fields.waTokenPlaceholder}
                    saved={channel.has_token}
                    hint={channel.token_hint}
                    pending={updateChannel.isPending}
                    p={p}
                    onSave={(v) => patch({ access_token: v }, res.tokenSaved)}
                  />

                  <Field label={p.fields.waPhoneId}>
                    <Input
                      defaultValue={channel.wa_phone_id || ""}
                      placeholder={p.fields.waPhoneIdPlaceholder}
                      onBlur={(e) =>
                        e.target.value !== (channel.wa_phone_id || "") &&
                        patch({ phone_number_id: e.target.value.trim() }, res.channelUpdated)
                      }
                    />
                  </Field>

                  <SecretField
                    label={p.fields.waAppSecret}
                    placeholder={p.fields.waAppSecretPlaceholder}
                    saved={channel.has_app_secret}
                    hint="••••••••"
                    pending={updateChannel.isPending}
                    p={p}
                    onSave={(v) => patch({ app_secret: v }, res.tokenSaved)}
                  />

                  {/* Meta has no setWebhook API, so without the one-click flow
                      these two get pasted by hand. */}
                  <CopyBox label={p.fields.callbackUrl} value={webhookUrl} />
                  <CopyBox label={p.fields.verifyToken} value={channel.verify_token || ""} />
                  <Hint>{p.whatsappHelp}</Hint>
                </Collapse>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={verifyWhatsApp.isPending || !channel.has_token}
                  onClick={() =>
                    verifyWhatsApp.mutate(channel.id, {
                      onSuccess: (r) =>
                        r?.success === false ? showError(r.message) : showSuccess(r.message),
                      onError: () => showError(res.channelUpdateError),
                    })
                  }
                >
                  {verifyWhatsApp.isPending ? (
                    <LoaderIcon className="size-3.5 animate-spin" />
                  ) : (
                    <WhatsAppIcon className="size-3.5" />
                  )}
                  {p.checkConnection}
                </Button>
              </>
            )}

            {type === "instagram" && (
              <>
                {igSignup?.available && (
                  <InstagramConnect channel={channel} signup={igSignup} p={p} />
                )}

                <Collapse open={!igSignup?.available} label={p.instagramSignup.manual}>
                  <SecretField
                    label={p.fields.igToken}
                    placeholder={p.fields.igTokenPlaceholder}
                    saved={channel.has_token}
                    hint={channel.token_hint}
                    pending={updateChannel.isPending}
                    p={p}
                    onSave={(v) => patch({ access_token: v }, res.tokenSaved)}
                  />

                  <Field label={p.fields.igAccountId}>
                    <Input
                      defaultValue={channel.ig_id || ""}
                      placeholder={p.fields.igAccountIdPlaceholder}
                      onBlur={(e) =>
                        e.target.value !== (channel.ig_id || "") &&
                        patch({ ig_id: e.target.value.trim() }, res.channelUpdated)
                      }
                    />
                  </Field>

                  <SecretField
                    label={p.fields.waAppSecret}
                    placeholder={p.fields.waAppSecretPlaceholder}
                    saved={channel.has_app_secret_ig}
                    hint="••••••••"
                    pending={updateChannel.isPending}
                    p={p}
                    onSave={(v) => patch({ app_secret: v }, res.tokenSaved)}
                  />

                  {/* Meta has no setWebhook API, so without the one-click flow
                      these two get pasted by hand. */}
                  <CopyBox label={p.fields.callbackUrl} value={webhookUrl} />
                  <CopyBox label={p.fields.verifyToken} value={channel.verify_token || ""} />
                  <Hint>{p.instagramHelp}</Hint>
                </Collapse>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={verifyInstagram.isPending || !channel.has_token}
                  onClick={() =>
                    verifyInstagram.mutate(channel.id, {
                      onSuccess: (r) =>
                        r?.success === false ? showError(r.message) : showSuccess(r.message),
                      onError: () => showError(res.channelUpdateError),
                    })
                  }
                >
                  {verifyInstagram.isPending ? (
                    <LoaderIcon className="size-3.5 animate-spin" />
                  ) : (
                    <InstagramIcon className="size-3.5" />
                  )}
                  {p.checkConnection}
                </Button>
              </>
            )}

            {type === "email" && (
              <>
                <div className="flex gap-3">
                  <Field label={p.fields.emailAddress} className="flex-1">
                    <Input
                      defaultValue={channel.config?.address || ""}
                      placeholder={p.fields.emailAddressPlaceholder}
                      onBlur={(e) =>
                        e.target.value !== (channel.config?.address || "") &&
                        patch(
                          { config: { ...(channel.config || {}), address: e.target.value.trim() } },
                          res.channelUpdated,
                        )
                      }
                    />
                  </Field>
                  <Field label={p.fields.emailFromName} className="flex-1">
                    <Input
                      defaultValue={channel.config?.from_name || ""}
                      placeholder={p.fields.emailFromNamePlaceholder}
                      onBlur={(e) =>
                        e.target.value !== (channel.config?.from_name || "") &&
                        patch(
                          { config: { ...(channel.config || {}), from_name: e.target.value.trim() } },
                          res.channelUpdated,
                        )
                      }
                    />
                  </Field>
                </div>

                <SecretField
                  label={p.fields.emailApiKey}
                  placeholder={p.fields.emailApiKeyPlaceholder}
                  saved={channel.has_token}
                  hint={channel.token_hint}
                  pending={updateChannel.isPending}
                  p={p}
                  onSave={(v) => patch({ api_key: v }, res.tokenSaved)}
                />

                {/* The secret is in the URL so providers that send no headers
                    can still authenticate. */}
                <CopyBox label={p.fields.inboundUrl} value={webhookUrl} />
                <Hint>{p.emailHelp}</Hint>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={verifyEmail.isPending}
                  onClick={() =>
                    verifyEmail.mutate(channel.id, {
                      onSuccess: (r) =>
                        r?.success === false ? showError(r.message) : showSuccess(r.message),
                      onError: () => showError(res.channelUpdateError),
                    })
                  }
                >
                  {verifyEmail.isPending ? (
                    <LoaderIcon className="size-3.5 animate-spin" />
                  ) : (
                    <MailIcon className="size-3.5" />
                  )}
                  {p.checkConnection}
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

              {/* 2 — the launcher itself */}
              <div>
                <p className="text-[13px] font-medium text-fg mb-1">{p.look.launcher}</p>
                <Hint className="mb-3">{p.look.launcherHint}</Hint>

                <div className="flex gap-2.5 mb-4">
                  {[
                    { value: "orb", label: p.look.styleOrb },
                    { value: "button", label: p.look.styleButton },
                  ].map((o) => {
                    const on = (config.launcherStyle || "orb") === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setCfg("launcherStyle", o.value)}
                        className={cn(
                          "flex-1 max-w-[168px] rounded-module border px-3 py-3 flex items-center gap-3 transition-colors cursor-pointer",
                          on ? "border-fg bg-secondary-transparent2" : "border-border hover:border-border-hover",
                        )}
                      >
                        {o.value === "orb" ? (
                          <Orb
                            accent={config.accent || "#c9ced6"}
                            accent2={config.accent2}
                            motion={config.orbMotion}
                            size={30}
                            live={on}
                          />
                        ) : (
                          <span
                            className="size-[30px] rounded-full grid place-items-center shrink-0"
                            style={{ background: config.accent || "#c9ced6" }}
                          >
                            <BotIcon shape={config.avatarShape} accent={config.accent} size={16} bare />
                          </span>
                        )}
                        <span className="text-[12px] text-fg text-left">{o.label}</span>
                      </button>
                    );
                  })}
                </div>

                {(config.launcherStyle || "orb") !== "button" && (
                  <div className="space-y-4 animate-fade">
                    <div>
                      <p className="text-[12px] text-secondary mb-2">{p.look.orbPresets}</p>
                      <div className="flex gap-2.5 flex-wrap">
                        {ORB_PRESETS.map((o) => {
                          const on =
                            (config.accent || "").toLowerCase() === o.accent.toLowerCase() &&
                            (config.accent2 || "") === o.accent2;
                          return (
                            <button
                              key={o.key}
                              type="button"
                              title={p.look.orbNames[o.key]}
                              aria-label={p.look.orbNames[o.key]}
                              onClick={() => setConfig((c) => ({ ...c, accent: o.accent, accent2: o.accent2 }))}
                              className={cn(
                                "rounded-full p-1 transition-transform cursor-pointer",
                                on ? "ring-2 ring-fg ring-offset-2 ring-offset-[var(--color-card)]" : "hover:scale-110",
                              )}
                            >
                              <Orb accent={o.accent} accent2={o.accent2} motion="still" size={30} />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Field label={p.look.motion}>
                      <Segmented
                        value={config.orbMotion || "alive"}
                        onChange={(v) => setCfg("orbMotion", v)}
                        options={[
                          { value: "alive", label: p.look.motionAlive },
                          { value: "calm", label: p.look.motionCalm },
                          { value: "still", label: p.look.motionStill },
                        ]}
                        className="w-fit"
                      />
                      <Hint>{p.look.motionHint}</Hint>
                    </Field>

                    <Toggle
                      checked={config.orbGlow !== false}
                      onChange={(v) => setCfg("orbGlow", v)}
                      label={p.look.glow}
                      hint={p.look.glowHint}
                    />
                  </div>
                )}
              </div>

              {/* 3 — the dialog itself */}
              <div>
                <p className="text-[13px] font-medium text-fg mb-1">{p.look.panel}</p>
                <Hint className="mb-3">{p.look.panelHint}</Hint>

                <Field label={p.look.language} className="mb-4 max-w-[360px]">
                  <NativeSelect
                    value={config.language || "auto"}
                    onChange={(e) => setCfg("language", e.target.value)}
                  >
                    <NativeSelectOption value="auto">{p.look.languageAuto}</NativeSelectOption>
                    {LANGUAGES.map((l) => (
                      <NativeSelectOption key={l.code} value={l.code}>{l.title}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Hint>{p.look.languageHint}</Hint>
                </Field>

                <div className="flex gap-3 flex-wrap mb-4">
                  <Field label={p.look.header} className="min-w-[310px]">
                    <Segmented
                      value={config.headerStyle || "full"}
                      onChange={(v) => setCfg("headerStyle", v)}
                      options={[
                        { value: "full", label: p.look.headerFull },
                        { value: "compact", label: p.look.headerCompact },
                        { value: "hidden", label: p.look.headerHidden },
                      ]}
                    />
                  </Field>
                  <Field label={p.look.density} className="min-w-[200px]">
                    <Segmented
                      value={config.density || "cosy"}
                      onChange={(v) => setCfg("density", v)}
                      options={[
                        { value: "cosy", label: p.look.densityCosy },
                        { value: "compact", label: p.look.densityCompact },
                      ]}
                    />
                  </Field>
                  <Field label={p.look.corners} className="w-[120px]">
                    <Input
                      type="number"
                      min="0"
                      max="28"
                      value={config.radius}
                      onChange={(e) => setCfg("radius", e.target.value)}
                    />
                  </Field>
                </div>

                <Field label={p.look.starters}>
                  <textarea
                    rows={3}
                    value={config.starters || ""}
                    onChange={(e) => setCfg("starters", e.target.value)}
                    placeholder={p.look.startersPlaceholder}
                    className="w-full resize-none bg-secondary-transparent2 border border-secondary-transparent rounded-button px-3 py-2.5 text-[13px] text-fg placeholder:text-muted outline-none focus:border-secondary/50 transition-colors leading-relaxed"
                  />
                  <Hint>{p.look.startersHint}</Hint>
                </Field>
              </div>

              {/* 4 — pick a look */}
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
                  {/* A preset is translated for each visitor; anything typed
                      by hand is shown to all of them exactly as written. */}
                  <NativeSelect
                    value={
                      String(config.launcherLabel || "").startsWith("preset:")
                        ? config.launcherLabel
                        : config.launcherLabel
                          ? "custom"
                          : ""
                    }
                    onChange={(e) =>
                      setCfg("launcherLabel", e.target.value === "custom" ? " " : e.target.value)
                    }
                  >
                    <NativeSelectOption value="">{p.look.labelNone}</NativeSelectOption>
                    {LABEL_PRESETS.map((key) => (
                      <NativeSelectOption key={key} value={`preset:${key}`}>
                        {widgetWords.labels?.[key] || key}
                      </NativeSelectOption>
                    ))}
                    <NativeSelectOption value="custom">{p.look.labelCustom}</NativeSelectOption>
                  </NativeSelect>

                  {Boolean(config.launcherLabel) &&
                    !String(config.launcherLabel).startsWith("preset:") && (
                      <Input
                        className="mt-2"
                        autoFocus
                        value={config.launcherLabel.trim() ? config.launcherLabel : ""}
                        onChange={(e) => setCfg("launcherLabel", e.target.value || " ")}
                        placeholder={p.look.launcherLabelPlaceholder}
                      />
                    )}
                  <Hint>
                    {String(config.launcherLabel || "").startsWith("preset:")
                      ? p.look.labelPresetHint
                      : p.look.launcherLabelHint}
                  </Hint>
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
                  <ColorField label={p.look.accent} value={config.accent} fallback="#c9ced6" onChange={(v) => setCfg("accent", v)} swatches={SWATCHES} />
                  <ColorField
                    label={p.look.accent2}
                    value={config.accent2}
                    fallback="#8b8b96"
                    onChange={(v) => setCfg("accent2", v)}
                    swatches={["#a78bfa", "#22d3ee", "#ff4d8d", "#8b8b96"]}
                  />
                  <Hint className="-mt-2">{p.look.accent2Hint}</Hint>
                  <ColorField label={p.look.panelBg} value={config.panelBg} fallback={themeDefaults.panelBg} onChange={(v) => setCfg("panelBg", v)} swatches={["#0a0a0c", "#14141a", "#0b1622", "#ffffff", "#fdfaf6"]} />
                  <ColorField label={p.look.panelText} value={config.panelText} fallback={themeDefaults.panelText} onChange={(v) => setCfg("panelText", v)} swatches={["#f4f4f6", "#c9c9d1", "#14141a", "#3a3a44"]} />
                  <ColorField label={p.look.panelSurface} value={config.panelSurface} fallback={themeDefaults.panelSurface} onChange={(v) => setCfg("panelSurface", v)} swatches={["#1c1c22", "#16293d", "#f1f1f4", "#eeeef1"]} />
                  <Field label={p.look.theme}>
                    <Segmented
                      value={config.theme || "dark"}
                      onChange={(v) =>
                        // Picking a theme that then does nothing is worse than
                        // having no themes: explicit panel colours set earlier
                        // would silently win. Choosing a theme clears them.
                        setConfig((c) => ({
                          ...c,
                          theme: v,
                          panelBg: null,
                          panelText: null,
                          panelSurface: null,
                        }))
                      }
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
                        avatarShape: config.avatarShape || "",
                        radius: Math.max(0, Math.min(Number(config.radius) || 20, 28)),
                        headerStyle: config.headerStyle || "full",
                        density: config.density || "cosy",
                        starters: (config.starters || "").trim(),
                        language: config.language || "auto",
                        launcherStyle: config.launcherStyle || "orb",
                        orbMotion: config.orbMotion || "alive",
                        orbGlow: config.orbGlow !== false,
                        accent2: config.accent2 || "",
                      },
                    },
                    res.channelUpdated,
                  )
                }
              >
                {updateChannel.isPending ? <LoaderIcon className="size-4 animate-spin" /> : p.look.save}
              </Button>
            </div>

            <WidgetPreview config={config} channel={channel} p={p} widgetWords={widgetWords} />
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

/**
 * A miniature of the customer's page, showing the panel as it will ship.
 *
 * It runs the same palette engine and the same orb the widget does, so a
 * seller can trust it. The previous one drew a flat circle and its own
 * colours, which is how a setting could look fine here and wrong on the site.
 */
function WidgetPreview({ config, channel, p, widgetWords }) {
  const t = panelTheme(config);
  const left = config.position === "left";
  const orb = (config.launcherStyle || "orb") !== "button";
  const header = config.headerStyle || "full";
  const compact = config.density === "compact";

  const size = Math.max(36, Math.min(Number(config.size) || 56, 72)) * 0.6;
  const edge = (Number(config.offset) || 20) * 0.5;
  const radius = Math.max(0, Math.min(Number(config.radius) || 20, 28));

  const label = resolveLauncherLabel(config.launcherLabel, widgetWords).trim();

  const starters = String(config.starters || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 2);

  return (
    <div className="laptop-2:sticky laptop-2:top-4">
      <p className="text-[11px] font-mono uppercase tracking-wider text-muted mb-1.5">{p.look.preview}</p>
      <div className="relative h-[380px] rounded-module border border-secondary-transparent bg-[#f2f2f4] overflow-hidden">
        {/* stand-in for the customer's own page */}
        <div className="p-3 space-y-2 opacity-40">
          <div className="h-2 w-2/3 rounded bg-black/25" />
          <div className="h-2 w-full rounded bg-black/15" />
          <div className="h-2 w-4/5 rounded bg-black/15" />
        </div>

        {/* the dialog */}
        <div
          className="absolute flex flex-col overflow-hidden"
          style={{
            background: t.bg,
            color: t.fg,
            border: `1px solid ${t.border}`,
            borderRadius: `${radius}px`,
            boxShadow: "0 14px 36px rgba(0,0,0,.22)",
            width: 176,
            height: 232,
            bottom: edge + size + 10,
            [left ? "left" : "right"]: edge,
          }}
        >
          {header !== "hidden" && (
            <div className="relative shrink-0">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-10 h-16"
                style={{
                  background: `radial-gradient(58% 72% at 16% 100%, ${t.accentOnPanel}33 0%, transparent 72%)`,
                }}
              />
              <div className="relative flex items-center gap-1.5 px-2 py-1.5 min-w-0">
                {header === "full" && (
                  <Orb accent={t.accent} accent2={config.accent2} motion="still" size={16} />
                )}
                <span className="text-[9px] font-semibold truncate min-w-0">
                  {config.title || channel.name}
                </span>
                <span
                  className="ml-auto size-3 rounded-full shrink-0"
                  style={{ background: `${t.fg}14` }}
                />
              </div>
              <span className="block h-px" style={{ background: t.border }} />
            </div>
          )}

          <div className={cn("flex-1 overflow-hidden", compact ? "p-1.5 space-y-1" : "p-2 space-y-1.5")}>
            <div
              className="max-w-[86%] px-2 py-1 rounded-[9px] rounded-bl-[3px] text-[8px] leading-snug"
              style={{ background: t.surface, border: `1px solid ${t.border}` }}
            >
              {p.look.sampleBot}
            </div>
            <div
              className="max-w-[72%] ml-auto px-2 py-1 rounded-[9px] rounded-br-[3px] text-[8px] leading-snug font-medium"
              style={{ background: t.accent, color: t.accentInk }}
            >
              {p.look.sampleUser}
            </div>
            {starters.map((text) => (
              <div
                key={text}
                className="inline-block mr-1 px-1.5 py-0.5 rounded-full text-[7px] truncate max-w-full"
                style={{ border: `1px solid ${t.border}`, color: t.secondary }}
              >
                {text}
              </div>
            ))}
          </div>

          <div className={cn("shrink-0", compact ? "p-1.5" : "p-2")}>
            <div
              className="flex items-center gap-1 rounded-full pl-2 pr-1 py-1"
              style={{ background: t.surface, border: `1px solid ${t.border}` }}
            >
              <span className="flex-1 h-2 rounded-full" style={{ background: `${t.fg}12` }} />
              <span className="size-3.5 rounded-full shrink-0" style={{ background: t.accent }} />
            </div>
          </div>
        </div>

        {config.greetingBubble && (
          <div
            className="absolute max-w-[140px] px-2 py-1 text-[9px] leading-snug shadow"
            style={{
              bottom: edge + size + 248,
              [left ? "left" : "right"]: edge,
              background: t.surface,
              color: t.fg,
              border: `1px solid ${t.border}`,
              borderRadius: Math.min(radius, 14),
            }}
          >
            {config.greetingBubble}
          </div>
        )}

        {/* The launcher, drawn the way the visitor will actually see it. */}
        {orb ? (
          <div
            className={cn(
              "absolute flex items-center gap-2",
              label &&
                "px-2 py-1 pr-3 rounded-full bg-[rgba(20,20,24,.72)] backdrop-blur-sm shadow-lg",
            )}
            style={{ bottom: edge, [left ? "left" : "right"]: edge }}
          >
            <Orb
              accent={t.accent}
              accent2={config.accent2}
              motion={config.orbMotion}
              size={label ? size * 0.72 : size}
              live={config.orbGlow !== false}
            />
            {label && (
              <span className="text-[10px] font-semibold text-white whitespace-nowrap">
                {label}
              </span>
            )}
          </div>
        ) : (
          <div
            className="absolute rounded-full grid place-items-center shadow-lg"
            style={{
              background: t.accent, color: t.accentInk, height: size, minWidth: size,
              padding: label ? "0 10px" : 0,
              bottom: edge, [left ? "left" : "right"]: edge,
            }}
          >
            <span className="text-[10px] font-semibold whitespace-nowrap flex items-center gap-1 px-0.5">
              <BotIcon shape={config.avatarShape} accent={t.accent} size={16} bare />
              {label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
