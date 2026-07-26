import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import {
  FileText, Plus, Pencil, Trash2, Check, Copy, Combine,
  ArrowUp, ArrowDown, ChevronRight, ChevronDown, Layers, User as UserIcon, ExternalLink,
} from "lucide-react";
import {
  useSalesQuoteTemplates,
  useCreateQuoteTemplate,
  useUpdateQuoteTemplate,
  useDeleteQuoteTemplate,
  useCreateQuoteTemplateItem,
  useUpdateQuoteTemplateItem,
  useDeleteQuoteTemplateItem,
} from "@/hooks/sales/useSalesQuoteTemplates";
import { inputCls } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import type { SalesQuoteTemplateItem } from "@/lib/sales-types";

const LINE_TYPE_LABELS: Record<string, string> = {
  service: "Palvelu",
  product: "Tuote",
  addon_service: "Lisäpalvelu",
  custom: "Muu",
};

const LINE_TYPE_COLORS: Record<string, string> = {
  service: "bg-blue-50 text-blue-700 border-blue-200",
  product: "bg-emerald-50 text-emerald-700 border-emerald-200",
  addon_service: "bg-purple-50 text-purple-700 border-purple-200",
  custom: "bg-gray-50 text-gray-600 border-gray-200",
};

const COMBO_COLORS = [
  "border-l-amber-400 bg-amber-50/30",
  "border-l-violet-400 bg-violet-50/30",
  "border-l-cyan-400 bg-cyan-50/30",
  "border-l-rose-400 bg-rose-50/30",
  "border-l-lime-400 bg-lime-50/30",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Section {
  title: string | null;
  order: number;
  items: SalesQuoteTemplateItem[];
}

function groupIntoSections(items: SalesQuoteTemplateItem[]): Section[] {
  const sorted = [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const map = new Map<string | null, Section>();

  for (const item of sorted) {
    const key = item.section_title || null;
    if (!map.has(key)) {
      map.set(key, { title: key, order: item.section_order ?? 0, items: [] });
    }
    map.get(key)!.items.push(item);
  }

  return [...map.values()].sort((a, b) => a.order - b.order);
}

function getComboColorMap(items: SalesQuoteTemplateItem[]): Map<string, number> {
  const groups = new Set(items.map((i) => i.combo_group).filter(Boolean) as string[]);
  const map = new Map<string, number>();
  let idx = 0;
  for (const g of groups) {
    map.set(g, idx % COMBO_COLORS.length);
    idx++;
  }
  return map;
}

// ─── Debounced item field update ────────────────────────────────────────────

function useDebouncedMutate(updateItem: ReturnType<typeof useUpdateQuoteTemplateItem>) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return useCallback(
    (payload: Parameters<typeof updateItem.mutate>[0]) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => updateItem.mutate(payload), 400);
    },
    [updateItem],
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

type Tab = "yksittaiset" | "mallit";

export default function QuoteTemplates() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = (searchParams.get("tab") as Tab) === "mallit" ? "mallit" : "yksittaiset";
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(searchParams);
    if (t === "yksittaiset") next.delete("tab");
    else next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  const { data: templates = [], isLoading } = useSalesQuoteTemplates("template");
  const { data: oneOffs = [], isLoading: isLoadingOneOffs } = useSalesQuoteTemplates("one_off");
  const createTemplate = useCreateQuoteTemplate();
  const updateTemplate = useUpdateQuoteTemplate();
  const deleteTemplate = useDeleteQuoteTemplate();
  const createItem = useCreateQuoteTemplateItem();
  const updateItem = useUpdateQuoteTemplateItem();
  const deleteItem = useDeleteQuoteTemplateItem();
  const debouncedUpdate = useDebouncedMutate(updateItem);
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith("/myyja") ? "/myyja" : "/myynti";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameForm, setNameForm] = useState("");
  const [descForm, setDescForm] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string | null>>(new Set());
  const [editingSectionTitle, setEditingSectionTitle] = useState<string | null>(null);
  const [sectionTitleForm, setSectionTitleForm] = useState("");

  // Local item state for smooth editing
  const [localItems, setLocalItems] = useState<SalesQuoteTemplateItem[]>([]);

  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const sections = useMemo(() => groupIntoSections(localItems), [localItems]);
  const comboColorMap = useMemo(() => getComboColorMap(localItems), [localItems]);

  // Auto-select first template
  useEffect(() => {
    if (!selectedId && templates.length > 0) {
      setSelectedId(templates[0].id);
    }
  }, [templates, selectedId]);

  // Sync local items when selection changes
  useEffect(() => {
    if (selected) {
      setLocalItems(
        [...(selected.sales_quote_template_items || [])].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        ),
      );
      setNameForm(selected.name);
      setDescForm(selected.description || "");
      setEditingName(false);
      setCollapsedSections(new Set());
    } else {
      setLocalItems([]);
    }
  }, [selected]);

  // ─── Template CRUD ──────────────────────────────────────────────────────────

  async function handleCreate() {
    try {
      const t = await createTemplate.mutateAsync({ name: "Uusi tarjousmalli" });
      setSelectedId(t.id);
      setEditingName(true);
      setNameForm("Uusi tarjousmalli");
      toast("Malli luotu");
    } catch {
      toast("Virhe luodessa mallia", "error");
    }
  }

  async function handleDuplicate() {
    if (!selected) return;
    try {
      const t = await createTemplate.mutateAsync({ name: `${selected.name} (kopio)` });
      const items = selected.sales_quote_template_items || [];
      for (const item of items) {
        await createItem.mutateAsync({
          template_id: t.id,
          line_type: item.line_type,
          item_id: item.item_id,
          name: item.name,
          description: item.description,
          unit_price_cents: item.unit_price_cents,
          quantity: item.quantity,
          is_optional: item.is_optional,
          sort_order: item.sort_order,
          combo_group: item.combo_group,
          section_title: item.section_title,
          section_order: item.section_order,
        });
      }
      setSelectedId(t.id);
      toast("Malli kopioitu");
    } catch {
      toast("Virhe kopioinnissa", "error");
    }
  }

  async function handleDelete() {
    if (!selected) return;
    const ok = await confirm({ message: `Poista "${selected.name}"?`, variant: "danger" });
    if (!ok) return;
    await deleteTemplate.mutateAsync(selected.id);
    setSelectedId(null);
    toast("Malli poistettu");
  }

  async function handleSaveName() {
    if (!selected || !nameForm.trim()) return;
    await updateTemplate.mutateAsync({ id: selected.id, name: nameForm.trim(), description: descForm.trim() || null });
    setEditingName(false);
    toast("Tallennettu");
  }

  async function handleDeleteOneOff(id: string, name: string) {
    const ok = await confirm({ message: `Poista tarjous "${name}"?`, variant: "danger" });
    if (!ok) return;
    await deleteTemplate.mutateAsync(id);
    toast("Tarjous poistettu");
  }

  function oneOffTotal(t: typeof oneOffs[number]): number {
    const itemsTotal = (t.sales_quote_template_items ?? []).reduce(
      (sum, i) => sum + (i.unit_price_cents / 100) * i.quantity,
      0,
    );
    return itemsTotal - (t.discount_cents ?? 0) / 100;
  }

  // ─── Section management ───────────────────────────────────────────────────

  function toggleSection(sectionTitle: string | null) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionTitle)) next.delete(sectionTitle);
      else next.add(sectionTitle);
      return next;
    });
  }

  async function handleAddSection() {
    if (!selected) return;
    const maxOrder = sections.reduce((max, s) => Math.max(max, s.order), 0);
    const maxSort = localItems.reduce((max, i) => Math.max(max, i.sort_order ?? 0), 0);
    const title = `Osio ${sections.length + 1}`;
    await createItem.mutateAsync({
      template_id: selected.id,
      line_type: "service",
      item_id: null,
      name: "",
      description: null,
      unit_price_cents: 0,
      quantity: 1,
      is_optional: false,
      sort_order: maxSort + 1,
      combo_group: null,
      section_title: title,
      section_order: maxOrder + 1,
    });
  }

  async function handleRenameSectionSave(oldTitle: string | null) {
    if (!selected || !sectionTitleForm.trim()) {
      setEditingSectionTitle(null);
      return;
    }
    const newTitle = sectionTitleForm.trim();
    if (newTitle === oldTitle) {
      setEditingSectionTitle(null);
      return;
    }
    // Update all items in this section
    const sectionItems = localItems.filter((i) => (i.section_title || null) === oldTitle);
    setLocalItems((prev) =>
      prev.map((i) =>
        (i.section_title || null) === oldTitle ? { ...i, section_title: newTitle } : i,
      ),
    );
    for (const item of sectionItems) {
      await updateItem.mutateAsync({ id: item.id, template_id: selected.id, section_title: newTitle });
    }
    setEditingSectionTitle(null);
    toast("Osion nimi päivitetty");
  }

  async function handleDeleteSection(sectionTitle: string | null) {
    if (!selected || sectionTitle === null) return;
    const sectionItems = localItems.filter((i) => i.section_title === sectionTitle);
    const ok = await confirm({
      message: `Poista osio "${sectionTitle}" ja sen ${sectionItems.length} riviä?`,
      variant: "danger",
    });
    if (!ok) return;
    setLocalItems((prev) => prev.filter((i) => i.section_title !== sectionTitle));
    for (const item of sectionItems) {
      await deleteItem.mutateAsync({ id: item.id, template_id: selected.id });
    }
    toast("Osio poistettu");
  }

  // ─── Item CRUD ──────────────────────────────────────────────────────────────

  async function handleAddItem(
    sectionTitle: string | null,
    sectionOrder: number,
    opts?: { comboGroup?: string; lineType?: SalesQuoteTemplateItem["line_type"] },
  ) {
    if (!selected) return;
    const maxSort = localItems.reduce((max, i) => Math.max(max, i.sort_order ?? 0), 0);
    await createItem.mutateAsync({
      template_id: selected.id,
      line_type: opts?.lineType ?? "service",
      item_id: null,
      name: "",
      description: null,
      unit_price_cents: 0,
      quantity: 1,
      is_optional: false,
      sort_order: maxSort + 1,
      combo_group: opts?.comboGroup ?? null,
      section_title: sectionTitle,
      section_order: sectionOrder,
    });
  }

  function handleLocalItemChange(itemId: string, field: string, value: unknown) {
    setLocalItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)),
    );
    if (!selected) return;
    debouncedUpdate({ id: itemId, template_id: selected.id, [field]: value });
  }

  async function handleDeleteItem(itemId: string) {
    if (!selected) return;
    setLocalItems((prev) => prev.filter((i) => i.id !== itemId));
    await deleteItem.mutateAsync({ id: itemId, template_id: selected.id });
  }

  async function handleMoveItem(itemId: string, direction: "up" | "down") {
    if (!selected) return;
    const idx = localItems.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= localItems.length) return;

    const newItems = [...localItems];
    [newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]];
    const updated = newItems.map((item, i) => ({ ...item, sort_order: i }));
    setLocalItems(updated);

    await Promise.all([
      updateItem.mutateAsync({ id: updated[idx].id, template_id: selected.id, sort_order: idx }),
      updateItem.mutateAsync({ id: updated[swapIdx].id, template_id: selected.id, sort_order: swapIdx }),
    ]);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const tabsBar = (
    <div className="border-b border-border px-4 flex items-center gap-1 flex-shrink-0 bg-surface/30">
      <TabButton
        active={tab === "yksittaiset"}
        onClick={() => setTab("yksittaiset")}
        label="Yksittäiset tarjoukset"
        count={oneOffs.length}
      />
      <TabButton
        active={tab === "mallit"}
        onClick={() => setTab("mallit")}
        label="Mallit"
        count={templates.length}
      />
    </div>
  );

  if (tab === "yksittaiset") {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {tabsBar}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Yksittäiset tarjoukset</h1>
                <p className="text-xs text-text-muted mt-0.5">Asiakaskohtaiset tarjoukset, jotka eivät ole malleja</p>
              </div>
              <button
                onClick={() => navigate(`${basePath}/tarjous-uusi`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Uusi tarjous
              </button>
            </div>

            {isLoadingOneOffs ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : oneOffs.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border rounded-2xl">
                <FileText className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-30" />
                <p className="text-sm text-text-muted">Ei yksittäisiä tarjouksia</p>
                <p className="text-[11px] text-text-muted mt-1">Luo ensimmäinen "Uusi tarjous" -napilla</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {oneOffs.map((t) => {
                  const total = oneOffTotal(t);
                  const customer = t.customer_name?.trim();
                  const created = new Date(t.created_at).toLocaleDateString("fi-FI");
                  return (
                    <button
                      key={t.id}
                      onClick={() => navigate(`${basePath}/tarjous-uusi/${t.id}`)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-xl hover:border-accent/40 hover:bg-accent/5 transition-colors group"
                    >
                      <FileText className="w-4 h-4 text-accent flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium truncate">{t.name || "Nimetön tarjous"}</span>
                          {t.opportunity_id && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-accent flex-shrink-0">
                              <ExternalLink className="w-2.5 h-2.5" />
                              Asiakas
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-text-muted">
                          {customer && (
                            <span className="flex items-center gap-1 truncate">
                              <UserIcon className="w-3 h-3" />
                              {customer}
                            </span>
                          )}
                          <span>{created}</span>
                          <span>{(t.sales_quote_template_items ?? []).length} riviä</span>
                        </div>
                      </div>
                      <span className="text-sm font-semibold whitespace-nowrap">
                        {total.toLocaleString("fi-FI", { style: "currency", currency: "EUR" })}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); handleDeleteOneOff(t.id, t.name); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleDeleteOneOff(t.id, t.name); } }}
                        className="p-1.5 text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Poista tarjous"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {tabsBar}
        <div className="flex items-center justify-center flex-1">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {tabsBar}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
      {/* ─── Left: Template list ─────────────────────────────────────────── */}
      <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-border flex flex-col bg-surface/50 max-h-[40vh] md:max-h-none">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold">Tarjousmallit</h2>
            </div>
            <button
              onClick={handleCreate}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-accent text-white rounded-lg text-[11px] font-medium hover:bg-accent/90 transition-colors"
            >
              <Plus className="w-3 h-3" /> Uusi
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {templates.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-xs text-text-muted">Ei tarjousmalleja</p>
              <p className="text-[11px] text-text-muted mt-1">Luo ensimmäinen malli</p>
            </div>
          ) : (
            templates.map((t) => {
              const isActive = selectedId === t.id;
              const itemCount = t.sales_quote_template_items?.length ?? 0;
              const total = (t.sales_quote_template_items ?? []).reduce(
                (sum, i) => sum + (i.unit_price_cents / 100) * i.quantity,
                0,
              );
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors group ${
                    isActive
                      ? "bg-accent/10 border border-accent/20"
                      : "hover:bg-surface border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium truncate ${isActive ? "text-accent" : ""}`}>
                      {t.name}
                    </span>
                    <ChevronRight className={`w-3 h-3 flex-shrink-0 ${isActive ? "text-accent" : "text-text-muted opacity-0 group-hover:opacity-100"}`} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-text-muted">{itemCount} riviä</span>
                    {total > 0 && (
                      <span className="text-[11px] text-text-muted">
                        {total.toLocaleString("fi-FI", { style: "currency", currency: "EUR" })}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Right: Template editor ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {!selected ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FileText className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-30" />
              <p className="text-sm text-text-muted">Valitse tai luo tarjousmalli</p>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6 max-w-4xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="space-y-2">
                    <input
                      value={nameForm}
                      onChange={(e) => setNameForm(e.target.value)}
                      className={`${inputCls} !text-lg !font-bold !py-2`}
                      placeholder="Mallin nimi"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    />
                    <input
                      value={descForm}
                      onChange={(e) => setDescForm(e.target.value)}
                      className={`${inputCls} !text-xs !py-1.5`}
                      placeholder="Kuvaus (valinnainen)"
                      onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleSaveName}
                        className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90"
                      >
                        <Check className="w-3 h-3" /> Tallenna
                      </button>
                      <button
                        onClick={() => {
                          setEditingName(false);
                          setNameForm(selected.name);
                          setDescForm(selected.description || "");
                        }}
                        className="px-3 py-1.5 text-text-muted text-xs hover:text-text"
                      >
                        Peruuta
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={() => setEditingName(true)}
                      className="group flex items-center gap-2"
                    >
                      <h1 className="text-xl sm:text-2xl font-bold text-text-primary truncate">{selected.name}</h1>
                      <Pencil className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </button>
                    {selected.description && (
                      <p className="text-xs text-text-muted mt-0.5">{selected.description}</p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => navigate(`${basePath}/tarjouspohja/${selected.id}`)}
                  className="px-3 py-1.5 border border-border rounded-lg text-xs font-medium hover:bg-surface transition-colors"
                >
                  <span className="hidden sm:inline">Avaa rakentajassa</span><span className="sm:hidden">Avaa</span>
                </button>
                <button
                  onClick={handleDuplicate}
                  className="p-1.5 text-text-muted hover:text-text rounded-lg hover:bg-surface transition-colors"
                  title="Kopioi malli"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 text-text-muted hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  title="Poista malli"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-4">
              {sections.map((section) => {
                const isCollapsed = collapsedSections.has(section.title);
                const sectionTotal = section.items
                  .filter((i) => !i.is_optional)
                  .reduce((sum, i) => sum + (i.unit_price_cents / 100) * i.quantity, 0);

                // Group items by combo_group for rendering
                const renderGroups = buildRenderGroups(section.items);

                return (
                  <div
                    key={section.title ?? "__default"}
                    className="bg-surface border border-border rounded-2xl overflow-hidden"
                  >
                    {/* Section header */}
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-bg/30">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button
                          onClick={() => toggleSection(section.title)}
                          className="text-text-muted hover:text-text"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {editingSectionTitle === (section.title ?? "__default") ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              value={sectionTitleForm}
                              onChange={(e) => setSectionTitleForm(e.target.value)}
                              className={`${inputCls} !py-1 !text-xs !w-48`}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameSectionSave(section.title);
                                if (e.key === "Escape") setEditingSectionTitle(null);
                              }}
                            />
                            <button
                              onClick={() => handleRenameSectionSave(section.title)}
                              className="text-accent"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            {section.title ? (
                              <button
                                onClick={() => {
                                  setEditingSectionTitle(section.title ?? "__default");
                                  setSectionTitleForm(section.title || "");
                                }}
                                className="group flex items-center gap-1.5"
                              >
                                <Layers className="w-3.5 h-3.5 text-accent" />
                                <span className="text-xs font-semibold truncate">
                                  {section.title}
                                </span>
                                <Pencil className="w-2.5 h-2.5 text-text-muted opacity-0 group-hover:opacity-100" />
                              </button>
                            ) : (
                              <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                                Rivit
                              </span>
                            )}
                            <span className="text-[10px] text-text-muted">
                              ({section.items.length})
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {sectionTotal > 0 && (
                          <span className="text-[11px] text-text-muted font-medium">
                            {sectionTotal.toLocaleString("fi-FI", { style: "currency", currency: "EUR" })}
                          </span>
                        )}
                        <button
                          onClick={() => handleAddItem(section.title, section.order)}
                          className="flex items-center gap-1 px-2 py-1 bg-accent/10 text-accent rounded-lg text-[11px] font-medium hover:bg-accent/20 transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Rivi
                        </button>
                        {section.title && (
                          <button
                            onClick={() => handleDeleteSection(section.title)}
                            className="p-1 text-text-muted hover:text-red-500"
                            title="Poista osio"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Items */}
                    {!isCollapsed && (
                      <>
                        {section.items.length === 0 ? (
                          <div className="px-4 py-8 text-center">
                            <p className="text-xs text-text-muted">Ei rivejä</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            {/* Column headers */}
                            <div className="grid grid-cols-[2rem_6rem_1fr_5rem_6rem_5rem_2rem] gap-2 px-4 py-2 text-[10px] font-medium text-text-muted uppercase tracking-wide bg-bg/50 border-b border-border min-w-[540px]">
                              <span />
                              <span>Tyyppi</span>
                              <span>Nimi</span>
                              <span className="text-center">Kpl</span>
                              <span className="text-right">á-hinta</span>
                              <span className="text-center">Valinnainen</span>
                              <span />
                            </div>

                            {renderGroups.map((group) => {
                              if (group.type === "single") {
                                return (
                                  <ItemRow
                                    key={group.item.id}
                                    item={group.item}
                                    allItems={localItems}
                                    onLocalChange={handleLocalItemChange}
                                    onDelete={handleDeleteItem}
                                    onMove={handleMoveItem}
                                  />
                                );
                              }
                              // Combo group
                              const colorIdx = comboColorMap.get(group.comboGroup) ?? 0;
                              const colorCls = COMBO_COLORS[colorIdx];
                              return (
                                <div
                                  key={`combo-${group.comboGroup}`}
                                  className={`border-l-[3px] ${colorCls}`}
                                >
                                  {/* Combo header */}
                                  <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/50">
                                    <Combine className="w-3 h-3 text-text-muted" />
                                    <span className="text-[11px] font-semibold text-text-muted">
                                      {group.comboGroup}
                                    </span>
                                    <span className="text-[10px] text-text-muted">
                                      ({group.items.length} riviä)
                                    </span>
                                    <span className="text-[10px] text-text-muted ml-auto">
                                      {group.items
                                        .reduce((s, i) => s + (i.unit_price_cents / 100) * i.quantity, 0)
                                        .toLocaleString("fi-FI", { style: "currency", currency: "EUR" })}
                                    </span>
                                  </div>
                                  {group.items.map((item) => (
                                    <ItemRow
                                      key={item.id}
                                      item={item}
                                      allItems={localItems}
                                      onLocalChange={handleLocalItemChange}
                                      onDelete={handleDeleteItem}
                                      onMove={handleMoveItem}
                                      isCombo
                                    />
                                  ))}
                                  {/* Add addon to combo */}
                                  <div className="flex items-center gap-2 px-4 py-1.5 border-t border-border/30">
                                    <button
                                      onClick={() =>
                                        handleAddItem(section.title, section.order, {
                                          comboGroup: group.comboGroup,
                                          lineType: "addon_service",
                                        })
                                      }
                                      className="flex items-center gap-1 text-[11px] font-medium text-purple-600 hover:text-purple-700 transition-colors"
                                    >
                                      <Plus className="w-3 h-3" /> Lisäpalvelu
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleAddItem(section.title, section.order, {
                                          comboGroup: group.comboGroup,
                                        })
                                      }
                                      className="flex items-center gap-1 text-[11px] font-medium text-text-muted hover:text-text transition-colors"
                                    >
                                      <Plus className="w-3 h-3" /> Rivi
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Section summary */}
                        {section.items.length > 0 && (
                          <div className="px-4 py-2.5 border-t border-border bg-bg/30 flex items-center justify-between">
                            <span className="text-[11px] text-text-muted">
                              {section.items.filter((i) => !i.is_optional).length} pakollista,{" "}
                              {section.items.filter((i) => i.is_optional).length} valinnaista
                            </span>
                            <div className="text-right">
                              <span className="text-sm font-bold">
                                {sectionTotal.toLocaleString("fi-FI", { style: "currency", currency: "EUR" })}
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {/* Add section button */}
              <button
                onClick={handleAddSection}
                className="flex items-center gap-1.5 px-4 py-2.5 border border-dashed border-border rounded-2xl text-xs font-medium text-text-muted hover:text-accent hover:border-accent/30 transition-colors w-full justify-center"
              >
                <Layers className="w-3.5 h-3.5" /> Lisää osio
              </button>
            </div>

            {/* Grand total */}
            {localItems.length > 0 && (
              <div className="mt-4 px-4 py-3 bg-surface border border-border rounded-2xl flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  Yhteensä ({localItems.length} riviä, {sections.length} {sections.length === 1 ? "osio" : "osiota"})
                </span>
                <div className="text-right">
                  <div className="text-[10px] text-text-muted uppercase tracking-wide">Yhteensä (pakolliset)</div>
                  <div className="text-base font-bold">
                    {localItems
                      .filter((i) => !i.is_optional)
                      .reduce((sum, i) => sum + (i.unit_price_cents / 100) * i.quantity, 0)
                      .toLocaleString("fi-FI", { style: "currency", currency: "EUR" })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-3 text-sm font-medium transition-colors ${
        active ? "text-accent" : "text-text-muted hover:text-text-primary"
      }`}
    >
      <span className="flex items-center gap-2">
        {label}
        {typeof count === "number" && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-accent/15 text-accent" : "bg-bg-secondary text-text-muted"}`}>
            {count}
          </span>
        )}
      </span>
      {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-t-full" />}
    </button>
  );
}

// ─── Render group helpers ───────────────────────────────────────────────────

type RenderGroup =
  | { type: "single"; item: SalesQuoteTemplateItem }
  | { type: "combo"; comboGroup: string; items: SalesQuoteTemplateItem[] };

function buildRenderGroups(items: SalesQuoteTemplateItem[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  const comboSeen = new Set<string>();

  for (const item of items) {
    if (item.combo_group) {
      if (comboSeen.has(item.combo_group)) continue;
      comboSeen.add(item.combo_group);
      const comboItems = items.filter((i) => i.combo_group === item.combo_group);
      groups.push({ type: "combo", comboGroup: item.combo_group, items: comboItems });
    } else {
      groups.push({ type: "single", item });
    }
  }

  return groups;
}

// ─── Item Row ───────────────────────────────────────────────────────────────

function ItemRow({
  item,
  allItems,
  onLocalChange,
  onDelete,
  onMove,
  isCombo,
}: {
  item: SalesQuoteTemplateItem;
  allItems: SalesQuoteTemplateItem[];
  onLocalChange: (id: string, field: string, value: unknown) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  isCombo?: boolean;
}) {
  const globalIdx = allItems.findIndex((i) => i.id === item.id);

  return (
    <div className="grid grid-cols-[2rem_6rem_1fr_5rem_6rem_5rem_2rem] gap-2 px-4 py-2 items-center group hover:bg-bg/50 transition-colors border-b border-border/50 last:border-b-0 min-w-[540px]">
      {/* Reorder */}
      <div className="flex flex-col items-center gap-0.5">
        <button
          onClick={() => onMove(item.id, "up")}
          disabled={globalIdx === 0}
          className="text-text-muted hover:text-text disabled:opacity-20"
        >
          <ArrowUp className="w-3 h-3" />
        </button>
        <button
          onClick={() => onMove(item.id, "down")}
          disabled={globalIdx === allItems.length - 1}
          className="text-text-muted hover:text-text disabled:opacity-20"
        >
          <ArrowDown className="w-3 h-3" />
        </button>
      </div>

      {/* Type */}
      <select
        value={item.line_type}
        onChange={(e) => onLocalChange(item.id, "line_type", e.target.value)}
        className={`px-2 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${LINE_TYPE_COLORS[item.line_type] || LINE_TYPE_COLORS.custom}`}
      >
        {Object.entries(LINE_TYPE_LABELS).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>

      {/* Name */}
      <div className="flex items-center gap-1.5">
        {isCombo && <Combine className="w-3 h-3 text-text-muted flex-shrink-0" />}
        <input
          value={item.name || ""}
          onChange={(e) => onLocalChange(item.id, "name", e.target.value)}
          placeholder="Rivin nimi..."
          className="px-2 py-1 text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none transition-colors flex-1"
        />
      </div>

      {/* Quantity */}
      <input
        type="number"
        value={item.quantity}
        onChange={(e) => onLocalChange(item.id, "quantity", parseInt(e.target.value) || 1)}
        className="px-2 py-1 text-sm text-center bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none transition-colors w-full"
        min={1}
      />

      {/* Unit price */}
      <div className="relative">
        <input
          type="number"
          value={item.unit_price_cents / 100}
          onChange={(e) =>
            onLocalChange(item.id, "unit_price_cents", Math.round(parseFloat(e.target.value) * 100) || 0)
          }
          className="px-2 py-1 pr-5 text-sm text-right bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none transition-colors w-full"
          step="0.01"
        />
        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">€</span>
      </div>

      {/* Optional */}
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={item.is_optional}
          onChange={(e) => onLocalChange(item.id, "is_optional", e.target.checked)}
          className="rounded accent-accent"
        />
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(item.id)}
        className="text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
