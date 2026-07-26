import { useParams } from "react-router-dom";
import { DealDetailView } from "@/components/sales/DealDetailView";

export default function InboundDealDetail() {
  const { id } = useParams<{ id: string }>();

  if (!id) return null;

  return (
    <div>
      <DealDetailView
        id={id}
        backPath="/myynti/inbound"
        quotePath={(oppId) => `/myynti/tarjoukset/${oppId}`}
        offerWizardPath={(oppId) => `/myynti/tarjous/${oppId}`}
        bookTimePath={(oppId) => `/myynti/varaus/${oppId}`}
        offerPdfPath={(offerId) => `/myynti/tarjous-pdf/${offerId}`}
        isAdmin
      />
    </div>
  );
}
