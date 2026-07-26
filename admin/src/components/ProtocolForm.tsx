import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Download,
  Camera,
  Trash2,
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  ClipboardCheck,
} from "lucide-react";
import SignaturePad from "signature_pad";
import { supabase, getFreshToken } from "@/lib/supabase";
import { useConfirm } from "@/context/ConfirmContext";
import { inputCls, selectCls } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import {
  useProtocolTemplates,
  useProtocolsByBooking,
  useCreateProtocol,
  useUpdateProtocol,
  useUploadProtocolPhoto,
  useDeleteProtocolPhoto,
} from "@/hooks/useProtocols";
import { useEmployees } from "@/hooks/useEmployees";
import { useBookingLineItems } from "@/hooks/useBookingLineItems";
import type {
  Booking,
  ProtocolFieldDef,
  ProtocolSectionDef,
} from "@/lib/types";

interface ProtocolFormProps {
  booking: Booking;
  backUrl: string;
  /** When provided, load this specific protocol instead of auto-detecting */
  protocolId?: string;
  /** Called after a new protocol is auto-created (for wrapper components) */
  onProtocolCreated?: (id: string) => void;
}

const labelCls =
  "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5";

export default function ProtocolForm({ booking, backUrl, protocolId: protocolIdProp, onProtocolCreated }: ProtocolFormProps) {
  const { data: templates, isLoading: templatesLoading } = useProtocolTemplates();
  const { data: allProtocols = [], isLoading: protocolLoading } = useProtocolsByBooking(booking.id);
  const existingProtocol = protocolIdProp
    ? allProtocols.find((p) => p.id === protocolIdProp) ?? null
    : allProtocols[0] ?? null;

  const confirm = useConfirm();
  const { data: allEmployees } = useEmployees("installer");
  const { data: lineItems } = useBookingLineItems(booking.id);
  const createProtocol = useCreateProtocol();
  const updateProtocol = useUpdateProtocol();
  const uploadPhoto = useUploadProtocolPhoto();
  const deletePhoto = useDeleteProtocolPhoto();

  // Form state
  const [fieldData, setFieldData] = useState<Record<string, string | number | boolean>>({});
  const [notes, setNotes] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [userTraining, setUserTraining] = useState(true);
  const [showTechnician, setShowTechnician] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [expandedOptional, setExpandedOptional] = useState<Record<string, boolean>>({});
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [createdProtocolId, setCreatedProtocolId] = useState<string | null>(null);
  const [pdfCacheStale, setPdfCacheStale] = useState(false);

  // Signature (installer)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  // Signature (customer) — only used on installation protocols
  const customerCanvasRef = useRef<HTMLCanvasElement>(null);
  const customerSigPadRef = useRef<SignaturePad | null>(null);
  const [customerSignatureData, setCustomerSignatureData] = useState<string | null>(null);
  const [customerSignedBy, setCustomerSignedBy] = useState("");

  // File inputs
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const extraFileRef = useRef<HTMLInputElement>(null);

  // Auto-save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  // Track manually selected template (for bookings whose service has no template)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Reset initialized when user manually picks a template so auto-create can run
  useEffect(() => {
    if (selectedTemplateId) {
      setInitialized(false);
      creatingRef.current = false;
    }
  }, [selectedTemplateId]);

  // Find matching template: existing protocol's template > service match > manual selection
  const template = useMemo(() => {
    if (!templates) return null;
    // If existing protocol has a template, use that
    if (existingProtocol?.protocol_templates) {
      return existingProtocol.protocol_templates as typeof templates[0];
    }
    // Match by service_id
    if (booking.service_id) {
      const match = templates.find((t) => t.service_id === booking.service_id);
      if (match) return match;
    }
    // Fallback: match huoltopesu variants (e.g. "Huoltopesu, 1 yksikkö") by slug
    const serviceName = booking.services?.name;
    if (serviceName && /^Huoltopesu/i.test(serviceName)) {
      const match = templates.find((t) => t.slug === "huoltopesu");
      if (match) return match;
    }
    // Manual selection
    if (selectedTemplateId) {
      return templates.find((t) => t.id === selectedTemplateId) || null;
    }
    return null;
  }, [templates, booking.service_id, booking.services?.name, existingProtocol, selectedTemplateId]);

  // Protocol ID (either existing or newly created)
  const protocolId = protocolIdProp || existingProtocol?.id || createdProtocolId;
  const photos = existingProtocol?.protocol_photos || [];
  const isCompleted = existingProtocol?.status === "completed";

  // Track whether we're currently creating to avoid duplicates
  const creatingRef = useRef(false);

  // Initialize form from existing protocol or defaults
  useEffect(() => {
    if (initialized || protocolLoading || templatesLoading) return;

    if (existingProtocol) {
      setFieldData(existingProtocol.field_data || {});
      setNotes(existingProtocol.notes || "");
      // Auto-fill technician name if not yet set
      if (existingProtocol.signed_by) {
        setSignedBy(existingProtocol.signed_by);
      } else if (booking.employees) {
        setSignedBy(`${booking.employees.first_name} ${booking.employees.last_name}`);
      }
      setSignatureData(existingProtocol.signature_data || null);
      setCustomerSignatureData(existingProtocol.customer_signature_data || null);
      if (existingProtocol.customer_signed_by) {
        setCustomerSignedBy(existingProtocol.customer_signed_by);
      } else if (booking.customers) {
        setCustomerSignedBy(`${booking.customers.first_name} ${booking.customers.last_name}`);
      }
      setUserTraining((existingProtocol.field_data?.user_training as boolean) ?? true);
      setShowTechnician(existingProtocol.show_technician ?? true);
      setInitialized(true);
    } else if (template && !creatingRef.current && !protocolIdProp) {
      // Set defaults from template
      const defaults: Record<string, string | number | boolean> = {};
      for (const section of template.sections) {
        for (const field of section.fields) {
          if (field.default_value !== undefined) {
            defaults[field.key] = field.default_value;
          }
        }
      }

      // Pre-fill manufacturer and model from booking line items (product)
      const productItem = (lineItems || []).find((li) => li.products?.brand || li.products?.model);
      if (productItem?.products) {
        if (productItem.products.brand) defaults.manufacturer = productItem.products.brand;
        if (productItem.products.model) defaults.model = productItem.products.model;
      }

      setFieldData(defaults);

      // Pre-fill technician name
      if (booking.employees) {
        setSignedBy(`${booking.employees.first_name} ${booking.employees.last_name}`);
      }

      // Pre-fill customer name (used for installation protocol customer signature block)
      if (booking.customers) {
        setCustomerSignedBy(`${booking.customers.first_name} ${booking.customers.last_name}`);
      }

      // Create the protocol record (only once)
      creatingRef.current = true;
      const nextSeq = allProtocols.length > 0
        ? Math.max(...allProtocols.map((p) => p.sequence_number)) + 1
        : 1;
      createProtocol.mutate(
        {
          booking_id: booking.id,
          template_id: template.id,
          sequence_number: nextSeq,
          field_data: defaults,
        },
        {
          onSuccess: (data) => {
            setCreatedProtocolId(data.id);
            setInitialized(true);
            onProtocolCreated?.(data.id);
          },
          onError: () => { creatingRef.current = false; },
        }
      );
    } else if (!template) {
      setInitialized(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingProtocol, template, protocolLoading, templatesLoading, initialized]);

  // Auto-save debounced (3s to minimize data loss if user navigates away)
  useEffect(() => {
    if (!protocolId || !initialized) return;
    if (existingProtocol?.status === "completed") return;

    const dataStr = JSON.stringify({ fieldData, notes, userTraining, signedBy, customerSignedBy, showTechnician });
    if (dataStr === lastSavedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = dataStr;

      // Capture signatures if drawn (prevents loss on navigate-away)
      const sig = sigPadRef.current && !sigPadRef.current.isEmpty()
        ? sigPadRef.current.toDataURL("image/png")
        : signatureData;
      const customerSig = customerSigPadRef.current && !customerSigPadRef.current.isEmpty()
        ? customerSigPadRef.current.toDataURL("image/png")
        : customerSignatureData;

      updateProtocol.mutate({
        id: protocolId,
        booking_id: booking.id,
        field_data: { ...fieldData, user_training: userTraining },
        notes: notes || null,
        signed_by: signedBy || null,
        signature_data: sig,
        customer_signature_data: customerSig,
        customer_signed_by: customerSignedBy || null,
        show_technician: showTechnician,
      });
    }, 3_000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldData, notes, userTraining, signedBy, customerSignedBy, showTechnician, protocolId, initialized, booking.id, existingProtocol?.status]);

  const initSignaturePad = useCallback(() => {
    if (canvasRef.current && !sigPadRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(2, 2);
      sigPadRef.current = new SignaturePad(canvas, {
        backgroundColor: "rgb(255, 255, 255)",
        penColor: "rgb(26, 26, 26)",
      });
    }
    if (customerCanvasRef.current && !customerSigPadRef.current) {
      const canvas = customerCanvasRef.current;
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(2, 2);
      customerSigPadRef.current = new SignaturePad(canvas, {
        backgroundColor: "rgb(255, 255, 255)",
        penColor: "rgb(26, 26, 26)",
      });
    }
  }, []);

  // Init signature pads when canvases mount
  useEffect(() => {
    initSignaturePad();
    // Disable when completed
    for (const pad of [sigPadRef.current, customerSigPadRef.current]) {
      if (!pad) continue;
      if (isCompleted) pad.off(); else pad.on();
    }
  }, [initSignaturePad, initialized, isCompleted]);

  // Load existing installer signature into pad
  useEffect(() => {
    if (signatureData && sigPadRef.current && canvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx && canvasRef.current) {
          ctx.drawImage(img, 0, 0, canvasRef.current.offsetWidth, canvasRef.current.offsetHeight);
        }
      };
      img.src = signatureData;
    }
  }, [signatureData, initialized]);

  // Load existing customer signature into pad
  useEffect(() => {
    if (customerSignatureData && customerSigPadRef.current && customerCanvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const ctx = customerCanvasRef.current?.getContext("2d");
        if (ctx && customerCanvasRef.current) {
          ctx.drawImage(img, 0, 0, customerCanvasRef.current.offsetWidth, customerCanvasRef.current.offsetHeight);
        }
      };
      img.src = customerSignatureData;
    }
  }, [customerSignatureData, initialized]);

  function setField(key: string, value: string | number | boolean) {
    setFieldData((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSection(key: string) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSaveDraft() {
    if (!protocolId) return;
    setSaving(true);
    setError("");
    try {
      const sig = sigPadRef.current && !sigPadRef.current.isEmpty()
        ? sigPadRef.current.toDataURL("image/png")
        : signatureData;
      const customerSig = customerSigPadRef.current && !customerSigPadRef.current.isEmpty()
        ? customerSigPadRef.current.toDataURL("image/png")
        : customerSignatureData;

      await updateProtocol.mutateAsync({
        id: protocolId,
        booking_id: booking.id,
        field_data: { ...fieldData, user_training: userTraining },
        notes: notes || null,
        signature_data: sig,
        signed_by: signedBy || null,
        customer_signature_data: customerSig,
        customer_signed_by: customerSignedBy || null,
        show_technician: showTechnician,
      });
      lastSavedRef.current = JSON.stringify({ fieldData, notes, userTraining, signedBy, customerSignedBy, showTechnician });
    } catch (err) {
      setError("Tallennusvirhe");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    if (!protocolId || !template) return;
    setCompleting(true);
    setError("");

    // Validate required fields
    const missing: string[] = [];
    for (const section of template.sections) {
      for (const field of section.fields) {
        if (field.required && !fieldData[field.key] && fieldData[field.key] !== 0 && fieldData[field.key] !== false) {
          missing.push(field.label);
        }
      }
    }
    if (missing.length > 0) {
      setError(`Täytä pakolliset kentät: ${missing.join(", ")}`);
      setCompleting(false);
      return;
    }

    try {
      const sig = sigPadRef.current && !sigPadRef.current.isEmpty()
        ? sigPadRef.current.toDataURL("image/png")
        : signatureData;
      const customerSig = customerSigPadRef.current && !customerSigPadRef.current.isEmpty()
        ? customerSigPadRef.current.toDataURL("image/png")
        : customerSignatureData;

      await updateProtocol.mutateAsync({
        id: protocolId,
        booking_id: booking.id,
        field_data: { ...fieldData, user_training: userTraining },
        notes: notes || null,
        signature_data: sig,
        signed_by: signedBy || null,
        customer_signature_data: customerSig,
        customer_signed_by: customerSignedBy || null,
        show_technician: showTechnician,
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: booking.employee_id,
      });

      // Generate PDF via Chromium (Vercel API) — retry once on 500
      try {
        const token = await getFreshToken();
        const pdfOpts = {
          method: "POST" as const,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ protocol_id: protocolId }),
        };

        let res = await fetch("https://loppusiivous-site-new.vercel.app/api/protocol-pdf", pdfOpts);
        if (!res.ok && res.status >= 500) {
          await new Promise((r) => setTimeout(r, 1500));
          res = await fetch("https://loppusiivous-site-new.vercel.app/api/protocol-pdf", pdfOpts);
        }

        if (res.ok) {
          const blob = await res.blob();
          setPdfUrl(URL.createObjectURL(blob));
        } else {
          const errBody = await res.json().catch(() => ({}));
          setError(`PDF-virhe: ${errBody.detail || res.status}`);
        }
      } catch (pdfErr) {
        console.error("PDF generation failed:", pdfErr);
      }
    } catch (err) {
      setError("Viimeistely epäonnistui");
      console.error(err);
    } finally {
      setCompleting(false);
    }
  }

  async function handleDownloadPdf() {
    const filename = `poytakirja-${booking.booking_number}.pdf`;

    // If we have an in-memory blob URL from just-generated PDF
    if (pdfUrl) {
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    if (!protocolId) return;
    setDownloadingPdf(true);
    setError("");

    try {
      // Try downloading from storage first if PDF was already generated
      // (skip when we just changed display flags — cache is stale)
      const storagePath = pdfCacheStale ? null : existingProtocol?.pdf_storage_path;
      if (storagePath) {
        const { data: fileData, error: dlErr } = await supabase.storage
          .from("protocol-files")
          .download(storagePath);
        if (!dlErr && fileData) {
          const url = URL.createObjectURL(fileData);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setDownloadingPdf(false);
          return;
        }
      }

      // Fall back to re-generating via Chromium API
      const token = await getFreshToken();
      const pdfOpts = {
        method: "POST" as const,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ protocol_id: protocolId }),
      };

      let res = await fetch("https://loppusiivous-site-new.vercel.app/api/protocol-pdf", pdfOpts);
      if (!res.ok && res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await fetch("https://loppusiivous-site-new.vercel.app/api/protocol-pdf", pdfOpts);
      }

      if (res.ok) {
        const blob = await res.blob();
        setPdfUrl(URL.createObjectURL(blob));
        setPdfCacheStale(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const errBody = await res.json().catch(() => ({}));
        console.error("PDF error:", res.status, errBody);
        setError(`PDF-virhe: ${errBody.detail || res.status}`);
      }
    } catch (err) {
      console.error("PDF download failed:", err);
      setError("PDF-lataus epäonnistui");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleReopen() {
    if (!protocolId) return;
    try {
      await updateProtocol.mutateAsync({
        id: protocolId,
        booking_id: booking.id,
        status: "draft",
        completed_at: null,
        completed_by: null,
      });
    } catch (err) {
      console.error("Reopen failed:", err);
    }
  }

  async function handlePhotoUpload(label: string, file: File) {
    if (!protocolId) return;
    try {
      await uploadPhoto.mutateAsync({
        protocolId,
        label,
        file,
        sortOrder: existingProtocol?.protocol_photos?.length || 0,
      });
    } catch (err) {
      console.error("Photo upload failed:", err);
      setError("Kuvan lataus epäonnistui – yritä uudelleen");
    }
  }

  async function handlePhotoDelete(photoId: string, storagePath: string) {
    if (!protocolId) return;
    if (!await confirm({ message: "Poistetaanko kuva?", confirmLabel: "Poista", variant: "danger" })) return;
    await deletePhoto.mutateAsync({ id: photoId, storagePath, protocolId });
  }

  function getPhotoUrl(storagePath: string): string {
    return supabase.storage.from("protocol-files").getPublicUrl(storagePath).data.publicUrl;
  }

  // ─── Render ──────────────────────────────────────────────

  if (templatesLoading || protocolLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-border rounded w-48" />
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  if (!template) {
    return (
      <div>
        {!protocolIdProp && (
          <Link to={backUrl} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-4">
            <ArrowLeft className="w-4 h-4" /> Takaisin
          </Link>
        )}
        <div className="bg-surface rounded-2xl border border-border p-8 text-center space-y-4">
          <p className="text-text-muted">Tälle palvelulle ei ole pöytäkirjapohjaa.</p>
          {templates && templates.length > 0 && (
            <div className="max-w-xs mx-auto">
              <p className="text-sm font-medium text-text-primary mb-2">Valitse pöytäkirjapohja:</p>
              <select
                className={selectCls}
                value=""
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                <option value="" disabled>Valitse pohja...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={protocolIdProp ? "pb-24" : "max-w-3xl mx-auto pb-24"}>
      {/* Header — only show when used standalone (no protocolIdProp) */}
      {!protocolIdProp && (
        <>
          <Link to={backUrl} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-4">
            <ArrowLeft className="w-4 h-4" /> Takaisin
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary">
              {template?.slug === "vianhaku"
                ? "Vianhakuraportti"
                : template?.slug === "huoltopesu"
                ? "Huoltoraportti"
                : "Asennuspöytäkirja"}
              {" — #"}{booking.booking_number}
            </h1>
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> Valmis
              </span>
            )}
            {!isCompleted && existingProtocol && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                Luonnos
              </span>
            )}
          </div>
        </>
      )}

      {/* Booking info summary */}
      <div className="bg-surface rounded-2xl border border-border p-4 mb-6">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-text-muted">Asiakas:</span>{" "}
            <span className="font-medium">
              {booking.customers ? `${booking.customers.first_name} ${booking.customers.last_name}` : "–"}
            </span>
          </div>
          <div>
            <span className="text-text-muted">Päivämäärä:</span>{" "}
            <span className="font-medium">{formatDate(booking.booking_date)}</span>
          </div>
          <div>
            <span className="text-text-muted">Osoite:</span>{" "}
            <span className="font-medium">{booking.address || "–"}</span>
          </div>
        </div>
      </div>

      {/* Dynamic sections */}
      {template.sections.map((section) => {
        // Hide optional sections that have no data and haven't been expanded
        if (section.optional) {
          const hasData = section.fields.some((f) => {
            const v = fieldData[f.key];
            return v !== undefined && v !== null && v !== "";
          });
          if (!hasData && !expandedOptional[section.key]) return null;
        }
        return (
          <SectionCard
            key={section.key}
            section={section}
            fieldData={fieldData}
            setField={setField}
            collapsed={!!collapsedSections[section.key]}
            onToggle={() => toggleSection(section.key)}
            disabled={isCompleted}
          />
        );
      })}

      {/* Buttons to reveal hidden optional sections */}
      {(() => {
        const hiddenOptional = template.sections.filter((s) => {
          if (!s.optional) return false;
          const hasData = s.fields.some((f) => {
            const v = fieldData[f.key];
            return v !== undefined && v !== null && v !== "";
          });
          return !hasData && !expandedOptional[s.key];
        });
        if (hiddenOptional.length === 0 || isCompleted) return null;
        return (
          <div className="flex flex-wrap gap-2 mb-4">
            {hiddenOptional.map((s) => (
              <button
                key={s.key}
                onClick={() => setExpandedOptional((prev) => ({ ...prev, [s.key]: true }))}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-accent border border-accent/30 rounded-xl hover:bg-accent/5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {s.title}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Notes */}
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-3 mb-4">
        <h3 className="font-semibold text-text-primary text-sm">Huomiot</h3>
        <div>
          <label className={labelCls}>Huomiot ja mahdolliset lisätyöt</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputCls} min-h-[100px]`}
            placeholder="Kirjaa huomiot, poikkeamat tai lisätyöt..."
            disabled={isCompleted}
          />
        </div>
      </div>

      {/* Photos */}
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-4 mb-4">
        <h3 className="font-semibold text-text-primary text-sm">Kuvat</h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {template.photo_labels.map((label) => {
            const photo = photos.find((p) => p.label === label);
            return (
              <div key={label} className="space-y-1.5">
                <label className={labelCls}>{label}</label>
                {photo ? (
                  <div className="relative group">
                    <img
                      src={getPhotoUrl(photo.storage_path)}
                      alt={label}
                      className="w-full h-32 object-cover rounded-xl border border-border"
                    />
                    {!isCompleted && (
                      <button
                        onClick={() => handlePhotoDelete(photo.id, photo.storage_path)}
                        className="absolute top-1 right-1 w-7 h-7 rounded-lg bg-red-500/90 text-white flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRefs.current[label]?.click()}
                    disabled={isCompleted || !protocolId}
                    className="w-full h-32 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-text-muted hover:border-accent/40 hover:text-accent transition-colors disabled:opacity-40"
                  >
                    <Camera className="w-5 h-5" />
                    <span className="text-xs">Lisää kuva</span>
                  </button>
                )}
                <input
                  ref={(el) => { fileInputRefs.current[label] = el; }}
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoUpload(label, file);
                    e.target.value = "";
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Extra photos */}
        {photos
          .filter((p) => !template.photo_labels.includes(p.label))
          .map((photo) => (
            <div key={photo.id} className="space-y-1.5">
              <label className={labelCls}>{photo.label}</label>
              <div className="relative group inline-block">
                <img
                  src={getPhotoUrl(photo.storage_path)}
                  alt={photo.label}
                  className="h-32 object-cover rounded-xl border border-border"
                />
                {!isCompleted && (
                  <button
                    onClick={() => handlePhotoDelete(photo.id, photo.storage_path)}
                    className="absolute top-1 right-1 w-7 h-7 rounded-lg bg-red-500/90 text-white flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

        {!isCompleted && protocolId && (
          <div className="flex gap-2">
            <button
              onClick={() => extraFileRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-border text-text-secondary hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" /> Lisää kuva
            </button>
            <input
              ref={extraFileRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePhotoUpload(`Lisäkuva ${photos.length + 1}`, file);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      {/* Signature & approval */}
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-4 mb-4">
        <h3 className="font-semibold text-text-primary text-sm">Työn hyväksyntä</h3>

        {/* User training given — only for installation protocols */}
        {template?.slug !== "vianhaku" && template?.slug !== "huoltopesu" && (
          <div>
            <label className={labelCls}>Käyttöopastus annettu</label>
            <div className="flex gap-2">
              {[
                { label: "Kyllä", value: true },
                { label: "Ei", value: false },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => !isCompleted && setUserTraining(opt.value)}
                  disabled={isCompleted}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                    userTraining === opt.value
                      ? "bg-accent-muted text-accent-dark border-accent/30"
                      : "bg-surface text-text-secondary border-border"
                  } disabled:opacity-60`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Technician name */}
        <div>
          <label className={labelCls}>Työn suorittanut</label>
          <select
            value={signedBy}
            onChange={(e) => setSignedBy(e.target.value)}
            className={selectCls}
            disabled={isCompleted}
          >
            <option value="">– Valitse asentaja –</option>
            {(allEmployees || [])
              .filter((e) => e.active)
              .map((e) => {
                const name = `${e.first_name} ${e.last_name}`;
                return (
                  <option key={e.id} value={name}>
                    {name}
                  </option>
                );
              })}
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showTechnician}
              onChange={(e) => {
                const next = e.target.checked;
                setShowTechnician(next);
                // Persist immediately so this works on completed protocols too,
                // and clear cached PDF so next download regenerates with the new flag.
                if (protocolId) {
                  updateProtocol.mutate({
                    id: protocolId,
                    booking_id: booking.id,
                    show_technician: next,
                    pdf_storage_path: null,
                  });
                  setPdfUrl(null);
                  setPdfCacheStale(true);
                }
              }}
              className="w-4 h-4 rounded border-border accent-accent"
            />
            Näytä työn suorittaja PDF:ssä
          </label>
        </div>

        {/* Installer signature */}
        <div>
          <label className={labelCls}>
            {template?.slug !== "vianhaku" && template?.slug !== "huoltopesu"
              ? "Asentajan allekirjoitus"
              : "Allekirjoitus"}
          </label>
          <div className="relative border border-border rounded-xl overflow-hidden bg-white">
            <canvas
              ref={canvasRef}
              className="w-full"
              style={{ height: 150, touchAction: isCompleted ? "auto" : "none" }}
            />
            {isCompleted && (
              <div className="absolute inset-0 cursor-not-allowed" />
            )}
          </div>
          {!isCompleted && (
            <button
              onClick={() => {
                sigPadRef.current?.clear();
                setSignatureData(null);
              }}
              className="mt-1.5 text-xs text-text-muted hover:text-text-primary"
            >
              Tyhjennä allekirjoitus
            </button>
          )}
        </div>

        {/* Customer signature — installation protocols only */}
        {template?.slug !== "vianhaku" && template?.slug !== "huoltopesu" && (
          <>
            <div>
              <label className={labelCls}>Asiakkaan nimi</label>
              <input
                type="text"
                value={customerSignedBy}
                onChange={(e) => setCustomerSignedBy(e.target.value)}
                className={inputCls}
                placeholder="Asiakkaan koko nimi"
                disabled={isCompleted}
              />
            </div>
            <div>
              <label className={labelCls}>Asiakkaan allekirjoitus</label>
              <div className="relative border border-border rounded-xl overflow-hidden bg-white">
                <canvas
                  ref={customerCanvasRef}
                  className="w-full"
                  style={{ height: 150, touchAction: isCompleted ? "auto" : "none" }}
                />
                {isCompleted && (
                  <div className="absolute inset-0 cursor-not-allowed" />
                )}
              </div>
              {!isCompleted && (
                <button
                  onClick={() => {
                    customerSigPadRef.current?.clear();
                    setCustomerSignatureData(null);
                  }}
                  className="mt-1.5 text-xs text-text-muted hover:text-text-primary"
                >
                  Tyhjennä allekirjoitus
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {!isCompleted && (
          <>
            <button
              onClick={handleSaveDraft}
              disabled={saving || !protocolId}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-surface text-text-primary hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? "Tallennetaan..." : "Tallenna luonnos"}
            </button>

            <button
              onClick={handleComplete}
              disabled={completing || !protocolId}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-dark transition-colors disabled:opacity-50"
            >
              {completing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {completing ? "Viimeistellään..." : "Viimeistele ja luo PDF"}
            </button>
          </>
        )}

        {(isCompleted || pdfUrl) && (
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {downloadingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloadingPdf ? "Luodaan PDF..." : "Lataa PDF"}
          </button>
        )}

        {isCompleted && (
          <Link
            to={backUrl.replace(/\/poytakirja$/, "") + "/viimeistely"}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-dark transition-colors"
          >
            <ClipboardCheck className="w-4 h-4" /> Jatka viimeistelyyn
          </Link>
        )}

        {isCompleted && (
          <button
            onClick={handleReopen}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
          >
            Avaa muokattavaksi
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Section Card ──────────────────────────────────────────

function SectionCard({
  section,
  fieldData,
  setField,
  collapsed,
  onToggle,
  disabled,
}: {
  section: ProtocolSectionDef;
  fieldData: Record<string, string | number | boolean>;
  setField: (key: string, value: string | number | boolean) => void;
  collapsed: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border mb-4 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <h3 className="font-semibold text-text-primary text-sm">{section.title}</h3>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronUp className="w-4 h-4 text-text-muted" />
        )}
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {section.fields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={fieldData[field.key]}
                onChange={(v) => setField(field.key, v)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Field Renderer ────────────────────────────────────────

function FieldRenderer({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ProtocolFieldDef;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
  disabled: boolean;
}) {
  const id = `field-${field.key}`;

  switch (field.type) {
    case "text":
    case "textarea":
      return (
        <div className={field.type === "textarea" ? "sm:col-span-2" : ""}>
          <label htmlFor={id} className={labelCls}>
            {field.label} {field.required && <span className="text-red-400">*</span>}
          </label>
          {field.type === "textarea" ? (
            <textarea
              id={id}
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              className={`${inputCls} min-h-[80px]`}
              placeholder={field.placeholder}
              disabled={disabled}
            />
          ) : (
            <div className="relative">
              <input
                id={id}
                type="text"
                value={(value as string) ?? ""}
                onChange={(e) => onChange(e.target.value)}
                className={inputCls}
                placeholder={field.placeholder}
                disabled={disabled}
              />
              {field.unit && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                  {field.unit}
                </span>
              )}
            </div>
          )}
        </div>
      );

    case "number":
      return (
        <div>
          <label htmlFor={id} className={labelCls}>
            {field.label} {field.required && <span className="text-red-400">*</span>}
          </label>
          <div className="relative">
            <input
              id={id}
              type="text"
              inputMode="decimal"
              value={value !== undefined && value !== "" && value !== false ? String(value) : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^-?\d*[.,]?\d*$/.test(v)) {
                  onChange(v === "" ? "" : v);
                }
              }}
              onBlur={(e) => {
                const v = e.target.value.replace(",", ".");
                if (v !== "" && !isNaN(Number(v))) {
                  onChange(Number(v));
                }
              }}
              className={`${inputCls} ${field.unit ? "pr-12" : ""}`}
              placeholder={field.placeholder || "–"}
              disabled={disabled}
            />
            {field.unit && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                {field.unit}
              </span>
            )}
          </div>
        </div>
      );

    case "select":
      return (
        <div>
          <label htmlFor={id} className={labelCls}>
            {field.label} {field.required && <span className="text-red-400">*</span>}
          </label>
          <select
            id={id}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={selectCls}
            disabled={disabled}
          >
            <option value="">{field.placeholder || "– Valitse –"}</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );

    case "boolean":
      return (
        <div>
          <label className={labelCls}>
            {field.label} {field.required && <span className="text-red-400">*</span>}
          </label>
          <div className="flex gap-2">
            {[
              { label: "Kyllä", val: true },
              { label: "Ei", val: false },
            ].map((opt) => (
              <button
                key={String(opt.val)}
                onClick={() => !disabled && onChange(opt.val)}
                disabled={disabled}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  value === opt.val
                    ? "bg-accent-muted text-accent-dark border-accent/30"
                    : "bg-surface text-text-secondary border-border"
                } disabled:opacity-60`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}
