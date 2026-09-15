"use client";

import { useMemo, useState } from "react";
import {
  useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useAdjustStock, useResetStock,
  useServices, useCreateService, useUpdateService, useDeleteService,
  useResources, useServiceResourceMap, useSetServiceResources,
} from "@/hooks/use-catalogue";
import useDebounce from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { money } from "@/lib/display";
import { showError, showSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Segmented, SearchInput, EmptyState, Loading, Toggle, Hint } from "@/components/ui/page";
import ImageDrop from "@/components/ui/image-drop";
import { metadata as appMeta } from "@/config/metadata";
import {
  BoxIcon, ClockIcon, RotateCcwIcon, ImageIcon, LoaderIcon, MinusIcon, PackageIcon, PencilIcon,
  PlusIcon, SearchIcon, SparklesIcon, Trash2Icon, TriangleAlertIcon, UsersIcon,
} from "lucide-react";

const emptyProduct = {
  name: "", description: "", category: "", price: 0, currency: "kzt",
  stock: 0, initial_stock: null, low_stock_at: 3, track_stock: true, active: true, image_url: null,
};

export const emptyService = {
  name: "", description: "", category: "", price: 0, currency: "kzt",
  duration_min: 60, buffer_min: 10, capacity: 1, active: true, image_url: null,
  slot_mode: "any", slot_step_min: 30, slot_times: [], lead_time_min: 0,
  booking_mode: "appointment", min_party: 1, max_party: 1,
};


export default function CatalogueManager({ language }) {
  const p = language.app.pages.catalogue;
  const res = language.app.res;

  const [tab, setTab] = useState("products");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 400);
  const [editing, setEditing] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const resetStock = useResetStock();

  const filters = debounced ? { search: debounced } : undefined;
  const { data: products, isLoading: loadingProducts } = useProducts(filters);
  const { data: services, isLoading: loadingServices } = useServices(filters);
  const { data: resources } = useResources();
  const { data: resourceMap } = useServiceResourceMap();

  // Every service — a haircut or a yoga class — is performed by a person.
  const people = useMemo(
    () => (resources || []).filter((r) => (r.kind || "person") === "person"),
    [resources],
  );

  const loading = tab === "products" ? loadingProducts : loadingServices;
  const rows = tab === "products" ? products : services;

  const TABS = {
    products: { blank: emptyProduct, icon: PackageIcon, add: p.addProduct, empty: p.empty.products },
    services: { blank: emptyService, icon: SparklesIcon, add: p.addService, empty: p.empty.services },
  };
  const current = TABS[tab];
  const startNew = () => setEditing({ kind: tab, row: { ...current.blank } });

  // Only tracked products that have drifted from their baseline will move.
  const resettable = useMemo(
    () => (products || []).filter(
      (x) => x.track_stock && x.initial_stock != null && x.stock !== x.initial_stock,
    ).length,
    [products],
  );

  // Shown whenever stock is tracked at all, not only once something has
  // drifted — a button that appears only when needed is a button nobody finds.
  const tracksStock = (products || []).some((x) => x.track_stock);

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "products", label: p.tabs.products, icon: PackageIcon, count: products?.length },
            { value: "services", label: p.tabs.services, icon: SparklesIcon, count: services?.length },
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={p.searchPlaceholder}
          icon={SearchIcon}
          className="flex-1 min-w-[180px]"
        />
        {tab === "products" && tracksStock && (
          <Button
            variant="outline"
            title={resettable ? undefined : p.stock.resetNothing}
            onClick={() => setConfirmReset(true)}
            disabled={resetStock.isPending || resettable === 0}
          >
            {resetStock.isPending
              ? <LoaderIcon className="size-4 animate-spin" />
              : <RotateCcwIcon className="size-4" />}
            {p.stock.reset}
          </Button>
        )}
        <Button onClick={startNew}>
          <PlusIcon className="size-4" />
          {current.add}
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : !rows?.length ? (
        <EmptyState
          icon={current.icon}
          title={current.empty.title}
          description={current.empty.subtitle}
          action={
            <Button onClick={startNew}>
              <PlusIcon className="size-4" />
              {current.add}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 tablet:grid-cols-2 laptop:grid-cols-3">
          {rows.map((row) =>
            tab === "products" ? (
              <ProductCard key={row.id} product={row} p={p} res={res} onEdit={() => setEditing({ kind: "products", row })} />
            ) : (
              <ServiceCard
                key={row.id}
                service={row}
                resources={people}
                assigned={resourceMap?.[row.id] || []}
                p={p}
                res={res}
                onEdit={() => setEditing({ kind: "services", row })}
              />
            ),
          )}
        </div>
      )}

      {confirmReset && (
        <Dialog open onOpenChange={(v) => !v && setConfirmReset(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{p.stock.resetTitle}</DialogTitle>
            </DialogHeader>
            <div className="px-6 pt-5 pb-3">
              <p className="text-[13px] text-secondary leading-relaxed">
                {p.stock.resetBody.replace("{n}", resettable)}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmReset(false)}>
                {p.confirmDelete?.cancel || "Cancel"}
              </Button>
              <Button
                disabled={resetStock.isPending}
                onClick={() =>
                  resetStock.mutate(null, {
                    onSuccess: (r) => {
                      if (r?.success === false) return showError(r.message);
                      showSuccess(res.stockReset.replace("{n}", r?.data ?? resettable));
                      setConfirmReset(false);
                    },
                    onError: () => showError(res.stockResetError),
                  })
                }
              >
                {resetStock.isPending ? <LoaderIcon className="size-4 animate-spin" /> : p.stock.resetConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <EditorDialog
          kind={editing.kind}
          row={editing.row}
          resources={people}
          assigned={resourceMap?.[editing.row?.id] || []}
          p={p}
          res={res}
          language={language}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────── cards ──────────────────────────────── */

export function Thumb({ src, fallback: Fallback, tint }) {
  return src ? (
    <img src={src} alt="" className="w-full h-28 object-cover" />
  ) : (
    <div className={cn("w-full h-28 grid place-items-center", tint)}>
      <Fallback className="size-5 opacity-40" />
    </div>
  );
}

function ProductCard({ product, p, res, onEdit }) {
  const adjustStock = useAdjustStock();
  const deleteProduct = useDeleteProduct();

  const low = product.track_stock && product.stock <= product.low_stock_at;
  const out = product.track_stock && product.stock === 0;

  function bump(delta) {
    adjustStock.mutate(
      { productId: product.id, delta, reason: delta > 0 ? "restock" : "correction" },
      {
        onSuccess: (r) => r?.success === false && showError(r.message),
        onError: () => showError(res.stockUpdateError),
      },
    );
  }

  return (
    <div className="border border-border rounded-module bg-card overflow-hidden flex flex-col">
      <Thumb src={product.image_url} fallback={BoxIcon} tint="bg-info/5 text-info" />

      <div className="p-3.5 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-fg truncate">{product.name}</span>
              {!product.active && <Badge className="bg-muted/10 text-muted shrink-0">{p.paused}</Badge>}
            </div>
            <p className="text-[11px] text-muted line-clamp-2 mt-1 leading-relaxed">
              {product.description || p.noDescription}
            </p>
          </div>
          <span className="text-[13px] font-semibold text-fg shrink-0">
            {money(product.price, product.currency)}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-auto pt-1">
          {product.track_stock ? (
            <div className="flex items-center gap-1">
              <button onClick={() => bump(-1)} disabled={product.stock === 0 || adjustStock.isPending}
                aria-label={p.stock.decrease}
                className="size-6 grid place-items-center rounded-[6px] bg-secondary-transparent2 text-secondary hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                <MinusIcon className="size-3" />
              </button>
              <span className={cn("text-[12px] font-mono tabular-nums min-w-[3ch] text-center",
                out ? "text-error" : low ? "text-warning" : "text-fg")}>
                {product.stock}
                {product.initial_stock != null && product.initial_stock !== product.stock && (
                  <span className="text-muted">/{product.initial_stock}</span>
                )}
              </span>
              <button onClick={() => bump(1)} disabled={adjustStock.isPending}
                aria-label={p.stock.increase}
                className="size-6 grid place-items-center rounded-[6px] bg-secondary-transparent2 text-secondary hover:text-fg cursor-pointer">
                <PlusIcon className="size-3" />
              </button>
              {out ? (
                <Badge className="bg-error/10 text-error ml-1">
                  <TriangleAlertIcon className="size-2.5" />
                  {p.stock.out}
                </Badge>
              ) : low ? (
                <Badge className="bg-warning/10 text-warning ml-1">{p.stock.low}</Badge>
              ) : null}
            </div>
          ) : (
            <Badge className="bg-secondary-transparent2 text-secondary">{p.stock.untracked}</Badge>
          )}

          <RowActions
            onEdit={onEdit}
            onDelete={() =>
              deleteProduct.mutate(product.id, {
                onSuccess: () => showSuccess(res.productDeleted),
                onError: () => showError(res.productDeleteError),
              })
            }
            p={p}
          />
        </div>
      </div>
    </div>
  );
}

export function ServiceCard({ service, resources, assigned, p, res, onEdit }) {
  const deleteService = useDeleteService();

  const masters = (resources || []).filter((s) => assigned.includes(s.id));
  const slotLabel =
    service.slot_mode === "fixed"
      ? (service.slot_times || []).map((t) => String(t).slice(0, 5)).join(", ") || p.slots.noneSet
      : service.slot_mode === "any"
        ? p.slots.anyShort
        : p.slots.everyN.replace("{n}", service.slot_step_min);

  return (
    <div className="border border-border rounded-module bg-card overflow-hidden flex flex-col">
      <Thumb src={service.image_url} fallback={SparklesIcon} tint="bg-purple-500/5 text-purple-400" />

      <div className="p-3.5 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-fg truncate">{service.name}</span>
              {!service.active && <Badge className="bg-muted/10 text-muted shrink-0">{p.paused}</Badge>}
            </div>
            <p className="text-[11px] text-muted line-clamp-2 mt-1 leading-relaxed">
              {service.description || p.noDescription}
            </p>
          </div>
          <span className="text-[13px] font-semibold text-fg shrink-0">
            {money(service.price, service.currency)}
          </span>
        </div>

        <dl className="text-[11px] space-y-1 mt-auto">
          <div className="flex items-center gap-1.5">
            <ClockIcon className="size-3 text-muted shrink-0" />
            <dd className="text-secondary">
              {service.duration_min} {p.minutes}
              {service.buffer_min > 0 && ` + ${service.buffer_min} ${p.buffer}`}
            </dd>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="text-muted shrink-0 mt-px">◷</span>
            <dd className="text-secondary truncate">{slotLabel}</dd>
          </div>
          <div className="flex items-start gap-1.5">
            <UsersIcon className="size-3 text-muted shrink-0 mt-px" />
            <dd className={cn("truncate", masters.length ? "text-secondary" : "text-muted")}>
              {service.max_party > 1 && (
                <span className="text-fg">{p.booking.upTo.replace("{n}", service.max_party)} · </span>
              )}
              {masters.length ? masters.map((m) => m.name).join(", ") : p.anyMaster}
            </dd>
          </div>
        </dl>

        <div className="flex items-center pt-1">
          {service.category && (
            <Badge className="bg-secondary-transparent2 text-secondary">{service.category}</Badge>
          )}
          <RowActions
            onEdit={onEdit}
            onDelete={() =>
              deleteService.mutate(service.id, {
                onSuccess: () => showSuccess(res.serviceDeleted),
                onError: () => showError(res.serviceDeleteError),
              })
            }
            p={p}
          />
        </div>
      </div>
    </div>
  );
}

export function RowActions({ onEdit, onDelete, p }) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <button onClick={onEdit} aria-label={p.edit}
        className="size-7 grid place-items-center rounded-button text-muted hover:text-fg hover:bg-hover cursor-pointer">
        <PencilIcon className="size-3.5" />
      </button>
      <button onClick={onDelete} aria-label={p.delete}
        className="size-7 grid place-items-center rounded-button text-muted hover:text-error hover:bg-error/10 cursor-pointer">
        <Trash2Icon className="size-3.5" />
      </button>
    </div>
  );
}

/* ─────────────────────────────── editor ──────────────────────────────── */

export function EditorDialog({ kind, row, resources, assigned, p, res, language, onClose }) {
  const isProduct = kind === "products";
  const [form, setForm] = useState(row);
  const [masters, setMasters] = useState(assigned);
  const [times, setTimes] = useState(
    (row.slot_times || []).map((t) => String(t).slice(0, 5)).join(", "),
  );

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const setServiceResources = useSetServiceResources();

  const pending =
    createProduct.isPending || updateProduct.isPending ||
    createService.isPending || updateService.isPending;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  function save(e) {
    e.preventDefault();
    if (!form.name?.trim()) return showError(res.nameRequired);

    const finish = async (serviceId) => {
      if (!isProduct && serviceId) {
        await setServiceResources.mutateAsync({ serviceId, resourceIds: masters });
      }
      showSuccess(row.id ? res.catalogueUpdated : res.catalogueCreated);
      onClose();
    };
    const fail = () => showError(res.catalogueSaveError);

    const { id, user_id, created_at, updated_at, embedding, ...payload } = form;
    payload.price = Number(payload.price) || 0;

    if (isProduct) {
      payload.stock = Number(payload.stock) || 0;
      payload.low_stock_at = Number(payload.low_stock_at) || 0;
      // Blank means "however many there are now", so a shop that never thinks
      // about resets still gets a sane baseline.
      payload.initial_stock =
        payload.initial_stock === "" || payload.initial_stock == null
          ? payload.stock
          : Math.max(0, Number(payload.initial_stock) || 0);
      const done = (r) => (r?.success === false ? showError(r.message) : finish());
      if (row.id) updateProduct.mutate({ id: row.id, updates: payload }, { onSuccess: done, onError: fail });
      else createProduct.mutate(payload, { onSuccess: done, onError: fail });
      return;
    }

    payload.duration_min = Number(payload.duration_min) || 60;
    payload.buffer_min = Number(payload.buffer_min) || 0;
    payload.capacity = Math.max(1, Number(payload.capacity) || 1);
    payload.slot_step_min =
      payload.slot_mode === "any" ? 30 : Number(payload.slot_step_min) || 30;
    payload.lead_time_min = Number(payload.lead_time_min) || 0;
    payload.min_party = 1;
    payload.max_party = Math.max(1, Number(payload.max_party) || 1);
    // One seat is an appointment; several are a group that fills up.
    payload.booking_mode = payload.max_party > 1 ? "class" : "appointment";

    if (payload.slot_mode === "fixed") {
      const parsed = times
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
        .map((t) => (t.length === 4 ? `0${t}` : t));
      if (!parsed.length) return showError(p.slots.needTimes);
      payload.slot_times = parsed;
    } else {
      payload.slot_times = [];
    }

    const done = (r) => {
      if (r?.success === false) return showError(r.message);
      finish(row.id || r?.data?.id);
    };
    if (row.id) updateService.mutate({ id: row.id, updates: payload }, { onSuccess: done, onError: fail });
    else createService.mutate(payload, { onSuccess: done, onError: fail });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {row.id
              ? isProduct ? p.editor.editProduct : p.editor.editService
              : isProduct ? p.addProduct : p.addService}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={save} className="px-6 pt-5 pb-3 space-y-5 max-h-[62vh] overflow-y-auto scrollbar-none">
          <ImageDrop
            value={form.image_url}
            onChange={(url) => set("image_url", url)}
            label={p.fields.image}
            hint={p.fields.imageHint}
          />

          <Field label={p.fields.name}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={p.fields.namePlaceholder} autoFocus />
          </Field>

          <Field label={p.fields.description}>
            <Textarea rows={3} value={form.description || ""} onChange={(e) => set("description", e.target.value)} placeholder={p.fields.descriptionPlaceholder} />
          </Field>

          <div className="flex gap-3">
            <Field label={p.fields.price} className="flex-1">
              <Input type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field label={p.fields.currency} className="flex-1">
              <NativeSelect value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                {appMeta.currencies.map((c) => (
                  <NativeSelectOption key={c.code} value={c.code}>
                    {language.app.global.currencies[c.code] ?? c.code.toUpperCase()}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label={p.fields.category} className="flex-1">
              <Input value={form.category || ""} onChange={(e) => set("category", e.target.value)} placeholder={p.fields.categoryPlaceholder} />
            </Field>
          </div>

          {isProduct ? (
            <>
              <div className="flex gap-3">
                <Field label={p.fields.stock} className="flex-1">
                  <Input type="number" min="0" value={form.stock} onChange={(e) => set("stock", e.target.value)} />
                </Field>
                <Field label={p.fields.initialStock} className="flex-1">
                  <Input
                    type="number"
                    min="0"
                    value={form.initial_stock ?? ""}
                    placeholder={String(form.stock ?? 0)}
                    onChange={(e) => set("initial_stock", e.target.value)}
                  />
                </Field>
                <Field label={p.fields.lowStockAt} className="flex-1">
                  <Input type="number" min="0" value={form.low_stock_at} onChange={(e) => set("low_stock_at", e.target.value)} />
                </Field>
              </div>
              <Hint>{p.fields.initialStockHint}</Hint>
            </>
          ) : (
            <>
              <div className="border-b border-secondary-transparent pb-4 space-y-4">
                <div>
                  <Field label={p.booking.capacity}>
                    <Input
                      type="number"
                      min="1"
                      value={form.capacity}
                      onChange={(e) => set("capacity", e.target.value)}
                      className="w-[130px]"
                    />
                  </Field>
                  <Hint className="mt-2">{p.booking.capacityHint}</Hint>
                </div>

                <div>
                  <Field label={p.booking.maxParty}>
                    <Input
                      type="number"
                      min="1"
                      value={form.max_party}
                      onChange={(e) => set("max_party", e.target.value)}
                      className="w-[130px]"
                    />
                  </Field>
                  <Hint className="mt-2">
                    {Number(form.max_party) > 1 ? p.booking.groupHint : p.booking.soloHint}
                  </Hint>
                </div>
              </div>

              <div className="flex gap-3">
                <Field label={p.fields.duration} className="flex-1">
                  <Input type="number" min="5" step="5" value={form.duration_min} onChange={(e) => set("duration_min", e.target.value)} />
                </Field>
                <Field label={p.fields.bufferMin} className="flex-1">
                  <Input type="number" min="0" step="5" value={form.buffer_min} onChange={(e) => set("buffer_min", e.target.value)} />
                </Field>
                <Field label={p.fields.leadTime} className="flex-1">
                  <Input type="number" min="0" step="30" value={form.lead_time_min} onChange={(e) => set("lead_time_min", e.target.value)} />
                </Field>
              </div>

              <div className="border-t border-secondary-transparent pt-4">
                <p className="text-[13px] font-semibold text-fg mb-1">{p.slots.title}</p>
                <Hint className="mb-3">{p.slots.help}</Hint>

                <Segmented
                  value={form.slot_mode}
                  onChange={(v) => set("slot_mode", v)}
                  options={[
                    { value: "any", label: p.slots.any },
                    { value: "grid", label: p.slots.grid },
                    { value: "fixed", label: p.slots.fixed },
                  ]}
                  className="mb-3 w-fit"
                />

                {form.slot_mode === "grid" ? (
                  <Field label={p.slots.stepLabel}>
                    <NativeSelect value={form.slot_step_min} onChange={(e) => set("slot_step_min", e.target.value)}>
                      {[5, 10, 15, 20, 30, 45, 60, 90, 120].map((n) => (
                        <NativeSelectOption key={n} value={n}>
                          {p.slots.everyN.replace("{n}", n)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                ) : form.slot_mode === "fixed" ? (
                  <Field label={p.slots.timesLabel}>
                    <Input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="11:00, 14:00, 17:00" />
                    <Hint>{p.slots.timesHint}</Hint>
                  </Field>
                ) : null}

                <Hint className="mt-3">{p.slots.modeHints[form.slot_mode] || ""}</Hint>
              </div>

              <div className="border-t border-secondary-transparent pt-4">
                <p className="text-[13px] font-semibold text-fg mb-1">{p.resourcesSection.title}</p>
                <Hint className="mb-3">{p.resourcesSection.help}</Hint>

                {!resources?.length ? (
                  <Hint>{p.resourcesSection.none}</Hint>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {resources.filter((s) => s.active).map((s) => {
                      const on = masters.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setMasters((m) => (on ? m.filter((x) => x !== s.id) : [...m, s.id]))
                          }
                          className={cn(
                            "px-2.5 py-1.5 rounded-button text-[12px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5",
                            on ? "bg-fg text-primary" : "bg-secondary-transparent2 text-secondary hover:text-fg",
                          )}
                        >
                          <span>{s.icon || "💫"}</span>
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!masters.length && (
                  <Hint className="mt-2">
                    {p.resourcesSection.noneSelected.replace("{n}", form.capacity || 1)}
                  </Hint>
                )}
              </div>
            </>
          )}

          <div className="border-t border-secondary-transparent pt-4 space-y-3">
            <Toggle
              checked={form.active}
              onChange={(v) => set("active", v)}
              label={p.fields.activeLabel}
              hint={p.fields.activeHint}
            />
            {isProduct && (
              <Toggle
                checked={form.track_stock}
                onChange={(v) => set("track_stock", v)}
                label={p.fields.trackStock}
                hint={p.fields.trackStockHint}
              />
            )}
          </div>
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} type="button">{p.editor.cancel}</Button>
          <Button onClick={save} disabled={pending}>
            {pending ? <LoaderIcon className="size-4 animate-spin" /> : p.editor.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
