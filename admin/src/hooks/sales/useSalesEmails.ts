import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SalesEmail, EmailThread, EmailMailbox, GmailLabel, SalesEmailTemplate } from "@/lib/sales-types";
import { generateDefaultSignatureHtml, formatEmailHtml, COMPANY_EMAIL, COMPANY_EMAILS } from "@/lib/email-styles";
import { queryKeys } from "@/lib/queryKeys";

const qk = queryKeys.sales.email;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function groupIntoThreads(emails: SalesEmail[]): EmailThread[] {
  const map = new Map<string, SalesEmail[]>();
  for (const e of emails) {
    const existing = map.get(e.gmail_thread_id) || [];
    existing.push(e);
    map.set(e.gmail_thread_id, existing);
  }

  const threads: EmailThread[] = [];
  for (const [threadId, messages] of map) {
    messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const latest = messages[messages.length - 1];
    const first = messages[0];
    const allParticipants = new Set<string>();
    messages.forEach((m) => {
      allParticipants.add(m.from_address);
      m.to_addresses.forEach((a) => allParticipants.add(a));
    });
    COMPANY_EMAILS.forEach((e) => allParticipants.delete(e));

    threads.push({
      thread_id: threadId,
      subject: first.subject,
      snippet: latest.snippet,
      last_date: latest.date,
      message_count: messages.length,
      is_starred: messages.some((m) => m.is_starred),
      is_read: messages.every((m) => m.is_read),
      has_attachments: messages.some((m) => m.has_attachments),
      participants: [...allParticipants],
      messages,
    });
  }

  threads.sort((a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime());
  return threads;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useGmailLabels(userEmail?: string) {
  return useQuery({
    queryKey: qk.labels(userEmail),
    enabled: !!userEmail,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gmail_labels")
        .select("*")
        .eq("email_address", userEmail!)
        .eq("type", "user")
        .order("name");
      if (error) throw error;
      return (data || []) as GmailLabel[];
    },
  });
}

export function useEmailThreads(mailbox: EmailMailbox, userEmail?: string, labelId?: string) {
  return useQuery({
    queryKey: qk.threads(mailbox, userEmail, labelId),
    enabled: !!userEmail,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const email = userEmail!.toLowerCase();

      let query = supabase
        .from("sales_emails")
        .select("*")
        .order("date", { ascending: false })
        .limit(500);

      switch (mailbox) {
        case "inbox":
          // Must have INBOX label — this is the Gmail source of truth.
          // Only show emails addressed TO the company inbox, not emails
          // sent FROM the company (those belong in "Sent").
          query = query
            .contains("labels", ["INBOX"])
            .eq("is_trashed", false)
            .or(`to_addresses.cs.{${email}},cc_addresses.cs.{${email}}`);
          break;
        case "sent":
          query = query
            .contains("labels", ["SENT"])
            .eq("is_trashed", false)
            .eq("from_address", email);
          break;
        case "drafts":
          query = query.eq("is_draft", true).eq("is_trashed", false);
          break;
        case "archive":
          // Archived = no INBOX, no TRASH, not draft. Must involve user.
          query = query
            .eq("is_archived", true).eq("is_trashed", false)
            .or(`from_address.eq.${email},to_addresses.cs.{${email}},cc_addresses.cs.{${email}}`);
          break;
        case "trash":
          query = query.eq("is_trashed", true)
            .or(`from_address.eq.${email},to_addresses.cs.{${email}},cc_addresses.cs.{${email}}`);
          break;
        case "starred":
          query = query.eq("is_starred", true).eq("is_trashed", false)
            .or(`from_address.eq.${email},to_addresses.cs.{${email}},cc_addresses.cs.{${email}}`);
          break;
        case "label":
          if (labelId) {
            query = query.eq("is_trashed", false).contains("labels", [labelId])
              .or(`from_address.eq.${email},to_addresses.cs.{${email}},cc_addresses.cs.{${email}}`);
          }
          break;
      }

      const { data, error } = await query;
      if (error) throw error;
      return groupIntoThreads((data || []) as SalesEmail[]);
    },
  });
}

export function useEmailThread(threadId: string | undefined) {
  return useQuery({
    queryKey: qk.thread(threadId),
    enabled: !!threadId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_emails")
        .select("*")
        .eq("gmail_thread_id", threadId!)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as SalesEmail[];
    },
  });
}

export function useEmailsByOpportunity(oppId: string | undefined, customerEmail?: string) {
  return useQuery({
    queryKey: qk.byOpportunity(oppId),
    enabled: !!oppId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      // Query by opportunity_id
      // Exclude drafts and trashed — Gmail draft autosaves create many
      // short-lived message IDs (each keystroke batch = new id, old one
      // deleted). Without this filter, the thread shows every autosave
      // version as a separate "Lähetetty" message.
      const { data: linkedEmails, error: err1 } = await supabase
        .from("sales_emails")
        .select("*")
        .eq("opportunity_id", oppId!)
        .eq("is_draft", false)
        .eq("is_trashed", false)
        .order("date", { ascending: false });
      if (err1) throw err1;

      // Also query by customer email address to catch unlinked emails
      let unlinkedEmails: SalesEmail[] = [];
      if (customerEmail) {
        const email = customerEmail.toLowerCase();
        const { data, error: err2 } = await supabase
          .from("sales_emails")
          .select("*")
          .is("opportunity_id", null)
          .eq("is_draft", false)
          .eq("is_trashed", false)
          .or(`from_address.eq.${email},to_addresses.cs.{${email}}`)
          .order("date", { ascending: false })
          .limit(200);
        if (err2) throw err2;
        unlinkedEmails = (data || []) as SalesEmail[];

        // Auto-link unlinked emails to this opportunity
        if (unlinkedEmails.length > 0) {
          const ids = unlinkedEmails.map((e) => e.id);
          await supabase
            .from("sales_emails")
            .update({ opportunity_id: oppId! })
            .in("id", ids);
          unlinkedEmails.forEach((e) => { e.opportunity_id = oppId!; });
        }
      }

      // Merge and deduplicate
      const allEmails = [...(linkedEmails || []) as SalesEmail[], ...unlinkedEmails];
      const seen = new Set<string>();
      const unique = allEmails.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });

      return groupIntoThreads(unique);
    },
  });
}

export function useEmailSearch(query: string) {
  return useQuery({
    queryKey: qk.search(query),
    enabled: query.length >= 2,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_emails")
        .select("*")
        .eq("is_trashed", false)
        .or(`subject.ilike.%${query}%,from_address.ilike.%${query}%,snippet.ilike.%${query}%`)
        .order("date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return groupIntoThreads((data || []) as SalesEmail[]);
    },
  });
}

export function useUnreadEmailCount() {
  return useQuery({
    queryKey: qk.unreadCount,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales_emails")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false)
        .eq("is_trashed", false)
        .contains("labels", ["INBOX"]);
      if (error) throw error;
      return count || 0;
    },
    staleTime: 15 * 1000,
    refetchInterval: 30000, // Poll every 30s
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

async function modifyGmailLabel(emailId: string, action: string) {
  const { data: email } = await supabase
    .from("sales_emails")
    .select("gmail_message_id, from_address, to_addresses, is_inbound")
    .eq("id", emailId)
    .single();
  if (!email) throw new Error("Email not found");

  const senderEmail = email.is_inbound
    ? (email.to_addresses?.[0] || COMPANY_EMAIL)
    : email.from_address;

  await supabase.functions.invoke("modify-gmail-labels", {
    body: {
      gmail_message_id: email.gmail_message_id,
      sender_email: senderEmail,
      action,
    },
  });
}

function invalidateEmailQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["email-threads"] });
  qc.invalidateQueries({ queryKey: ["email-unread-count"] });
}

export function useStarEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, starred }: { id: string; starred: boolean }) => {
      await modifyGmailLabel(id, starred ? "star" : "unstar");
    },
    onSuccess: () => invalidateEmailQueries(qc),
  });
}

export function useArchiveEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await modifyGmailLabel(id, "archive");
    },
    onSuccess: () => invalidateEmailQueries(qc),
  });
}

export function useTrashEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await modifyGmailLabel(id, "trash");
    },
    onSuccess: () => invalidateEmailQueries(qc),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
      await modifyGmailLabel(id, read ? "read" : "unread");
    },
    onSuccess: () => invalidateEmailQueries(qc),
  });
}

export function useArchiveThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      // Get sender email from any message in the thread
      const { data: sample } = await supabase
        .from("sales_emails")
        .select("from_address, to_addresses, is_inbound")
        .eq("gmail_thread_id", threadId)
        .limit(1)
        .single();
      if (!sample) return;
      const senderEmail = sample.is_inbound
        ? (sample.to_addresses?.[0] || COMPANY_EMAIL)
        : sample.from_address;
      // Use thread-level Gmail API for atomic archive
      await supabase.functions.invoke("modify-gmail-labels", {
        body: { gmail_thread_id: threadId, sender_email: senderEmail, action: "archive_thread" },
      });
    },
    onSuccess: () => invalidateEmailQueries(qc),
  });
}

export function useTrashThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      const { data: sample } = await supabase
        .from("sales_emails")
        .select("from_address, to_addresses, is_inbound")
        .eq("gmail_thread_id", threadId)
        .limit(1)
        .single();
      if (!sample) return;
      const senderEmail = sample.is_inbound
        ? (sample.to_addresses?.[0] || COMPANY_EMAIL)
        : sample.from_address;
      await supabase.functions.invoke("modify-gmail-labels", {
        body: { gmail_thread_id: threadId, sender_email: senderEmail, action: "trash_thread" },
      });
    },
    onSuccess: () => invalidateEmailQueries(qc),
  });
}

export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ senderEmail, name, color, parentLabelId }: {
      senderEmail: string;
      name: string;
      color?: { text: string; background: string };
      parentLabelId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("modify-gmail-labels", {
        body: { sender_email: senderEmail, action: "create_label", label_name: name, label_color: color, parent_label_id: parentLabelId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gmail-labels"] }),
  });
}

export function useUpdateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ senderEmail, labelId, name, color }: {
      senderEmail: string;
      labelId: string;
      name?: string;
      color?: { text: string; background: string };
    }) => {
      const { data, error } = await supabase.functions.invoke("modify-gmail-labels", {
        body: { sender_email: senderEmail, action: "update_label", label_id: labelId, label_name: name, label_color: color },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gmail-labels"] }),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ senderEmail, labelId }: { senderEmail: string; labelId: string }) => {
      const { data, error } = await supabase.functions.invoke("modify-gmail-labels", {
        body: { sender_email: senderEmail, action: "delete_label", label_id: labelId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gmail-labels"] }),
  });
}

export function useModifyLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ emailId, action, labelId }: { emailId: string; action: "add_label" | "remove_label"; labelId: string }) => {
      const { data: email } = await supabase
        .from("sales_emails")
        .select("gmail_message_id, from_address, to_addresses, is_inbound")
        .eq("id", emailId)
        .single();
      if (!email) throw new Error("Email not found");

      const senderEmail = email.is_inbound
        ? (email.to_addresses?.[0] || COMPANY_EMAIL)
        : email.from_address;

      await supabase.functions.invoke("modify-gmail-labels", {
        body: { gmail_message_id: email.gmail_message_id, sender_email: senderEmail, action, label_id: labelId },
      });
    },
    onSuccess: () => invalidateEmailQueries(qc),
  });
}

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      body_html: string;
      sender_email: string;
      sender_name?: string;
      in_reply_to?: string;
      thread_id?: string;
      opportunity_id?: string;
      employee_id?: string;
      attachments?: { filename: string; base64: string; mimeType: string }[];
    }) => {
      const { opportunity_id, ...emailFields } = payload;
      const formattedFields = { ...emailFields, body_html: formatEmailHtml(emailFields.body_html) };
      const { error } = await supabase.from("email_outbox").insert({
        type: "sales",
        sender_email: payload.sender_email,
        payload: formattedFields,
        status: "pending",
        scheduled_at: new Date().toISOString(),
        ...(opportunity_id ? { reference_type: "opportunity" as const, reference_id: opportunity_id } : {}),
      });
      if (error) throw error;

      // Auto-advance opportunity to "kontaktoitu" when seller sends first email
      if (opportunity_id) {
        await supabase
          .from("sales_opportunities")
          .update({ status: "kontaktoitu", updated_at: new Date().toISOString() })
          .eq("id", opportunity_id)
          .eq("status", "new_inbound"); // Only advance if still in initial stage
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      qc.invalidateQueries({ queryKey: ["email-thread"] });
      qc.invalidateQueries({ queryKey: ["emails-by-opportunity"] });
      qc.invalidateQueries({ queryKey: ["email-unread-count"] });
    },
  });
}

const LOGO_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/public-assets/logo-email.png`;

export function useEmailSignature(employeeId: string | undefined, employee?: { first_name: string; last_name: string; email: string; phone?: string | null } | null) {
  return useQuery({
    queryKey: qk.signature(employeeId),
    enabled: !!employeeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_email_signatures")
        .select("*")
        .eq("employee_id", employeeId!)
        .maybeSingle();

      if (data?.signature_html) return data.signature_html;

      // No signature yet — generate default from employee data and persist it
      if (employee) {
        const defaultHtml = generateDefaultSignatureHtml(employee, LOGO_URL);
        await supabase.from("sales_email_signatures").upsert(
          { employee_id: employeeId!, signature_html: defaultHtml, updated_at: new Date().toISOString() },
          { onConflict: "employee_id" }
        );
        return defaultHtml;
      }

      return "";
    },
  });
}

export function useUpdateEmailSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, html }: { employeeId: string; html: string }) => {
      await supabase.from("sales_email_signatures").upsert(
        { employee_id: employeeId, signature_html: html, updated_at: new Date().toISOString() },
        { onConflict: "employee_id" }
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-signature"] }),
  });
}

// ─── Contact Photos ─────────────────────────────────────────────────────────

export function useContactPhotos(emails: string[]) {
  return useQuery({
    queryKey: qk.contactPhotos(emails.sort().join(",")),
    enabled: emails.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const uniqueEmails = [...new Set(emails.map((e) => e.toLowerCase()))];
      const { data } = await supabase
        .from("email_contact_photos")
        .select("email, photo_url")
        .in("email", uniqueEmails)
        .not("photo_url", "is", null);

      const map: Record<string, string> = {};
      for (const row of data || []) {
        if (row.photo_url) map[row.email] = row.photo_url;
      }
      return map;
    },
  });
}

// ─── Email Templates ─────────────────────────────────────────────────────────

export function useEmailTemplates(employeeId?: string) {
  return useQuery({
    queryKey: qk.templates(employeeId),
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*, email_template_attachments(*)")
        .or(`owner_salesperson_id.eq.${employeeId},owner_salesperson_id.is.null,is_system.eq.true`)
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return (data || []) as SalesEmailTemplate[];
    },
  });
}

export function useCompanyEmailTemplates() {
  return useQuery({
    queryKey: qk.companyTemplates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*, email_template_attachments(*)")
        .is("owner_salesperson_id", null)
        .order("position");
      if (error) throw error;
      return (data || []) as SalesEmailTemplate[];
    },
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      subject_template: string;
      body_template: string;
      owner_salesperson_id: string;
      category?: string;
      attachments?: { file: File; base64: string }[];
    }) => {
      const { attachments, ...templateData } = payload;
      const { data, error } = await supabase
        .from("email_templates")
        .insert(templateData)
        .select()
        .single();
      if (error) throw error;

      // Upload attachments
      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          const safeName = att.file.name.normalize("NFC").replace(/[^\w\s.\-()]/g, "_");
          const path = `${data.id}/${Date.now()}_${safeName}`;
          const contentType = att.file.type || "application/octet-stream";
          const { error: uploadError } = await supabase.storage
            .from("email-template-attachments")
            .upload(path, att.file, { contentType });
          if (uploadError) throw uploadError;

          await supabase.from("email_template_attachments").insert({
            template_id: data.id,
            filename: att.file.name,
            storage_path: path,
            mime_type: att.file.type || "application/octet-stream",
            size_bytes: att.file.size,
          });
        }
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      name?: string;
      subject_template?: string;
      body_template?: string;
      is_active?: boolean;
      position?: number;
    }) => {
      const { id, ...updates } = payload;
      const { error } = await supabase
        .from("email_templates")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: attachments } = await supabase
        .from("email_template_attachments")
        .select("storage_path")
        .eq("template_id", id);
      if (attachments && attachments.length > 0) {
        await supabase.storage
          .from("email-template-attachments")
          .remove(attachments.map((a) => a.storage_path));
      }
      const { error } = await supabase
        .from("email_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}

export function useAddTemplateAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, file }: { templateId: string; file: File }) => {
      const safeName = file.name.normalize("NFC").replace(/[^\w\s.\-()]/g, "_");
      const path = `${templateId}/${Date.now()}_${safeName}`;
      const contentType = file.type || "application/octet-stream";
      const { error: uploadError } = await supabase.storage
        .from("email-template-attachments")
        .upload(path, file, { contentType });
      if (uploadError) throw uploadError;

      const { error } = await supabase.from("email_template_attachments").insert({
        template_id: templateId,
        filename: file.name,
        storage_path: path,
        mime_type: contentType,
        size_bytes: file.size,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}

export function useRemoveTemplateAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, storagePath }: { id: string; storagePath: string }) => {
      await supabase.storage.from("email-template-attachments").remove([storagePath]);
      const { error } = await supabase
        .from("email_template_attachments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}

// ─── All Email Templates (including system) ──────────────────────────────────

export function useAllEmailTemplates() {
  return useQuery({
    queryKey: ["email-templates", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*, email_template_attachments(*)")
        .is("owner_salesperson_id", null)
        .order("category")
        .order("position");
      if (error) throw error;
      return (data || []) as SalesEmailTemplate[];
    },
  });
}

export function useSalesCategoryTemplates() {
  return useQuery({
    queryKey: ["email-templates", "sales-category"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*, email_template_attachments(*)")
        .is("owner_salesperson_id", null)
        .eq("category", "sales")
        .order("position");
      if (error) throw error;
      return (data || []) as SalesEmailTemplate[];
    },
  });
}

export function useResetTemplateToDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Fetch default values
      const { data: tpl, error: fetchErr } = await supabase
        .from("email_templates")
        .select("default_subject, default_body")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;
      if (!tpl?.default_subject && !tpl?.default_body) throw new Error("No defaults available");

      const { error } = await supabase
        .from("email_templates")
        .update({
          subject_template: tpl.default_subject || "",
          body_template: tpl.default_body || "",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}

// ─── Create deal from email thread ──────────────────────────────────────────

export function useCreateDealFromThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      threadId: string;
      name?: string;
      email?: string;
      phone?: string;
      address?: string;
      postcode?: string;
      city?: string;
      notes?: string;
      assigned_salesperson_id: string;
    }) => {
      const { data: opp, error: oppErr } = await supabase
        .from("sales_opportunities")
        .insert({
          name: input.name || null,
          email: input.email || null,
          phone: input.phone || null,
          address: input.address || null,
          postcode: input.postcode || null,
          city: input.city || null,
          channel: "email",
          status: "new_inbound",
          external_source: "email_thread",
          external_id: `thread:${input.threadId}`,
          assigned_salesperson_id: input.assigned_salesperson_id,
          source_payload: { gmail_thread_id: input.threadId, notes: input.notes || null },
        })
        .select()
        .single();
      if (oppErr) throw oppErr;

      const { error: linkErr } = await supabase
        .from("sales_emails")
        .update({ opportunity_id: opp.id })
        .eq("gmail_thread_id", input.threadId);
      if (linkErr) throw linkErr;

      return opp;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      qc.invalidateQueries({ queryKey: ["email-thread"] });
      qc.invalidateQueries({ queryKey: queryKeys.sales.opportunities.all });
    },
  });
}

export function emailToColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}
