"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { uploadCatalogueImage } from "@/actions/catalogue";
import { showError } from "@/lib/toast";
import { ImageIcon, LoaderIcon, XIcon } from "lucide-react";

/**
 * Drop or pick one catalogue image.
 *
 * Uploads immediately and hands back a public URL, so the parent form only
 * ever stores a string — no multipart submit, no half-saved rows.
 */
export default function ImageDrop({ value, onChange, label, hint, className }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await uploadCatalogueImage(form);
      if (res?.success === false) showError(res.message);
      else onChange(res.data.url);
    } catch (err) {
      showError(err?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      {label && (
        <p className="text-[13px] text-fg mb-2">
          {label}
          {hint && <span className="text-[11px] text-muted ml-2">{hint}</span>}
        </p>
      )}

      {value ? (
        <div className="relative w-full h-36 rounded-button overflow-hidden border border-secondary-transparent group">
          {/* Remote Supabase URLs, so a plain img avoids next/image host config. */}
          <img src={value} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove image"
            className="absolute top-2 right-2 size-7 grid place-items-center rounded-button bg-primary/80 text-fg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            upload(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          className={cn(
            "w-full h-36 rounded-button border border-dashed grid place-items-center transition-colors cursor-pointer",
            over ? "border-accent bg-accent/5" : "border-border hover:border-secondary/50",
            busy && "opacity-60 cursor-wait",
          )}
        >
          <span className="flex flex-col items-center gap-1.5 text-muted">
            {busy ? <LoaderIcon className="size-5 animate-spin" /> : <ImageIcon className="size-5" />}
            <span className="text-[12px]">{busy ? "Uploading…" : "Drop an image or click to choose"}</span>
            <span className="text-[10px]">PNG, JPEG, WEBP · up to 5 MB</span>
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        hidden
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
