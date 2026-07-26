import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, getFreshToken } from "@/lib/supabase";
import { Paperclip, X } from "lucide-react";
import { formatFileSize } from "./email-utils";

export default function MessageAttachments({ emailId, gmailMessageId, senderEmail, bodyHtml }: {
  emailId: string;
  gmailMessageId: string;
  senderEmail: string;
  bodyHtml?: string | null;
}) {
  const { data: allAttachments = [] } = useQuery({
    queryKey: ["email-attachments", emailId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_email_attachments")
        .select("*")
        .eq("email_id", emailId);
      return data || [];
    },
  });

  // Hide only attachments that are actually referenced inline from the HTML
  // (cid:<content_id>), plus the known signature/logo heuristic for small images.
  // Gmail assigns "f_xxx" Content-IDs to ordinary MIME parts too, so content_id
  // alone is not a reliable "inline" signal.
  const attachments = allAttachments.filter((att: { content_id: string | null; filename: string; mime_type: string; size_bytes: number }) => {
    if (att.content_id && bodyHtml && bodyHtml.includes(`cid:${att.content_id}`)) return false;
    if (att.mime_type.startsWith("image/") && att.size_bytes < 50_000) {
      if (/^image\d{3}\./i.test(att.filename)) return false;
      if (/signature|logo/i.test(att.filename)) return false;
    }
    return true;
  });

  const [previewAtt, setPreviewAtt] = useState<{ url: string; filename: string; mimeType: string } | null>(null);
  const [accessToken, setAccessToken] = useState("");

  useEffect(() => {
    getFreshToken().then(setAccessToken).catch(() => setAccessToken(""));
  }, []);

  if (attachments.length === 0) return null;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  function getAttUrl(att: { gmail_attachment_id: string; filename: string; mime_type: string }) {
    const base = `${supabaseUrl}/functions/v1/get-email-attachment?message_id=${gmailMessageId}&attachment_id=${att.gmail_attachment_id}&filename=${encodeURIComponent(att.filename)}&mime_type=${encodeURIComponent(att.mime_type)}&sender_email=${encodeURIComponent(senderEmail)}`;
    return accessToken ? `${base}&token=${accessToken}` : base;
  }

  function isPreviewable(mimeType: string): boolean {
    return mimeType.startsWith("image/") || mimeType === "application/pdf";
  }

  return (
    <div className="px-4 py-2 border-t border-border">
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
        Liitteet ({attachments.length})
      </p>

      {/* Inline image previews */}
      {attachments.filter((att: { mime_type: string }) => att.mime_type.startsWith("image/")).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments
            .filter((att: { mime_type: string }) => att.mime_type.startsWith("image/"))
            .map((att: { id: string; gmail_attachment_id: string; filename: string; mime_type: string; size_bytes: number }) => (
              <button type="button"
                key={att.id}
                onClick={() => setPreviewAtt({ url: getAttUrl(att), filename: att.filename, mimeType: att.mime_type })}
                className="rounded-lg border border-border overflow-hidden hover:border-accent/50 transition-colors"
              >
                <img
                  src={getAttUrl(att)}
                  alt={att.filename}
                  className="max-h-24 max-w-[200px] object-contain"
                />
              </button>
            ))}
        </div>
      )}

      {/* File list */}
      <div className="flex flex-wrap gap-2">
        {attachments.map((att: { id: string; gmail_attachment_id: string; filename: string; mime_type: string; size_bytes: number }) => (
          <div key={att.id} className="flex items-center gap-1">
            <button type="button"
              onClick={() => {
                if (isPreviewable(att.mime_type)) {
                  setPreviewAtt({ url: getAttUrl(att), filename: att.filename, mimeType: att.mime_type });
                } else {
                  window.open(getAttUrl(att), "_blank");
                }
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-bg-secondary text-xs transition-colors"
            >
              <Paperclip className="w-3.5 h-3.5 text-text-muted" />
              <span className="font-medium truncate max-w-[200px]">{att.filename}</span>
              <span className="text-text-muted">{formatFileSize(att.size_bytes)}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Preview modal */}
      {previewAtt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPreviewAtt(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl max-h-[90vh] w-full mx-4 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold truncate">{previewAtt.filename}</span>
              <div className="flex items-center gap-2">
                <a
                  href={previewAtt.url}
                  download={previewAtt.filename}
                  className="text-xs text-accent hover:text-accent/80 font-medium"
                >
                  Lataa
                </a>
                <button type="button" onClick={() => setPreviewAtt(null)} className="text-text-muted hover:text-text-primary">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-gray-50">
              {previewAtt.mimeType.startsWith("image/") ? (
                <img src={previewAtt.url} alt={previewAtt.filename} className="max-w-full max-h-[70vh] object-contain" />
              ) : previewAtt.mimeType === "application/pdf" ? (
                <iframe src={previewAtt.url} className="w-full h-[70vh] border-0 rounded-lg" title={previewAtt.filename} />
              ) : (
                <p className="text-sm text-text-muted">Esikatselua ei tueta tälle tiedostotyypille</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
