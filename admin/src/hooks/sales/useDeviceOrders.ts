import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeviceOrderRow {
  orderId: string;
  brand: string;
  productNames: string[];
  orderStatus: "pending" | "sent" | "failed";
  gmailThreadId: string | null;
  // Booking info
  bookingId: string | null;
  bookingNumber: number | null;
  bookingDate: string | null;
  bookingAddress: string | null;
  bookingEmployeeId: string | null;
  // Customer info
  customerName: string | null;
  // Offer info
  offerId: string;
  offerNumber: string | null;
  opportunityId: string | null;
}

// ─── Admin: all device orders ────────────────────────────────────────────────

export function useDeviceOrders() {
  return useQuery({
    queryKey: queryKeys.sales.deviceOrders.all,
    queryFn: async () => {
      // 1. Get all offer_order_emails with offer + outbox info
      const { data: orderEmails, error: oeErr } = await supabase
        .from("offer_order_emails")
        .select("id, brand, status, offer_id, outbox_id")
        .order("created_at", { ascending: false });

      if (oeErr) throw oeErr;
      if (!orderEmails?.length) return [] as DeviceOrderRow[];

      // 2. Get outbox rows for gmail_thread_id
      const outboxIds = orderEmails.map((oe) => oe.outbox_id).filter(Boolean) as string[];
      const outboxMap = new Map<string, string | null>();
      if (outboxIds.length > 0) {
        const { data: outboxRows } = await supabase
          .from("email_outbox")
          .select("id, gmail_thread_id")
          .in("id", outboxIds);
        for (const row of outboxRows || []) {
          outboxMap.set(row.id, row.gmail_thread_id);
        }
      }

      // 3. Get offers for customer name + opportunity_id + offer_number
      const offerIds = [...new Set(orderEmails.map((oe) => oe.offer_id))];
      const { data: offers } = await supabase
        .from("sales_offers")
        .select("id, opportunity_id, customer_name, offer_number")
        .in("id", offerIds);

      const offerMap = new Map<string, { opportunity_id: string | null; customer_name: string | null; offer_number: string | null }>();
      for (const o of offers || []) {
        offerMap.set(o.id, { opportunity_id: o.opportunity_id, customer_name: o.customer_name, offer_number: o.offer_number });
      }

      // 4. Get bookings by opportunity_id
      const opportunityIds = [...new Set((offers || []).map((o) => o.opportunity_id).filter(Boolean))] as string[];
      const bookingMap = new Map<string, { id: string; booking_number: number; booking_date: string; address: string | null; employee_id: string | null }>();
      if (opportunityIds.length > 0) {
        const { data: bookings } = await supabase
          .from("bookings")
          .select("id, booking_number, booking_date, address, employee_id, opportunity_id")
          .in("opportunity_id", opportunityIds)
          .neq("status", "cancelled");
        for (const b of bookings || []) {
          if (b.opportunity_id) bookingMap.set(b.opportunity_id, b);
        }
      }

      // 5. Get product line items per offer to resolve product names by brand
      // offer_id → brand → product names
      const productNamesByOfferBrand = new Map<string, Map<string, string[]>>();
      if (offerIds.length > 0) {
        const { data: lineItems } = await supabase
          .from("sales_offer_line_items")
          .select("offer_id, name, item_id, line_type")
          .in("offer_id", offerIds)
          .eq("line_type", "product");

        if (lineItems?.length) {
          // Get brands for product item_ids
          const itemIds = lineItems.map((li) => li.item_id).filter(Boolean) as string[];
          const brandByItemId = new Map<string, string>();
          if (itemIds.length > 0) {
            const { data: products } = await supabase
              .from("products")
              .select("id, brand")
              .in("id", itemIds);
            for (const p of products || []) {
              if (p.brand) brandByItemId.set(p.id, p.brand);
            }
          }

          for (const li of lineItems) {
            const brand = li.item_id ? brandByItemId.get(li.item_id) : undefined;
            if (!brand) continue;
            let offerMap2 = productNamesByOfferBrand.get(li.offer_id);
            if (!offerMap2) { offerMap2 = new Map(); productNamesByOfferBrand.set(li.offer_id, offerMap2); }
            const names = offerMap2.get(brand) || [];
            names.push(li.name);
            offerMap2.set(brand, names);
          }
        }
      }

      // 6. Assemble rows
      return orderEmails.map((oe): DeviceOrderRow => {
        const offer = offerMap.get(oe.offer_id);
        const booking = offer?.opportunity_id ? bookingMap.get(offer.opportunity_id) : undefined;
        const brandNames = productNamesByOfferBrand.get(oe.offer_id)?.get(oe.brand) ?? [];
        return {
          orderId: oe.id,
          brand: oe.brand,
          productNames: brandNames,
          orderStatus: oe.status as DeviceOrderRow["orderStatus"],
          gmailThreadId: oe.outbox_id ? (outboxMap.get(oe.outbox_id) ?? null) : null,
          bookingId: booking?.id ?? null,
          bookingNumber: booking?.booking_number ?? null,
          bookingDate: booking?.booking_date ?? null,
          bookingAddress: booking?.address ?? null,
          bookingEmployeeId: booking?.employee_id ?? null,
          customerName: offer?.customer_name ?? null,
          offerId: oe.offer_id,
          offerNumber: offer?.offer_number ?? null,
          opportunityId: offer?.opportunity_id ?? null,
        };
      });
    },
  });
}

// ─── Installer/detail: device orders for a specific opportunity ──────────────

export function useBookingDeviceOrders(opportunityId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.deviceOrders.byOpportunity(opportunityId),
    enabled: !!opportunityId,
    queryFn: async () => {
      // 1. Get offers for this opportunity
      const { data: offers } = await supabase
        .from("sales_offers")
        .select("id")
        .eq("opportunity_id", opportunityId!);
      if (!offers?.length) return [];

      // 2. Get order emails with outbox join
      const offerIds = offers.map((o) => o.id);
      const { data: orderEmails, error } = await supabase
        .from("offer_order_emails")
        .select("id, brand, status, outbox_id, offer_id")
        .in("offer_id", offerIds);
      if (error) throw error;
      if (!orderEmails?.length) return [];

      // 3. Get outbox gmail_thread_id
      const outboxIds = orderEmails.map((oe) => oe.outbox_id).filter(Boolean) as string[];
      const outboxMap = new Map<string, string | null>();
      if (outboxIds.length > 0) {
        const { data: outboxRows } = await supabase
          .from("email_outbox")
          .select("id, gmail_thread_id")
          .in("id", outboxIds);
        for (const row of outboxRows || []) {
          outboxMap.set(row.id, row.gmail_thread_id);
        }
      }

      return orderEmails.map((oe) => ({
        id: oe.id,
        brand: oe.brand,
        status: oe.status as "pending" | "sent" | "failed",
        gmailThreadId: oe.outbox_id ? (outboxMap.get(oe.outbox_id) ?? null) : null,
      }));
    },
  });
}
