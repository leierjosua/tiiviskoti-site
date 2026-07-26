import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { OfferOrderEmail } from "@/lib/sales-types";

export function useOfferOrderEmails(offerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales.offerOrderEmails.byOffer(offerId),
    enabled: !!offerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offer_order_emails")
        .select("*")
        .eq("offer_id", offerId!)
        .order("created_at");
      if (error) throw error;
      return data as OfferOrderEmail[];
    },
  });
}
