"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { knowledgeTypes } from "@/config/knowledgeTypes"
import { metadata } from "@/config/metadata"
import useDebounce from "@/hooks/use-debounce"
import { useCreateEntry, useDeleteEntry, useKnowledgeEntries, useUpdateEntry } from "@/hooks/use-knowledge"
import { useSyncSearchParam } from "@/hooks/use-sync-search-param"
import { entrySchema } from "@/lib/schemas"
import { showError, showSuccess } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Check, Copy, Edit, LoaderIcon, Plus, Search, Trash, X } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import {
    NativeSelect,
    NativeSelectOptGroup,
    NativeSelectOption,
} from "@/components/ui/native-select"
import ListField from "@/components/ui/list-field"
import { DatePicker } from "@/components/ui/date-picker"
import { usePersona, usePersonas } from "@/hooks/use-personas"
import Grainient from "@/components/ui/grainient"

function formatEntries(language, count) {
    const forms = language.app.pages.knowledgeBase.entries
    const rule = new Intl.PluralRules(language.lang).select(count)
    const template = forms[rule] ?? forms.other
    return template.replace("{count}", count)
}

const metadataDefaults = {
    product: { price: null, currency: null },
    service: { duration: null },
    faq: { category: null, related_questions: null },
    flow: { steps: null },
    template: { language: null },
    policy: { valid_until: null }
}

function PersonaName({ language, id }) {
    const { data: persona, loading, error } = usePersona(id)

    return (
        persona ?
            (
                <Badge variant="secondary">
                    {persona.name}
                </Badge>
            )
            :
            <Badge variant="secondary">
                {language.app.labels.global}
            </Badge>
    )
}

function MetadataFields({ type, formData, setFormData, isPending, language }) {

    const f = language.app.pages.knowledgeBase.fields
    const currencyLabels = language.app.global.currencies

    function handleMetadata(code, value) {
        setFormData((prev) => ({ ...prev, metadata: { ...prev.metadata, [code]: value } }))
    }

    switch (type) {
        case 'product':
            return (
                <div className="flex gap-2">
                    <Field label={f.price.label}>
                        <Input
                            id="price"
                            name="price"
                            type="text"
                            placeholder={f.price.placeholder}
                            disabled={isPending}
                            onChange={(e) => handleMetadata("price", e.target.value)}
                            value={formData.metadata.price ?? ""}
                        />
                    </Field>
                    <Field label={f.currency.label} className={'flex-1'}>
                        <NativeSelect
                            name="currency"
                            value={formData.metadata.currency ?? ""}
                            onChange={(e) => handleMetadata("currency", e.target.value)}
                        >
                            <NativeSelectOption value="">{f.currency.placeholder}</NativeSelectOption>
                            {metadata.currencies.map((c) => (
                                <NativeSelectOption key={c.code} value={c.code}>
                                    {currencyLabels[c.code] ?? c.code}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                </div>
            )
        case 'service':
            return (
                <div className="flex gap-2">
                    <Field label={f.price.label}>
                        <Input
                            id="price"
                            name="price"
                            type="text"
                            placeholder={f.price.placeholder}
                            disabled={isPending}
                            onChange={(e) => handleMetadata("price", e.target.value)}
                            value={formData.metadata.price ?? ""}
                        />
                    </Field>
                    <Field label={f.currency.label} className={'flex-1'}>
                        <NativeSelect
                            name="currency"
                            value={formData.metadata.currency ?? ""}
                            onChange={(e) => handleMetadata("currency", e.target.value)}
                        >
                            <NativeSelectOption value="">{f.currency.placeholder}</NativeSelectOption>
                            {metadata.currencies.map((c) => (
                                <NativeSelectOption key={c.code} value={c.code}>
                                    {currencyLabels[c.code] ?? c.code}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                </div>
            )
        case 'faq':
            return (
                <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                        <Field label={f.category.label} className={'flex-1'}>
                            <Input
                                id="category"
                                name="category"
                                type="text"
                                placeholder={f.category.placeholder}
                                disabled={isPending}
                                onChange={(e) => handleMetadata("category", e.target.value)}
                                value={formData.metadata.category ?? ""}
                            />
                        </Field>
                    </div>
                    <ListField
                        label={f.relatedQuestions.label}
                        placeholder={f.relatedQuestions.placeholder}
                        items={formData.metadata.related_questions ?? []}
                        onChange={(next) => handleMetadata("related_questions", next)}
                        isPending={isPending}
                    />
                </div>
            )
        case 'flow':
            return (
                <ListField
                    label={f.steps.label}
                    placeholder={f.steps.placeholder}
                    items={formData.metadata.steps ?? []}
                    onChange={(next) => handleMetadata("steps", next)}
                    isPending={isPending}
                    numbered
                />
            )
        case 'policy':
            return (
                <div className="flex gap-2">
                    <Field label={f.validUntil.label} className={'flex-1'}>
                        <DatePicker
                            value={formData.metadata.valid_until ?? ""}
                            onChange={(v) => handleMetadata("valid_until", v)}
                            disabled={isPending}
                            placeholder={f.validUntil.placeholder}
                            lang={language}
                        />
                    </Field>
                </div>
            )
        case 'template':
            return (
                <Field label={f.language.label} className={'flex-1'}>
                    <Input
                        id="language"
                        name="language"
                        type="text"
                        placeholder={f.language.placeholder}
                        disabled={isPending}
                        onChange={(e) => handleMetadata("language", e.target.value)}
                        value={formData.metadata.language ?? ""}
                    />
                </Field>
            )
        default:
            return null
    }
}

function AddModal({ language, personas }) {

    const initialEntryData = { type: "", title: "", content: "", keywords: "", priority: "0", active: true, metadata: {}, persona_id: null }

    const t = language.app.pages.knowledgeBase.fields
    const m = language.app.pages.knowledgeBase.modals

    const createEntry = useCreateEntry();

    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [formData, setFormData] = useState(initialEntryData)

    useEffect(() => {
        setFormData(initialEntryData)
    }, [open])

    function handleChange(e) {
        const { name, value } = e.target

        setFormData((prev) => ({ ...prev, [name]: value }))

    }

    function handleType(value) {
        setFormData((prev) => ({ ...prev, type: value, metadata: metadataDefaults[value] ?? {} }))
    }

    function handleSubmit(e) {
        e.preventDefault();

        const schema = entrySchema(language.app.res);
        const result = schema.safeParse(formData);

        if (!result.success) {
            for (const issue of result.error.issues) {
                showError(issue.message)
            }
            return;
        }

        startTransition(() => {
            createEntry.mutate(
                {
                    type: formData.type,
                    title: formData.title,
                    content: formData.content,
                    keywords: formData.keywords,
                    priority: formData.priority,
                    active: formData.active,
                    metadata: formData.metadata,
                    persona_id: formData.persona_id
                },
                {
                    onSuccess: (data) => {

                        if (data?.success === false) {
                            showError(data.message);
                        } else {
                            setOpen(false);
                            setFormData(initialEntryData)
                            showSuccess(language.app.res.entryCreated);
                        }
                    },
                    onError: () => {
                        showError(language.app.res.entryCreateError);
                    },
                }
            );
        });
    }


    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button><Plus />{m.add}</Button>
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{m.addTitle}</DialogTitle>
                </DialogHeader>
                <div className="p-5 space-y-5">
                    <Field label={t.type.label}>
                        <div className="flex flex-wrap gap-2">
                            {
                                knowledgeTypes.map((item, key) => {
                                    const Icon = item.icon
                                    return (
                                        <Badge onClick={() => handleType(item.type)} className={formData.type === item.type && cn(
                                            item.border,
                                            item.color,
                                            item.bg
                                        )} key={key} variant="outline"><Icon />{language.app.pages.knowledgeBase.types[item.type].singular}</Badge>
                                    )
                                })
                            }
                        </div>
                    </Field>
                    <Field label={t.title.label}>
                        <Input
                            id="title"
                            name="title"
                            type="text"
                            placeholder={t.title.placeholder}
                            disabled={isPending}
                            onChange={handleChange}
                            value={formData.title}
                        />
                    </Field>
                    <Field label={t.content.label}>
                        <Textarea
                            id="content"
                            name="content"
                            type="text"
                            placeholder={t.content.placeholder}
                            disabled={isPending}
                            onChange={handleChange}
                            value={formData.content}
                        />
                    </Field>
                    <Field label={t.keywords.label}>
                        <Input
                            id="keywords"
                            name="keywords"
                            type="text"
                            placeholder={t.keywords.placeholder}
                            disabled={isPending}
                            onChange={handleChange}
                            value={formData.keywords}
                        />
                    </Field>
                    <div className="flex gap-2">
                        <Field label={t.persona.label} className={'flex-1'}>
                            <NativeSelect
                                name="persona"
                                onChange={(e) => setFormData((prev) => ({ ...prev, persona_id: e.target.value }))}
                            >
                                <NativeSelectOption value="">{language.app.labels.global}</NativeSelectOption>
                                {
                                    personas?.map((persona) => (
                                        <NativeSelectOption key={persona.id} value={persona.id}>{persona.name}</NativeSelectOption>
                                    ))
                                }
                            </NativeSelect>
                        </Field>
                        <Field label={t.priority.label} className={'flex-1'}>
                            <Input
                                id="priority"
                                name="priority"
                                type="number"
                                max="10"
                                placeholder={t.priority.placeholder}
                                disabled={isPending}
                                onChange={handleChange}
                                value={formData.priority}
                            />
                        </Field>
                        <Field label={t.status.label} className={'flex-1'}>
                            <NativeSelect
                                name="active"
                                value={String(formData.active)}
                                onChange={(e) => setFormData((prev) => ({ ...prev, active: e.target.value === "true" }))}
                            >
                                <NativeSelectOption value="true">{t.status.active}</NativeSelectOption>
                                <NativeSelectOption value="false">{t.status.draft}</NativeSelectOption>
                            </NativeSelect>
                        </Field>
                    </div>
                    <MetadataFields language={language} type={formData.type} setFormData={setFormData} formData={formData} isPending={isPending} />
                </div>
                <DialogFooter className="justify-end">
                    <DialogClose asChild>
                        <Button variant="outline" type="button">{m.cancel}</Button>
                    </DialogClose>
                    <Button onClick={handleSubmit} disabled={isPending || !formData.type || !formData.title || !formData.content}>
                        {isPending ? (
                            <LoaderIcon className="animate-spin" />
                        ) : (
                            <><Check />{m.add}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function UpdateModal({ language, entry }) {

    const { data: personas, loading } = usePersonas()

    const initialEntryData = { type: entry.type, title: entry.title, content: entry.content, keywords: entry.keywords, priority: entry.priority, active: entry.active, metadata: entry.metadata, persona_id: entry.persona_id }

    const t = language.app.pages.knowledgeBase.fields
    const m = language.app.pages.knowledgeBase.modals

    const updateEntry = useUpdateEntry();

    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [formData, setFormData] = useState(initialEntryData)

    useEffect(() => {
        setFormData(initialEntryData)
    }, [entry, open])

    function handleChange(e) {
        const { name, value } = e.target

        setFormData((prev) => ({ ...prev, [name]: value }))

    }

    function handleType(value) {
        setFormData((prev) => ({ ...prev, type: value, metadata: metadataDefaults[value] ?? {} }))
    }

    function handleSubmit(e) {
        e.preventDefault();

        const schema = entrySchema(language.app.res);
        const result = schema.safeParse(formData);

        if (!result.success) {
            for (const issue of result.error.issues) {
                showError(issue.message)
            }
            return;
        }

        startTransition(() => {
            updateEntry.mutate(
                {
                    id: entry.id,
                    updates: {
                        type: formData.type,
                        title: formData.title,
                        content: formData.content,
                        keywords: formData.keywords,
                        priority: formData.priority,
                        active: formData.active,
                        metadata: formData.metadata,
                        persona_id: formData.persona_id
                    }
                },
                {
                    onSuccess: (data) => {

                        if (data?.success === false) {
                            showError(data.message);
                        } else {
                            setOpen(false);
                            setFormData(initialEntryData)
                            showSuccess(language.app.res.entryCreated);
                        }
                    },
                    onError: (err) => {
                        showError(language.app.res.entryCreateError);
                    },
                }
            );
        });
    }


    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Edit className="cursor-pointer" size={14} />
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{m.updateTitle}</DialogTitle>
                </DialogHeader>
                <div className="p-5 space-y-5">
                    <Field label={t.type.label}>
                        <div className="flex flex-wrap gap-2">
                            {
                                knowledgeTypes.map((item, key) => {
                                    const Icon = item.icon
                                    return (
                                        <Badge onClick={() => handleType(item.type)} className={formData.type === item.type && cn(
                                            item.border,
                                            item.color,
                                            item.bg
                                        )} key={key} variant="outline"><Icon />{language.app.pages.knowledgeBase.types[item.type].singular}</Badge>
                                    )
                                })
                            }
                        </div>
                    </Field>
                    <Field label={t.title.label}>
                        <Input
                            autoFocus={true}
                            id="title"
                            name="title"
                            type="text"
                            placeholder={t.title.placeholder}
                            disabled={isPending}
                            onChange={handleChange}
                            value={formData.title}
                        />
                    </Field>
                    <Field label={t.content.label}>
                        <Textarea
                            id="content"
                            name="content"
                            type="text"
                            placeholder={t.content.placeholder}
                            disabled={isPending}
                            onChange={handleChange}
                            value={formData.content}
                        />
                    </Field>
                    <Field label={t.keywords.label}>
                        <Input
                            id="keywords"
                            name="keywords"
                            type="text"
                            placeholder={t.keywords.placeholder}
                            disabled={isPending}
                            onChange={handleChange}
                            value={formData.keywords}
                        />
                    </Field>
                    <div className="flex gap-2">
                        <Field label={t.persona.label} className={'flex-1'}>
                            <NativeSelect
                                name="persona"
                                onChange={(e) => setFormData((prev) => ({ ...prev, persona_id: e.target.value }))}
                                value={formData.persona_id ?? ""}
                            >
                                <NativeSelectOption value="">{language.app.labels.global}</NativeSelectOption>
                                {
                                    personas?.map((persona) => (
                                        <NativeSelectOption key={persona.id} value={persona.id}>{persona.name}</NativeSelectOption>
                                    ))
                                }
                            </NativeSelect>
                        </Field>
                        <Field label={t.priority.label} className={'flex-1'}>
                            <Input
                                id="priority"
                                name="priority"
                                type="number"
                                max="10"
                                placeholder={t.priority.placeholder}
                                disabled={isPending}
                                onChange={handleChange}
                                value={formData.priority}
                            />
                        </Field>
                        <Field label={t.status.label} className={'flex-1'}>
                            <NativeSelect
                                name="active"
                                value={String(formData.active)}
                                onChange={(e) => setFormData((prev) => ({ ...prev, active: e.target.value === "true" }))}
                            >
                                <NativeSelectOption value="true">{t.status.active}</NativeSelectOption>
                                <NativeSelectOption value="false">{t.status.draft}</NativeSelectOption>
                            </NativeSelect>
                        </Field>
                    </div>
                    <MetadataFields language={language} type={formData.type} setFormData={setFormData} formData={formData} isPending={isPending} />
                </div>
                <DialogFooter className="justify-end">
                    <DialogClose asChild>
                        <Button variant="outline" type="button">{m.cancel}</Button>
                    </DialogClose>
                    <Button onClick={handleSubmit} disabled={isPending || JSON.stringify(initialEntryData) === JSON.stringify(formData)}>
                        {isPending ? (
                            <LoaderIcon className="animate-spin" />
                        ) : (
                            <><Check />{m.update}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function KnowledgeBaseFilter({ language, searchParams, count }) {

    const { data: personas, loading } = usePersonas()

    const [search, setSearch] = useState(searchParams?.search)
    const [persona, setPersona] = useState(searchParams?.persona)
    const debouncedSearch = useDebounce(search, 700)

    useSyncSearchParam('search', debouncedSearch)
    useSyncSearchParam('persona', persona)

    return (
        <div className="flex justify-between items-center">
            <div className="flex gap-5 items-center w-full">
                <InputGroup className="max-w-80 min-w-80">
                    <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} type={'text'} placeholder={language.app.labels.search} />
                    <InputGroupAddon align="inline-start" className="text-secondary cursor-pointer">
                        <Search />
                    </InputGroupAddon>
                </InputGroup>
                <NativeSelect
                    className="w-48 text-fg"
                    name="persona"
                    onChange={(e) => setPersona(e.target.value)}
                >
                    <NativeSelectOption value="">{language.app.labels.allPersonas}</NativeSelectOption>
                    <NativeSelectOption value="global">{language.app.labels.global}</NativeSelectOption>
                    {
                        personas?.map((persona) => (
                            <NativeSelectOption key={persona.id} value={persona.id}>{persona.name}</NativeSelectOption>
                        ))
                    }
                </NativeSelect>
                <code className="text-secondary text-xs">{formatEntries(language, count || 0)}</code>
            </div>
            <AddModal language={language} personas={personas} />
        </div>
    )
}

export default function KnowledgeBaseTable({ language, searchParams }) {

    const t = language.app.pages.knowledgeBase.table

    const searchQ = searchParams?.search && searchParams.search
    const typesQ = searchParams?.types && searchParams.types.split(',')
    const personaQ = searchParams?.persona

    const { data: entries, isLoading, error } = useKnowledgeEntries({ types: typesQ, search: searchQ, persona_id: personaQ })

    const deleteEntry = useDeleteEntry();
    const createEntry = useCreateEntry()

    function handleCopy(entry) {
        const schema = entrySchema(language.app.res);
        const result = schema.safeParse(entry);

        if (!result.success) {
            for (const issue of result.error.issues) {
                showError(issue.message)
            }
            return;
        }

        createEntry.mutate(
            {
                type: entry.type,
                title: entry.title,
                content: entry.content,
                keywords: entry.keywords,
                priority: entry.priority,
                active: entry.active,
                metadata: entry.metadata
            },
            {
                onSuccess: (data) => {

                    if (data?.success === false) {
                        showError(data.message);
                    } else {
                        showSuccess(language.app.res.entryCreated);
                    }
                },
                onError: () => {
                    showError(language.app.res.entryCreateError);
                },
            }
        );
    }

    function handleDelete(id) {
        deleteEntry.mutate(id, {
            onSuccess: (data) => {
                if (data?.success === false) {
                    showError(data.message);
                } else {
                    showSuccess(language.app.res.entryDeleted);
                }
            },
            onError: () => {
                showError(language.app.res.entryCreateError);
            },
        })
    }

    return (
        <div className="flex flex-col gap-5">
            <KnowledgeBaseFilter language={language} searchParams={searchParams} count={entries?.length} />
            <div className="relative">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t.title}</TableHead>
                            <TableHead>{t.type}</TableHead>
                            <TableHead className="w-70">{t.content}</TableHead>
                            <TableHead>{t.keywords}</TableHead>
                            {/* <TableHead className="w-35">{t.persona}</TableHead> */}
                            <TableHead>{t.priority}</TableHead>
                            <TableHead>{t.status}</TableHead>
                            <TableHead className="text-right">{t.actions}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody className={''}>
                        {
                            entries &&
                            entries.map((entry) => {
                                const type = knowledgeTypes.filter((x) => x.type === entry.type)
                                const Icon = type[0].icon
                                const color = type[0].color
                                const bg = type[0].bg
                                const border = type[0].border
                                const keywords = entry.keywords?.split(',')

                                return (
                                    <TableRow key={entry.id}>
                                        <TableCell className="font-medium text-fg"><span className={cn(
                                            "flex gap-2 items-center",
                                        )}>{entry.title}</span></TableCell>
                                        <TableCell>
                                            {/* <Badge className={cn(
                                            bg,
                                            color
                                        )}>
                                            <Icon className={color} size={16} />
                                            {language.app.pages.knowledgeBase.types[entry.type].singular}
                                        </Badge> */}
                                            <Badge variant="secondary" className={cn(
                                                color,
                                                bg
                                            )}><Icon />{language.app.pages.knowledgeBase.types[entry.type].singular}</Badge>
                                        </TableCell>
                                        <TableCell className="whitespace-normal py-0 my-4 line-clamp-2 max-w-70">{entry.content}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1 max-w-56">
                                                {
                                                    keywords && keywords.slice(0, 3).map((keyword, k) => (
                                                        <Badge key={k} variant="secondary">
                                                            {keyword.trim()}
                                                        </Badge>
                                                    ))
                                                }
                                                {keywords && keywords.length > 3 && (
                                                    <Badge variant="secondary">+{keywords.length - 3}</Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        {/* <TableCell>
                                            <PersonaName language={language} id={entry.persona_id} />
                                        </TableCell> */}
                                        <TableCell>{entry.priority}</TableCell>
                                        <TableCell>
                                            {
                                                entry.active
                                                    ?
                                                    <Badge variant="secondary" className={"bg-green-900/30 text-green-500"}>
                                                        {language.app.labels.active}
                                                    </Badge>
                                                    :
                                                    <Badge variant="secondary" className={"bg-orange-900/30 text-orange-500"}>
                                                        {language.app.labels.draft}
                                                    </Badge>
                                            }
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex gap-3 text-muted justify-end">
                                                <UpdateModal entry={entry} language={language} />
                                                <Copy onClick={() => handleCopy(entry)} className="cursor-pointer" size={14} />
                                                <Trash className="cursor-pointer" onClick={() => handleDelete(entry.id)} size={14} />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        }
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}