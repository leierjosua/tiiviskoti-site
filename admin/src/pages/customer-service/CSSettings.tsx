import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import DOMPurify from "dompurify";
import { SlidersHorizontal, Plus, Pencil, Trash2, Save, Clock, Zap, BookOpen, Search, Eye, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Globe, Lock, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCSCategories } from "@/hooks/customer-service/useTickets";
import { useCreateCSCategory, useUpdateCSCategory, useDeleteCSCategory } from "@/hooks/customer-service/useCSCategories";
import { useAllCannedResponses, useCreateCannedResponse, useUpdateCannedResponse, useDeleteCannedResponse } from "@/hooks/customer-service/useCannedResponses";
import { useKBArticles, useCreateKBArticle, useDeleteKBArticle } from "@/hooks/customer-service/useKnowledgeBase";
import { useCompanySettings, useUpdateCompanySettings } from "@/hooks/useServices";
import { useAgentSignature, useUpsertAgentSignature } from "@/hooks/customer-service/useAgentSignature";
import {
  useCSPricing,
  useUpsertCSPricing,
  useDeleteCSPricing,
  useCSFaqs,
  useUpsertCSFaq,
  useDeleteCSFaq,
  useCSBrandVoice,
  useUpdateCSBrandVoice,
  useAIFeedbackStats,
} from "@/hooks/customer-service/useAISettings";
import { useUserRole } from "@/context/UserRoleContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import { formatDateTime } from "@/lib/utils";
import type { CSCategory, CSCannedResponse, KBFilters, KBArticle } from "@/lib/cs-types";

type Tab = "categories" | "canned" | "knowledge" | "ai" | "profile";

const TABS: { key: Tab; label: string }[] = [
  { key: "categories", label: "Kategoriat & SLA" },
  { key: "canned", label: "Pikavastaukset" },
  { key: "knowledge", label: "Tietopankki" },
  { key: "ai", label: "AI & hinnasto" },
  { key: "profile", label: "Oma profiili" },
];

export default function CSSettings() {
  const [tab, setTab] = useState<Tab>("categories");

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <SlidersHorizontal className="w-5 h-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Asiakaspalvelun asetukset</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 sm:px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "categories" && <CategoriesTab />}
      {tab === "canned" && <CannedTab />}
      {tab === "knowledge" && <KnowledgeTab />}
      {tab === "ai" && <AITab />}
      {tab === "profile" && <ProfileTab />}
    </div>
  );
}

// ─── AI & Pricing Tab ────────────────────────────────────────────────────────

function AITab() {
  return (
    <div className="space-y-6 max-w-4xl">
      <PricingSection />
      <FAQSection />
      <BrandVoiceSection />
      <AIFeedbackSection />
    </div>
  );
}

function PricingSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: rows = [] } = useCSPricing();
  const upsert = useUpsertCSPricing();
  const del = useDeleteCSPricing();
  const [editing, setEditing] = useState<null | {
    id?: string;
    label: string;
    service_area: string;
    price_display: string;
    notes: string;
    is_active: boolean;
  }>(null);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Hinnasto AI-luonnoksille</h3>
          <p className="text-xs text-text-muted">
            Näitä hintoja käytetään SANATARKASTI AI-vastausluonnoksissa hintakyselyissä. Ei pyöristystä, ei tulkintaa.
          </p>
        </div>
        <button
          onClick={() =>
            setEditing({ label: "", service_area: "", price_display: "", notes: "", is_active: true })
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90"
        >
          <Plus className="w-3 h-3" /> Uusi rivi
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-text-muted py-4 text-center">Ei hintarivejä vielä.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-white">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-text-primary truncate">
                  {r.label}
                  {!r.is_active && <span className="ml-2 text-text-muted">(piilotettu)</span>}
                </div>
                <div className="text-text-muted truncate">
                  {r.service_area ? `${r.service_area} · ` : ""}
                  <span className="font-semibold">{r.price_display}</span>
                  {r.notes ? ` — ${r.notes}` : ""}
                </div>
              </div>
              <button
                onClick={() =>
                  setEditing({
                    id: r.id,
                    label: r.label,
                    service_area: r.service_area ?? "",
                    price_display: r.price_display,
                    notes: r.notes ?? "",
                    is_active: r.is_active,
                  })
                }
                className="p-1 text-text-muted hover:text-text-primary"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={async () => {
                  if (await confirm({ title: "Poista rivi?", message: "Haluatko varmasti poistaa tämän rivin?", variant: "danger" })) {
                    del.mutate(r.id, {
                      onSuccess: () => toast.success("Poistettu"),
                      onError: (err) => toast.error(err.message),
                    });
                  }
                }}
                className="p-1 text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 space-y-2">
          <input
            type="text"
            placeholder="Nimi (esim. Split-asennus 1 yksikkö)"
            value={editing.label}
            onChange={(e) => setEditing({ ...editing, label: e.target.value })}
            className="w-full px-2 py-1.5 text-xs border border-border rounded bg-white"
          />
          <input
            type="text"
            placeholder="Palvelualue (esim. Helsinki / koko Suomi) — vapaaehtoinen"
            value={editing.service_area}
            onChange={(e) => setEditing({ ...editing, service_area: e.target.value })}
            className="w-full px-2 py-1.5 text-xs border border-border rounded bg-white"
          />
          <input
            type="text"
            placeholder="Näytettävä hinta (esim. alk. 1490 €, sis. asennus)"
            value={editing.price_display}
            onChange={(e) => setEditing({ ...editing, price_display: e.target.value })}
            className="w-full px-2 py-1.5 text-xs border border-border rounded bg-white"
          />
          <textarea
            placeholder="Lisätiedot (vapaaehtoinen)"
            value={editing.notes}
            onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            rows={2}
            className="w-full px-2 py-1.5 text-xs border border-border rounded bg-white"
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={editing.is_active}
              onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
            />
            Näytä AI-luonnoksissa
          </label>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setEditing(null)}
              className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
            >
              Peruuta
            </button>
            <button
              onClick={() => {
                if (!editing.label.trim() || !editing.price_display.trim()) {
                  toast.error("Nimi ja hinta ovat pakollisia");
                  return;
                }
                upsert.mutate(
                  {
                    id: editing.id,
                    label: editing.label.trim(),
                    service_area: editing.service_area.trim() || null,
                    price_display: editing.price_display.trim(),
                    notes: editing.notes.trim() || null,
                    is_active: editing.is_active,
                  },
                  {
                    onSuccess: () => {
                      toast.success("Tallennettu");
                      setEditing(null);
                    },
                    onError: (err) => toast.error(err.message),
                  }
                );
              }}
              className="px-3 py-1.5 bg-accent text-white text-xs rounded font-semibold"
            >
              Tallenna
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FAQSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: rows = [] } = useCSFaqs();
  const upsert = useUpsertCSFaq();
  const del = useDeleteCSFaq();
  const [editing, setEditing] = useState<null | {
    id?: string;
    question: string;
    answer: string;
    topic: string;
    is_published: boolean;
  }>(null);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Usein kysytyt kysymykset</h3>
          <p className="text-xs text-text-muted">
            Käytetään AI-luonnoksissa palvelu- ja teknisiin kysymyksiin. Pidä vastaukset lyhyinä ja faktapohjaisina.
          </p>
        </div>
        <button
          onClick={() =>
            setEditing({ question: "", answer: "", topic: "", is_published: true })
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90"
        >
          <Plus className="w-3 h-3" /> Uusi kysymys
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-text-muted py-4 text-center">Ei kysymyksiä vielä.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-white">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-3 py-2 text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-text-primary">{r.question}</div>
                <div className="text-text-muted line-clamp-2">{r.answer}</div>
                <div className="text-[11px] text-text-tertiary mt-0.5">
                  {r.topic ?? "(ei aihetta)"} · käytetty {r.use_count}×
                </div>
              </div>
              <button
                onClick={() =>
                  setEditing({
                    id: r.id,
                    question: r.question,
                    answer: r.answer,
                    topic: r.topic ?? "",
                    is_published: r.is_published,
                  })
                }
                className="p-1 text-text-muted hover:text-text-primary"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={async () => {
                  if (await confirm({ title: "Poista kysymys?", message: "Haluatko varmasti poistaa tämän kysymyksen?", variant: "danger" })) {
                    del.mutate(r.id, {
                      onSuccess: () => toast.success("Poistettu"),
                      onError: (err) => toast.error(err.message),
                    });
                  }
                }}
                className="p-1 text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 space-y-2">
          <input
            type="text"
            placeholder="Kysymys (esim. Kuinka kauan asennus kestää?)"
            value={editing.question}
            onChange={(e) => setEditing({ ...editing, question: e.target.value })}
            className="w-full px-2 py-1.5 text-xs border border-border rounded bg-white"
          />
          <textarea
            placeholder="Vastaus"
            value={editing.answer}
            onChange={(e) => setEditing({ ...editing, answer: e.target.value })}
            rows={4}
            className="w-full px-2 py-1.5 text-xs border border-border rounded bg-white"
          />
          <input
            type="text"
            placeholder="Aihe / topic (esim. asennus, takuu, hinnat)"
            value={editing.topic}
            onChange={(e) => setEditing({ ...editing, topic: e.target.value })}
            className="w-full px-2 py-1.5 text-xs border border-border rounded bg-white"
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={editing.is_published}
              onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })}
            />
            Käytä AI-luonnoksissa
          </label>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setEditing(null)}
              className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
            >
              Peruuta
            </button>
            <button
              onClick={() => {
                if (!editing.question.trim() || !editing.answer.trim()) {
                  toast.error("Kysymys ja vastaus pakollisia");
                  return;
                }
                upsert.mutate(
                  {
                    id: editing.id,
                    question: editing.question.trim(),
                    answer: editing.answer.trim(),
                    topic: editing.topic.trim() || null,
                    is_published: editing.is_published,
                  },
                  {
                    onSuccess: () => {
                      toast.success("Tallennettu");
                      setEditing(null);
                    },
                    onError: (err) => toast.error(err.message),
                  }
                );
              }}
              className="px-3 py-1.5 bg-accent text-white text-xs rounded font-semibold"
            >
              Tallenna
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BrandVoiceSection() {
  const toast = useToast();
  const { data: brandVoice = "" } = useCSBrandVoice();
  const update = useUpdateCSBrandVoice();
  const [value, setValue] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setValue(brandVoice);
  }, [brandVoice, dirty]);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Brand voice (AI-system prompt)</h3>
        <p className="text-xs text-text-muted">
          Muokkaa AI-luonnoksen sävyä ja kovia sääntöjä ilman uudelleenjulkaisua. Jätä tyhjäksi käyttääksesi oletusta.
        </p>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(true);
        }}
        rows={12}
        placeholder="(oletus brand voice käytössä)"
        className="w-full rounded-lg border border-border bg-white p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      <div className="flex items-center justify-end">
        <button
          onClick={() =>
            update.mutate(value, {
              onSuccess: () => {
                setDirty(false);
                toast.success("Brand voice tallennettu");
              },
              onError: (err) => toast.error(err.message),
            })
          }
          disabled={!dirty || update.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
        >
          <Save className="w-3 h-3" />
          Tallenna
        </button>
      </div>
    </div>
  );
}

function AIFeedbackSection() {
  const { data: stats = [] } = useAIFeedbackStats();

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">AI-luonnosten laatu (60 päivää)</h3>
        <p className="text-xs text-text-muted">
          Per-intent tilasto: missä AI pärjää hyvin, missä agentti joutuu aina muokkaamaan.
        </p>
      </div>
      {stats.length === 0 ? (
        <p className="text-xs text-text-muted py-4 text-center">Ei vielä palautedataa.</p>
      ) : (
        <div className="rounded-lg border border-border bg-white overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-bg-secondary/50 text-text-muted">
              <tr>
                <th className="text-left px-3 py-2">Intent</th>
                <th className="text-right px-3 py-2">Hyväksytty</th>
                <th className="text-right px-3 py-2">Muokattu</th>
                <th className="text-right px-3 py-2">Hylätty</th>
                <th className="text-right px-3 py-2">Yhteensä</th>
                <th className="text-right px-3 py-2">Hyväksymis-%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.map((s) => {
                const approvalRate =
                  s.total > 0 ? Math.round((s.approved / s.total) * 100) : 0;
                const color =
                  approvalRate >= 70
                    ? "text-green-600"
                    : approvalRate >= 40
                    ? "text-amber-600"
                    : "text-red-600";
                return (
                  <tr key={s.intent}>
                    <td className="px-3 py-2 font-medium text-text-primary">{s.intent}</td>
                    <td className="px-3 py-2 text-right">{s.approved}</td>
                    <td className="px-3 py-2 text-right">{s.edited}</td>
                    <td className="px-3 py-2 text-right">{s.discarded}</td>
                    <td className="px-3 py-2 text-right text-text-muted">{s.total}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${color}`}>
                      {approvalRate}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const toast = useToast();
  const { employee } = useUserRole();
  const { data: existing } = useAgentSignature(employee?.id);
  const upsertSignature = useUpsertAgentSignature();
  const [signature, setSignature] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (existing?.html && !dirty) {
      setSignature(existing.html);
    }
  }, [existing?.html, dirty]);

  const handleSave = () => {
    if (!employee?.id) return;
    upsertSignature.mutate(
      { agentId: employee.id, html: signature },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Allekirjoitus tallennettu");
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const defaultSig = employee
    ? `<div><strong>${employee.first_name ?? ""} ${employee.last_name ?? ""}</strong><br>Lasikiilto<br><a href="mailto:info@lasikiilto.fi">info@lasikiilto.fi</a></div>`
    : "";

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">Sähköpostiallekirjoitus</h3>
          <p className="text-xs text-text-muted">
            Lisätään automaattisesti jokaisen asiakasvastauksen loppuun. HTML sallittu.
          </p>
        </div>
        <textarea
          value={signature}
          onChange={(e) => {
            setSignature(e.target.value);
            setDirty(true);
          }}
          rows={8}
          placeholder={defaultSig}
          className="w-full rounded-lg border border-border bg-white p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setSignature(defaultSig);
              setDirty(true);
            }}
            className="text-xs text-text-muted hover:text-text-primary underline"
          >
            Käytä oletuspohjaa
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || upsertSignature.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            Tallenna
          </button>
        </div>
        {signature && (
          <div>
            <div className="text-xs text-text-muted mb-1">Esikatselu:</div>
            <div
              className="rounded-lg border border-dashed border-border p-3 bg-white text-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signature) }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Categories & SLA Tab ────────────────────────────────────────────────────

function AutoArchiveSettings() {
  const toast = useToast();
  const { data: settings } = useCompanySettings();
  const updateSettings = useUpdateCompanySettings();

  function toggle(key: "cs_auto_archive_system_emails" | "cs_auto_archive_ai_junk") {
    const current = (settings as any)?.[key] ?? false;
    updateSettings.mutate(
      { [key]: !current } as any,
      {
        onSuccess: () => toast.success("Asetus päivitetty"),
        onError: (err) => toast.error(err.message),
      }
    );
  }

  const systemEnabled = (settings as any)?.cs_auto_archive_system_emails ?? false;
  const aiJunkEnabled = (settings as any)?.cs_auto_archive_ai_junk ?? false;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-1">Automaattinen arkistointi</h3>
        <p className="text-xs text-text-muted">Hallitse mitkä viestit arkistoidaan automaattisesti. Kun pois päältä, viestit tulevat normaalisti tiketteinä.</p>
      </div>
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => toggle("cs_auto_archive_system_emails")}
            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
              systemEnabled ? "bg-accent" : "bg-gray-300"
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                systemEnabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </div>
          <div>
            <span className="text-sm font-medium text-text-primary">Järjestelmäviestit</span>
            <p className="text-xs text-text-muted">Noreply-osoitteet, kalenterikutsut, poissaoloilmoitukset, delivery-notifikaatiot</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => toggle("cs_auto_archive_ai_junk")}
            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
              aiJunkEnabled ? "bg-accent" : "bg-gray-300"
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                aiJunkEnabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </div>
          <div>
            <span className="text-sm font-medium text-text-primary">AI junk-tunnistus</span>
            <p className="text-xs text-text-muted">AI (Haiku) tunnistaa ja arkistoi roskapostit ja uutiskirjeet</p>
          </div>
        </label>
      </div>
    </div>
  );
}

function CategoriesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: categories, isLoading } = useCSCategories();
  const createCat = useCreateCSCategory();
  const updateCat = useUpdateCSCategory();
  const deleteCat = useDeleteCSCategory();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [formId, setFormId] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formColor, setFormColor] = useState("#6366f1");
  const [formSlaFirst, setFormSlaFirst] = useState(240);
  const [formSlaResolution, setFormSlaResolution] = useState(2880);
  const [formAutoArchive, setFormAutoArchive] = useState(false);
  const [formDescription, setFormDescription] = useState("");

  function startNew() {
    setShowNew(true); setEditingId(null);
    setFormId(""); setFormLabel(""); setFormColor("#6366f1");
    setFormSlaFirst(240); setFormSlaResolution(2880); setFormAutoArchive(false); setFormDescription("");
  }

  function startEdit(c: CSCategory) {
    setEditingId(c.id); setShowNew(false);
    setFormId(c.id); setFormLabel(c.label); setFormColor(c.color);
    setFormSlaFirst(c.sla_first_response_minutes ?? 240);
    setFormSlaResolution(c.sla_resolution_minutes ?? 2880);
    setFormAutoArchive(c.auto_archive ?? false);
    setFormDescription((c as any).description || "");
  }

  function cancelEdit() { setEditingId(null); setShowNew(false); }

  function handleSave() {
    if (!formLabel.trim()) return;
    if (showNew) {
      const id = formId.trim() || formLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      createCat.mutate(
        { id, label: formLabel, color: formColor, sla_first_response_minutes: formSlaFirst, sla_resolution_minutes: formSlaResolution, auto_archive: formAutoArchive, description: formDescription || null, position: (categories?.length ?? 0) } as any,
        { onSuccess: () => { toast.success("Kategoria luotu"); cancelEdit(); }, onError: (err) => toast.error(err.message) }
      );
    } else if (editingId) {
      updateCat.mutate(
        { id: editingId, label: formLabel, color: formColor, sla_first_response_minutes: formSlaFirst, sla_resolution_minutes: formSlaResolution, auto_archive: formAutoArchive, description: formDescription || null } as any,
        { onSuccess: () => { toast.success("Kategoria päivitetty"); cancelEdit(); }, onError: (err) => toast.error(err.message) }
      );
    }
  }

  async function handleDelete(c: CSCategory) {
    const ok = await confirm({ title: "Poista kategoria", message: `Haluatko varmasti poistaa kategorian "${c.label}"?`, confirmLabel: "Poista", variant: "danger" });
    if (!ok) return;
    deleteCat.mutate(c.id, { onError: (err) => toast.error(err.message) });
  }

  function formatMinutes(min: number): string {
    if (min >= 1440) return `${Math.floor(min / 1440)}pv`;
    if (min >= 60) return `${Math.floor(min / 60)}h`;
    return `${min}min`;
  }

  return (
    <div className="space-y-4">
      <AutoArchiveSettings />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm text-text-muted">Määritä SLA-tavoitteet kullekin kategorialle. AI luokittelee uudet tiketit automaattisesti.</p>
        <button onClick={startNew} className="inline-flex items-center gap-2 px-3 py-2 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-dark transition-colors whitespace-nowrap">
          <Plus className="h-4 w-4" /> Uusi kategoria
        </button>
      </div>

      {(showNew || editingId) && (
        <div className="rounded-xl border border-accent/20 bg-accent-muted/30 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {showNew && (
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">ID</label>
                <input type="text" value={formId} onChange={(e) => setFormId(e.target.value)} placeholder="auto" className="w-full rounded-xl border border-border px-3 py-1.5 text-sm bg-surface" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Nimi *</label>
              <input type="text" value={formLabel} onChange={(e) => setFormLabel(e.target.value)} className="w-full rounded-xl border border-border px-3 py-1.5 text-sm bg-surface" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Väri</label>
              <input type="color" value={formColor} onChange={(e) => setFormColor(e.target.value)} className="w-full h-[34px] rounded-xl border border-border" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">SLA: ensivastaus (min)</label>
              <input type="number" value={formSlaFirst} onChange={(e) => setFormSlaFirst(parseInt(e.target.value) || 0)} className="w-full rounded-xl border border-border px-3 py-1.5 text-sm bg-surface" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">SLA: ratkaisu (min)</label>
              <input type="number" value={formSlaResolution} onChange={(e) => setFormSlaResolution(parseInt(e.target.value) || 0)} className="w-full rounded-xl border border-border px-3 py-1.5 text-sm bg-surface" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">AI-luokittelun kuvaus</label>
            <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className="w-full rounded-xl border border-border px-3 py-1.5 text-sm bg-surface" placeholder="Kuvaa mitä viestejä tähän kategoriaan kuuluu — AI käyttää tätä luokitteluun" />
            <p className="text-xs text-text-muted mt-1">Haiku käyttää tätä kuvausta päättäessään mihin kategoriaan saapuva viesti kuuluu</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={formAutoArchive} onChange={(e) => setFormAutoArchive(e.target.checked)} className="rounded border-border" />
            Arkistoi automaattisesti
          </label>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!formLabel.trim()} className="inline-flex items-center gap-2 px-4 py-1.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-dark disabled:opacity-50 transition-colors">
              <Save className="h-4 w-4" /> Tallenna
            </button>
            <button onClick={cancelEdit} className="px-4 py-1.5 text-text-muted text-sm hover:text-text-primary transition-colors">Peruuta</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="text-left px-4 py-2 text-xs font-medium text-text-muted uppercase">Kategoria</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-text-muted uppercase">SLA: ensivastaus</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-text-muted uppercase">SLA: ratkaisu</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-text-muted uppercase">Auto-arkisto</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-text-muted uppercase">Toiminnot</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted">Ladataan...</td></tr>
            ) : (
              (categories ?? []).map((c) => (
                <tr key={c.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">{c.label}</span>
                          <span className="text-xs text-text-muted">{c.id}</span>
                        </div>
                        {(c as any).description && (
                          <p className="text-xs text-text-muted mt-0.5 truncate max-w-[300px]">{(c as any).description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-text-secondary">
                      <Clock className="w-3.5 h-3.5" />
                      {formatMinutes(c.sla_first_response_minutes ?? 0)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{formatMinutes(c.sla_resolution_minutes ?? 0)}</td>
                  <td className="px-4 py-3 text-center">
                    {c.auto_archive && <span className="text-xs text-accent-dark font-medium bg-accent-muted px-2 py-0.5 rounded-lg">Kyllä</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(c)} className="p-1.5 text-text-muted hover:text-accent rounded-lg hover:bg-accent-muted transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 text-text-muted hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Canned Responses Tab ────────────────────────────────────────────────────

function CannedTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const { employee } = useUserRole();
  const { data: responses, isLoading } = useAllCannedResponses();
  const createResponse = useCreateCannedResponse();
  const updateResponse = useUpdateCannedResponse();
  const deleteResponse = useDeleteCannedResponse();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formBody, setFormBody] = useState("");

  function startNew() { setShowNew(true); setEditingId(null); setFormName(""); setFormCategory(""); setFormSubject(""); setFormBody(""); }
  function startEdit(r: CSCannedResponse) { setEditingId(r.id); setShowNew(false); setFormName(r.name); setFormCategory(r.category || ""); setFormSubject(r.subject || ""); setFormBody(r.body_html); }
  function cancelEdit() { setEditingId(null); setShowNew(false); }

  function handleSave() {
    if (!formName.trim() || !formBody.trim()) return;
    if (showNew) {
      createResponse.mutate(
        { name: formName, category: formCategory || null, subject: formSubject || null, body_html: formBody, body_text: formBody.replace(/<[^>]*>/g, ""), created_by: employee?.id },
        { onSuccess: () => { toast.success("Pikavastaus luotu"); cancelEdit(); }, onError: (err) => toast.error(err.message) }
      );
    } else if (editingId) {
      updateResponse.mutate(
        { id: editingId, name: formName, category: formCategory || null, subject: formSubject || null, body_html: formBody, body_text: formBody.replace(/<[^>]*>/g, "") },
        { onSuccess: () => { toast.success("Pikavastaus päivitetty"); cancelEdit(); }, onError: (err) => toast.error(err.message) }
      );
    }
  }

  async function handleDelete(r: CSCannedResponse) {
    const ok = await confirm({ title: "Poista pikavastaus", message: `Haluatko varmasti poistaa pikavastauksen "${r.name}"?`, confirmLabel: "Poista", variant: "danger" });
    if (!ok) return;
    deleteResponse.mutate(r.id, { onError: (err) => toast.error(err.message) });
  }

  function toggleActive(r: CSCannedResponse) {
    updateResponse.mutate({ id: r.id, is_active: !r.is_active });
  }

  const isPending = createResponse.isPending || updateResponse.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          Valmiit vastauspohjat. Muuttujat: <code className="bg-surface-alt px-1 rounded text-xs">{"{{customer_name}}"}</code>, <code className="bg-surface-alt px-1 rounded text-xs">{"{{ticket_number}}"}</code>
        </p>
        <button onClick={startNew} className="inline-flex items-center gap-2 px-3 py-2 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-dark transition-colors whitespace-nowrap">
          <Plus className="h-4 w-4" /> Uusi pikavastaus
        </button>
      </div>

      {(showNew || editingId) && (
        <div className="rounded-xl border border-accent/20 bg-accent-muted/30 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Nimi *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full rounded-xl border border-border px-3 py-1.5 text-sm bg-surface" placeholder="esim. Kiitos yhteydenotosta" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Kategoria</label>
              <input type="text" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full rounded-xl border border-border px-3 py-1.5 text-sm bg-surface" placeholder="esim. yleinen, tekninen" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Aihe (valinnainen)</label>
              <input type="text" value={formSubject} onChange={(e) => setFormSubject(e.target.value)} className="w-full rounded-xl border border-border px-3 py-1.5 text-sm bg-surface" placeholder="Korvaa tiketin aiheen" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Sisältö (HTML) *</label>
            <textarea value={formBody} onChange={(e) => setFormBody(e.target.value)} rows={6} className="w-full rounded-xl border border-border px-3 py-2 text-sm font-mono bg-surface" placeholder="<p>Hei {{customer_name}},</p><p>Kiitos yhteydenotostasi...</p>" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!formName.trim() || !formBody.trim() || isPending} className="inline-flex items-center gap-2 px-4 py-1.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-dark disabled:opacity-50 transition-colors">
              <Save className="h-4 w-4" /> {isPending ? "Tallennetaan..." : "Tallenna"}
            </button>
            <button onClick={cancelEdit} className="px-4 py-1.5 text-text-muted text-sm hover:text-text-primary transition-colors">Peruuta</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface overflow-hidden divide-y divide-border">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-4"><div className="h-5 w-1/2 rounded bg-border animate-pulse mb-2" /><div className="h-3 w-full rounded bg-border animate-pulse" /></div>
            ))}
          </div>
        ) : !responses?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <Zap className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">Ei pikavastauksia</p>
          </div>
        ) : (
          responses.map((r) => (
            <div key={r.id} className="px-4 py-3">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-medium text-text-primary break-words">{r.name}</h3>
                    {r.category && <span className="text-xs text-text-muted bg-surface-alt px-1.5 py-0.5 rounded">{r.category}</span>}
                    {!r.is_active && <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded">Ei käytössä</span>}
                  </div>
                  {r.subject && <p className="text-xs text-text-muted mt-0.5">Aihe: {r.subject}</p>}
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-text-muted"><BarChart3 className="h-3 w-3" />{r.usage_count}</span>
                <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} className="p-1 text-text-muted hover:text-text-primary">
                  {expandedId === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <button onClick={() => toggleActive(r)} className={`text-xs px-2 py-1 rounded-lg ${r.is_active ? "text-green-700 bg-green-50 hover:bg-green-100" : "text-text-muted bg-surface-alt hover:bg-surface-hover"}`}>
                  {r.is_active ? "Käytössä" : "Pois"}
                </button>
                <button onClick={() => startEdit(r)} className="p-1.5 text-text-muted hover:text-accent rounded-lg hover:bg-accent-muted transition-colors"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDelete(r)} className="p-1.5 text-text-muted hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="h-4 w-4" /></button>
              </div>
              {expandedId === r.id && (
                <div className="mt-3 p-3 bg-surface-alt rounded-xl border border-border">
                  <div className="prose prose-sm max-w-none text-text-secondary" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.body_html) }} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Knowledge Base Tab ──────────────────────────────────────────────────────

function KnowledgeTab() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const { employee } = useUserRole();
  const { data: categories } = useCSCategories();

  const [filters, setFilters] = useState<KBFilters>({ category: "all", visibility: "all", search: "", page: 0 });
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newCategory, setNewCategory] = useState("general");

  const { data: result, isLoading } = useKBArticles(filters);
  const createArticle = useCreateKBArticle();
  const deleteArticle = useDeleteKBArticle();
  const articles = result?.data ?? [];

  function generateSlug(title: string): string {
    return title.toLowerCase().replace(/[äå]/g, "a").replace(/ö/g, "o").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const slug = newSlug.trim() || generateSlug(newTitle);
    createArticle.mutate(
      { title: newTitle, slug, category: newCategory, body_html: "", body_text: "", visibility: "internal", tags: [], created_by: employee?.id },
      { onSuccess: (article) => { setShowNewForm(false); setNewTitle(""); setNewSlug(""); navigate(`/asiakaspalvelu/tietopankki/${article.slug}`); }, onError: (err) => toast.error(err.message) }
    );
  }

  async function handleDelete(article: KBArticle) {
    const ok = await confirm({ title: "Poista artikkeli", message: `Haluatko varmasti poistaa artikkelin "${article.title}"?`, confirmLabel: "Poista", variant: "danger" });
    if (!ok) return;
    deleteArticle.mutate(article.id, { onError: (err) => toast.error(err.message) });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm text-text-muted">Sisäiset ja julkiset artikkelit asiakaspalvelun tueksi.</p>
        <button onClick={() => setShowNewForm(true)} className="inline-flex items-center gap-2 px-3 py-2 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-dark transition-colors whitespace-nowrap">
          <Plus className="h-4 w-4" /> Uusi artikkeli
        </button>
      </div>

      {showNewForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-accent/20 bg-accent-muted/30 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Otsikko *</label>
              <input type="text" value={newTitle} onChange={(e) => { setNewTitle(e.target.value); if (!newSlug) setNewSlug(generateSlug(e.target.value)); }} className="w-full rounded-xl border border-border px-3 py-1.5 text-sm bg-surface" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Slug</label>
              <input type="text" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="auto-generoitu" className="w-full rounded-xl border border-border px-3 py-1.5 text-sm bg-surface" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Kategoria</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full rounded-xl border border-border px-3 py-1.5 text-sm bg-surface">
                {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={!newTitle.trim() || createArticle.isPending} className="px-4 py-1.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-dark disabled:opacity-50 transition-colors">
              {createArticle.isPending ? "Luodaan..." : "Luo artikkeli"}
            </button>
            <button type="button" onClick={() => setShowNewForm(false)} className="px-4 py-1.5 text-text-muted text-sm hover:text-text-primary transition-colors">Peruuta</button>
          </div>
        </form>
      )}

      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input type="text" placeholder="Hae artikkeleista..." value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 0 }))} className="w-full pl-10 pr-4 py-2 border border-border rounded-xl text-sm bg-surface" />
        </div>
        <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value, page: 0 }))} className="rounded-xl border border-border text-sm px-3 py-2 bg-surface">
          <option value="all">Kaikki kategoriat</option>
          {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={filters.visibility} onChange={(e) => setFilters((f) => ({ ...f, visibility: e.target.value as KBFilters["visibility"], page: 0 }))} className="rounded-xl border border-border text-sm px-3 py-2 bg-surface">
          <option value="all">Kaikki</option>
          <option value="internal">Sisäinen</option>
          <option value="customer_facing">Julkinen</option>
        </select>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden divide-y divide-border">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-4"><div className="h-5 w-2/3 rounded bg-border animate-pulse mb-2" /><div className="h-3 w-1/3 rounded bg-border animate-pulse" /></div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <BookOpen className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">Ei artikkeleita</p>
          </div>
        ) : (
          articles.map((article) => {
            const cat = categories?.find((c) => c.id === article.category);
            return (
              <Link key={article.id} to={`/asiakaspalvelu/tietopankki/${article.slug}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-medium text-text-primary truncate">{article.title}</h3>
                    {article.visibility === "customer_facing" ? <Globe className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <Lock className="h-3.5 w-3.5 text-text-muted shrink-0" />}
                    {!article.is_published && <Badge className="bg-surface-alt text-text-muted text-[10px]">Luonnos</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    {cat && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: cat.color + "18", color: cat.color }}>{cat.label}</span>}
                    <span>Päivitetty {formatDateTime(article.updated_at)}</span>
                    {article.view_count > 0 && <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {article.view_count}</span>}
                    {article.tags.length > 0 && <span className="text-text-muted truncate">{article.tags.join(", ")}</span>}
                  </div>
                </div>
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(article); }} className="p-1.5 text-text-muted hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="h-4 w-4" /></button>
              </Link>
            );
          })
        )}
      </div>

      {result && result.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">{result.count} artikkelia</p>
          <div className="flex items-center gap-2">
            <button disabled={(filters.page ?? 0) === 0} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 0) - 1 }))} className="p-2 rounded-xl border border-border text-text-muted hover:bg-surface-hover disabled:opacity-40 transition-colors"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm text-text-secondary">{(filters.page ?? 0) + 1} / {result.totalPages}</span>
            <button disabled={(filters.page ?? 0) >= result.totalPages - 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 0) + 1 }))} className="p-2 rounded-xl border border-border text-text-muted hover:bg-surface-hover disabled:opacity-40 transition-colors"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
