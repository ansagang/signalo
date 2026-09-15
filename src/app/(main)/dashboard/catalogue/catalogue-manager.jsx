"use client";

import { useMemo, useState } from "react";
import {
  useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useAdjustStock,
  useServices, useCreateService, useUpdateService, useDeleteService,
  useStaff, useServiceStaffMap, useSetServiceStaff,
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
  BoxIcon, ClockIcon, ImageIcon, LoaderIcon, MinusIcon, PackageIcon, PencilIcon,
  PlusIcon, SearchIcon, SparklesIcon, Trash2Icon, TriangleAlertIcon, UsersIcon,
} from "lucide-react";

const emptyProduct = {
  name: "", description: "", category: "", price: 0, currency: "kzt",
  stock: 0, low_stock_at: 3, track_stock: true, active: true, image_url: null,
};

const emptyService = {
  name: "", description: "", category: "", price: 0, currency: "kzt",
  duration_min: 60, buffer_min: 10, max_parallel: 1, active: true, image_url: null,
  slot_mode: "grid", slot_step_min: 30, slot_times: [], lead_time_min: 0,
};

export default function CatalogueManager({ language }) {
  const p = language.app.pages.catalogue;
  const res = language.app.res;

  const [tab, setTab] = useState("products");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 400);
  const [editing, setEditing] = useState(null);

  const filters = debounced ? { search: debounced } : undefined;
  const { data: products, isLoading: loadingProducts } = useProducts(filters);
  const { data: services, isLoading: loadingServices } = useServices(filters);
  const { data: staff } = useStaff();
  const { data: staffMap } = useServiceStaffMap();

  const loading = tab === "products" ? loadingProducts : loadingServices;
  const rows = tab === "products" ? products : services;

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
        <Button
          onClick={() =>
            setEditing({ kind: tab, row: tab === "products" ? { ...emptyProduct } : { ...emptyService } })
          }
        >
          <PlusIcon className="size-4" />
          {tab === "products" ? p.addProduct : p.addService}
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : !rows?.length ? (
        <EmptyState
          icon={tab === "products" ? PackageIcon : SparklesIcon}
          title={tab === "products" ? p.empty.products.title : p.empty.services.title}
          description={tab === "products" ? p.empty.products.subtitle : p.empty.services.subtitle}
          action={
            <Button
              onClick={() =>
                setEditing({ kind: tab, row: tab === "products" ? { ...emptyProduct } : { ...emptyService } })
              }
            >
              <PlusIcon className="size-4" />
              {tab === "products" ? p.addProduct : p.addService}
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
                staff={staff}
                assigned={staffMap?.[row.id] || []}
                p={p}
                res={res}
                onEdit={() => setEditing({ kind: "services", row })}
              />
            ),
          )}
        </div>
      )}

      {editing && (
        <EditorDialog
          kind={editing.kind}
          row={editing.row}
          staff={staff}
          assigned={staffMap?.[editing.row?.id] || []}
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

function Thumb({ src, fallback: Fallback, tint }) {
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

function ServiceCard({ service, staff, assigned, p, res, onEdit }) {
  const deleteService = useDeleteService();

  const masters = (staff || []).filter((s) => assigned.includes(s.id));
  const slotLabel =
    service.slot_mode === "fixed"
      ? (service.slot_times || []).map((t) => String(t).slice(0, 5)).join(", ") || p.slots.noneSet
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

function RowActions({ onEdit, onDelete, p }) {
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

function EditorDialog({ kind, row, staff, assigned, p, res, language, onClose }) {
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
  const setServiceStaff = useSetServiceStaff();

  const pending =
    createProduct.isPending || updateProduct.isPending ||
    createService.isPending || updateService.isPending;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  function save(e) {
    e.preventDefault();
    if (!form.name?.trim()) return showError(res.nameRequired);

    const finish = async (serviceId) => {
      if (!isProduct && serviceId) {
        await setServiceStaff.mutateAsync({ serviceId, staffIds: masters });
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
      const done = (r) => (r?.success === false ? showError(r.message) : finish());
      if (row.id) updateProduct.mutate({ id: row.id, updates: payload }, { onSuccess: done, onError: fail });
      else createProduct.mutate(payload, { onSuccess: done, onError: fail });
      return;
    }

    payload.duration_min = Number(payload.duration_min) || 60;
    payload.buffer_min = Number(payload.buffer_min) || 0;
    payload.max_parallel = Number(payload.max_parallel) || 1;
    payload.slot_step_min = Number(payload.slot_step_min) || 30;
    payload.lead_time_min = Number(payload.lead_time_min) || 0;

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
            <div className="flex gap-3">
              <Field label={p.fields.stock} className="flex-1">
                <Input type="number" min="0" value={form.stock} onChange={(e) => set("stock", e.target.value)} />
              </Field>
              <Field label={p.fields.lowStockAt} className="flex-1">
                <Input type="number" min="0" value={form.low_stock_at} onChange={(e) => set("low_stock_at", e.target.value)} />
              </Field>
            </div>
          ) : (
            <>
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
                    { value: "grid", label: p.slots.grid },
                    { value: "fixed", label: p.slots.fixed },
                  ]}
                  className="mb-3 w-fit"
                />

                {form.slot_mode === "grid" ? (
                  <Field label={p.slots.stepLabel}>
                    <NativeSelect value={form.slot_step_min} onChange={(e) => set("slot_step_min", e.target.value)}>
                      {[15, 20, 30, 45, 60, 90, 120].map((n) => (
                        <NativeSelectOption key={n} value={n}>
                          {p.slots.everyN.replace("{n}", n)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                ) : (
                  <Field label={p.slots.timesLabel}>
                    <Input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="11:00, 14:00, 17:00" />
                    <Hint>{p.slots.timesHint}</Hint>
                  </Field>
                )}
              </div>

              <div className="border-t border-secondary-transparent pt-4">
                <p className="text-[13px] font-semibold text-fg mb-1">{p.masters.title}</p>
                <Hint className="mb-3">{p.masters.help}</Hint>

                {!staff?.length ? (
                  <Hint>{p.masters.noStaff}</Hint>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {staff.filter((s) => s.active).map((s) => {
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
                {!masters.length && staff?.length > 0 && (
                  <Hint className="mt-2">{p.masters.noneSelected}</Hint>
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
