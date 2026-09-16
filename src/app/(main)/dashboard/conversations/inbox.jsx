"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useConversations,
  useMessages,
  useOrders,
  useSendAgentMessage,
  useUpdateConversation,
} from "@/hooks/use-conversations";
import { useSyncSearchParam } from "@/hooks/use-sync-search-param";
import useDebounce from "@/hooks/use-debounce";
import { cn, createdAtDecode } from "@/lib/utils";
import { customerLabel, initialsFor, relativeTime, money } from "@/lib/display";
import { showError, showSuccess } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LoaderIcon,
  SearchIcon,
  SendIcon,
  UserRoundIcon,
  CheckCircle2Icon,
  MessageSquareIcon,
  PackageIcon,
  RotateCcwIcon,
  BotIcon,
} from "lucide-react";

const CHANNEL_STYLES = {
  webchat: "bg-info/10 text-info",
  telegram: "bg-info/10 text-info",
  whatsapp: "bg-success/10 text-success",
  email: "bg-muted/10 text-secondary",
  playground: "bg-purple-500/10 text-purple-500",
};

const STATUS_STYLES = {
  open: "bg-success/10 text-success",
  needs_review: "bg-warning/10 text-warning",
  escalated: "bg-error/10 text-error",
  resolved: "bg-muted/10 text-secondary",
  closed: "bg-muted/10 text-muted",
};

export default function Inbox({ language }) {
  const p = language.app.pages.conversations;
  const res = language.app.res;

  // The overview links straight to a conversation (?c=<id>); honour it.
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState(() => searchParams.get("c") || null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);

  useSyncSearchParam("c", selectedId || "");

  const filters = useMemo(() => {
    const f = {};
    if (filter === "handoff") f.handoff = true;
    else if (filter !== "all") f.status = filter;
    if (debouncedSearch) f.search = debouncedSearch;
    return f;
  }, [filter, debouncedSearch]);

  const { data: conversations, isLoading } = useConversations(filters);

  const selected = conversations?.find((c) => c.id === selectedId) || null;

  const FILTERS = [
    { key: "all", label: p.filters.all },
    { key: "open", label: p.filters.open },
    { key: "escalated", label: p.filters.escalated },
    { key: "handoff", label: p.filters.handoff },
    { key: "resolved", label: p.filters.resolved },
  ];

  return (
    <div className="flex h-dvh min-h-0">
      {/* ── list ── */}
      <aside className="w-[340px] shrink-0 border-r border-secondary-transparent flex flex-col min-h-0">
        <div className="px-4 pt-5 pb-3 border-b border-secondary-transparent shrink-0">
          <div className="title mb-3">
            <h3>{p.meta.title}</h3>
          </div>

          <div className="relative mb-3">
            <SearchIcon className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={p.searchPlaceholder}
              className="w-full bg-secondary-transparent2 border border-secondary-transparent rounded-button pl-9 pr-3 py-2 text-[13px] text-fg placeholder:text-muted outline-none focus:border-secondary/50"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-2.5 py-1 rounded-button text-[11px] font-medium transition-colors cursor-pointer shrink-0",
                  filter === f.key
                    ? "bg-fg text-primary"
                    : "bg-secondary-transparent2 text-secondary hover:text-fg",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <LoaderIcon className="animate-spin text-muted size-5" />
            </div>
          ) : !conversations?.length ? (
            <div className="px-6 py-16 text-center">
              <MessageSquareIcon className="size-6 text-muted mx-auto mb-3" />
              <p className="text-[13px] text-fg mb-1">{p.empty.title}</p>
              <p className="text-[12px] text-muted leading-relaxed">{p.empty.subtitle}</p>
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-secondary-transparent2 transition-colors cursor-pointer",
                  selectedId === c.id ? "bg-secondary-transparent2" : "hover:bg-hover",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className="size-8 shrink-0 rounded-full bg-secondary-transparent2 grid place-items-center text-[10px] font-semibold text-secondary">
                    {initialsFor(c, p.labels)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-fg truncate">
                        {customerLabel(c, p.labels)}
                      </span>
                      <span className="text-[10px] text-muted shrink-0">
                        {relativeTime(c.last_message_at, p.time)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 overflow-hidden">
                      <Badge className={CHANNEL_STYLES[c.channel] || "bg-muted/10 text-muted"}>
                        {p.channels[c.channel] || c.channel}
                      </Badge>
                      {c.handoff && (
                        <Badge className="bg-warning/10 text-warning">
                          <UserRoundIcon className="size-2.5" />
                          {p.filters.handoff}
                        </Badge>
                      )}
                      {c.status !== "open" && (
                        <Badge className={STATUS_STYLES[c.status] || "bg-muted/10 text-muted"}>
                          {p.status[c.status] || c.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── transcript ── */}
      <section className="flex-1 min-w-0 flex flex-col min-h-0">
        {selected ? (
          <Transcript key={selected.id} conversation={selected} language={language} p={p} res={res} />
        ) : (
          <div className="flex-1 grid place-items-center">
            <div className="text-center">
              <MessageSquareIcon className="size-7 text-muted mx-auto mb-3" />
              <p className="text-[13px] text-secondary">{p.selectPrompt}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Transcript({ conversation, language, p, res }) {
  const { data: messages, isLoading } = useMessages(conversation.id);
  const { data: orders } = useOrders({ conversationId: conversation.id });
  const sendMessage = useSendAgentMessage();
  const updateConversation = useUpdateConversation();
  const [reply, setReply] = useState("");

  const resolved = conversation.status === "resolved" || conversation.status === "closed";

  function handleSend(e) {
    e.preventDefault();
    if (!reply.trim()) return;

    sendMessage.mutate(
      { conversationId: conversation.id, content: reply },
      {
        onSuccess: (r) => {
          if (r?.success === false) return showError(r.message);
          setReply("");
        },
        onError: () => showError(res.messageSendError),
      },
    );
  }

  function setStatus(status) {
    updateConversation.mutate(
      { id: conversation.id, updates: { status, ...(status === "open" ? { handoff: false, handoff_at: null } : {}) } },
      {
        onSuccess: (r) =>
          r?.success === false ? showError(r.message) : showSuccess(res.conversationUpdated),
        onError: () => showError(res.conversationUpdateError),
      },
    );
  }

  return (
    <>
      <header className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-secondary-transparent shrink-0">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-fg truncate">
            {customerLabel(conversation, p.labels)}
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted">
            <span>{p.channels[conversation.channel] || conversation.channel}</span>
            {conversation.phone && (
              <>
                <span>·</span>
                <span>{conversation.phone}</span>
              </>
            )}
            {conversation.personas?.name && (
              <>
                <span>·</span>
                <span>{conversation.personas.name}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {conversation.handoff && (
            // Otherwise the assistant waits out the quiet period before it
            // picks the conversation back up.
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                updateConversation.mutate(
                  { id: conversation.id, updates: { handoff: false, handoff_at: null, status: "open" } },
                  {
                    onSuccess: (r) =>
                      r?.success === false ? showError(r.message) : showSuccess(res.handoffReleased),
                    onError: () => showError(res.conversationUpdateError),
                  },
                )
              }
            >
              <BotIcon className="size-3.5" />
              {p.actions.backToAssistant}
            </Button>
          )}
          {resolved ? (
            <Button variant="ghost" size="sm" onClick={() => setStatus("open")}>
              <RotateCcwIcon className="size-3.5" />
              {p.actions.reopen}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setStatus("resolved")}>
              <CheckCircle2Icon className="size-3.5" />
              {p.actions.resolve}
            </Button>
          )}
        </div>
      </header>

      {orders?.length > 0 && (
        <div className="px-5 py-3 border-b border-secondary-transparent bg-success/5 shrink-0">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center gap-2 text-[12px]">
              <PackageIcon className="size-3.5 text-success shrink-0" />
              <span className="text-fg">
                {(o.items || []).map((i) => `${i.quantity}× ${i.title}`).join(", ")}
              </span>
              <span className="text-success font-medium ml-auto shrink-0">
                {money(o.total, o.currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-3 scrollbar-none">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <LoaderIcon className="animate-spin text-muted size-5" />
          </div>
        ) : !messages?.length ? (
          <p className="text-center text-[12px] text-muted py-10">{p.transcript.empty}</p>
        ) : (
          messages.map((m) => {
            const fromCustomer = m.role === "customer";
            const { time } = createdAtDecode(m.created_at);
            return (
              <div
                key={m.id}
                className={cn("flex flex-col gap-1", fromCustomer ? "items-start" : "items-end")}
              >
                <div
                  className={cn(
                    "max-w-[68%] rounded-button px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words",
                    fromCustomer
                      ? "bg-secondary-transparent2 border border-secondary-transparent text-fg"
                      : m.role === "agent"
                        ? "bg-info/15 border border-info/30 text-fg"
                        : "bg-accent/15 border border-accent/30 text-fg",
                  )}
                >
                  {m.content}
                </div>
                <span className="text-[10px] text-muted px-1">
                  {m.role === "agent" ? p.labels.agent : fromCustomer ? "" : p.labels.bot} {time}
                </span>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="border-t border-secondary-transparent p-3 flex items-end gap-2 shrink-0"
      >
        <textarea
          rows={1}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) handleSend(e);
          }}
          placeholder={p.reply.placeholder}
          className="flex-1 resize-none bg-secondary-transparent2 border border-secondary-transparent rounded-button px-3 py-2.5 text-[13px] text-fg placeholder:text-muted outline-none focus:border-secondary/50 max-h-28"
        />
        <button
          type="submit"
          disabled={sendMessage.isPending || !reply.trim()}
          aria-label={p.reply.send}
          className="size-9 shrink-0 rounded-button bg-fg text-primary grid place-items-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {sendMessage.isPending ? (
            <LoaderIcon className="size-4 animate-spin" />
          ) : (
            <SendIcon className="size-4" />
          )}
        </button>
      </form>
    </>
  );
}
