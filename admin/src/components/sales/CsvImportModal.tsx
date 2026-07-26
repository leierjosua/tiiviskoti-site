import { useState, useCallback } from "react";
import { Upload, X, FileSpreadsheet, ArrowRight, Check, Tag, Plus } from "lucide-react";
import { inputCls, selectCls } from "@/lib/constants";
import { useSalesTags } from "@/hooks/sales/useSalesTags";

interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: Record<string, string>[], listName: string, importTag: string) => void;
  isPending?: boolean;
}

type Step = "upload" | "mapping" | "preview";

const REQUIRED_FIELDS = ["first_name", "phone"] as const;
const OPTIONAL_FIELDS = ["last_name", "company", "email", "address", "postcode", "city"] as const;
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as const;

const FIELD_LABELS: Record<string, string> = {
  first_name: "Etunimi",
  last_name: "Sukunimi",
  company: "Yritys",
  phone: "Puhelin",
  email: "Sähköposti",
  address: "Osoite",
  postcode: "Postinumero",
  city: "Kaupunki",
};

export function CsvImportModal({ open, onClose, onImport, isPending }: CsvImportModalProps) {
  const { data: allTags = [] } = useSalesTags();
  const importTags = allTags.filter((t) => t.tag_type === "import");

  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [listName, setListName] = useState("");
  const [importTag, setImportTag] = useState("");
  const [isNewTag, setIsNewTag] = useState(true);
  const [fileName, setFileName] = useState("");

  const reset = useCallback(() => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setListName("");
    setImportTag("");
    setIsNewTag(true);
    setFileName("");
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setListName(file.name.replace(/\.csv$/i, ""));

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return;

      // Detect delimiter
      const delimiter = lines[0].includes(";") ? ";" : ",";
      const headers = parseCsvLine(lines[0], delimiter);
      const rows = lines.slice(1).map((l) => parseCsvLine(l, delimiter));

      setCsvHeaders(headers);
      setCsvRows(rows);

      // Auto-map by fuzzy name matching
      const autoMap: Record<string, string> = {};
      const usedIndices = new Set<number>();
      for (const field of ALL_FIELDS) {
        const match = headers.findIndex((h, idx) => {
          if (usedIndices.has(idx)) return false;
          const lower = h.toLowerCase().trim();
          if (field === "first_name") return lower.includes("etunimi") || lower === "first_name" || lower === "first name";
          if (field === "last_name") return lower.includes("sukunimi") || lower === "last_name" || lower === "last name";
          if (field === "company") return lower.includes("yritys") || lower.includes("company") || lower.includes("firma") || lower.includes("yhtiö") || lower.includes("taloyhtiö");
          if (field === "phone") return lower.includes("puhelin") || lower.includes("phone") || lower.includes("gsm");
          if (field === "email") return lower.includes("email") || lower.includes("sähköposti");
          if (field === "address") return lower.includes("osoite") || lower.includes("address");
          if (field === "postcode") return lower.includes("postinumero") || lower.includes("zip") || lower.includes("postal");
          if (field === "city") return lower.includes("kaupunki") || lower.includes("city") || lower.includes("paikkakunta");
          return false;
        });
        if (match >= 0) {
          autoMap[field] = headers[match];
          usedIndices.add(match);
        }
      }
      // Fallback: if no first_name match but there's a generic "nimi"/"name" column, use it as first_name
      if (!autoMap.first_name) {
        const nameIdx = headers.findIndex((h) => {
          const lower = h.toLowerCase().trim();
          return (lower.includes("nimi") || lower === "name") && !lower.includes("markkinointi") && !lower.includes("virallinen");
        });
        if (nameIdx >= 0) autoMap.first_name = headers[nameIdx];
      }
      setMapping(autoMap);
      setStep("mapping");
    };
    reader.readAsText(file);
  }

  function handleConfirmMapping() {
    setStep("preview");
  }

  function handleImport() {
    const mapped = csvRows.map((row) => {
      const obj: Record<string, string> = {};
      for (const field of ALL_FIELDS) {
        const headerName = mapping[field];
        if (headerName) {
          const idx = csvHeaders.indexOf(headerName);
          if (idx >= 0 && row[idx]) obj[field] = row[idx].trim();
        }
      }
      // Combine first_name + last_name into name
      const name = [obj.first_name, obj.last_name].filter(Boolean).join(" ");
      if (name) obj.name = name;
      // Keep company as-is (passed through to import handler)
      return obj;
    }).filter((r) => r.name || r.phone);

    onImport(mapped, listName, importTag.trim());
    handleClose();
  }

  const mappedCount = csvRows.filter((row) => {
    const firstNameIdx = mapping.first_name ? csvHeaders.indexOf(mapping.first_name) : -1;
    const phoneIdx = mapping.phone ? csvHeaders.indexOf(mapping.phone) : -1;
    return (firstNameIdx >= 0 && row[firstNameIdx]?.trim()) || (phoneIdx >= 0 && row[phoneIdx]?.trim());
  }).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-3 sm:mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-accent" />
            <h2 className="text-sm font-semibold">CSV-tuonti</h2>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === "upload" && (
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors">
                <Upload className="w-8 h-8 text-text-muted" />
                <div className="text-center">
                  <p className="text-sm font-medium">Pudota CSV-tiedosto tai klikkaa</p>
                  <p className="text-xs text-text-muted mt-1">Tuetut: .csv (pilkku- tai puolipisteerottelu)</p>
                </div>
                <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
              </label>
            </div>
          )}

          {step === "mapping" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Listan nimi</label>
                  <input value={listName} onChange={(e) => setListName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Tuontitagi</span>
                  </label>
                  {isNewTag ? (
                    <div className="flex gap-1.5">
                      <input
                        value={importTag}
                        onChange={(e) => setImportTag(e.target.value)}
                        placeholder="esim. Eläkeläiset, Hallituksen pj..."
                        className={`${inputCls} flex-1`}
                      />
                      {importTags.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setIsNewTag(false); setImportTag(""); }}
                          className="px-2 py-1 text-[10px] font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/5 whitespace-nowrap"
                        >
                          Valitse oleva
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <select
                        value={importTag}
                        onChange={(e) => setImportTag(e.target.value)}
                        className={`${selectCls} flex-1`}
                      >
                        <option value="">– Valitse tuontitagi –</option>
                        {importTags.map((t) => (
                          <option key={t.name} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => { setIsNewTag(true); setImportTag(""); }}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/5 whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3" /> Uusi
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-text-muted mt-1">Myyjä voi suodattaa liidejä tämän tagin perusteella</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Sarakkeiden yhdistäminen</p>
                <div className="space-y-2">
                  {ALL_FIELDS.map((field) => (
                    <div key={field} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                      <span className="text-xs font-medium sm:w-24">
                        {FIELD_LABELS[field]}
                        {REQUIRED_FIELDS.includes(field as typeof REQUIRED_FIELDS[number]) && (
                          <span className="text-red-500 ml-0.5">*</span>
                        )}
                      </span>
                      <ArrowRight className="w-3 h-3 text-text-muted hidden sm:block" />
                      <select
                        value={mapping[field] || ""}
                        onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                        className={`${selectCls} flex-1`}
                      >
                        <option value="">– Ohita –</option>
                        {csvHeaders.map((h, i) => (
                          <option key={`${i}-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-text-muted">
                Tiedosto: {fileName} ({csvRows.length} riviä)
              </p>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3">
              <div className="text-sm">
                <p><strong>{listName}</strong></p>
                {importTag && (
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-accent/10 text-accent border border-accent/20">
                    <Tag className="w-3 h-3" /> {importTag}
                  </span>
                )}
                <p className="text-text-muted text-xs mt-1">{mappedCount} liidiä tuodaan ({csvRows.length} riviä yhteensä)</p>
              </div>

              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      {(mapping.first_name || mapping.last_name) && (
                        <th className="px-3 py-2 text-left font-semibold text-text-muted">Nimi</th>
                      )}
                      {ALL_FIELDS.filter((f) => f !== "first_name" && f !== "last_name" && mapping[f]).map((f) => (
                        <th key={f} className="px-3 py-2 text-left font-semibold text-text-muted">{FIELD_LABELS[f]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 10).map((row, i) => {
                      const fnIdx = mapping.first_name ? csvHeaders.indexOf(mapping.first_name) : -1;
                      const lnIdx = mapping.last_name ? csvHeaders.indexOf(mapping.last_name) : -1;
                      const fullName = [fnIdx >= 0 ? row[fnIdx] : "", lnIdx >= 0 ? row[lnIdx] : ""].filter(Boolean).join(" ");
                      return (
                        <tr key={i} className="border-t border-border">
                          {(mapping.first_name || mapping.last_name) && (
                            <td className="px-3 py-1.5 font-medium">{fullName}</td>
                          )}
                          {ALL_FIELDS.filter((f) => f !== "first_name" && f !== "last_name" && mapping[f]).map((f) => {
                            const idx = csvHeaders.indexOf(mapping[f]);
                            return <td key={f} className="px-3 py-1.5">{idx >= 0 ? row[idx] : ""}</td>;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {csvRows.length > 10 && (
                  <p className="px-3 py-2 text-[11px] text-text-muted border-t border-border">
                    ...ja {csvRows.length - 10} muuta
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-border">
          {step === "mapping" && (
            <button onClick={() => setStep("upload")} className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text">
              Takaisin
            </button>
          )}
          {step === "preview" && (
            <button onClick={() => setStep("mapping")} className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text">
              Takaisin
            </button>
          )}
          <button onClick={handleClose} className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text">
            Peruuta
          </button>
          {step === "mapping" && (
            <button
              onClick={handleConfirmMapping}
              disabled={!mapping.first_name && !mapping.phone}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 disabled:opacity-50"
            >
              Esikatselu <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          {step === "preview" && (
            <button
              onClick={handleImport}
              disabled={isPending || mappedCount === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" /> Tuo {mappedCount} liidiä
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
