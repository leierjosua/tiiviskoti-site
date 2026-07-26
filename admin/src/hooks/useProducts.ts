import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Product, ProductCategory, ProductFaq, ServiceProductLink } from "@/lib/types";

/**
 * Trigger ISR cache busting on the public site after a product/category mutation.
 * Fire-and-forget — never throws, never blocks the mutation.
 */
async function revalidateSiteProducts(): Promise<void> {
  try {
    await supabase.functions.invoke("revalidate-site", {
      body: { type: "products" },
    });
  } catch (err) {
    // Don't surface this to the user — the DB write already succeeded.
    console.warn("[revalidateSiteProducts] failed:", err);
  }
}

// ─── Categories ──────────────────────────────────────────────────────────────

export function useProductCategories() {
  return useQuery({
    queryKey: queryKeys.productCategories.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data as ProductCategory[];
    },
  });
}

export function useCreateProductCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ProductCategory, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("product_categories").insert(input).select().single();
      if (error) throw error;
      return data as ProductCategory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productCategories.all });
      revalidateSiteProducts();
    },
  });
}

export function useUpdateProductCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ProductCategory> & { id: string }) => {
      const { error } = await supabase.from("product_categories").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productCategories.all });
      revalidateSiteProducts();
    },
  });
}

// ─── Brands (derived from existing products) ────────────────────────────────

export function useProductBrands() {
  return useQuery({
    queryKey: ["product-brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("brand")
        .not("brand", "is", null)
        .order("brand");
      if (error) throw error;
      const unique = [...new Set((data || []).map((d) => d.brand as string).filter(Boolean))];
      return unique;
    },
  });
}

// ─── Products ────────────────────────────────────────────────────────────────

export function useProducts(categoryId?: string) {
  return useQuery({
    queryKey: queryKeys.products.list(categoryId),
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*, product_categories(*)")
        .order("sort_order")
        .order("name");
      if (categoryId) query = query.eq("category_id", categoryId);
      const { data, error } = await query;
      if (error) throw error;
      return data as (Product & { product_categories: ProductCategory })[];
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.products.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_categories(*), product_faqs(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      // Sort FAQs by sort_order
      if (data.product_faqs) {
        data.product_faqs.sort((a: ProductFaq, b: ProductFaq) => a.sort_order - b.sort_order);
      }
      return data as Product & { product_categories: ProductCategory; product_faqs: ProductFaq[] };
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Product, "id" | "created_at" | "updated_at" | "product_categories">) => {
      const { data, error } = await supabase.from("products").insert(input).select().single();
      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: ["product-brands"] });
      revalidateSiteProducts();
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      const { product_categories: _, ...cleanUpdates } = updates as Product;
      const { error } = await supabase.from("products").update(cleanUpdates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: ["product-brands"] });
      revalidateSiteProducts();
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: ["product-brands"] });
      revalidateSiteProducts();
    },
  });
}

export function useDuplicateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const { data: source, error: sourceErr } = await supabase
        .from("products")
        .select("*, product_faqs(*)")
        .eq("id", sourceId)
        .single();
      if (sourceErr) throw sourceErr;

      const {
        id: _id,
        created_at: _createdAt,
        updated_at: _updatedAt,
        product_categories: _category,
        product_faqs: sourceFaqs,
        ...rest
      } = source as Product & { product_faqs?: ProductFaq[]; product_categories?: ProductCategory };

      const insertData = {
        ...rest,
        name: `${rest.name} (kopio)`,
        sku: null,
        slug: null,
        show_on_website: false,
      };

      const { data: created, error: createErr } = await supabase
        .from("products")
        .insert(insertData)
        .select()
        .single();
      if (createErr) throw createErr;

      if (sourceFaqs && sourceFaqs.length > 0) {
        const newFaqs = sourceFaqs.map((f, i) => ({
          product_id: created.id,
          category_id: f.category_id,
          question: f.question,
          answer: f.answer,
          sort_order: i,
        }));
        const { error: faqErr } = await supabase.from("product_faqs").insert(newFaqs);
        if (faqErr) throw faqErr;
      }

      const { data: links } = await supabase
        .from("service_product_links")
        .select("service_id, role, sort_order")
        .eq("product_id", sourceId);
      if (links && links.length > 0) {
        const newLinks = links.map((l) => ({
          product_id: created.id,
          service_id: l.service_id,
          role: l.role,
          sort_order: l.sort_order,
        }));
        await supabase.from("service_product_links").insert(newLinks);
      }

      return created as Product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: ["product-brands"] });
    },
  });
}

// ─── Product FAQs ─────────────────────────────────────────────────────────────

export function useUpsertProductFaqs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, faqs }: { productId: string; faqs: Omit<ProductFaq, "id" | "created_at" | "updated_at">[] }) => {
      // Delete existing FAQs for this product, then insert new ones
      const { error: deleteError } = await supabase
        .from("product_faqs")
        .delete()
        .eq("product_id", productId);
      if (deleteError) throw deleteError;

      if (faqs.length > 0) {
        const { error: insertError } = await supabase
          .from("product_faqs")
          .insert(faqs.map((f, i) => ({ ...f, product_id: productId, sort_order: i })));
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

/** Get product category IDs linked to a service (for guided product filtering) */
export function useServiceProductCategories(serviceId: string | undefined) {
  return useQuery({
    queryKey: ["service-product-categories", serviceId],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_product_category_links")
        .select("product_category_id")
        .eq("service_id", serviceId!)
        .order("sort_order");
      if (error) {
        // Table may not exist yet
        if (error.code === "42P01" || error.message?.includes("does not exist")) return [];
        throw error;
      }
      return (data || []).map((r: { product_category_id: string }) => r.product_category_id);
    },
  });
}

/** Get products linked to a service with role (addon/upsell) */
export function useProductsByService(serviceId: string | undefined) {
  return useQuery({
    queryKey: ["service-product-links", serviceId],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_product_links")
        .select("*, products(*)")
        .eq("service_id", serviceId!)
        .order("sort_order");
      if (error) {
        if (error.code === "42P01" || error.message?.includes("does not exist")) return [];
        throw error;
      }
      return data as (ServiceProductLink & { products: Product })[];
    },
  });
}

/** Get service links for a product (which services this product is linked to) */
export function useProductServiceLinks(productId: string | undefined) {
  return useQuery({
    queryKey: ["product-service-links", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_product_links")
        .select("*, services(name)")
        .eq("product_id", productId!)
        .order("sort_order");
      if (error) {
        if (error.code === "42P01" || error.message?.includes("does not exist")) return [];
        throw error;
      }
      return data as (ServiceProductLink & { services: { name: string } })[];
    },
  });
}

export function useLinkProductToService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { product_id: string; service_id: string; role?: "addon" | "upsell" }) => {
      const { error } = await supabase.from("service_product_links").insert({
        product_id: input.product_id,
        service_id: input.service_id,
        role: input.role || "upsell",
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["product-service-links", v.product_id] });
      qc.invalidateQueries({ queryKey: ["service-product-links", v.service_id] });
    },
  });
}

export function useUnlinkProductFromService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ product_id, service_id }: { product_id: string; service_id: string }) => {
      const { error } = await supabase
        .from("service_product_links")
        .delete()
        .eq("product_id", product_id)
        .eq("service_id", service_id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["product-service-links", v.product_id] });
      qc.invalidateQueries({ queryKey: ["service-product-links", v.service_id] });
    },
  });
}

export function useUpdateProductServiceLinkRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ product_id, service_id, role }: { product_id: string; service_id: string; role: "addon" | "upsell" }) => {
      const { error } = await supabase
        .from("service_product_links")
        .update({ role })
        .eq("product_id", product_id)
        .eq("service_id", service_id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["product-service-links", v.product_id] });
      qc.invalidateQueries({ queryKey: ["service-product-links", v.service_id] });
    },
  });
}
