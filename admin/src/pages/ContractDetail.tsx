import { useParams, Link, useNavigate } from "react-router-dom";
import { useConfirm } from "@/context/ConfirmContext";
import { ArrowLeft, Download, Send, XCircle, RefreshCw, Trash2 } from "lucide-react";
import {
  useContractByNumber,
  useContractVisits,
  useContractStatusLog,
  useUpdateContract,
  useDeleteContract,
} from "@/hooks/useContracts";
import { Badge } from "@/components/ui/badge";
import { supabase, getFreshToken } from "@/lib/supabase";
import {
  formatCents,
  formatDate,
  formatDateTime,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  FREQUENCY_LABELS,
  VISIT_STATUS_LABELS,
  VISIT_STATUS_COLORS,
  MONTH_LABELS_FI,
  formatAddress,
} from "@/lib/utils";
import { useState } from "react";

export default function ContractDetail() {
  const confirm = useConfirm();
  const { contractNumber } = useParams<{ contractNumber: string }>();
  const parsed = contractNumber ? parseInt(contractNumber, 10) : undefined;
  const { data: contract, isLoading } = useContractByNumber(parsed);
  const { data: visits } = useContractVisits(contract?.id);
  const { data: statusLog } = useContractStatusLog(contract?.id);
  const navigate = useNavigate();
  const updateContract = useUpdateContract();
  const deleteContract = useDeleteContract();
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-border rounded w-32" />
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  if (!contract) {
    return <p className="text-text-muted">Sopimusta ei löytynyt</p>;
  }

  const customer = contract.customers;
  const customerName = customer ? `${customer.first_name} ${customer.last_name}` : "–";
  const service = contract.services;
  const savings = (contract.contract_templates?.regular_price_cents || 0) - contract.contract_price_cents;

  async function handleSendForSigning() {
    if (!contract) return;
    // Create signature token & send email
    const { data: token } = await supabase
      .from("contract_signature_tokens")
      .insert({
        contract_id: contract.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("token")
      .single();

    if (token) {
      await updateContract.mutateAsync({ id: contract.id, status: "pending_signature" });
      // Insert email into outbox
      await supabase.from("email_outbox").insert({
        type: "contract",
        sender_email: "info@lasikiilto.fi",
        payload: {
          contract_id: contract.id,
          email_type: "contract_proposal",
          signing_token: token.token,
        },
        status: "pending",
        scheduled_at: new Date().toISOString(),
        reference_type: "contract",
        reference_id: contract.id,
      });
    }
  }

  async function handleCancel() {
    if (!contract) return;
    await updateContract.mutateAsync({
      id: contract.id,
      status: "cancelled",
      cancellation_reason: cancelReason || undefined,
    });
    setCancelling(false);
  }

  async function handleActivate() {
    if (!contract) return;
    await updateContract.mutateAsync({
      id: contract.id,
      status: "active",
      signature_method: "admin",
      signed_by_name: "Admin",
    });
  }

  async function handleDownloadPdf() {
    if (!contract) return;

    // If stored PDF exists, download it
    if (contract.pdf_storage_path) {
      const { data } = await supabase.storage
        .from("contracts")
        .download(contract.pdf_storage_path);
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sopimus-${contract.contract_number}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    }

    // Otherwise generate via Chromium API
    const token = await getFreshToken();
    const resp = await fetch("https://loppusiivous-site-new.vercel.app/api/contract-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ contract_id: contract.id }),
    });
    if (!resp.ok) return;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sopimus-${contract.contract_number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Link
        to="/sopimukset"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Takaisin
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">
            Sopimus #{contract.contract_number}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {contract.contract_templates?.name || "–"} · {customerName}
          </p>
        </div>
        <Badge className={`${CONTRACT_STATUS_COLORS[contract.status]} text-sm px-4 py-1.5`}>
          {CONTRACT_STATUS_LABELS[contract.status]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Contract info */}
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-5">Sopimuksen tiedot</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Palvelu</p>
                <p className="font-medium text-text-primary">{service?.name || "–"}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Käyntiväli</p>
                <p className="font-medium text-text-primary">{contract.visit_interval_months ? `${contract.visit_interval_months} kk` : FREQUENCY_LABELS[contract.frequency]}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Sopimuskausi</p>
                <p className="font-medium text-text-primary">
                  {formatDate(contract.start_date)} — {formatDate(contract.end_date)}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Kohteen osoite</p>
                <p className="font-medium text-text-primary">
                  {formatAddress(contract.service_address, contract.service_postal_code)}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Automaattinen uusinta</p>
                <p className="font-medium text-text-primary">{contract.auto_renew ? "Kyllä" : "Ei"}</p>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4">Hinnoittelu</h2>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <p className="text-2xl sm:text-3xl font-bold text-accent-dark">{formatCents(contract.contract_price_cents)}</p>
                {savings > 0 && (
                  <p className="text-sm text-text-muted mt-1">
                    Normaalihinta{" "}
                    <span className="line-through">
                      {formatCents(contract.contract_templates?.regular_price_cents || 0)}
                    </span>
                    {" · "}
                    <span className="text-accent-dark font-semibold">Säästö {formatCents(savings)}</span>
                  </p>
                )}
              </div>
              {contract.renewal_year > 1 && (
                <p className="text-sm text-text-muted">
                  {contract.renewal_year}. sopimusvuosi
                  {contract.renewal_discount_percent > 0 && (
                    <span className="text-accent-dark font-semibold ml-1">
                      (-{contract.renewal_discount_percent}% uskollisuusalennus)
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Visits timeline */}
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-5">Käyntiaikataulu</h2>
            {!visits || visits.length === 0 ? (
              <p className="text-sm text-text-muted">Ei aikataulutettuja käyntejä</p>
            ) : (
              <div className="space-y-3">
                {visits.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-brand/5 flex items-center justify-center text-sm font-bold text-white">
                        {MONTH_LABELS_FI[v.scheduled_month - 1]?.slice(0, 3)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {MONTH_LABELS_FI[v.scheduled_month - 1]} {v.scheduled_year}
                        </p>
                        {v.booking_id && v.bookings && (
                          <Link
                            to={`/varaukset/${(v.bookings as any).booking_number}`}
                            className="text-xs text-accent-dark hover:underline"
                          >
                            Varaus #{(v.bookings as any).booking_number}
                          </Link>
                        )}
                      </div>
                    </div>
                    <Badge className={VISIT_STATUS_COLORS[v.visit_status]}>
                      {VISIT_STATUS_LABELS[v.visit_status]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Signature */}
          {contract.signature_data && (
            <div className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="font-semibold text-text-primary mb-4">Allekirjoitus</h2>
              <div className="bg-white border border-border rounded-xl p-4 mb-3 inline-block">
                <img
                  src={contract.signature_data}
                  alt="Allekirjoitus"
                  className="max-h-24"
                />
              </div>
              <div className="text-sm text-text-muted space-y-1">
                <p>{contract.signed_by_name}</p>
                {contract.signed_at && <p>{formatDateTime(contract.signed_at)}</p>}
                <p className="text-xs">
                  {contract.signature_method === "on_site"
                    ? "Allekirjoitettu paikan päällä"
                    : contract.signature_method === "remote_link"
                    ? "Allekirjoitettu etänä"
                    : "Merkitty adminin toimesta"}
                </p>
              </div>
            </div>
          )}

          {/* Status log */}
          {statusLog && statusLog.length > 0 && (
            <div className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="font-semibold text-text-primary mb-4">Tapahtumaloki</h2>
              <div className="space-y-2">
                {statusLog.map((log) => (
                  <div key={log.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm">
                    <span className="text-text-muted text-xs whitespace-nowrap">{formatDateTime(log.created_at)}</span>
                    <span className="text-text-secondary">
                      {log.old_status ? `${CONTRACT_STATUS_LABELS[log.old_status]} → ` : ""}
                      {CONTRACT_STATUS_LABELS[log.new_status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column — actions & customer */}
        <div className="space-y-5">
          {/* Actions */}
          <div className="bg-surface rounded-2xl border border-border p-6 space-y-3">
            <h2 className="font-semibold text-text-primary mb-2">Toiminnot</h2>

            {contract.status === "draft" && (
              <>
                <button
                  onClick={handleSendForSigning}
                  disabled={updateContract.isPending}
                  className="w-full flex items-center gap-2 justify-center px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  Lähetä allekirjoitettavaksi
                </button>
                <button
                  onClick={handleActivate}
                  disabled={updateContract.isPending}
                  className="w-full flex items-center gap-2 justify-center px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-colors disabled:opacity-50"
                >
                  Merkitse aktiiviseksi
                </button>
              </>
            )}

            {contract.status === "pending_signature" && (
              <button
                onClick={handleActivate}
                disabled={updateContract.isPending}
                className="w-full flex items-center gap-2 justify-center px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-colors disabled:opacity-50"
              >
                Merkitse aktiiviseksi
              </button>
            )}

            <button
              onClick={handleDownloadPdf}
              className="w-full flex items-center gap-2 justify-center px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-secondary hover:bg-surface-hover transition-colors"
            >
              <Download className="w-4 h-4" />
              Lataa PDF
            </button>

            {(contract.status === "active" || contract.status === "expiring") && (
              <>
                {!cancelling ? (
                  <button
                    onClick={() => setCancelling(true)}
                    className="w-full flex items-center gap-2 justify-center px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Peruuta sopimus
                  </button>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Peruutuksen syy (valinnainen)"
                      className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCancelling(false)}
                        className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold border border-border text-text-secondary hover:bg-surface-hover transition-colors"
                      >
                        Peruuta
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={updateContract.isPending}
                        className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        Vahvista
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {(contract.status === "expiring" || contract.status === "expired") && (
              <Link
                to={`/sopimukset/uusi?renew=${contract.id}`}
                className="w-full flex items-center gap-2 justify-center px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Uusi sopimus
              </Link>
            )}

            <hr className="border-border" />

            <button
              onClick={async () => {
                if (!await confirm({ message: "Poistetaanko sopimus pysyvästi? Tätä ei voi perua.", confirmLabel: "Poista", variant: "danger" })) return;
                await deleteContract.mutateAsync(contract.id);
                navigate("/sopimukset");
              }}
              disabled={deleteContract.isPending}
              className="w-full flex items-center gap-2 justify-center px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleteContract.isPending ? "Poistetaan..." : "Poista pysyvästi"}
            </button>
          </div>

          {/* Customer */}
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4">Asiakas</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-text-primary">{customerName}</p>
                {customer?.email && <p className="text-text-muted">{customer.email}</p>}
                {customer?.phone && <p className="text-text-muted">{customer.phone}</p>}
              </div>
              <Link
                to={`/asiakkaat/${contract.customer_id}`}
                className="inline-block text-sm text-accent-dark hover:underline"
              >
                Näytä asiakasprofiili
              </Link>
            </div>
          </div>

          {/* Notes */}
          {contract.notes && (
            <div className="bg-surface rounded-2xl border border-border p-6">
              <h2 className="font-semibold text-text-primary mb-2">Muistiinpanot</h2>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{contract.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
