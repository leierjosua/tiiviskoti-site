import { Search, MessageSquare } from "lucide-react";
import { useState } from "react";
import type { SmsConversation } from "@/lib/types";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" });
  }
  if (diffDays === 1) return "eilen";
  if (diffDays < 7) return `${diffDays}pv sitten`;
  return d.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", timeZone: "Europe/Helsinki" });
}

export function SmsConversationList({
  conversations,
  selectedPhone,
  onSelect,
}: {
  conversations: SmsConversation[];
  selectedPhone: string | null;
  onSelect: (phone: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.phone_e164.includes(q) ||
      c.customer_name?.toLowerCase().includes(q) ||
      c.customer_address?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Hae nimellä tai numerolla..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <MessageSquare className="w-8 h-8 mb-2" />
            <p className="text-xs">Ei keskusteluja</p>
          </div>
        )}
        {filtered.map((c) => (
          <button
            key={c.phone_e164}
            onClick={() => onSelect(c.phone_e164)}
            className={`w-full text-left px-3 py-2.5 border-b border-gray-100 transition-colors ${
              selectedPhone === c.phone_e164
                ? "bg-accent/5 border-l-2 border-l-accent"
                : "hover:bg-gray-50"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {c.customer_name || c.phone_e164}
                </p>
                {c.customer_name && (
                  <p className="text-[11px] text-gray-400">{c.phone_e164}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-[10px] text-gray-400">
                  {formatTime(c.last_message_at)}
                </span>
                {c.unread_count > 0 && (
                  <span className="inline-flex items-center justify-center w-4.5 h-4.5 text-[10px] font-bold text-white bg-accent rounded-full">
                    {c.unread_count}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {c.last_direction === "outbound" && (
                <span className="text-gray-400">Sinä: </span>
              )}
              {c.last_message}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
