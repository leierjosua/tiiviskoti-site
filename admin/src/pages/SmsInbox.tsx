import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { SmsConversationList } from "@/components/sms/SmsConversationList";
import { SmsThread } from "@/components/sms/SmsThread";
import {
  useSmsConversations,
  useSmsThread,
  useSendSms,
  useMarkSmsRead,
  useSmsRealtime,
} from "@/hooks/useSmsMessages";
import { useUserRole } from "@/context/UserRoleContext";

export default function SmsInbox() {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const { employee } = useUserRole();

  const { data: conversations = [] } = useSmsConversations();
  const { data: messages = [] } = useSmsThread(selectedPhone);
  const sendSms = useSendSms();
  const markRead = useMarkSmsRead(selectedPhone);

  // Realtime subscription
  useSmsRealtime(selectedPhone);

  function handleSelectConversation(phone: string) {
    setSelectedPhone(phone);
    // Mark messages as read when opening conversation
    if (phone) {
      setTimeout(() => markRead.mutate(), 300);
    }
  }

  function handleSend(body: string) {
    if (!selectedPhone) return;

    // Find customer_id from conversation
    const conv = conversations.find((c) => c.phone_e164 === selectedPhone);

    sendSms.mutate(
      {
        to: selectedPhone,
        body,
        customer_id: conv?.customer_id ?? undefined,
        sent_by: employee?.id,
        reference_type: "manual",
      },
      {
        onError: (err) => {
          console.error("[send-sms] mutation error:", err);
          alert("SMS-lähetys epäonnistui: " + String(err));
        },
      }
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <MessageSquare className="w-5 h-5 text-accent" />
        <h1 className="text-lg font-semibold text-gray-900">Viestit</h1>
        {conversations.some((c) => c.unread_count > 0) && (
          <span className="inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold text-white bg-accent rounded-full">
            {conversations.reduce((sum, c) => sum + c.unread_count, 0)} uutta
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col md:flex-row" style={{ height: "calc(100vh - 160px)" }}>
        {/* Left panel: conversation list */}
        <div className={`w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-200 flex-shrink-0 ${selectedPhone ? "hidden md:block" : ""}`}>
          <SmsConversationList
            conversations={conversations}
            selectedPhone={selectedPhone}
            onSelect={handleSelectConversation}
          />
        </div>

        {/* Right panel: thread or empty state */}
        <div className={`flex-1 min-w-0 ${selectedPhone ? "" : "hidden md:flex"}`}>
          {selectedPhone ? (
            <SmsThread
              messages={messages}
              phoneE164={selectedPhone}
              onSend={handleSend}
              isSending={sendSms.isPending}
              onBack={() => setSelectedPhone(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <MessageSquare className="w-12 h-12 mb-3" />
              <p className="text-sm">Valitse keskustelu</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
