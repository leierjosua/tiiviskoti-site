import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useStorageUrls } from "@/lib/storage";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { Camera, ImagePlus, X, FileText } from "lucide-react";
import type { SiteFile } from "@/lib/types";

const PHOTO_CATEGORIES = [
  { value: "indoor_unit", label: "Sisäyksikön sijainti" },
  { value: "outdoor_unit", label: "Ulkoyksikön sijainti" },
  { value: "electrical", label: "Sähkösyöttö" },
  { value: "condensate", label: "Kondenssivesi" },
  { value: "installation", label: "Asennus" },
  { value: "other", label: "Muu" },
] as const;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(PHOTO_CATEGORIES.map((c) => [c.value, c.label]));

interface Props {
  siteId?: string | null;
  bookingId: string;
}

export default function BookingFileUpload({ siteId, bookingId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingCategories, setPendingCategories] = useState<Record<number, string>>({});

  // Use site_files if site_id is available, otherwise fall back to booking_files
  const useSiteFiles = !!siteId;

  const { data: files = [] } = useQuery({
    queryKey: useSiteFiles ? ["site-files", siteId] : ["booking-files", bookingId],
    queryFn: async () => {
      if (useSiteFiles) {
        const { data, error } = await supabase
          .from("site_files")
          .select("*")
          .eq("site_id", siteId!)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data as SiteFile[];
      } else {
        const { data, error } = await supabase
          .from("booking_files")
          .select("*")
          .eq("booking_id", bookingId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data || []).map((f) => ({ ...f, site_id: "", booking_id: f.booking_id })) as SiteFile[];
      }
    },
  });

  const images = files.filter((f) => /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));
  const docs = files.filter((f) => !/\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f.filename));

  async function uploadFiles(fileList: File[], categories: Record<number, string>) {
    setUploading(true);
    try {
      const bucket = useSiteFiles ? "site-files" : "booking-files";
      const parentId = useSiteFiles ? siteId! : bookingId;

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const ext = file.name.split(".").pop() || "bin";
        const path = `${parentId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
        if (uploadErr) {
          toast(`Lataus epäonnistui: ${uploadErr.message}`, "error");
          continue;
        }
        const isImage = /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(file.name) || file.type.startsWith("image/");

        if (useSiteFiles) {
          await supabase.from("site_files").insert({
            site_id: siteId,
            booking_id: bookingId,
            filename: file.name,
            bucket,
            path,
            file_type: "manual",
            photo_category: isImage ? (categories[i] || "other") : null,
          });
        } else {
          await supabase.from("booking_files").insert({
            booking_id: bookingId,
            filename: file.name,
            bucket,
            path,
            file_type: "manual",
            photo_category: isImage ? (categories[i] || "other") : null,
          });
        }
      }
      qc.invalidateQueries({ queryKey: useSiteFiles ? ["site-files", siteId] : ["booking-files", bookingId] });
      toast("Tiedostot ladattu");
    } catch {
      toast("Lataus epäonnistui", "error");
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    const hasImages = fileList.some((f) => f.type.startsWith("image/"));
    if (hasImages) {
      setPendingFiles(fileList);
      setPendingCategories(Object.fromEntries(fileList.map((_, i) => [i, "other"])));
    } else {
      uploadFiles(fileList, {});
    }
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
    const table = useSiteFiles ? "site_files" : "booking_files";
    await supabase.from(table).update({ photo_category: category }).eq("id", fileId);
    qc.invalidateQueries({ queryKey: useSiteFiles ? ["site-files", siteId] : ["booking-files", bookingId] });
  }

  async function deleteFile(file: SiteFile) {
    const ok = await confirm({
      title: "Poista tiedosto",
      message: `Haluatko varmasti poistaa "${file.filename}"?`,
      confirmLabel: "Poista",
      variant: "danger",
    });
    if (!ok) return;
    await supabase.storage.from(file.bucket).remove([file.path]);
    const table = useSiteFiles ? "site_files" : "booking_files";
    await supabase.from(table).delete().eq("id", file.id);
    qc.invalidateQueries({ queryKey: useSiteFiles ? ["site-files", siteId] : ["booking-files", bookingId] });
    toast("Tiedosto poistettu");
  }

  return (
    <div className="space-y-4">
      {/* Category picker modal */}
      {pendingFiles.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-6 w-[calc(100%-2rem)] sm:w-[400px] max-w-[400px] space-y-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-text-primary">Valitse kuvien tyypit</h3>
            <div className="space-y-3">
              {pendingFiles.map((file, idx) => {
                const isImage = file.type.startsWith("image/");
                if (!isImage) return null;
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
          <ImagePlus className="w-3.5 h-3.5" /> Lisää tiedosto
        </button>
        {files.length > 0 && <span className="text-xs text-text-muted">{files.length} tiedostoa</span>}
      </div>
      <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx" multiple onChange={handleFileSelect} className="hidden" />
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
                        value=""
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

      {/* Documents */}
      {docs.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Dokumentit</p>
          <div className="space-y-1">
            {docs.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
                <a href={urls[f.id] || undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-accent hover:underline truncate">
                  <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                  {f.filename}
                </a>
                <button onClick={() => deleteFile(f)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
