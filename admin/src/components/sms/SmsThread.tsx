import { useRef, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import type { SmsMessage } from "@/lib/types";
import { SmsContextCard } from "./SmsContextCard";
import { SmsComposer } from "./SmsComposer";

function SmsBubble({ message }: { message: SmsMessage }) {
  const isOutbound = message.direction === "outbound";
  const time = new Date(message.created_at).toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Helsinki",
  });

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
          isOutbound
            ? "bg-accent text-white rounded-br-md"
            : "bg-gray-100 text-gray-900 rounded-bl-md"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
        <div
          className={`flex items-center gap-1 mt-1 ${
            isOutbound ? "justify-end" : "justify-start"
          }`}
        >
          <span
            className={`text-[10px] ${
              isOutbound ? "text-white/60" : "text-gray-400"
            }`}
          >
            {time}
          </span>
          {message.reference_type && message.reference_type !== "manual" && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                isOutbound
                  ? "bg-white/15 text-white/70"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {message.reference_type === "booking" && "Varaus"}
              {message.reference_type === "review_request" && "Arvostelu"}
              {message.reference_type === "offer" && "Tarjous"}
              {!["booking", "review_request", "offer"].includes(
                message.reference_type ?? ""
              ) && message.reference_type}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DateDivider({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[10px] text-gray-400 font-medium">{date}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

export function SmsThread({
  messages,
  phoneE164,
  onSend,
  isSending,
  onBack,
}: {
  messages: SmsMessage[];
  phoneE164: string;
  onSend: (body: string) => void;
  isSending: boolean;
  onBack?: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Group messages by date
  let lastDate = "";

  // Find customer/booking context from messages
  const firstWithCustomer = messages.find((m) => m.customers);
  const firstWithBooking = messages.find((m) => m.bookings);
  const firstWithEmployee = messages.find((m) => m.employees);

  return (
    <div className="flex flex-col h-full">
      {/* Mobile back button */}
      {onBack && (
        <div className="md:hidden border-b border-gray-200 px-3 py-2">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" /> Takaisin
          </button>
        </div>
      )}

      {/* Context card */}
      <SmsContextCard
        phoneE164={phoneE164}
        customer={firstWithCustomer?.customers}
        booking={firstWithBooking?.bookings}
        employee={firstWithEmployee?.employees}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.map((msg) => {
          const msgDate = new Date(msg.created_at).toLocaleDateString("fi-FI", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Europe/Helsinki",
          });
          const showDate = msgDate !== lastDate;
          lastDate = msgDate;

          return (
            <div key={msg.id}>
              {showDate && <DateDivider date={msgDate} />}
              <SmsBubble message={msg} />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <SmsComposer onSend={onSend} isSending={isSending} />
    </div>
  );
}
