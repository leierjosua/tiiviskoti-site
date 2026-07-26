import { useParams } from "react-router-dom";
import { DealDetailView } from "@/components/sales/DealDetailView";

export default function SellerDealDetail() {
  const { id } = useParams<{ id: string }>();

  if (!id) return null;

  return (
    <DealDetailView
      id={id}
      backPath="/myyja/inbound"
      quotePath={(oppId) => `/myyja/tarjoukset/${oppId}`}
      offerWizardPath={(oppId) => `/myyja/tarjous/${oppId}`}
      bookTimePath={(oppId) => `/myyja/varaus/${oppId}`}
      offerPdfPath={(offerId) => `/myyja/tarjous-pdf/${offerId}`}
    />
  );
}
