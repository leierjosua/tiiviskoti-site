import { useState, useRef, useEffect } from "react";
import { useCannedResponses, useIncrementCannedResponseUsage } from "@/hooks/customer-service/useCannedResponses";
import { Zap, Search, ChevronDown } from "lucide-react";
import type { CSCannedResponse, CSTicket } from "@/lib/cs-types";

interface Props {
  ticket: CSTicket;
  onSelect: (html: string) => void;
}

function substituteVariables(html: string, ticket: CSTicket): string {
  return html
    .replace(/\{\{customer_name\}\}/g, ticket.customer_name || "")
    .replace(/\{\{customer_email\}\}/g, ticket.customer_email || "")
    .replace(/\{\{ticket_number\}\}/g, String(ticket.ticket_number));
}

export function CannedResponsePicker({ ticket, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { data: responses } = useCannedResponses();
  const incrementUsage = useIncrementCannedResponseUsage();

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = (responses ?? []).filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.category && r.category.toLowerCase().includes(search.toLowerCase()))
  );

  function handleSelect(r: CSCannedResponse) {
    const html = substituteVariables(r.body_html, ticket);
    onSelect(html);
    incrementUsage.mutate(r.id);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Zap className="h-3.5 w-3.5" />
        Pikavastaus
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hae pikavastauksia..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                Ei pikavastauksia
              </p>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      {r.name}
                    </span>
                    {r.category && (
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1 rounded">
                        {r.category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {r.body_text || r.body_html.replace(/<[^>]*>/g, "").slice(0, 80)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
