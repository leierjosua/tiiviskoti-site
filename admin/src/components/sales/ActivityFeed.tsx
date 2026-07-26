import { Phone, ArrowRightLeft, MessageSquare, FileText, Star, Inbox } from "lucide-react";
import { useActivityFeed } from "@/hooks/sales/useActivityFeed";

const EVENT_ICONS: Record<string, React.ElementType> = {
  status_change: ArrowRightLeft,
  note_added: MessageSquare,
  call_made: Phone,
  offer_sent: FileText,
  won: Star,
};

const EVENT_LABELS: Record<string, string> = {
  status_change: "Vaihe muutettu",
  note_added: "Muistiinpano",
  call_made: "Soitto",
  offer_sent: "Tarjous lähetetty",
  offer_created: "Tarjous luotu",
  created: "Luotu",
  won: "Voitettu",
  lost: "Hävitty",
  assigned: "Siirretty myyjälle",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "juuri nyt";
  if (mins < 60) return `${mins} min sitten`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h sitten`;
  const days = Math.floor(hours / 24);
  return `${days} pv sitten`;
}

export function ActivityFeed({ limit = 20 }: { limit?: number }) {
  const { data: events = [], isLoading } = useActivityFeed(limit);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="text-xs text-text-muted py-4 text-center">Ei aktiviteettia</p>;
  }

  return (
    <div className="space-y-1">
      {events.map((event) => {
        const Icon = EVENT_ICONS[event.type] || (event.entity_type === "lead" ? Phone : Inbox);
        return (
          <div
            key={event.id}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/20 transition-colors"
          >
            <div className="p-1 rounded-md bg-muted/40 flex-shrink-0">
              <Icon className="w-3 h-3 text-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium truncate">
                {EVENT_LABELS[event.type] || event.type}
                <span className="text-text-muted font-normal ml-1">
                  {event.entity_type === "lead" ? "Liidi" : "Inbound"}
                </span>
              </p>
            </div>
            <span className="text-[10px] text-text-muted flex-shrink-0">
              {timeAgo(event.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
