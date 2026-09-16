"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConversations } from "@/hooks/use-conversations";
import { useSyncSearchParam } from "@/hooks/use-sync-search-param";
import useDebounce from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { customerLabel, initialsFor, relativeTime } from "@/lib/display";
import { ChannelAvatar } from "@/components/ui/channel-look";
import Transcript from "./transcript";
import {
  ArrowLeftIcon, LoaderIcon, MessageSquareIcon, SearchIcon, UserRoundIcon,
} from "lucide-react";

/**
 * Two panes: who is talking, and what they said.
 *
 * The list used to show a name, a timestamp and three coloured chips — which
 * told an operator nothing about which conversation needed them. It now leads
 * with the last line of the conversation, and marks state only when the state
 * is unusual.
 */
export default function Inbox({ language, timezone }) {
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

  // On a phone the two panes cannot sit side by side, so opening a
  // conversation replaces the list and a back arrow returns to it.
  const [mobileReading, setMobileReading] = useState(false);
  useEffect(() => {
    if (!selectedId) setMobileReading(false);
  }, [selectedId]);

  const FILTERS = [
    { key: "all", label: p.filters.all },
    { key: "handoff", label: p.filters.handoff },
    { key: "escalated", label: p.filters.escalated },
    { key: "open", label: p.filters.open },
    { key: "resolved", label: p.filters.resolved },
  ];

  const waiting = (conversations || []).filter((c) => c.handoff).length;

  return (
    <div className="flex h-dvh min-h-0">
      {/* ── list ── */}
      <aside
        className={cn(
          "w-full tablet:w-[360px] shrink-0 border-r border-secondary-transparent flex flex-col min-h-0",
          mobileReading && "hidden tablet:flex",
        )}
      >
        <div className="px-4 pt-5 pb-3 border-b border-secondary-transparent shrink-0">
          <div className="flex items-baseline gap-2 mb-3">
            <h3 className="text-[15px] font-semibold text-fg">{p.meta.title}</h3>
            {waiting > 0 && (
              <span className="text-[11px] text-warning font-medium">
                {p.waitingCount.replace("{n}", waiting)}
              </span>
            )}
          </div>

          <div className="relative mb-3">
            <SearchIcon className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={p.searchPlaceholder}
              className="w-full bg-secondary-transparent2 border border-secondary-transparent rounded-button pl-9 pr-3 py-2 text-[13px] text-fg placeholder:text-muted outline-none focus:border-secondary/50 transition-colors"
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
            <ListSkeleton />
          ) : !conversations?.length ? (
            <div className="px-6 py-16 text-center animate-fade">
              <MessageSquareIcon className="size-6 text-muted mx-auto mb-3" />
              <p className="text-[13px] text-fg mb-1">{p.empty.title}</p>
              <p className="text-[12px] text-muted leading-relaxed">{p.empty.subtitle}</p>
            </div>
          ) : (
            conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                selected={selectedId === c.id}
                onSelect={() => {
                  setSelectedId(c.id);
                  setMobileReading(true);
                }}
                p={p}
              />
            ))
          )}
        </div>
      </aside>

      {/* ── transcript ── */}
      <section
        className={cn(
          "flex-1 min-w-0 flex-col min-h-0",
          mobileReading ? "flex" : "hidden tablet:flex",
        )}
      >
        {selected ? (
          <Transcript
            key={selected.id}
            conversation={selected}
            language={language}
            timezone={timezone}
            p={p}
            res={res}
            onBack={() => setMobileReading(false)}
            backIcon={ArrowLeftIcon}
          />
        ) : (
          <div className="flex-1 grid place-items-center">
            <div className="text-center animate-fade">
              <MessageSquareIcon className="size-7 text-muted mx-auto mb-3" />
              <p className="text-[13px] text-secondary">{p.selectPrompt}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * One conversation in the list.
 *
 * The preview line is the point of the row: it says who spoke last and what
 * about, which is what decides whether anyone needs to open it.
 */
function ConversationRow({ conversation: c, selected, onSelect, p }) {
  const preview = c.preview?.content?.replace(/\s+/g, " ").trim();
  const who =
    c.preview?.role === "agent" ? p.labels.you
    : c.preview?.role === "assistant" ? p.labels.ai
    : null;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left pl-4 pr-3 py-3 border-b border-secondary-transparent2 cursor-pointer relative transition-colors",
        selected ? "bg-secondary-transparent2" : "hover:bg-hover",
      )}
    >
      {/* A bar rather than a fill, so the selected row stays readable. */}
      {selected && <span className="absolute left-0 inset-y-0 w-[2px] bg-accent" />}

      <div className="flex items-start gap-3">
        <ChannelAvatar channel={c.channel} initials={initialsFor(c, p.labels)} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-fg truncate">
              {customerLabel(c, p.labels)}
            </span>
            <span className="text-[10px] text-muted shrink-0 ml-auto tabular-nums">
              {relativeTime(c.last_message_at, p.time)}
            </span>
          </div>

          <p className="text-[12px] text-muted truncate mt-0.5 leading-relaxed">
            {preview ? (
              <>
                {who && <span className="text-secondary">{who}: </span>}
                {preview}
              </>
            ) : (
              <span className="italic">{p.transcript.empty}</span>
            )}
          </p>

          {(c.handoff || (c.status !== "open" && c.status !== "resolved")) && (
            <div className="flex items-center gap-1.5 mt-1.5">
              {c.handoff ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning">
                  <UserRoundIcon className="size-2.5" />
                  {p.filters.handoff}
                </span>
              ) : (
                <span className="text-[10px] font-medium text-error">
                  {p.status[c.status] || c.status}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/** Same geometry as a loaded row, so nothing jumps when the data lands. */
function ListSkeleton() {
  return (
    <div className="animate-pulse">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-secondary-transparent2">
          <div className="size-9 rounded-full bg-secondary-transparent2 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2.5 w-28 rounded bg-secondary-transparent2" />
            <div className="h-2 w-full max-w-[180px] rounded bg-secondary-transparent2" />
          </div>
        </div>
      ))}
      <div className="sr-only">
        <LoaderIcon />
      </div>
    </div>
  );
}
