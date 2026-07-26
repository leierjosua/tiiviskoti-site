import { CheckCircle, Image } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { formatCents } from "@/lib/utils";
import OpportunityPhotoUpload from "@/components/sales/OpportunityPhotoUpload";
import type { DeliveryMode, CustomerData } from "./types";

interface Props {
  deliveryMode: DeliveryMode | null;
  offerNumber: string;
  customer: CustomerData;
  totalCents: number;
  bookingDate?: string | null;
  bookingTime?: string | null;
}

export function ConfirmationStep({ deliveryMode, offerNumber, customer, totalCents, bookingDate, bookingTime }: Props) {
  const navigate = useNavigate();
  const { opportunityId } = useParams<{ opportunityId: string }>();

  const isSend = deliveryMode === "send";

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center text-center py-12 space-y-6">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-text-primary">
            {isSend ? "Tarjous lähetetty!" : "Tarjous allekirjoitettu ja asennus varattu!"}
          </h2>
          <p className="text-sm text-text-muted mt-2">
            {isSend
              ? "Asiakas saa tarjouksen sähköpostiinsa."
              : "Asiakkaan allekirjoitus tallennettu ja asennus varattu kalenteriin."}
          </p>
        </div>

        <div className="bg-bg-secondary rounded-xl p-4 text-sm space-y-2 w-full max-w-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Tarjousnumero</span>
            <span className="font-semibold text-text-primary">{offerNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Asiakas</span>
            <span className="font-medium text-text-primary">{customer.firstName} {customer.lastName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Summa</span>
            <span className="font-semibold text-text-primary">{formatCents(totalCents)}</span>
          </div>
          {bookingDate && bookingTime && (
            <div className="flex justify-between">
              <span className="text-text-muted">Asennusaika</span>
              <span className="font-medium text-text-primary">{bookingDate} klo {bookingTime}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate(`/myynti/inbound/${opportunityId}`)}
          className="px-5 py-3 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90"
        >
          Takaisin diiliin
        </button>
      </div>

      {/* Photo upload section */}
      {opportunityId && (
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Image className="w-5 h-5 text-accent" />
            <h3 className="text-base font-semibold text-text-primary">Lisää kohteen kuvat</h3>
          </div>
          <p className="text-sm text-text-muted">
            Lisää kuvat asennuskohteesta. Kuvat näkyvät asentajalle varauksen tiedoissa.
          </p>
          <OpportunityPhotoUpload opportunityId={opportunityId} />
        </div>
      )}
    </div>
  );
}
