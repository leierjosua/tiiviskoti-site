import { useState, useRef, useMemo, useEffect } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import {
  FileText, Download, Save, Plus, Trash2, X, Package, Layers,
  ShoppingBag, PenLine, Combine, Search, Eye, EyeOff,
  ArrowUp, ArrowDown,
} from "lucide-react";
import { useServices } from "@/hooks/useServices";
import { useProducts } from "@/hooks/useProducts";
import { useAddonServices } from "@/hooks/useAddonServices";
import {
  useSalesQuoteTemplate,
  useCreateQuoteTemplate,
  useUpdateQuoteTemplate,
} from "@/hooks/sales/useSalesQuoteTemplates";
import { supabase } from "@/lib/supabase";
import { useUserRole } from "@/context/UserRoleContext";
import { useToast } from "@/context/ToastContext";
import { OfferPdfContent } from "@/components/sales/OfferPdfContent";
import type { OfferPdfData, OfferPdfLineItem } from "@/components/sales/OfferPdfContent";
import { downloadPdfFromElement } from "@/lib/chromiumPdf";
import { inputCls } from "@/lib/constants";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { isComponentProduct } from "@/lib/products";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BuilderLineItem {
  id: string;
  lineType: "service" | "product" | "additional_service" | "other_charge";
  itemId: string | null;
  name: string;
  description: string;
  unitPrice: number; // EUR
  quantity: number;
  comboGroup: string | null;
  laborPortion: number;
}

interface BuilderSection {
  id: string;
  title: string;
  items: BuilderLineItem[];
}

type CatalogTab = "services" | "products" | "addons" | "custom" | "combo";

const CATALOG_TABS: { key: CatalogTab; label: string; icon: typeof Package }[] = [
  { key: "services", label: "Palvelut", icon: Package },
  { key: "products", label: "Tuotteet", icon: ShoppingBag },
  { key: "addons", label: "Lisäpalvelut", icon: Layers },
  { key: "custom", label: "Muu", icon: PenLine },
  { key: "combo", label: "Kombo", icon: Combine },
];

function uid() {
  return crypto.randomUUID();
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function OfferTemplateBuilder() {
  const { templateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { employee } = useUserRole();
  const toast = useToast();
  const pdfRef = useRef<HTMLDivElement>(null);
  const templateLoadedRef = useRef(false);

  // Mode is decided by the route, not the row: /tarjouspohja → template, /tarjous-uusi → one_off.
  const kind: "template" | "one_off" =
    location.pathname.includes("tarjous-uusi") ? "one_off" : "template";
  const isOneOff = kind === "one_off";
  const basePath = location.pathname.startsWith("/myyja") ? "/myyja" : "/myynti";
  const editorPath = isOneOff ? "tarjous-uusi" : "tarjouspohja";
  const opportunityIdParam = searchParams.get("opportunity_id");

  // Catalog data
  const { data: services = [] } = useServices();
  const { data: products = [] } = useProducts();
  const { data: addons = [] } = useAddonServices();

  // Template loading
  const { data: existingTemplate } = useSalesQuoteTemplate(templateId);
  const createTemplate = useCreateQuoteTemplate();
  const updateTemplate = useUpdateQuoteTemplate();

  // ─── State ──────────────────────────────────────────────────────────────────
  const [title, setTitle] = useState("Tarjous");
  const [offerNumber, setOfferNumber] = useState("001");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [discount, setDiscount] = useState(0);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [sections, setSections] = useState<BuilderSection[]>([{ id: uid(), title: "", items: [] }]);
  const [activeSectionId, setActiveSectionId] = useState<string>(sections[0].id);
  const [hideCustomer, setHideCustomer] = useState(false);
  const [hideOfferMeta, setHideOfferMeta] = useState(false);
  const [hideTotals, setHideTotals] = useState(false);
  const [hideTermsPages, setHideTermsPages] = useState(true);
  const [linkedOpportunityId, setLinkedOpportunityId] = useState<string | null>(opportunityIdParam);

  // Catalog UI
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("products");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Combo builder — default service to "Perusasennus"
  const defaultServiceId = useMemo(
    () => services.find((s) => s.name.toLowerCase().includes("perusasennus"))?.id || "",
    [services]
  );
  const [comboProduct, setComboProduct] = useState("");
  const [comboService, setComboService] = useState("");
  const [comboName, setComboName] = useState("");
  const [comboPrice, setComboPrice] = useState(0);
  const [comboProductPrice, setComboProductPrice] = useState(0);
  const [comboServicePrice, setComboServicePrice] = useState(0);

  // Set default service once loaded
  useEffect(() => {
    if (defaultServiceId && !comboService) setComboService(defaultServiceId);
  }, [defaultServiceId]);

  // Reset load guard when switching templates
  useEffect(() => { templateLoadedRef.current = false; }, [templateId]);

  // ─── Load existing template ─────────────────────────────────────────────────
  useEffect(() => {
    if (!existingTemplate) return;
    // Wait until catalog data is loaded, then load once
    if (products.length === 0 && services.length === 0) return;
    if (templateLoadedRef.current) return;
    templateLoadedRef.current = true;
    setTitle(existingTemplate.name);
    setNoteTitle(existingTemplate.note_title || "");
    setNoteContent(existingTemplate.note_content || "");
    setValidityDays(existingTemplate.validity_days ?? 30);
    if (existingTemplate.offer_number) setOfferNumber(existingTemplate.offer_number);
    setCustomerName(existingTemplate.customer_name || "");
    setCustomerEmail(existingTemplate.customer_email || "");
    setCustomerPhone(existingTemplate.customer_phone || "");
    setCustomerAddress(existingTemplate.customer_address || "");
    setDiscount((existingTemplate.discount_cents ?? 0) / 100);
    setLinkedOpportunityId(existingTemplate.opportunity_id);
    const items = [...(existingTemplate.sales_quote_template_items || [])]
      .sort((a, b) => a.sort_order - b.sort_order);

    // Group items into sections by section_order
    const sectionMap = new Map<number, { title: string; items: typeof items }>();
    for (const it of items) {
      const sOrder = it.section_order ?? 0;
      if (!sectionMap.has(sOrder)) {
        sectionMap.set(sOrder, { title: it.section_title || "", items: [] });
      }
      sectionMap.get(sOrder)!.items.push(it);
    }

    // Sort sections by order and build BuilderSection[]
    const sortedSections = [...sectionMap.entries()].sort((a, b) => a[0] - b[0]);
    const loadedSections: BuilderSection[] = sortedSections.map(([, sec]) => ({
      id: uid(),
      title: sec.title,
      items: sec.items.map((it) => {
        // Use live catalog price when possible, fall back to stamped price
        let livePrice = it.unit_price_cents / 100;
        if (it.item_id) {
          if (it.line_type === "product") {
            const prod = products.find((p) => p.id === it.item_id);
            if (prod) livePrice = prod.price_cents / 100;
          } else if (it.line_type === "service") {
            const svc = services.find((s) => s.id === it.item_id);
            if (svc) livePrice = svc.base_price_cents / 100;
          } else if (it.line_type === "addon_service") {
            const addon = addons.find((a) => a.id === it.item_id);
            if (addon) livePrice = addon.price_cents / 100;
          }
        }
        return {
          id: uid(),
          lineType: (it.line_type === "addon_service" ? "additional_service" : it.line_type === "custom" ? "other_charge" : it.line_type) as BuilderLineItem["lineType"],
          itemId: it.item_id,
          name: it.name,
          description: it.description || "",
          unitPrice: livePrice,
          quantity: it.quantity,
          comboGroup: it.combo_group,
          laborPortion: it.line_type === "service" || it.line_type === "addon_service" ? livePrice : 0,
        };
      }),
    }));

    if (loadedSections.length === 0) {
      const id = uid();
      setSections([{ id, title: "", items: [] }]);
      setActiveSectionId(id);
    } else {
      setSections(loadedSections);
      setActiveSectionId(loadedSections[0].id);
    }
  }, [existingTemplate, products.length, services.length, addons.length]);
  // Re-run when catalog data finishes loading (length changes 0→N), but not on every reference change

  // ─── Combo auto-fill ────────────────────────────────────────────────────────
  useEffect(() => {
    const prod = products.find((p) => p.id === comboProduct);
    const svc = services.find((s) => s.id === comboService);
    const pp = prod ? prod.price_cents / 100 : 0;
    const sp = svc ? svc.base_price_cents / 100 : 0;
    setComboProductPrice(pp);
    setComboServicePrice(sp);
    setComboPrice(pp + sp);
    if (prod && svc) {
      setComboName(`${prod.name} (sis. ${svc.name})`);
    } else if (prod) {
      setComboName(prod.name);
    }
  }, [comboProduct, comboService, products, services]);

  // Keep total in sync when individual prices are edited
  useEffect(() => {
    setComboPrice(comboProductPrice + comboServicePrice);
  }, [comboProductPrice, comboServicePrice]);

  // ─── Section helpers ─────────────────────────────────────────────────────────

  const allLineItems = sections.flatMap((s) => s.items);

  function addSection() {
    const id = uid();
    setSections((prev) => [...prev, { id, title: "", items: [] }]);
    setActiveSectionId(id);
  }

  function removeSection(sectionId: string) {
    setSections((prev) => {
      const next = prev.filter((s) => s.id !== sectionId);
      if (next.length === 0) {
        const id = uid();
        setActiveSectionId(id);
        return [{ id, title: "", items: [] }];
      }
      if (activeSectionId === sectionId) setActiveSectionId(next[0].id);
      return next;
    });
  }

  function updateSectionTitle(sectionId: string, title: string) {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, title } : s)));
  }

  function moveSection(sectionId: string, dir: -1 | 1) {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === sectionId);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  // ─── Item helpers ──────────────────────────────────────────────────────────

  /** Sort items: cheapest (by effective price) first, combos use combined price */
  function sortByPrice(items: BuilderLineItem[]): BuilderLineItem[] {
    // Compute effective price per item (combo items share a group price)
    const comboPrice = new Map<string, number>();
    const comboQty = new Map<string, number>();
    for (const item of items) {
      if (item.comboGroup) {
        comboPrice.set(item.comboGroup, (comboPrice.get(item.comboGroup) || 0) + item.unitPrice);
        if (!comboQty.has(item.comboGroup)) comboQty.set(item.comboGroup, item.quantity);
      }
    }
    const price = (item: BuilderLineItem) =>
      item.comboGroup
        ? (comboPrice.get(item.comboGroup) || 0) * (comboQty.get(item.comboGroup) || 1)
        : item.unitPrice * item.quantity;

    // Stable sort: keep combo items together
    const groups: BuilderLineItem[][] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const key = item.comboGroup || item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      if (item.comboGroup) {
        groups.push(items.filter((i) => i.comboGroup === item.comboGroup));
      } else {
        groups.push([item]);
      }
    }
    groups.sort((a, b) => price(a[0]) - price(b[0]));
    return groups.flat();
  }

  function addItem(item: Omit<BuilderLineItem, "id">) {
    setSections((prev) => prev.map((s) =>
      s.id === activeSectionId
        ? { ...s, items: sortByPrice([...s.items, { ...item, id: uid() }]) }
        : s
    ));
  }

  function removeItem(id: string) {
    setSections((prev) => prev.map((s) => {
      const item = s.items.find((i) => i.id === id);
      if (!item) return s;
      if (item.comboGroup) {
        return { ...s, items: s.items.filter((i) => i.comboGroup !== item.comboGroup) };
      }
      return { ...s, items: s.items.filter((i) => i.id !== id) };
    }));
  }

  function updateItem(id: string, updates: Partial<BuilderLineItem>) {
    setSections((prev) => prev.map((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    })));
  }

  function updateComboQuantity(comboGroup: string, quantity: number) {
    const q = Math.max(1, quantity);
    setSections((prev) => prev.map((s) => ({
      ...s,
      items: s.items.map((i) => (i.comboGroup === comboGroup ? { ...i, quantity: q } : i)),
    })));
  }

  function moveItem(itemId: string, dir: -1 | 1) {
    setSections((prev) => prev.map((s) => {
      const idx = s.items.findIndex((i) => i.id === itemId);
      if (idx < 0) return s;
      // For combo items, move the whole group
      const item = s.items[idx];
      if (item.comboGroup) {
        // Simple: just swap positions in the flat list
        const allGroups: BuilderLineItem[][] = [];
        const seenG = new Set<string>();
        for (const it of s.items) {
          const key = it.comboGroup || it.id;
          if (seenG.has(key)) continue;
          seenG.add(key);
          allGroups.push(it.comboGroup ? s.items.filter((x) => x.comboGroup === it.comboGroup) : [it]);
        }
        const gIdx = allGroups.findIndex((g) => g[0].comboGroup === item.comboGroup);
        const gTarget = gIdx + dir;
        if (gTarget < 0 || gTarget >= allGroups.length) return s;
        [allGroups[gIdx], allGroups[gTarget]] = [allGroups[gTarget], allGroups[gIdx]];
        return { ...s, items: allGroups.flat() };
      }
      const target = idx + dir;
      if (target < 0 || target >= s.items.length) return s;
      // Skip over combo group members
      const targetItem = s.items[target];
      if (targetItem.comboGroup) {
        // Jump over the whole combo
        const comboItems = s.items.filter((i) => i.comboGroup === targetItem.comboGroup);
        const firstComboIdx = s.items.indexOf(comboItems[0]);
        const lastComboIdx = s.items.indexOf(comboItems[comboItems.length - 1]);
        const jumpTo = dir === -1 ? firstComboIdx : lastComboIdx;
        const next = [...s.items];
        next.splice(idx, 1);
        next.splice(jumpTo + (dir === -1 ? 0 : 0), 0, item);
        return { ...s, items: next };
      }
      const next = [...s.items];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...s, items: next };
    }));
  }

  function addCombo() {
    if (!comboName.trim()) return;
    const group = uid();
    const prod = products.find((p) => p.id === comboProduct);
    const svc = services.find((s) => s.id === comboService);

    // Add product item in the combo (with custom price)
    if (prod) {
      addItem({
        lineType: "product",
        itemId: prod.id,
        name: prod.name,
        description: "",
        unitPrice: comboProductPrice,
        quantity: 1,
        comboGroup: group,
        laborPortion: 0,
      });
    }
    // Add service item in the combo (with custom price)
    if (svc) {
      addItem({
        lineType: "service",
        itemId: svc.id,
        name: svc.name,
        description: "",
        unitPrice: comboServicePrice,
        quantity: 1,
        comboGroup: group,
        laborPortion: comboServicePrice,
      });
    }

    setComboProduct("");
    setComboService(defaultServiceId);
    setComboName("");
    setComboPrice(0);
  }

  // ─── Build PDF data ─────────────────────────────────────────────────────────

  function resolveItems(items: BuilderLineItem[]): OfferPdfLineItem[] {
    const comboGroups = new Map<string, BuilderLineItem[]>();
    const singles: BuilderLineItem[] = [];
    for (const item of items) {
      if (item.comboGroup) {
        const group = comboGroups.get(item.comboGroup) || [];
        group.push(item);
        comboGroups.set(item.comboGroup, group);
      } else {
        singles.push(item);
      }
    }
    const result: OfferPdfLineItem[] = [];
    for (const [, group] of comboGroups) {
      const productItem = group.find((i) => i.lineType === "product");
      const serviceItem = group.find((i) => i.lineType === "service");
      const combinedPrice = group.reduce((sum, i) => sum + i.unitPrice, 0);
      const combinedLabor = group.reduce((sum, i) => sum + i.laborPortion, 0);
      const quantity = Math.max(1, group[0]?.quantity ?? 1);
      const name = productItem && serviceItem
        ? `${productItem.name} (sis. ${serviceItem.name})`
        : group.map((i) => i.name).join(" + ");
      result.push({ name, description: group.map((i) => i.description).filter(Boolean).join("; ") || null, quantity, unitPrice: combinedPrice, totalPrice: combinedPrice * quantity, lineType: "product", laborPortion: combinedLabor * quantity });
    }
    for (const item of singles) {
      result.push({ name: item.name, description: item.description || null, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.unitPrice * item.quantity, lineType: item.lineType, laborPortion: item.laborPortion });
    }
    return result;
  }

  const pdfData: OfferPdfData = useMemo(() => {
    const allPdfItems = resolveItems(allLineItems);
    const hasTitledSections = sections.some((s) => s.title.trim());
    const pdfSections = sections.length > 1 || hasTitledSections
      ? sections.map((s) => ({ title: s.title, items: resolveItems(s.items) }))
      : undefined;

    const subtotal = allPdfItems.reduce((sum, i) => sum + i.totalPrice, 0);
    const total = subtotal - discount;

    return {
      offerNumber,
      title,
      createdAt: new Date().toISOString(),
      customerName: customerName || "Asiakas",
      customerAddress: customerAddress || "",
      customerContact: "",
      customerEmail: customerEmail || undefined,
      customerPhone: customerPhone || undefined,
      lineItems: allPdfItems,
      subtotal,
      discount,
      total,
      sellerName: employee ? `${employee.first_name} ${employee.last_name}` : undefined,
      noteTitle: noteTitle || undefined,
      noteContent: noteContent || undefined,
      validityDays,
      hideCustomer,
      hideOfferMeta,
      hideTotals,
      hideTermsPages,
      sections: pdfSections,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, title, offerNumber, customerName, customerEmail, customerPhone, customerAddress, discount, noteTitle, noteContent, validityDays, hideCustomer, hideOfferMeta, hideTotals, hideTermsPages, employee]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleDownload() {
    if (!pdfRef.current) return;
    setDownloading(true);
    try {
      await downloadPdfFromElement(pdfRef.current, `${title.replace(/\s+/g, "_")}.pdf`);
      toast("PDF ladattu");
    } catch (err) {
      console.error("PDF download failed:", err);
      toast("PDF:n lataus epäonnistui", "error");
    } finally {
      setDownloading(false);
    }
  }

  async function handleSaveAsTemplate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      async function saveItems(tplId: string) {
        const rows: Array<Record<string, unknown>> = [];
        let idx = 0;
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const section = sections[sIdx];
          for (const li of section.items) {
            rows.push({
              template_id: tplId,
              line_type: li.lineType === "additional_service" ? "addon_service" : li.lineType === "other_charge" ? "custom" : li.lineType,
              item_id: li.itemId,
              name: li.name,
              description: li.description || null,
              unit_price_cents: Math.round(li.unitPrice * 100),
              quantity: li.quantity,
              is_optional: false,
              sort_order: idx++,
              combo_group: li.comboGroup || null,
              section_title: section.title || null,
              section_order: sIdx,
            });
          }
        }
        if (rows.length > 0) {
          const { error } = await supabase.from("sales_quote_template_items").insert(rows);
          if (error) throw error;
        }
      }

      const sharedFields = {
        note_title: noteTitle.trim() || null,
        note_content: noteContent.trim() || null,
        validity_days: validityDays,
        offer_number: isOneOff ? (offerNumber.trim() || null) : null,
        customer_name: isOneOff ? (customerName.trim() || null) : null,
        customer_email: isOneOff ? (customerEmail.trim() || null) : null,
        customer_phone: isOneOff ? (customerPhone.trim() || null) : null,
        customer_address: isOneOff ? (customerAddress.trim() || null) : null,
        discount_cents: Math.round(discount * 100),
        opportunity_id: isOneOff ? linkedOpportunityId : null,
      };

      if (templateId && existingTemplate) {
        await updateTemplate.mutateAsync({ id: templateId, name: title.trim(), ...sharedFields });
        // Delete all old items in one call
        await supabase
          .from("sales_quote_template_items")
          .delete()
          .eq("template_id", templateId);
        await saveItems(templateId);
        toast(isOneOff ? "Tarjous päivitetty" : "Pohja päivitetty");
      } else {
        const tpl = await createTemplate.mutateAsync({ name: title.trim(), kind, ...sharedFields });
        await saveItems(tpl.id);
        toast(isOneOff ? "Tarjous tallennettu" : "Pohja tallennettu");
        navigate(`${basePath}/${editorPath}/${tpl.id}`, { replace: true });
      }
    } catch (err) {
      console.error("Save failed:", err);
      toast("Tallennus epäonnistui", "error");
    } finally {
      setSaving(false);
    }
  }

  // ─── Filtered catalog ───────────────────────────────────────────────────────
  const q = catalogSearch.toLowerCase();
  const filteredServices = services.filter((s) => s.name.toLowerCase().includes(q));
  const filteredProducts = products.filter((p) => {
    // Components (sisä-/ulkoyksiköt) stay hidden until the user searches.
    if (!q) return !isComponentProduct(p);
    return p.name.toLowerCase().includes(q) || (p.brand || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
  });
  const filteredAddons = addons.filter((a) => a.name.toLowerCase().includes(q));

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-1px)] overflow-hidden">
      {/* ═══ LEFT: Builder ═══ */}
      <div className="w-full lg:w-[480px] flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" />
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary">
              {isOneOff ? "Yksittäinen tarjous" : "Tarjouspohja"}
            </h1>
            {isOneOff && linkedOpportunityId && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-medium">
                Liitetty asiakkaaseen
              </span>
            )}
          </div>

          {/* ── Toggles ── */}
          <div className="flex flex-wrap gap-2">
            <ToggleChip label="Asiakastiedot" active={!hideCustomer} onClick={() => setHideCustomer(!hideCustomer)} />
            <ToggleChip label="Tarjouksen tiedot" active={!hideOfferMeta} onClick={() => setHideOfferMeta(!hideOfferMeta)} />
            <ToggleChip label="Yhteenveto" active={!hideTotals} onClick={() => setHideTotals(!hideTotals)} />
            <ToggleChip label="Sopimusehdot" active={!hideTermsPages} onClick={() => setHideTermsPages(!hideTermsPages)} />
          </div>

          {/* ── Customer info ── */}
          {!hideCustomer && (
            <Card title="Asiakastiedot">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={`${inputCls} !py-1.5 !text-xs`} placeholder="Nimi" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                <input className={`${inputCls} !py-1.5 !text-xs`} placeholder="Sähköposti" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                <input className={`${inputCls} !py-1.5 !text-xs`} placeholder="Puhelin" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                <input className={`${inputCls} !py-1.5 !text-xs`} placeholder="Osoite" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
              </div>
            </Card>
          )}

          {/* ── Offer metadata ── */}
          {!hideOfferMeta && (
            <Card title="Tarjouksen tiedot">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={`${inputCls} !py-1.5 !text-xs`} placeholder="Otsikko" value={title} onChange={(e) => setTitle(e.target.value)} />
                <input className={`${inputCls} !py-1.5 !text-xs`} placeholder="Tarjousnumero" value={offerNumber} onChange={(e) => setOfferNumber(e.target.value)} />
              </div>
            </Card>
          )}

          {/* ── Extra options (always visible) ── */}
          <Card title="Lisäasetukset">
            {!hideTotals && (
              <div className="mb-2">
                <div className="relative">
                  <input
                    type="number"
                    className={`${inputCls} !py-1.5 !text-xs !pr-8`}
                    placeholder="Alennus"
                    value={discount || ""}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    step="0.01"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">€</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <input
                className={`${inputCls} !py-1.5 !text-xs`}
                placeholder={isOneOff ? "Tarjouksen nimi (sisäinen)" : "Pohjan nimi (tallennusta varten)"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className={`${inputCls} !py-1.5 !text-xs w-20`}
                  value={validityDays}
                  onChange={(e) => setValidityDays(Math.max(1, parseInt(e.target.value) || 30))}
                  min={1}
                  max={365}
                />
                <span className="text-[10px] text-text-muted">pv voimassaolo</span>
              </div>
              <input className={`${inputCls} !py-1.5 !text-xs`} placeholder="Huomautuksen otsikko (valinnainen)" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
              <textarea className={`${inputCls} !py-1.5 !text-xs`} placeholder="Huomautus (valinnainen)" rows={2} value={noteContent} onChange={(e) => setNoteContent(e.target.value)} />
            </div>
          </Card>

          {/* ── Catalog picker ── */}
          <Card title="Lisää rivejä">
            <div className="flex flex-wrap gap-1 mb-2">
              {CATALOG_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setCatalogTab(tab.key); setCatalogSearch(""); }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                    catalogTab === tab.key ? "bg-accent text-white" : "bg-bg-secondary text-text-muted hover:text-text-primary"
                  }`}
                >
                  <tab.icon className="w-3 h-3" /> {tab.label}
                </button>
              ))}
            </div>

            {catalogTab !== "custom" && catalogTab !== "combo" && (
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <input
                  className={`${inputCls} !py-1.5 !text-xs !pl-8`}
                  placeholder="Hae..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                />
              </div>
            )}

            {/* Services */}
            {catalogTab === "services" && (
              <CatalogList
                items={filteredServices.map((s) => ({
                  id: s.id,
                  name: s.name,
                  price: s.base_price_cents / 100,
                  sub: `${s.duration_minutes} min`,
                }))}
                onAdd={(item) => addItem({
                  lineType: "service",
                  itemId: item.id,
                  name: item.name,
                  description: "",
                  unitPrice: item.price,
                  quantity: 1,
                  comboGroup: null,
                  laborPortion: item.price,
                })}
              />
            )}

            {/* Products */}
            {catalogTab === "products" && (
              <CatalogList
                items={filteredProducts.map((p) => ({
                  id: p.id,
                  name: p.name,
                  price: p.price_cents / 100,
                  sub: p.brand || undefined,
                }))}
                onAdd={(item) => addItem({
                  lineType: "product",
                  itemId: item.id,
                  name: item.name,
                  description: "",
                  unitPrice: item.price,
                  quantity: 1,
                  comboGroup: null,
                  laborPortion: 0,
                })}
              />
            )}

            {/* Addon services */}
            {catalogTab === "addons" && (
              <CatalogList
                items={filteredAddons.map((a) => ({
                  id: a.id,
                  name: a.name,
                  price: a.price_cents / 100,
                }))}
                onAdd={(item) => addItem({
                  lineType: "additional_service",
                  itemId: item.id,
                  name: item.name,
                  description: "",
                  unitPrice: item.price,
                  quantity: 1,
                  comboGroup: null,
                  laborPortion: item.price,
                })}
              />
            )}

            {/* Custom item */}
            {catalogTab === "custom" && (
              <CustomItemForm onAdd={(name, price, qty) => addItem({
                lineType: "other_charge",
                itemId: null,
                name,
                description: "",
                unitPrice: price,
                quantity: qty,
                comboGroup: null,
                laborPortion: 0,
              })} />
            )}

            {/* Combo builder */}
            {catalogTab === "combo" && (
              <div className="space-y-2">
                <p className="text-[10px] text-text-muted">Yhdistä tuote ja palvelu yhdeksi riviksi</p>
                <SearchableSelect
                  value={comboProduct}
                  onChange={setComboProduct}
                  placeholder="Valitse tuote..."
                  searchPlaceholder="Hae tuotetta nimellä, merkillä tai SKU:lla..."
                  hint="Komponentit (sisä-/ulkoyksiköt) löytyvät hakemalla."
                  options={products.map((p) => ({
                    id: p.id,
                    label: p.name,
                    sublabel: p.brand || undefined,
                    price: p.price_cents / 100,
                    keywords: p.sku || undefined,
                    hiddenUntilSearch: isComponentProduct(p),
                    badge: isComponentProduct(p) ? "komponentti" : undefined,
                  }))}
                />
                <SearchableSelect
                  value={comboService}
                  onChange={setComboService}
                  placeholder="Valitse palvelu..."
                  searchPlaceholder="Hae palvelua..."
                  options={services.map((s) => ({
                    id: s.id,
                    label: s.name,
                    price: s.base_price_cents / 100,
                  }))}
                />
                {(comboProduct || comboService) && (
                  <div className="space-y-2">
                    <input
                      className={`${inputCls} !py-1.5 !text-xs`}
                      value={comboName}
                      onChange={(e) => setComboName(e.target.value)}
                      placeholder="Paketin nimi"
                    />
                    {comboProduct && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-muted w-14">Tuote</span>
                        <div className="relative flex-1">
                          <input
                            type="number"
                            className={`${inputCls} !py-1.5 !text-xs !pr-6`}
                            value={comboProductPrice || ""}
                            onChange={(e) => setComboProductPrice(parseFloat(e.target.value) || 0)}
                            step="0.01"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">€</span>
                        </div>
                      </div>
                    )}
                    {comboService && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-muted w-14">Palvelu</span>
                        <div className="relative flex-1">
                          <input
                            type="number"
                            className={`${inputCls} !py-1.5 !text-xs !pr-6`}
                            value={comboServicePrice || ""}
                            onChange={(e) => setComboServicePrice(parseFloat(e.target.value) || 0)}
                            step="0.01"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">€</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">Yht:</span>
                      <span className="text-sm font-semibold">{comboPrice.toFixed(2)} €</span>
                    </div>
                    <button
                      onClick={addCombo}
                      disabled={!comboName.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" /> Lisää paketti
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* ── Sections & Line items ── */}
          {sections.map((section, sIdx) => (
            <div
              key={section.id}
              className={`border rounded-xl overflow-hidden transition-colors ${
                activeSectionId === section.id ? "border-accent/40 bg-accent/5" : "border-border bg-surface"
              }`}
            >
              {/* Section header */}
              <div
                className="flex items-center gap-1.5 px-3 py-2 cursor-pointer"
                onClick={() => setActiveSectionId(section.id)}
              >
                {/* Section reorder buttons */}
                {sections.length > 1 && (
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveSection(section.id, -1); }}
                      disabled={sIdx === 0}
                      className="text-text-muted hover:text-text-primary disabled:opacity-20"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveSection(section.id, 1); }}
                      disabled={sIdx === sections.length - 1}
                      className="text-text-muted hover:text-text-primary disabled:opacity-20"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <input
                    className={`w-full text-xs font-semibold bg-transparent outline-none placeholder:text-text-muted ${
                      activeSectionId === section.id ? "text-accent" : ""
                    }`}
                    value={section.title}
                    onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                    placeholder={sections.length > 1 ? "Osion otsikko..." : "Osion otsikko (valinnainen)"}
                    onClick={(e) => { e.stopPropagation(); setActiveSectionId(section.id); }}
                  />
                </div>
                <span className="text-[10px] text-text-muted whitespace-nowrap">{section.items.length} riviä</span>
                {sections.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSection(section.id); }}
                    className="text-text-muted hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Section items */}
              {section.items.length > 0 && (
                <div className="px-3 pb-2 space-y-1">
                  {(() => {
                    const rendered = new Set<string>();
                    return section.items.map((item) => {
                      if (item.comboGroup) {
                        if (rendered.has(item.comboGroup)) return null;
                        rendered.add(item.comboGroup);
                        const group = section.items.filter((i) => i.comboGroup === item.comboGroup);
                        const combinedPrice = group.reduce((s, i) => s + i.unitPrice, 0);
                        const productItem = group.find((i) => i.lineType === "product");
                        const serviceItem = group.find((i) => i.lineType === "service");
                        const displayName = productItem && serviceItem
                          ? `${productItem.name} (sis. ${serviceItem.name})`
                          : group.map((i) => i.name).join(" + ");
                        const comboQty = Math.max(1, group[0]?.quantity ?? 1);
                        return (
                          <div key={item.comboGroup} className="flex items-center gap-1.5 px-2 py-1.5 bg-purple-50 border border-purple-200 rounded-lg group/row">
                            <div className="flex flex-col gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0">
                              <button onClick={() => moveItem(item.id, -1)} className="text-text-muted hover:text-text-primary"><ArrowUp className="w-2.5 h-2.5" /></button>
                              <button onClick={() => moveItem(item.id, 1)} className="text-text-muted hover:text-text-primary"><ArrowDown className="w-2.5 h-2.5" /></button>
                            </div>
                            <Combine className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{displayName}</p>
                              <p className="text-[10px] text-purple-600">Paketti</p>
                            </div>
                            <input
                              type="number"
                              className="w-10 text-center text-xs bg-white border border-border rounded px-1 py-0.5"
                              value={comboQty}
                              onChange={(e) => updateComboQuantity(item.comboGroup!, parseInt(e.target.value) || 1)}
                              min={1}
                            />
                            <span className="text-xs font-semibold whitespace-nowrap">{(combinedPrice * comboQty).toFixed(2)} €</span>
                            <button onClick={() => removeItem(item.id)} className="text-text-muted hover:text-red-500 flex-shrink-0">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div key={item.id} className="flex items-center gap-1.5 px-2 py-1.5 bg-white/80 rounded-lg group/row">
                          <div className="flex flex-col gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => moveItem(item.id, -1)} className="text-text-muted hover:text-text-primary"><ArrowUp className="w-2.5 h-2.5" /></button>
                            <button onClick={() => moveItem(item.id, 1)} className="text-text-muted hover:text-text-primary"><ArrowDown className="w-2.5 h-2.5" /></button>
                          </div>
                          <div className="flex-1 min-w-0">
                            <input className="text-xs font-medium bg-transparent outline-none w-full" value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} />
                          </div>
                          <input type="number" className="w-10 text-center text-xs bg-white border border-border rounded px-1 py-0.5" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: parseInt(e.target.value) || 1 })} min={1} />
                          <div className="relative w-20">
                            <input type="number" className="w-full text-xs bg-white border border-border rounded px-1 py-0.5 pr-5 text-right" value={item.unitPrice} onChange={(e) => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })} step="0.01" />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-text-muted">€</span>
                          </div>
                          <button onClick={() => removeItem(item.id)} className="text-text-muted hover:text-red-500 flex-shrink-0">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          ))}

          {/* Add section button */}
          <button
            onClick={addSection}
            className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80"
          >
            <Plus className="w-3.5 h-3.5" /> Lisää osio
          </button>

          {/* Totals summary */}
          {!hideTotals && allLineItems.length > 0 && (
            <div className="border border-border rounded-xl bg-surface p-3">
              <div className="flex justify-between text-xs text-text-muted">
                <span>Välisumma</span>
                <span>{pdfData.subtotal.toFixed(2)} €</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-xs text-red-500">
                  <span>Alennus</span>
                  <span>-{discount.toFixed(2)} €</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold mt-1">
                <span>Yhteensä</span>
                <span>{pdfData.total.toFixed(2)} €</span>
              </div>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex flex-wrap gap-2 pb-4">
            <button
              onClick={handleDownload}
              disabled={downloading || allLineItems.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
            >
              {downloading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
              Lataa PDF
            </button>
            <button
              onClick={handleSaveAsTemplate}
              disabled={saving || allLineItems.length === 0}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-xs font-semibold hover:bg-bg-secondary disabled:opacity-50"
            >
              {saving ? <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
              {isOneOff
                ? (templateId ? "Päivitä tarjous" : "Tallenna tarjous")
                : (templateId ? "Päivitä pohja" : "Tallenna pohjaksi")}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT: Live PDF Preview ═══ */}
      <div className="hidden lg:block flex-1 bg-gray-100 overflow-y-auto p-6">
        <div className="mx-auto overflow-x-auto" style={{ maxWidth: "595px" }}>
          <div
            ref={pdfRef}
            className="bg-white shadow-xl"
            style={{ width: "595px", minWidth: "595px" }}
          >
            <OfferPdfContent data={pdfData} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? "bg-accent/10 text-accent border border-accent/30"
          : "bg-bg-secondary text-text-muted border border-border"
      }`}
    >
      {active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      {label}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-xl bg-surface">
      <div className="px-3 py-2 border-b border-border">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{title}</p>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function CatalogList({
  items,
  onAdd,
}: {
  items: { id: string; name: string; price: number; sub?: string }[];
  onAdd: (item: { id: string; name: string; price: number }) => void;
}) {
  return (
    <div className="max-h-48 overflow-y-auto space-y-0.5">
      {items.length === 0 && <p className="text-xs text-text-muted text-center py-2">Ei tuloksia</p>}
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onAdd(item)}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-bg-secondary text-left transition-colors"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{item.name}</p>
            {item.sub && <p className="text-[10px] text-text-muted">{item.sub}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className="text-xs font-semibold">{item.price.toFixed(2)} €</span>
            <Plus className="w-3.5 h-3.5 text-accent" />
          </div>
        </button>
      ))}
    </div>
  );
}

function CustomItemForm({ onAdd }: { onAdd: (name: string, price: number, qty: number) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");

  function handleAdd() {
    if (!name.trim()) return;
    onAdd(name.trim(), parseFloat(price) || 0, parseInt(qty) || 1);
    setName("");
    setPrice("");
    setQty("1");
  }

  return (
    <div className="space-y-2">
      <input className={`${inputCls} !py-1.5 !text-xs`} placeholder="Rivin nimi" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <input
            type="number"
            className={`${inputCls} !py-1.5 !text-xs !pr-6`}
            placeholder="Hinta"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            step="0.01"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">€</span>
        </div>
        <input
          type="number"
          className={`${inputCls} !py-1.5 !text-xs`}
          placeholder="Määrä"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          min="1"
        />
      </div>
      <button
        onClick={handleAdd}
        disabled={!name.trim()}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 disabled:opacity-50"
      >
        <Plus className="w-3 h-3" /> Lisää rivi
      </button>
    </div>
  );
}
