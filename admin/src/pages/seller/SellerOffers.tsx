import { FileText, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/context/UserRoleContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { OfferStatusBadge } from "@/components/sales/SalesStatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { SalesOffer } from "@/lib/sales-types";

export default function SellerOffers() {
  const { employee } = useUserRole();
  const navigate = useNavigate();

  // Fetch all offers created by this salesperson
  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["seller-offers", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_offers")
        .select("*, sales_opportunities(id, name, phone)")
        .eq("created_by_salesperson_id", employee!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (SalesOffer & { sales_opportunities: { id: string; name: string | null; phone: string | null } })[];
    },
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <FileText className="w-5 h-5 text-accent" />
        <h1 className="text-lg font-bold">Tarjoukset</h1>
        <span className="text-xs text-text-muted">({offers.length})</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-muted">Ei tarjouksia</p>
          <p className="text-xs text-text-muted mt-1">Luo tarjous inbound-diilin kautta</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Tarjous</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Asiakas</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Summa</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap">Luotu</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => (
                  <tr key={offer.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                      {offer.title || `#${offer.offer_number || "–"}`}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {offer.customer_name || offer.sales_opportunities?.name || "–"}
                    </td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                      {Number(offer.total).toFixed(0)} €
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <OfferStatusBadge status={offer.status} />
                    </td>
                    <td className="px-4 py-2.5 text-text-muted whitespace-nowrap">
                      {formatDateTime(offer.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => navigate(`/myyja/tarjoukset/${offer.opportunity_id}`)}
                        className="text-accent hover:text-accent/80 p-1"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
