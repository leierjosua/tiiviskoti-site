import { useState, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { ConditionRow } from "./ConditionRow";
import { useCompanyEmailTemplates } from "@/hooks/sales/useSalesEmails";
import type {
  FormAutomation,
  AutomationCondition,
  AutomationActionType,
  ContactFormField,
} from "@/lib/types";
import { COMPANY_EMAIL } from "@/lib/email-styles";

interface AutomationEditorProps {
  automation?: FormAutomation | null;
  formId: string;
  fields: ContactFormField[];
  onSave: (data: Omit<FormAutomation, "id" | "created_at" | "updated_at">) => void;
  onClose: () => void;
  saving?: boolean;
}

const EMPTY_CONDITION: AutomationCondition = { field: "", operator: "equals", value: "" };

const SENDER_OPTIONS = [
  { value: COMPANY_EMAIL, label: `${COMPANY_EMAIL} (oletus)` },
  { value: "{{assigned_seller_email}}", label: "Allokoitu myyjä (automaattinen)" },
  { value: "custom", label: "Muu osoite..." },
];

export function AutomationEditor({ automation, formId, fields, onSave, onClose, saving }: AutomationEditorProps) {
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [conditions, setConditions] = useState<AutomationCondition[]>([{ ...EMPTY_CONDITION }]);
  const [actionType, setActionType] = useState<AutomationActionType>("send_email_template");
  const [templateId, setTemplateId] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("{{customer_email}}");
  const [rawSubject, setRawSubject] = useState("");
  const [rawBody, setRawBody] = useState("");
  const [channel, setChannel] = useState("form");
  const [senderEmail, setSenderEmail] = useState(COMPANY_EMAIL);
  const [senderName, setSenderName] = useState("Lasikiilto");
  const [senderMode, setSenderMode] = useState<"preset" | "custom">("preset");
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [delayUnit, setDelayUnit] = useState<"min" | "h">("min");

  const { data: templates } = useCompanyEmailTemplates();

  // Populate form if editing
  useEffect(() => {
    if (!automation) return;
    setName(automation.name);
    setIsActive(automation.is_active);
    setConditions(automation.conditions.length > 0 ? automation.conditions : [{ ...EMPTY_CONDITION }]);
    setActionType(automation.action_type);
    setTemplateId((automation.action_config.template_id as string) || "");
    setRecipientEmail((automation.action_config.to as string) || "{{customer_email}}");
    setRawSubject((automation.action_config.subject as string) || "");
    setRawBody((automation.action_config.body_html as string) || "");
    setChannel((automation.action_config.channel as string) || "form");
    setSenderName((automation.action_config.sender_name as string) || "Lasikiilto");

    const configSender = (automation.action_config.sender_email as string) || COMPANY_EMAIL;
    const isPreset = SENDER_OPTIONS.some((o) => o.value === configSender);
    if (isPreset) {
      setSenderEmail(configSender);
      setSenderMode("preset");
    } else {
      setSenderEmail(configSender);
      setSenderMode("custom");
    }

    const mins = automation.delay_minutes;
    if (mins >= 60 && mins % 60 === 0) {
      setDelayMinutes(mins / 60);
      setDelayUnit("h");
    } else {
      setDelayMinutes(mins);
      setDelayUnit("min");
    }
  }, [automation]);

  function handleSave() {
    const actualDelay = delayUnit === "h" ? delayMinutes * 60 : delayMinutes;
    const validConditions = conditions.filter((c) => c.field);

    const actionConfig: Record<string, unknown> = {};
    if (actionType === "send_email_template") {
      actionConfig.to = recipientEmail;
      actionConfig.template_id = templateId;
      actionConfig.sender_email = senderEmail;
      actionConfig.sender_name = senderName;
    } else if (actionType === "send_raw_email") {
      actionConfig.to = recipientEmail;
      actionConfig.subject = rawSubject;
      actionConfig.body_html = rawBody;
      actionConfig.sender_email = senderEmail;
      actionConfig.sender_name = senderName;
    } else if (actionType === "create_opportunity") {
      actionConfig.channel = channel;
    }

    onSave({
      form_id: formId,
      name,
      is_active: isActive,
      priority: automation?.priority ?? 0,
      conditions: validConditions,
      action_type: actionType,
      action_config: actionConfig,
      delay_minutes: actualDelay,
    });
  }

  function updateCondition(index: number, updated: AutomationCondition) {
    setConditions((prev) => prev.map((c, i) => (i === index ? updated : c)));
  }

  function removeCondition(index: number) {
    setConditions((prev) => (prev.length === 1 ? [{ ...EMPTY_CONDITION }] : prev.filter((_, i) => i !== index)));
  }

  const hasValidRecipient =
    actionType === "create_opportunity" ||
    (recipientEmail.includes("{{") || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail));
  const hasValidAction =
    actionType === "create_opportunity" ||
    (actionType === "send_email_template" && !!templateId) ||
    (actionType === "send_raw_email" && !!rawSubject.trim());

  const canSave = !!name.trim() && hasValidAction && hasValidRecipient;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[100vw] sm:max-w-lg h-full bg-surface border-l border-border overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-lg text-text-primary">
            {automation ? "Muokkaa automaatiota" : "Uusi automaatio"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
              Nimi
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Esim. "Viilennys → Tarjous-sähköposti"'
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
            />
          </div>

          {/* Conditions */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
              Ehdot (kaikki pitää täyttyä)
            </label>
            <div className="space-y-2">
              {conditions.map((cond, i) => (
                <ConditionRow
                  key={i}
                  condition={cond}
                  fields={fields}
                  onChange={(updated) => updateCondition(i, updated)}
                  onRemove={() => removeCondition(i)}
                />
              ))}
            </div>
            <button
              onClick={() => setConditions((prev) => [...prev, { ...EMPTY_CONDITION }])}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand/80 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Lisää ehto
            </button>
          </div>

          {/* Action type */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
              Toiminto
            </label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as AutomationActionType)}
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
            >
              <option value="send_email_template">Lähetä sähköpostipohja</option>
              <option value="send_raw_email">Lähetä mukautettu sähköposti</option>
              <option value="create_opportunity">Luo myyntimahdollisuus</option>
            </select>
          </div>

          {/* Opportunity config */}
          {actionType === "create_opportunity" && (
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
              <p className="text-xs text-blue-700 font-medium">
                Luo myyntimahdollisuus (opportunity) ja allokoi myyjälle automaattisesti inbound-jaon mukaan.
                Myyjä saa ilmoitussähköpostin.
              </p>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                  Kanava
                </label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
                >
                  <option value="form">Lomake</option>
                  <option value="chat">Chat</option>
                  <option value="phone">Puhelin</option>
                  <option value="email">Sähköposti</option>
                </select>
              </div>
            </div>
          )}

          {/* Template picker */}
          {actionType === "send_email_template" && (
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                Sähköpostipohja
              </label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
              >
                <option value="">Valitse pohja...</option>
                {templates?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Raw email fields */}
          {actionType === "send_raw_email" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                  Aihe
                </label>
                <input
                  type="text"
                  value={rawSubject}
                  onChange={(e) => setRawSubject(e.target.value)}
                  placeholder="Sähköpostin aihe (tukee muuttujia)"
                  className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                  Sisältö (HTML)
                </label>
                <textarea
                  value={rawBody}
                  onChange={(e) => setRawBody(e.target.value)}
                  rows={6}
                  placeholder="<p>Hei {{customer_name}},</p>"
                  className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm font-mono"
                />
              </div>
            </>
          )}

          {/* Sender & Recipient (email actions only) */}
          {(actionType === "send_email_template" || actionType === "send_raw_email") && (
            <>
              {/* Sender email */}
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                  Lähettäjä
                </label>
                <select
                  value={senderMode === "custom" ? "custom" : senderEmail}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "custom") {
                      setSenderMode("custom");
                      setSenderEmail("");
                      setSenderName("");
                    } else {
                      setSenderMode("preset");
                      setSenderEmail(val);
                      // Auto-set sender name based on selection
                      if (val === "{{assigned_seller_email}}") {
                        setSenderName("{{assigned_seller_name}}");
                      } else {
                        setSenderName("Lasikiilto");
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
                >
                  {SENDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {senderMode === "custom" && (
                  <input
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="myynti@lasikiilto.fi"
                    className="w-full mt-2 px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
                  />
                )}
                <p className="text-[11px] text-text-muted mt-1">
                  Sähköposti lähetetään tästä osoitteesta Gmail-impersonoinnin kautta.
                </p>
              </div>

              {/* Sender name — hidden when using assigned seller (auto-resolved) */}
              {senderEmail !== "{{assigned_seller_email}}" && (
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                  Lähettäjän nimi
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Lasikiilto"
                  className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
                />
              </div>
              )}

              {/* Recipient */}
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                  Vastaanottaja
                </label>
                <input
                  type="text"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="{{customer_email}}"
                  className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
                />
                <p className="text-[11px] text-text-muted mt-1">
                  Muuttujat: {"{{customer_email}}"}, {"{{customer_name}}"}, {"{{assigned_seller_email}}"}, {"{{assigned_seller_name}}"}, {"{{field:kenttä}}"}
                </p>
              </div>
            </>
          )}

          {/* Delay */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
              Viive
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-24 px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
              />
              <select
                value={delayUnit}
                onChange={(e) => setDelayUnit(e.target.value as "min" | "h")}
                className="px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm"
              >
                <option value="min">minuuttia</option>
                <option value="h">tuntia</option>
              </select>
              {delayMinutes === 0 && delayUnit === "min" && (
                <span className="text-xs text-text-muted">= lähetetään heti</span>
              )}
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text-primary">Aktiivinen</label>
            <button
              onClick={() => setIsActive(!isActive)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isActive ? "bg-green-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  isActive ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-surface border-t border-border px-5 py-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Tallennetaan..." : automation ? "Tallenna" : "Luo automaatio"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            Peruuta
          </button>
        </div>
      </div>
    </div>
  );
}
