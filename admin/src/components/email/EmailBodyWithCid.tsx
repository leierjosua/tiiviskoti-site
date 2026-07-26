import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, getFreshToken } from "@/lib/supabase";
import DOMPurify from "dompurify";

/**
 * Strip quoted/replied content from an email HTML body.
 * Gmail wraps quoted text in <div class="gmail_quote">,
 * Outlook uses <div id="appendonsend"> or <!-- Original Message -->,
 * and generic clients use <blockquote>.
 */
function stripQuotedContent(html: string): { stripped: string; hadQuote: boolean } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const selectors = [
    ".gmail_quote",
    ".gmail_extra",
    "#appendonsend",
    // Yahoo
    ".yahoo_quoted",
  ];

  let removed = false;
  for (const sel of selectors) {
    doc.querySelectorAll(sel).forEach((el) => { el.remove(); removed = true; });
  }

  // Also remove standalone <blockquote> that looks like a reply quote
  doc.querySelectorAll("blockquote[type='cite'], blockquote.cite").forEach((el) => {
    el.remove();
    removed = true;
  });

  // Remove "On ... wrote:" / "... kirjoitti:" lines right before removed quotes
  if (removed) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const toRemove: Node[] = [];
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent || "";
      // "On <date> <name> wrote:" or Finnish "kirjoitti:"
      if (/^\s*(On .+ wrote:|.+ kirjoitti:)\s*$/i.test(text)) {
        toRemove.push(walker.currentNode.parentElement || walker.currentNode);
      }
    }
    toRemove.forEach((n) => n.parentElement?.removeChild(n));
  }

  return { stripped: doc.body.innerHTML, hadQuote: removed };
}

export default function EmailBodyWithCid({ bodyHtml, emailId, gmailMessageId, senderEmail, className, isInThread }: {
  bodyHtml: string;
  emailId: string;
  gmailMessageId: string;
  senderEmail: string;
  className?: string;
  /** When true, strip quoted reply content to avoid repetition in thread view */
  isInThread?: boolean;
}) {
  const { data: cidAttachments } = useQuery({
    queryKey: ["email-attachments-cid", emailId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_email_attachments")
        .select("gmail_attachment_id, content_id, filename, mime_type")
        .eq("email_id", emailId)
        .not("content_id", "is", null);
      return data || [];
    },
  });

  const [accessToken, setAccessToken] = useState("");
  useEffect(() => { getFreshToken().then(setAccessToken).catch(() => {}); }, []);

  const resolvedHtml = useMemo(() => {
    let html = bodyHtml;
    if (cidAttachments && cidAttachments.length > 0 && accessToken) {
      const base = import.meta.env.VITE_SUPABASE_URL;
      for (const att of cidAttachments) {
        const url = `${base}/functions/v1/get-email-attachment?message_id=${gmailMessageId}&attachment_id=${att.gmail_attachment_id}&filename=${encodeURIComponent(att.filename)}&mime_type=${encodeURIComponent(att.mime_type)}&sender_email=${encodeURIComponent(senderEmail)}&token=${accessToken}`;
        html = html.replace(new RegExp(`cid:${att.content_id!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), url);
      }
    }
    // Strip any remaining unresolved cid: images
    html = html.replace(/<img[^>]+src=["']cid:[^"']*["'][^>]*>/gi, "");

    // In thread view, strip quoted content to avoid showing the same text repeatedly
    if (isInThread) {
      const { stripped } = stripQuotedContent(html);
      html = stripped;
    }

    return DOMPurify.sanitize(html);
  }, [bodyHtml, cidAttachments, accessToken, gmailMessageId, senderEmail, isInThread]);

  return (
    <div
      className={className || "prose prose-sm max-w-none text-xs [&_p]:my-0.5"}
      dangerouslySetInnerHTML={{ __html: resolvedHtml }}
    />
  );
}
