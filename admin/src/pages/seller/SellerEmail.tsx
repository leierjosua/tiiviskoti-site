import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  Inbox, Send, Star, Archive, Trash2, Search, Plus, RefreshCw,
  Mail, X, Menu,
} from "lucide-react";
import { useEmailThreads, useEmailThread, useEmailSearch, useGmailLabels, useUnreadEmailCount, useContactPhotos } from "@/hooks/sales/useSalesEmails";
import { useUserRole } from "@/context/UserRoleContext";
import type { EmailThread, SalesEmail, EmailMailbox, GmailLabel } from "@/lib/sales-types";
import { COMPANY_EMAIL } from "@/lib/email-styles";

import ThreadListItem from "@/components/email/ThreadListItem";
import ThreadView from "@/components/email/ThreadView";
import ComposeModal, { type ComposeState } from "@/components/email/ComposeModal";
import LabelsSidebar from "@/components/email/LabelsSidebar";

const MAILBOXES: { key: EmailMailbox; label: string; icon: typeof Inbox }[] = [
  { key: "inbox", label: "Saapuneet", icon: Inbox },
  { key: "sent", label: "Lähetetyt", icon: Send },
  { key: "starred", label: "Tärkeät", icon: Star },
  { key: "archive", label: "Arkisto", icon: Archive },
  { key: "trash", label: "Roskakori", icon: Trash2 },
];

export default function SellerEmail() {
  const { employee } = useUserRole();
  const [mailbox, setMailbox] = useState<EmailMailbox>("inbox");
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [composing, setComposing] = useState<ComposeState | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const userEmail = employee?.email;
  const { data: threads = [], isLoading, refetch } = useEmailThreads(mailbox, userEmail, selectedLabelId || undefined);
  const { data: searchResults = [] } = useEmailSearch(searchQuery);
  const { data: threadMessages = [] } = useEmailThread(selectedThreadId || undefined);
  const { data: labels = [] } = useGmailLabels(userEmail);
  const { data: unreadCount = 0 } = useUnreadEmailCount();

  const displayThreads = searchQuery.length >= 2 ? searchResults : threads;

  // Collect all from_address emails for photo lookup
  const allFromEmails = useMemo(() => {
    return displayThreads.flatMap((t) => t.messages.map((m) => m.from_address));
  }, [displayThreads]);
  const { data: contactPhotos } = useContactPhotos(allFromEmails);

  const handleSelectThread = useCallback((t: EmailThread) => {
    setSelectedThreadId(t.thread_id);
  }, []);

  const handleCompose = useCallback(() => {
    setComposing({ mode: "new", to: "", subject: "", body: "" });
  }, []);

  const handleReply = useCallback((msg: SalesEmail, mode: "reply" | "reply_all" | "forward" = "reply") => {
    const reSubject = msg.subject || "";
    let to = "";
    let cc = "";
    let body = "";

    if (mode === "reply") {
      to = msg.is_inbound ? msg.from_address : msg.to_addresses[0] || "";
    } else if (mode === "reply_all") {
      to = msg.is_inbound ? msg.from_address : msg.to_addresses[0] || "";
      const allRecipients = [...msg.to_addresses, ...msg.cc_addresses]
        .filter((e) => e !== userEmail && e !== to);
      cc = allRecipients.join(", ");
    } else if (mode === "forward") {
      to = "";
    }

    const prefix = mode === "forward" ? "Fwd:" : "Re:";
    const subject = reSubject.startsWith(prefix) ? reSubject : `${prefix} ${reSubject}`;

    if (mode === "forward") {
      const fwdHeader = `\n\n---------- Välitetty viesti ----------\nLähettäjä: ${msg.from_name || msg.from_address}\nPäivämäärä: ${new Date(msg.date).toLocaleString("fi-FI", { timeZone: "Europe/Helsinki" })}\nAihe: ${msg.subject || ""}\nVastaanottaja: ${msg.to_addresses.join(", ")}\n\n`;
      body = fwdHeader + (msg.body_text || msg.snippet || "");
    }

    setComposing({
      mode: mode === "forward" ? "forward" : "reply",
      to,
      cc,
      subject,
      body,
      inReplyTo: mode !== "forward" ? msg.gmail_message_id : undefined,
      threadId: mode !== "forward" ? msg.gmail_thread_id : undefined,
    });
  }, [userEmail]);

  return (
    <div className="flex h-[calc(100vh-64px)] relative">
      {/* Sidebar — hidden on mobile, visible on md+ */}
      <div className="hidden md:flex w-48 border-r border-border flex-shrink-0 flex-col">
        <button type="button"
          onClick={handleCompose}
          className="m-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Kirjoita
        </button>

        <nav className="flex-1 px-2">
          {MAILBOXES.map((mb) => (
            <button type="button"
              key={mb.key}
              onClick={() => { setMailbox(mb.key); setSelectedLabelId(null); setSelectedThreadId(null); setSearchQuery(""); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mailbox === mb.key && !searchQuery && !selectedLabelId
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:bg-bg-secondary"
              }`}
            >
              <mb.icon className="w-4 h-4" />
              <span className="flex-1 text-left">{mb.label}</span>
              {mb.key === "inbox" && unreadCount > 0 && (
                <span className="bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}

          {/* Gmail labels */}
          <LabelsSidebar
            labels={labels}
            mailbox={mailbox}
            selectedLabelId={selectedLabelId}
            userEmail={userEmail || ""}
            onSelectLabel={(labelId) => { setMailbox("label"); setSelectedLabelId(labelId); setSelectedThreadId(null); setSearchQuery(""); }}
          />
        </nav>
      </div>

      {/* Mobile mailbox drawer */}
      <div
        className={`md:hidden fixed inset-0 z-50 transition-opacity duration-300 ${mobileDrawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setMobileDrawerOpen(false)}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div
          className={`absolute inset-y-0 left-0 w-72 bg-white flex flex-col shadow-2xl transition-transform duration-300 ease-out ${mobileDrawerOpen ? "translate-x-0" : "-translate-x-full"}`}
          onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <span className="text-sm font-bold text-text-primary">Sähköposti</span>
              <button type="button" onClick={() => setMobileDrawerOpen(false)} className="p-1 text-text-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mailboxes */}
            <nav className="flex-1 overflow-y-auto py-2">
              {MAILBOXES.map((mb) => {
                const isActive = mailbox === mb.key && !selectedLabelId;
                return (
                  <button type="button"
                    key={mb.key}
                    onClick={() => { setMailbox(mb.key); setSelectedLabelId(null); setSelectedThreadId(null); setSearchQuery(""); setMobileDrawerOpen(false); }}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      isActive ? "bg-accent/10 text-accent border-r-4 border-accent" : "text-text-primary hover:bg-bg-secondary"
                    }`}
                  >
                    <mb.icon className="w-5 h-5" />
                    <span className="flex-1 text-left">{mb.label}</span>
                    {mb.key === "inbox" && unreadCount > 0 && (
                      <span className={`text-xs font-bold ${isActive ? "text-accent" : "text-text-muted"}`}>
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Labels */}
              {labels.length > 0 && (
                <>
                  <div className="h-px bg-border mx-4 my-2" />
                  <p className="px-5 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">Tunnisteet</p>
                  {labels.map((label: GmailLabel) => {
                    const displayName = label.name.includes("/") ? label.name.split("/").pop() : label.name;
                    const depth = (label.name.match(/\//g) || []).length;
                    const isActive = mailbox === "label" && selectedLabelId === label.gmail_label_id;
                    return (
                      <button type="button"
                        key={label.id}
                        onClick={() => { setMailbox("label"); setSelectedLabelId(label.gmail_label_id); setSelectedThreadId(null); setSearchQuery(""); setMobileDrawerOpen(false); }}
                        className={`w-full flex items-center gap-3 py-2.5 text-sm font-medium transition-colors ${
                          isActive ? "bg-accent/10 text-accent border-r-4 border-accent" : "text-text-primary hover:bg-bg-secondary"
                        }`}
                        style={{ paddingLeft: `${20 + depth * 16}px` }}
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: label.background_color || "#9ca3af" }} />
                        {displayName}
                      </button>
                    );
                  })}
                </>
              )}
            </nav>
          </div>
        </div>

      {/* Mobile compose FAB */}
      {!selectedThreadId && (
        <button type="button"
          onClick={handleCompose}
          className="md:hidden fixed bottom-6 right-4 z-40 w-14 h-14 bg-accent text-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-transform"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Main content area — shows either thread list OR thread view (Gmail style) */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedThreadId ? (
          <ThreadView
            messages={threadMessages}
            threadId={selectedThreadId}
            onBack={() => setSelectedThreadId(null)}
            allLabels={labels}
            senderEmail={employee?.email || COMPANY_EMAIL}
            senderName={employee ? `${employee.first_name} ${employee.last_name}` : "Lasikiilto"}
            employeeId={employee?.id}
            employee={employee}
            onReply={handleReply}
          />
        ) : (
          <>
            {/* Search bar with mobile drawer trigger */}
            <div className="flex items-center gap-2 px-3 md:px-4 py-2 border-b border-border">
              {/* Mobile mailbox drawer trigger */}
              <button type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-secondary"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-bg-secondary text-sm"
                  placeholder="Hae sähköposteja..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button type="button"
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    const { error } = await supabase.functions.invoke("sync-gmail", { body: { email_address: userEmail, reconcile: true } });
                    if (error) throw error;
                    await refetch();
                  } catch (err: any) {
                    console.error("Gmail sync failed:", err);
                  } finally {
                    setRefreshing(false);
                  }
                }}
                disabled={refreshing}
                className="p-2 text-text-muted hover:text-accent rounded-lg hover:bg-bg-secondary active:scale-90 transition-all disabled:opacity-50"
                title="Synkkaa ja päivitä"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <span className="text-xs text-text-muted whitespace-nowrap">
                {searchQuery ? `${displayThreads.length} tulosta` : `${displayThreads.length} ketjua`}
              </span>
            </div>

            {/* Thread list */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : displayThreads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Mail className="w-12 h-12 text-text-muted/20 mb-3" />
                  <p className="text-sm text-text-muted">Ei sähköposteja</p>
                </div>
              ) : (
                displayThreads.map((t) => (
                  <ThreadListItem
                    key={t.thread_id}
                    thread={t}
                    selected={false}
                    allLabels={labels}
                    senderEmail={employee?.email}
                    contactPhotos={contactPhotos}
                    onSelect={() => handleSelectThread(t)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Compose modal */}
      {composing && (
        <ComposeModal
          state={composing}
          onClose={() => setComposing(null)}
          senderEmail={employee?.email || COMPANY_EMAIL}
          senderName={employee ? `${employee.first_name} ${employee.last_name}` : "Lasikiilto"}
          employeeId={employee?.id}
          employee={employee}
        />
      )}
    </div>
  );
}
