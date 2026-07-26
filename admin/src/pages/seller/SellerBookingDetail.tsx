import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUpdateCustomer } from "@/hooks/useCustomers";
import { useBookingByNumber } from "@/hooks/useBookings";
import { useBookingLineItems } from "@/hooks/useBookingLineItems";
import { useBookingProductOrdersByBooking } from "@/hooks/useLogistics";
import { useUserRole } from "@/context/UserRoleContext";
import { ProductOrderStatusBadge } from "@/components/logistics/LogisticsStatusBadge";
import BookingFileUpload from "@/components/BookingFileUpload";
import { supabase } from "@/lib/supabase";
import { useStorageUrls } from "@/lib/storage";
import { queryKeys } from "@/lib/queryKeys";
import {
  formatDate,
  formatCents,
  STATUS_LABELS,
  STATUS_COLORS,
  formatAddress,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, MapPin, Phone, Mail, Clock, Package, FileText, Image, Download, Pencil,
} from "lucide-react";
import type { SalesOpportunityFile } from "@/lib/sales-types";

export default function SellerBookingDetail() {
  const { bookingNumber } = useParams();
  const { employee } = useUserRole();
  const queryClient = useQueryClient();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone: "", address: "", postal_code: "" });
  const updateCustomer = useUpdateCustomer();
  const num = bookingNumber ? parseInt(bookingNumber, 10) : undefined;
  const { data: booking, isLoading } = useBookingByNumber(num);
  const { data: lineItems = [] } = useBookingLineItems(booking?.id);
  const showPrices = employee?.can_see_prices ?? true;
  const { data: productOrders = [] } = useBookingProductOrdersByBooking(booking?.id);

  // Fetch opportunity files (photos, install plan, etc.)
  const { data: oppFiles = [] } = useQuery({
    queryKey: ["seller-opp-files", booking?.opportunity_id],
    enabled: !!booking?.opportunity_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunity_files")
        .select("*")
        .eq("opportunity_id", booking!.opportunity_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesOpportunityFile[];
    },
  });

  const oppFileUrls = useStorageUrls(oppFiles);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-border rounded w-48" />
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  if (!booking) {
    return <p className="text-text-muted">Varausta ei löytynyt.</p>;
  }

  const customer = booking.customers;
  const service = booking.services;

  // Split opportunity files
  const images = oppFiles.filter((f) => /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));
  const docs = oppFiles.filter((f) => !/\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));

  function getFileUrl(file: SalesOpportunityFile) {
    return oppFileUrls[file.id];
  }

  // Compute end time
  const endTime = (() => {
    const [h, m] = (booking.time_slot || "08:00").split(":").map(Number);
    const dur = booking.duration_minutes || service?.duration_minutes || 60;
    const endTotal = h * 60 + m + dur;
    return `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;
  })();

  return (
    <div>
      <Link
        to="/myyja/kalenteri"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Takaisin
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">
          Varaus #{booking.booking_number}
        </h1>
        <Badge className={STATUS_COLORS[booking.status]}>
          {STATUS_LABELS[booking.status]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Booking info */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
          <h2 className="font-semibold text-text-primary">Työn tiedot</h2>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {formatDate(booking.booking_date)} klo {booking.time_slot?.slice(0, 5)} – {endTime}
                </p>
                {service && (
                  <p className="text-xs text-text-muted">
                    Kesto: {booking.duration_minutes || service.duration_minutes} min
                  </p>
                )}
              </div>
            </div>

            {service && (
              <div className="flex items-start gap-3">
                <Package className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {service.name}
                    {booking.service_variants && (
                      <span className="text-text-muted font-normal ml-1">— {booking.service_variants.label}</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {booking.address && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                <p className="text-sm text-text-primary">
                  {formatAddress(booking.address, booking.postal_code)}
                </p>
              </div>
            )}

            <div className="pt-2">
              {showPrices && (
                <>
                  <p className="text-sm font-medium text-text-primary">
                    Hinta: {formatCents(booking.price_cents)}
                  </p>
                  {booking.discount_amount_cents > 0 && (
                    <p className="text-xs text-accent-dark mt-0.5">Alennus: -{formatCents(booking.discount_amount_cents)}{booking.discount_codes?.code && ` (${booking.discount_codes.code})`}</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Line items */}
          {lineItems.length > 0 && (
            <div className="pt-3 border-t border-border space-y-1.5">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Tuotteet ja palvelut</p>
              {lineItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary">{item.name}</span>
                    {item.quantity > 1 && <span className="text-text-muted">× {item.quantity}</span>}
                    {item.line_type === "addon_service" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">lisäpalvelu</span>}
                    {item.line_type === "product" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">tuote</span>}
                  </div>
                  {showPrices && (
                    <span className="text-text-muted shrink-0">{formatCents(item.price_cents * item.quantity)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {booking.notes && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                Lisätiedot
              </p>
              <p className="text-sm text-text-primary whitespace-pre-wrap">
                {booking.notes}
              </p>
            </div>
          )}
        </div>

        {/* Customer info */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary">Asiakas</h2>
            {customer && !editingCustomer && (
              <button
                onClick={() => {
                  setEditForm({
                    first_name: customer.first_name || "",
                    last_name: customer.last_name || "",
                    email: customer.email || "",
                    phone: customer.phone || "",
                    address: customer.address || "",
                    postal_code: customer.postal_code || "",
                  });
                  setEditingCustomer(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Muokkaa
              </button>
            )}
          </div>

          {customer && !editingCustomer && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-text-primary">
                {customer.first_name} {customer.last_name}
              </p>

              {customer.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-text-muted shrink-0" />
                  <a href={`tel:${customer.phone}`} className="text-sm text-accent-dark hover:underline">
                    {customer.phone}
                  </a>
                </div>
              )}

              {customer.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-text-muted shrink-0" />
                  <a href={`mailto:${customer.email}`} className="text-sm text-accent-dark hover:underline">
                    {customer.email}
                  </a>
                </div>
              )}

              {(customer.address || customer.postal_code) && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-text-muted shrink-0" />
                  <p className="text-sm text-text-primary">
                    {formatAddress(customer.address, customer.postal_code)}
                  </p>
                </div>
              )}
            </div>
          )}

          {customer && editingCustomer && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await updateCustomer.mutateAsync({
                    id: customer.id,
                    first_name: editForm.first_name.trim(),
                    last_name: editForm.last_name.trim(),
                    email: editForm.email.trim(),
                    phone: editForm.phone.trim() || null,
                    address: editForm.address.trim() || null,
                    postal_code: editForm.postal_code.trim() || null,
                  });
                  queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
                  queryClient.invalidateQueries({ queryKey: queryKeys.bookings.byNumber(booking.booking_number) });
                  setEditingCustomer(false);
                } catch (err: any) {
                  alert(`Tallennus epäonnistui: ${err?.message || "Tuntematon virhe"}`);
                }
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Etunimi</label>
                  <input
                    type="text"
                    required
                    value={editForm.first_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Sukunimi</label>
                  <input
                    type="text"
                    required
                    value={editForm.last_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Sähköposti</label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Puhelin</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Osoite</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="w-32">
                <label className="block text-xs text-text-muted mb-1">Postinumero</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={editForm.postal_code}
                  onChange={(e) => setEditForm((f) => ({ ...f, postal_code: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={updateCustomer.isPending}
                  className="px-4 py-2 text-sm font-semibold bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
                >
                  {updateCustomer.isPending ? "Tallennetaan..." : "Tallenna"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCustomer(false)}
                  className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary border border-border rounded-lg hover:bg-surface-hover transition-colors"
                >
                  Peruuta
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Product logistics */}
      {productOrders.length > 0 && (
        <div className="mt-6 bg-surface rounded-2xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <Package className="w-4 h-4 text-accent" />
            Tuotetilaukset
          </h2>
          {productOrders.map((po) => (
            <div key={po.id} className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-text-primary">{po.products?.name ?? "Tuote"}</span>
                <span className="block text-xs text-text-tertiary">{po.products?.brand} — {po.quantity} kpl</span>
              </div>
              <ProductOrderStatusBadge status={po.status} />
            </div>
          ))}
        </div>
      )}

      {/* Documents */}
      {docs.length > 0 && (
        <div className="mt-6 bg-surface rounded-2xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            Tiedostot
          </h2>
          <div className="space-y-2">
            {docs.map((file) => {
              const url = getFileUrl(file);
              return (
                <div key={file.id} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-text-muted shrink-0" />
                    <span className="text-sm text-text-primary truncate">{file.filename}</span>
                    {file.file_type === "offer_pdf" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 shrink-0">tarjous</span>}
                    {file.file_type === "installation_plan_pdf" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 shrink-0">asennussuunnitelma</span>}
                  </div>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Avaa
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Photos */}
      {images.length > 0 && (
        <div className="mt-6 bg-surface rounded-2xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <Image className="w-4 h-4 text-accent" />
            Kuvat
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map((file) => {
              const url = getFileUrl(file);
              return (
                <button
                  key={file.id}
                  onClick={() => url && setLightboxUrl(url)}
                  className="relative aspect-square rounded-xl overflow-hidden border border-border hover:ring-2 hover:ring-accent/30 transition-all"
                >
                  <img src={url || ""} alt={file.filename} className="w-full h-full object-cover" />
                  {file.photo_category && (
                    <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">
                      {file.photo_category}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Booking files upload */}
      <div className="mt-6 bg-surface rounded-2xl border border-border p-6 space-y-3">
        <h2 className="font-semibold text-text-primary flex items-center gap-2">
          <Image className="w-4 h-4 text-accent" />
          Varauksen kuvat ja tiedostot
        </h2>
        <BookingFileUpload siteId={booking.site_id} bookingId={booking.id} />
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] rounded-lg" />
        </div>
      )}
    </div>
  );
}
