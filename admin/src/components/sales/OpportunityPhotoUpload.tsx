import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useStorageUrls } from "@/lib/storage";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/context/ToastContext";
import { Camera, ImagePlus, X } from "lucide-react";
import type { SalesOpportunityFile } from "@/lib/sales-types";

export const PHOTO_CATEGORIES = [
  { value: "indoor_unit", label: "Sisäyksikön sijainti" },
  { value: "outdoor_unit", label: "Ulkoyksikön sijainti" },
  { value: "electrical", label: "Sähkösyöttö" },
  { value: "condensate", label: "Kondenssivesi" },
  { value: "other", label: "Muu" },
] as const;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(PHOTO_CATEGORIES.map((c) => [c.value, c.label]));

interface Props {
  opportunityId: string;
}

export default function OpportunityPhotoUpload({ opportunityId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingCategories, setPendingCategories] = useState<Record<number, string>>({});

  const { data: files = [] } = useQuery({
    queryKey: queryKeys.sales.opportunities.files(opportunityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_opportunity_files")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesOpportunityFile[];
    },
  });

  const images = files.filter((f) => /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));

  async function uploadFiles(fileList: File[], categories: Record<number, string>) {
    setUploading(true);
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const ext = file.name.split(".").pop() || "bin";
        const path = `${opportunityId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("sales-opportunity-files").upload(path, file, { upsert: true });
        if (uploadErr) {
          toast(`Lataus epäonnistui: ${uploadErr.message}`, "error");
          continue;
        }
        await supabase.from("sales_opportunity_files").insert({
          opportunity_id: opportunityId,
          filename: file.name,
          bucket: "sales-opportunity-files",
          path,
          file_type: "manual",
          photo_category: categories[i] || "other",
        });
      }
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.files(opportunityId) });
      toast("Kuvat ladattu");
    } catch {
      toast("Lataus epäonnistui", "error");
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    setPendingFiles(fileList);
    setPendingCategories(Object.fromEntries(fileList.map((_, i) => [i, "other"])));
    e.target.value = "";
  }

  function handleCameraCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    setPendingFiles(fileList);
    setPendingCategories(Object.fromEntries(fileList.map((_, i) => [i, "other"])));
    e.target.value = "";
  }

  const urls = useStorageUrls(files);

  async function updateCategory(fileId: string, category: string) {
    await supabase.from("sales_opportunity_files").update({ photo_category: category }).eq("id", fileId);
    qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.files(opportunityId) });
  }

  async function deleteFile(file: SalesOpportunityFile) {
    await supabase.storage.from(file.bucket).remove([file.path]);
    await supabase.from("sales_opportunity_files").delete().eq("id", file.id);
    qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.files(opportunityId) });
    toast("Kuva poistettu");
  }

  return (
    <div className="space-y-4">
      {/* Category picker modal — per-file selection */}
      {pendingFiles.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-6 w-[calc(100%-2rem)] sm:w-[400px] max-w-[400px] space-y-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-text-primary">Valitse kuvien tyypit</h3>
            <div className="space-y-3">
              {pendingFiles.map((file, idx) => {
                const previewUrl = URL.createObjectURL(file);
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <img src={previewUrl} alt={file.name} className="w-12 h-12 rounded-lg object-cover border border-border flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-text-muted truncate mb-1">{file.name}</p>
                      <select
                        value={pendingCategories[idx] || "other"}
                        onChange={(e) => setPendingCategories((prev) => ({ ...prev, [idx]: e.target.value }))}
                        className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-bg-secondary"
                      >
                        {PHOTO_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
            {pendingFiles.length > 1 && (
              <div className="pt-1 border-t border-border">
                <p className="text-[10px] text-text-muted mb-1.5">Aseta kaikille sama tyyppi:</p>
                <div className="flex flex-wrap gap-1">
                  {PHOTO_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setPendingCategories(Object.fromEntries(pendingFiles.map((_, i) => [i, cat.value])))}
                      className="px-2 py-1 rounded-lg text-[10px] font-medium bg-bg-secondary text-text-primary hover:bg-accent hover:text-white transition-colors"
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setPendingFiles([])} className="flex-1 px-4 py-2 rounded-xl text-sm font-medium border border-border text-text-muted hover:bg-bg-secondary">
                Peruuta
              </button>
              <button
                onClick={() => { uploadFiles(pendingFiles, pendingCategories); setPendingFiles([]); }}
                disabled={uploading}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {uploading ? "Ladataan..." : `Lataa ${pendingFiles.length > 1 ? `(${pendingFiles.length})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => cameraRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 disabled:opacity-50">
          <Camera className="w-3.5 h-3.5" /> Ota kuva
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 disabled:opacity-50">
          <ImagePlus className="w-3.5 h-3.5" /> Lisää kuva
        </button>
        {images.length > 0 && <span className="text-xs text-text-muted">{images.length} kuvaa</span>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleCameraCapture} className="hidden" />

      {/* Images grouped by category */}
      {images.length > 0 && (
        <div className="space-y-3">
          {PHOTO_CATEGORIES.map((cat) => {
            const catImages = images.filter((f) => f.photo_category === cat.value);
            if (catImages.length === 0) return null;
            return (
              <div key={cat.value}>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">{cat.label}</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {catImages.map((f) => (
                    <div key={f.id} className="relative group">
                      <a href={urls[f.id] || undefined} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-xl overflow-hidden border border-border hover:border-accent/30 transition-colors">
                        <img src={urls[f.id] || ""} alt={f.filename} className="w-full h-full object-cover" />
                      </a>
                      <button onClick={() => deleteFile(f)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">
                        <X className="w-3 h-3" />
                      </button>
                      <select
                        value={f.photo_category || "other"}
                        onChange={(e) => updateCategory(f.id, e.target.value)}
                        className="absolute bottom-1 left-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur rounded-lg text-[10px] px-1.5 py-1 border border-border"
                      >
                        {PHOTO_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {/* Uncategorized */}
          {(() => {
            const uncategorized = images.filter((f) => !f.photo_category || !CATEGORY_LABELS[f.photo_category]);
            if (uncategorized.length === 0) return null;
            return (
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Luokittelematon</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {uncategorized.map((f) => (
                    <div key={f.id} className="relative group">
                      <a href={urls[f.id] || undefined} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-xl overflow-hidden border border-border">
                        <img src={urls[f.id] || ""} alt={f.filename} className="w-full h-full object-cover" />
                      </a>
                      <button onClick={() => deleteFile(f)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">
                        <X className="w-3 h-3" />
                      </button>
                      <select
                        value={f.photo_category || ""}
                        onChange={(e) => updateCategory(f.id, e.target.value)}
                        className="absolute bottom-1 left-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur rounded-lg text-[10px] px-1.5 py-1 border border-border"
                      >
                        <option value="">Valitse tyyppi...</option>
                        {PHOTO_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
