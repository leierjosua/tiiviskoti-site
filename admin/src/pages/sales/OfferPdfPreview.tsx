import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Printer, ArrowLeft, Loader2 } from "lucide-react";
import { formatAddress } from "@/lib/utils";
import { useSalesOffer } from "@/hooks/sales/useSalesOffers";
import { useSalesOpportunity } from "@/hooks/sales/useSalesOpportunities";
import { OfferPdfContent } from "@/components/sales/OfferPdfContent";
import { useUserRole } from "@/context/UserRoleContext";
import { downloadOfferPdfById } from "@/lib/chromiumPdf";

export default function OfferPdfPreview() {
  const { offerId } = useParams<{ offerId: string }>();
  const { data: offer, isLoading } = useSalesOffer(offerId);
  const { data: opp } = useSalesOpportunity(offer?.opportunity_id);
  const { employee } = useUserRole();
  const items = offer?.sales_offer_line_items || [];
  const contentRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  if (isLoading || !offer) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const customerName = offer.customer_name || opp?.name || "";
  const customerAddress = formatAddress(offer.customer_address, offer.customer_postcode, offer.customer_city);
  const customerContact = [offer.customer_email, offer.customer_phone].filter(Boolean).join(" \u00B7 ");
  const filename = `Tarjous${offer.offer_number ? ` #${offer.offer_number}` : ""} - ${customerName || "asiakas"}.pdf`;

  async function handleDownload() {
    if (!offerId) return;
    setDownloading(true);
    try {
      await downloadOfferPdfById(offerId, filename);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="bg-gray-100 min-h-screen pb-16">
      {/* Controls */}
      <div className="print:hidden fixed top-4 left-4 right-4 sm:left-auto z-50 flex flex-wrap gap-2 justify-end">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2.5 sm:px-5 bg-[#1e3a8a] text-white rounded-xl text-sm font-semibold hover:bg-[#1e3a8a]/90 shadow-lg transition-colors disabled:opacity-60"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? "Ladataan..." : "Lataa PDF"}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2.5 sm:px-5 bg-white text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 shadow-lg border border-gray-200 transition-colors"
        >
          <Printer className="w-4 h-4" />
          <span className="hidden sm:inline">Tulosta</span>
        </button>
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 px-4 py-2.5 sm:px-5 bg-white text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 shadow-lg border border-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Takaisin</span>
        </button>
      </div>

      <div className="pt-16 sm:pt-0" />
      <div ref={contentRef} className="max-w-[210mm] mx-auto bg-white overflow-x-auto">
        <OfferPdfContent data={{
          offerNumber: offer.offer_number || "–",
          title: offer.title || "Tarjous",
          createdAt: offer.created_at,
          customerName,
          customerAddress,
          customerContact,
          customerEmail: offer.customer_email || undefined,
          customerPhone: offer.customer_phone || undefined,
          lineItems: [...items].sort((a, b) => a.sort_order - b.sort_order).map((li) => ({
            name: li.name,
            description: li.description,
            quantity: li.quantity,
            unitPrice: Number(li.unit_price),
            totalPrice: Number(li.total_price || li.unit_price * li.quantity),
            lineType: li.line_type,
            laborPortion: Number(li.labor_portion || 0),
          })),
          subtotal: Number(offer.subtotal),
          discount: Number(offer.discount),
          total: Number(offer.total),
          sellerName: employee ? `${employee.first_name} ${employee.last_name}`.trim() : undefined,
        }} />
      </div>

      <style>{`
        @media print {
          body { margin: 0; padding: 0; background: white; }
          .print\\:hidden { display: none !important; }
        }
        @page { margin: 0; size: A4; }
      `}</style>
    </div>
  );
}
