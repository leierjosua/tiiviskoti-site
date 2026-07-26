import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProduct, useProducts, useProductCategories, useProductBrands, useCreateProduct, useUpdateProduct, useDeleteProduct, useDuplicateProduct, useUpsertProductFaqs, useProductServiceLinks, useLinkProductToService, useUnlinkProductFromService, useUpdateProductServiceLinkRole } from "@/hooks/useProducts";
import { supabase } from "@/lib/supabase";
import { useServices } from "@/hooks/useServices";
import { formatCents } from "@/lib/utils";
import { inputCls, selectCls } from "@/lib/constants";
import { ArrowLeft, Save, Trash2, Globe, Plus, GripVertical, X, Upload, Link2, Unlink, Sparkles, FileText, Copy } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { PRODUCT_TAG_OPTIONS } from "@/lib/types";
import type { SpecField } from "@/lib/types";

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

function SortableImage({ url, index, name, onRemove }: { url: string; index: number; name: string; onRemove: (i: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <img src={url} alt={`${name} ${index + 1}`} className="h-32 w-full object-cover rounded-xl" />
      <button type="button" {...attributes} {...listeners}
        className="absolute bottom-2 left-2 p-1.5 bg-black/60 text-white rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => onRemove(index)}
        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
      {index === 0 && <span className="absolute top-2 left-2 text-[9px] font-bold bg-accent text-white px-2 py-0.5 rounded-md">Pääkuva</span>}
    </div>
  );
}

function ProductServiceLinkManager({ productId }: { productId: string }) {
  const { data: links } = useProductServiceLinks(productId);
  const { data: services } = useServices();
  const linkMutation = useLinkProductToService();
  const unlinkMutation = useUnlinkProductFromService();
  const roleMutation = useUpdateProductServiceLinkRole();
  const [showPicker, setShowPicker] = useState(false);

  const linkedServiceIds = new Set(links?.map((l) => l.service_id));
  const availableServices = services?.filter((s) => !linkedServiceIds.has(s.id) && s.active) || [];

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="w-4 h-4 text-text-muted" />
        <h3 className={labelCls + " mb-0"}>Linkitetyt palvelut</h3>
      </div>
      <p className="text-xs text-text-muted mb-3">Määritä mihin palveluihin tämä tuote liittyy tarjouswizardissa.</p>
      <div className="flex flex-wrap gap-1.5">
        {links?.map((link) => {
          const isUpsell = link.role === "upsell";
          return (
            <div key={link.service_id} className="inline-flex items-center gap-0.5">
              <button
                onClick={() => unlinkMutation.mutate({ product_id: productId, service_id: link.service_id })}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-l-lg transition-colors group ${
                  isUpsell ? "bg-amber-50 text-amber-700 hover:bg-red-50 hover:text-red-600" : "bg-accent-muted text-accent-dark hover:bg-red-50 hover:text-red-600"
                }`}
              >
                {(link as { services?: { name: string } }).services?.name || "—"}
                <Unlink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <button
                onClick={() => roleMutation.mutate({
                  product_id: productId,
                  service_id: link.service_id,
                  role: isUpsell ? "addon" : "upsell",
                })}
                title={isUpsell ? "Lisämyynti — klikkaa vaihtaaksesi lisäpalveluksi" : "Lisäpalvelu — klikkaa vaihtaaksesi lisämyynniksi"}
                className={`inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium rounded-r-lg transition-colors ${
                  isUpsell
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    : "bg-gray-100 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                }`}
              >
                <Sparkles className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
        {!showPicker && (
          <button
            onClick={() => setShowPicker(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-border text-text-muted text-xs rounded-lg hover:border-accent hover:text-accent transition-colors"
          >
            <Plus className="w-3 h-3" /> Linkitä palvelu
          </button>
        )}
      </div>
      {showPicker && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {availableServices.length === 0 ? (
            <span className="text-xs text-text-muted">Kaikki palvelut on jo linkitetty</span>
          ) : (
            availableServices.map((s) => (
              <button
                key={s.id}
                onClick={() => linkMutation.mutate({ product_id: productId, service_id: s.id, role: "upsell" })}
                className="px-2.5 py-1 border border-border text-xs rounded-lg hover:bg-accent-muted hover:text-accent-dark hover:border-accent/30 transition-colors"
              >
                {s.name}
              </button>
            ))
          )}
          <button onClick={() => setShowPicker(false)} className="px-2 py-1 text-xs text-text-muted hover:text-text-primary">
            Peruuta
          </button>
        </div>
      )}
    </div>
  );
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/å/g, "a").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "uusi";
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const { data: product, isLoading } = useProduct(isNew ? undefined : id);
  const { data: categories } = useProductCategories();
  const { data: allProducts } = useProducts();
  const { data: existingBrands } = useProductBrands();
  const createProduct = useCreateProduct();
  const deleteProduct = useDeleteProduct();
  const duplicateProduct = useDuplicateProduct();
  const updateProduct = useUpdateProduct();
  const upsertFaqs = useUpsertProductFaqs();

  const [form, setForm] = useState({
    category_id: "",
    name: "",
    brand: "",
    model: "",
    description: "",
    sku: "",
    barcode: "",
    price_cents: "",
    cost_cents: "",
    specs: {} as Record<string, string | number | boolean>,
    tags: [] as string[],
    stock_quantity: "",
    stock_low_threshold: "",
    indoor_component_id: "",
    outdoor_component_id: "",
    multisplit_ports: "",
    show_on_website: false,
    slug: "",
    seo_title: "",
    seo_description: "",
    features: "",
    long_description: "",
    sort_order: "0",
    active: true,
  });

  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingBrochure, setUploadingBrochure] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const brochureInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleImageReorder(event: DragEndEvent) {
    if (!product || !id) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = product.images.indexOf(active.id as string);
    const newIndex = product.images.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(product.images, oldIndex, newIndex);
    await updateProduct.mutateAsync({ id, images: reordered });
  }

  useEffect(() => {
    if (product) {
      setForm({
        category_id: product.category_id,
        name: product.name,
        brand: product.brand || "",
        model: product.model || "",
        description: product.description || "",
        sku: product.sku || "",
        barcode: product.barcode || "",
        price_cents: String(product.price_cents / 100),
        cost_cents: String(product.cost_cents / 100),
        specs: product.specs,
        tags: product.tags || [],
        stock_quantity: product.stock_quantity != null ? String(product.stock_quantity) : "",
        stock_low_threshold: product.stock_low_threshold != null ? String(product.stock_low_threshold) : "",
        indoor_component_id: product.indoor_component_id || "",
        outdoor_component_id: product.outdoor_component_id || "",
        multisplit_ports: product.multisplit_ports != null ? String(product.multisplit_ports) : "",
        show_on_website: product.show_on_website,
        slug: product.slug || "",
        seo_title: product.seo_title || "",
        seo_description: product.seo_description || "",
        features: (product.features || []).join("\n"),
        long_description: product.long_description || "",
        sort_order: String(product.sort_order ?? 0),
        active: product.active,
      });
      setFaqs((product.product_faqs || []).map((f) => ({ question: f.question, answer: f.answer })));
    }
  }, [product]);

  // Build hierarchy for category selector
  const categoryTree = useMemo(() => {
    if (!categories) return [];
    const parents = categories.filter((c) => !c.parent_id && c.active);
    return parents.map((p) => ({
      ...p,
      children: categories.filter((c) => c.parent_id === p.id && c.active),
    }));
  }, [categories]);

  const selectedCategory = categories?.find((c) => c.id === form.category_id);
  const specSchema: SpecField[] = selectedCategory?.spec_schema || [];

  function autoSlug() {
    const parts = [form.brand, form.model || form.name].filter(Boolean);
    return slugify(parts.join(" "));
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const featuresArr = form.features.split("\n").map((f) => f.trim()).filter(Boolean);
    const data = {
      category_id: form.category_id,
      name: form.name,
      brand: form.brand || null,
      model: form.model || null,
      description: form.description || null,
      sku: form.sku || null,
      barcode: form.barcode.trim() || null,
      price_cents: Math.round(parseFloat(form.price_cents || "0") * 100),
      cost_cents: Math.round(parseFloat(form.cost_cents || "0") * 100),
      specs: form.specs,
      tags: form.tags,
      images: product?.images || [],
      stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity, 10) : null,
      stock_low_threshold: form.stock_low_threshold ? parseInt(form.stock_low_threshold, 10) : null,
      indoor_component_id: form.indoor_component_id || null,
      outdoor_component_id: form.outdoor_component_id || null,
      multisplit_ports: form.multisplit_ports ? parseInt(form.multisplit_ports, 10) : null,
      show_on_website: form.show_on_website,
      slug: form.show_on_website ? (form.slug || autoSlug()) : (form.slug || null),
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
      features: featuresArr.length > 0 ? featuresArr : null,
      long_description: form.long_description || null,
      brochure_url: product?.brochure_url || null,
      brochure_filename: product?.brochure_filename || null,
      active: form.active,
      sort_order: parseInt(form.sort_order, 10) || 0,
    };

    try {
      if (isNew) {
        const created = await createProduct.mutateAsync(data);
        // Save FAQs if any
        if (faqs.length > 0) {
          await upsertFaqs.mutateAsync({
            productId: created.id,
            faqs: faqs.map((f, i) => ({ product_id: created.id, category_id: null, question: f.question, answer: f.answer, sort_order: i })),
          });
        }
        toast("Tuote luotu", "success");
        navigate(`/tuotteet/${created.id}`, { replace: true });
      } else {
        await updateProduct.mutateAsync({ id: id!, ...data });
        // Save FAQs
        await upsertFaqs.mutateAsync({
          productId: id!,
          faqs: faqs.map((f, i) => ({ product_id: id!, category_id: null, question: f.question, answer: f.answer, sort_order: i })),
        });
        toast("Tuote päivitetty", "success");
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Tallennus epäonnistui", "error");
    }
  }

  async function handleImageUpload(files: FileList) {
    if (!id || isNew || !product) return;
    setUploadingImages(true);
    try {
      const newImages = [...product.images];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
        newImages.push(urlData.publicUrl);
      }
      await updateProduct.mutateAsync({ id: id!, images: newImages });
      toast("Kuvat ladattu", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Kuvien lataus epäonnistui", "error");
    }
    setUploadingImages(false);
  }

  async function handleImageRemove(index: number) {
    if (!id || !product) return;
    const ok = await confirm({ title: "Poista kuva", message: "Haluatko poistaa tämän kuvan?", confirmLabel: "Poista", variant: "danger" });
    if (!ok) return;
    const newImages = product.images.filter((_, i) => i !== index);
    await updateProduct.mutateAsync({ id: id!, images: newImages });
    toast("Kuva poistettu", "success");
  }

  function updateSpec(key: string, value: string | number | boolean) {
    setForm({ ...form, specs: { ...form.specs, [key]: value } });
  }

  async function handleDuplicate() {
    if (!id || isNew) return;
    const ok = await confirm({
      title: "Duplikoi tuote",
      message: `Luo kopio tuotteesta "${product?.name}"? Saat saman tuotteen kopion, jota voit muokata.`,
      confirmLabel: "Duplikoi",
    });
    if (!ok) return;
    try {
      const created = await duplicateProduct.mutateAsync(id);
      toast("Tuote duplikoitu", "success");
      navigate(`/tuotteet/${created.id}`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Duplikointi epäonnistui", "error");
    }
  }

  async function handleDelete() {
    if (!id || isNew) return;
    const ok = await confirm({
      title: "Poista tuote",
      message: `Haluatko varmasti poistaa tuotteen "${product?.name}"? Tätä ei voi perua.`,
      confirmLabel: "Poista",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteProduct.mutateAsync(id);
      toast("Tuote poistettu", "success");
      navigate("/tuotteet", { replace: true });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Poisto epäonnistui", "error");
    }
  }

  async function handleBrochureUpload(file: File) {
    if (!id || isNew) return;
    setUploadingBrochure(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${id}/brochure-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
      await updateProduct.mutateAsync({ id, brochure_url: urlData.publicUrl, brochure_filename: file.name });
      toast("Esite ladattu", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Esitteen lataus epäonnistui", "error");
    }
    setUploadingBrochure(false);
  }

  async function handleBrochureRemove() {
    if (!id || !product) return;
    const ok = await confirm({ title: "Poista esite", message: "Haluatko poistaa tämän esitteen?", confirmLabel: "Poista", variant: "danger" });
    if (!ok) return;
    await updateProduct.mutateAsync({ id, brochure_url: null, brochure_filename: null });
    toast("Esite poistettu", "success");
  }

  if (!isNew && isLoading) {
    return <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">Ladataan...</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={() => navigate("/tuotteet")}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary min-w-0 break-words">
          {isNew ? "Uusi tuote" : product?.name || "Tuote"}
        </h1>
        {product && (
          <Badge className={product.active ? "bg-accent-muted text-accent-dark border border-accent/30" : "bg-gray-100 text-gray-500 border border-gray-200"}>
            {product.active ? "Aktiivinen" : "Pois käytöstä"}
          </Badge>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Perustiedot</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Kategoria *</label>
              <select required value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value, specs: {} })}
                className={selectCls}>
                <option value="">Valitse kategoria</option>
                {categoryTree.map((parent) =>
                  parent.children.length > 0 ? (
                    <optgroup key={parent.id} label={parent.name}>
                      <option value={parent.id}>{parent.name} (kaikki)</option>
                      {parent.children.map((child) => (
                        <option key={child.id} value={child.id}>{child.name}</option>
                      ))}
                    </optgroup>
                  ) : (
                    <option key={parent.id} value={parent.id}>{parent.name}</option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className={labelCls}>Merkki</label>
              <input type="text" list="brand-options" value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className={inputCls} placeholder="Valitse tai kirjoita uusi" />
              <datalist id="brand-options">
                {(existingBrands || []).map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Malli</label>
              <input type="text" value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className={inputCls} placeholder="Esim. Nordic Plus 35" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Tuotteen nimi *</label>
              <input type="text" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>SKU</label>
              <input type="text" value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className={inputCls} placeholder="Valinnainen tuotekoodi" />
            </div>
            <div>
              <label className={labelCls}>Viivakoodi (EAN/GTIN)</label>
              <input type="text" inputMode="numeric" value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className={inputCls} placeholder="Laatikon viivakoodi skannausta varten" />
            </div>
            <div>
              <label className={labelCls}>Järjestys</label>
              <input type="number" min={0} step={1} value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                className={inputCls} placeholder="0 = oletus" />
              <p className="text-xs text-text-muted mt-1">Pienempi numero = näkyy ensin tuotelistauksessa</p>
            </div>
          </div>
          <div>
            <label className={labelCls}>Kuvaus</label>
            <textarea value={form.description} rows={3}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputCls + " resize-none"} />
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Hinnoittelu</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Myyntihinta sis. ALV 25,5 % (€) *</label>
              <input type="number" required min={0} step={0.01} value={form.price_cents}
                onChange={(e) => setForm({ ...form, price_cents: e.target.value })}
                className={inputCls} />
              {form.price_cents && (
                <p className="text-xs text-text-muted mt-1">
                  Veroton: {formatCents(Math.round((parseFloat(form.price_cents) / 1.255) * 100))}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Ostohinta ALV 0 % (€)</label>
              <input type="number" min={0} step={0.01} value={form.cost_cents}
                onChange={(e) => setForm({ ...form, cost_cents: e.target.value })}
                className={inputCls} />
              {form.price_cents && form.cost_cents && (() => {
                const priceExVat = parseFloat(form.price_cents) / 1.255;
                const cost = parseFloat(form.cost_cents);
                const marginEur = priceExVat - cost;
                const marginPct = Math.round((marginEur / priceExVat) * 100);
                return (
                  <p className="text-xs text-text-muted mt-1">
                    Kate: {formatCents(Math.round(marginEur * 100))} ({marginPct} %)
                  </p>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Tunnisteet</p>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_TAG_OPTIONS.map((tag) => {
              const isSelected = form.tags.includes(tag.value);
              return (
                <button
                  key={tag.value}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      tags: isSelected
                        ? form.tags.filter((t) => t !== tag.value)
                        : [...form.tags, tag.value],
                    })
                  }
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    isSelected
                      ? tag.color + " ring-2 ring-offset-1 ring-accent/30"
                      : "bg-surface-hover text-text-muted border-border hover:border-accent/30"
                  }`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic specs — grouped */}
        {specSchema.length > 0 && (() => {
          // Group fields by their group property, preserving order
          const groups: { name: string | null; fields: typeof specSchema }[] = [];
          for (const field of specSchema) {
            const groupName = field.group || null;
            const existing = groups.find((g) => g.name === groupName);
            if (existing) {
              existing.fields.push(field);
            } else {
              groups.push({ name: groupName, fields: [field] });
            }
          }

          return (
            <div className="bg-surface rounded-2xl border border-border p-6 space-y-6">
              <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Tekniset tiedot</p>
              {groups.map((group) => (
                <div key={group.name || "__ungrouped"}>
                  {group.name && (
                    <p className="text-xs font-semibold text-text-secondary mb-3 border-b border-border pb-2">{group.name}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.fields.map((field) => (
                      <div key={field.key}>
                        <label className={labelCls}>
                          {field.label}{field.unit ? ` (${field.unit})` : ""}{field.required ? " *" : ""}
                        </label>
                        {field.type === "boolean" ? (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox"
                              checked={!!form.specs[field.key]}
                              onChange={(e) => updateSpec(field.key, e.target.checked)}
                              className="rounded border-border text-accent focus:ring-accent/30"
                            />
                            <span className="text-sm text-text-secondary">Kyllä</span>
                          </label>
                        ) : field.type === "select" && field.options ? (
                          <select
                            required={field.required}
                            value={String(form.specs[field.key] || "")}
                            onChange={(e) => updateSpec(field.key, e.target.value)}
                            className={selectCls}
                          >
                            <option value="">Valitse...</option>
                            {field.options.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type === "number" ? "number" : "text"}
                            required={field.required}
                            step={field.type === "number" ? "any" : undefined}
                            value={String(form.specs[field.key] ?? "")}
                            onChange={(e) => updateSpec(field.key, field.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
                            className={inputCls}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Stock */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Varastoseuranta</p>
          <p className="text-xs text-text-muted -mt-3">Jätä tyhjäksi jos et halua seurata varastoa</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Varastomäärä</label>
              <input type="number" min={0} step={1} value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                className={inputCls} placeholder="Tyhjä = ei seurantaa" />
            </div>
            <div>
              <label className={labelCls}>Hälytysraja</label>
              <input type="number" min={0} step={1} value={form.stock_low_threshold}
                onChange={(e) => setForm({ ...form, stock_low_threshold: e.target.value })}
                className={inputCls} placeholder="Tyhjä = ei hälytystä" />
            </div>
          </div>
        </div>

        {/* Components (split-unit heat pumps, e.g. Toshiba) */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Komponentit (kaksiosainen laite)</p>
          <p className="text-xs text-text-muted -mt-3">
            Jos tämä tuote on kaksiosainen ilmalämpöpumppu (esim. Toshiba), valitse sen sisä- ja ulkoyksikkö-komponenttituotteet.
            Varastoa seurataan komponenttitasolla. Jätä molemmat tyhjäksi yksiosaisille laitteille.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Sisäyksikkö-komponentti</label>
              <select
                value={form.indoor_component_id}
                onChange={(e) => setForm({ ...form, indoor_component_id: e.target.value })}
                className={selectCls}
              >
                <option value="">— Ei komponenttia —</option>
                {(allProducts || [])
                  .filter((p) => p.id !== id && !p.indoor_component_id && !p.outdoor_component_id)
                  .sort((a, b) => a.name.localeCompare(b.name, "fi"))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.sku ? ` (${p.sku})` : ""}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Ulkoyksikkö-komponentti</label>
              <select
                value={form.outdoor_component_id}
                onChange={(e) => setForm({ ...form, outdoor_component_id: e.target.value })}
                className={selectCls}
              >
                <option value="">— Ei komponenttia —</option>
                {(allProducts || [])
                  .filter((p) => p.id !== id && !p.indoor_component_id && !p.outdoor_component_id && p.id !== form.indoor_component_id)
                  .sort((a, b) => a.name.localeCompare(b.name, "fi"))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.sku ? ` (${p.sku})` : ""}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          {(form.indoor_component_id || form.outdoor_component_id) &&
            !(form.indoor_component_id && form.outdoor_component_id) && (
              <p className="text-xs text-red-600">
                Aseta molemmat komponentit, tai jätä molemmat tyhjäksi.
              </p>
          )}
        </div>

        {/* Multisplit ports (only for outdoor-unit components) */}
        {selectedCategory?.slug === "ulkoyksikot" && (
          <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
            <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Multi-split</p>
            <p className="text-xs text-text-muted -mt-3">
              Jos tämä ulkoyksikkö on multi-split (yksi ulkoyksikkö, useita sisäyksiköitä), aseta sisäyksikköporttien määrä.
              Jätä tyhjäksi tavallisille (1:1) ulkoyksiköille. Näkyy myynnin multi-split-tarjouspolussa.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Sisäyksikköporttien määrä</label>
                <input
                  type="number" min={2} max={8} step={1}
                  value={form.multisplit_ports}
                  onChange={(e) => setForm({ ...form, multisplit_ports: e.target.value })}
                  className={inputCls}
                  placeholder="Tyhjä = tavallinen ulkoyksikkö"
                />
              </div>
            </div>
          </div>
        )}

        {/* Website visibility */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-accent" />
            <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Verkkosivunäkyvyys</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.show_on_website}
              onChange={(e) => {
                const checked = e.target.checked;
                setForm((f) => ({
                  ...f,
                  show_on_website: checked,
                  slug: checked && !f.slug ? autoSlug() : f.slug,
                }));
              }}
              className="rounded border-border text-accent focus:ring-accent/30"
            />
            <span className="text-sm font-medium text-text-secondary">Näytä tuotesivu verkkosivuilla</span>
          </label>

          {form.show_on_website && (
            <div className="space-y-4 pt-2 border-t border-border/50">
              <div>
                <label className={labelCls}>URL-polku (slug)</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted whitespace-nowrap">/tuotteet/</span>
                  <input type="text" value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                    className={inputCls} placeholder={autoSlug()} />
                </div>
              </div>
              <div>
                <label className={labelCls}>SEO-otsikko</label>
                <input type="text" value={form.seo_title}
                  onChange={(e) => setForm({ ...form, seo_title: e.target.value })}
                  className={inputCls} placeholder={`${form.name} – ${form.brand} | Lasikiilto`} />
                <p className="text-xs text-text-muted mt-1">{(form.seo_title || `${form.name} – ${form.brand} | Lasikiilto`).length}/60 merkkiä</p>
              </div>
              <div>
                <label className={labelCls}>SEO-kuvaus</label>
                <textarea value={form.seo_description} rows={2}
                  onChange={(e) => setForm({ ...form, seo_description: e.target.value })}
                  className={inputCls + " resize-none"}
                  placeholder="Automaattinen kuvaus generoidaan tuotetiedoista" />
                <p className="text-xs text-text-muted mt-1">{(form.seo_description || "").length}/160 merkkiä</p>
              </div>
              <div>
                <label className={labelCls}>Ominaisuudet (yksi per rivi)</label>
                <textarea value={form.features} rows={4}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  className={inputCls + " resize-none"}
                  placeholder={"Energiatehokas A+++ luokitus\nHiljainen toiminta 19 dB\nWi-Fi-ohjaus vakiona"} />
              </div>
              <div>
                <label className={labelCls}>Pitkä kuvaus (tuotesivulle)</label>
                <textarea value={form.long_description} rows={6}
                  onChange={(e) => setForm({ ...form, long_description: e.target.value })}
                  className={inputCls + " resize-none"}
                  placeholder="Yksityiskohtainen tuotekuvaus tuotesivua varten..." />
              </div>
            </div>
          )}
        </div>

        {/* FAQs (when show_on_website is on) */}
        {form.show_on_website && (
          <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Tuotesivun UKK</p>
              <button type="button" onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-dark transition-colors">
                <Plus className="w-3.5 h-3.5" /> Lisää kysymys
              </button>
            </div>
            {faqs.length === 0 ? (
              <p className="text-xs text-text-muted">Ei UKK-kysymyksiä. Lisää kysymyksiä painamalla yllä olevaa nappia.</p>
            ) : (
              <div className="space-y-4">
                {faqs.map((faq, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <GripVertical className="w-4 h-4 text-text-muted/40 mt-3 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <input type="text" value={faq.question}
                        onChange={(e) => { const newFaqs = [...faqs]; newFaqs[i] = { ...newFaqs[i], question: e.target.value }; setFaqs(newFaqs); }}
                        className={inputCls} placeholder="Kysymys" />
                      <textarea value={faq.answer} rows={2}
                        onChange={(e) => { const newFaqs = [...faqs]; newFaqs[i] = { ...newFaqs[i], answer: e.target.value }; setFaqs(newFaqs); }}
                        className={inputCls + " resize-none"} placeholder="Vastaus" />
                    </div>
                    <button type="button" onClick={() => setFaqs(faqs.filter((_, j) => j !== i))}
                      className="p-2 text-text-muted hover:text-red-500 transition-colors mt-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Images with upload */}
        {isNew ? (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Kuvat</p>
            <p className="text-sm text-text-muted">Tallenna tuote ensin lisätäksesi kuvia.</p>
          </div>
        ) : product && (
          <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
            <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Kuvat</p>
            {product.images.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleImageReorder}>
                <SortableContext items={product.images} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {product.images.map((img, i) => (
                      <SortableImage key={img} url={img} index={i} name={product.name} onRemove={handleImageRemove} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { if (e.target.files?.length) handleImageUpload(e.target.files); e.target.value = ""; }} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingImages}
              className="flex items-center justify-center gap-2 w-full h-24 bg-surface-hover rounded-xl border border-dashed border-border hover:border-accent/30 transition-colors text-sm text-text-muted hover:text-accent disabled:opacity-50">
              {uploadingImages ? (
                <>Ladataan...</>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Lataa kuvia
                </>
              )}
            </button>
          </div>
        )}

        {/* Brochure / Esite upload */}
        {isNew ? (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <p className="text-xs font-semibold text-text-primary uppercase tracking-wide mb-2">Esite / Datalehti</p>
            <p className="text-sm text-text-muted">Tallenna tuote ensin lisätäksesi esitteen.</p>
          </div>
        ) : product && (
          <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
            <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">Esite / Datalehti</p>
            {product.brochure_url ? (
              <div className="flex items-center gap-3 bg-surface-hover rounded-xl p-4">
                <FileText className="w-8 h-8 text-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <a href={product.brochure_url} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-medium text-accent hover:underline truncate block">
                    {product.brochure_filename || "Esite"}
                  </a>
                  <p className="text-xs text-text-muted">PDF / dokumentti</p>
                </div>
                <button type="button" onClick={handleBrochureRemove}
                  className="p-2 text-text-muted hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <input ref={brochureInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleBrochureUpload(e.target.files[0]); e.target.value = ""; }} />
                <button type="button" onClick={() => brochureInputRef.current?.click()} disabled={uploadingBrochure}
                  className="flex items-center justify-center gap-2 w-full h-20 bg-surface-hover rounded-xl border border-dashed border-border hover:border-accent/30 transition-colors text-sm text-text-muted hover:text-accent disabled:opacity-50">
                  {uploadingBrochure ? (
                    <>Ladataan...</>
                  ) : (
                    <>
                      <FileText className="w-5 h-5" />
                      Lataa esite (PDF)
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {/* Service links (only for existing products) */}
        {!isNew && id && <ProductServiceLinkManager productId={id} />}

        {/* Status + save + delete */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded border-border text-accent focus:ring-accent/30"
              />
              <span className="text-sm font-medium text-text-secondary">Aktiivinen</span>
            </label>
            {!isNew && (
              <>
                <button type="button" onClick={handleDuplicate} disabled={duplicateProduct.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-border text-text-secondary hover:bg-surface-hover rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                  <Copy className="w-4 h-4" />
                  {duplicateProduct.isPending ? "Duplikoidaan..." : "Duplikoi"}
                </button>
                <button type="button" onClick={handleDelete} disabled={deleteProduct.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-500 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                  <Trash2 className="w-4 h-4" />
                  Poista
                </button>
              </>
            )}
          </div>
          <button type="submit" disabled={createProduct.isPending || updateProduct.isPending}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
            <Save className="w-4 h-4" />
            {createProduct.isPending || updateProduct.isPending ? "Tallennetaan..." : isNew ? "Luo tuote" : "Tallenna"}
          </button>
        </div>
      </form>
    </div>
  );
}
