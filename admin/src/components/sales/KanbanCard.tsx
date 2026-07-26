import { User, Phone, MapPin, Clock, AlertCircle, Copy, MailWarning } from "lucide-react";
import type { SalesOpportunity } from "@/lib/sales-types";
import type { AwaitingReplyInfo } from "@/hooks/sales/useAwaitingReply";
import { formatDateTime } from "@/lib/utils";

interface KanbanCardProps {
  opportunity: SalesOpportunity;
  duplicateCount?: number;
  awaitingReply?: AwaitingReplyInfo;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}

function formatWaitTime(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${Math.round(hours)} t`;
  return `${Math.round(hours / 24)} pv`;
}

export function KanbanCard({ opportunity: opp, duplicateCount = 0, awaitingReply, isDragging, onDragStart, onDragEnd, onClick }: KanbanCardProps) {
  const isUrgent = awaitingReply && awaitingReply.hours_waiting >= 24;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`rounded-xl px-3 py-2.5 cursor-pointer hover:shadow-sm transition-all ${
        isDragging ? "opacity-40 scale-95" : ""
      } ${
        opp.status === "tarjous_hyvaksytty"
          ? "bg-amber-50 border-2 border-amber-300 ring-1 ring-amber-200"
          : awaitingReply
            ? isUrgent
              ? "bg-red-50 border-2 border-red-300 ring-1 ring-red-200"
              : "bg-blue-50 border-2 border-blue-300 ring-1 ring-blue-200"
            : "bg-surface border border-border hover:border-accent/30"
      }`}
    >
      {awaitingReply && (
        <div className={`flex items-center gap-1 mb-1.5 ${isUrgent ? "text-red-700" : "text-blue-700"}`}>
          <MailWarning className="w-3 h-3" />
          <span className="text-[10px] font-semibold">
            Odottaa vastausta · {formatWaitTime(awaitingReply.hours_waiting)}
          </span>
        </div>
      )}
      {opp.status === "tarjous_hyvaksytty" && !awaitingReply && (
        <div className="flex items-center gap-1 mb-1.5 text-amber-700">
          <AlertCircle className="w-3 h-3" />
          <span className="text-[10px] font-semibold">Odottaa yhteydenottoa</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <User className="w-3 h-3 text-text-muted flex-shrink-0" />
            <p className="text-xs font-medium truncate">{opp.name || "Nimetön"}</p>
          </div>
          {opp.phone && (
            <div className="flex items-center gap-1.5 mt-1">
              <Phone className="w-3 h-3 text-text-muted flex-shrink-0" />
              <p className="text-[11px] text-text-muted">{opp.phone}</p>
            </div>
          )}
          {opp.city && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <MapPin className="w-3 h-3 text-text-muted flex-shrink-0" />
              <p className="text-[11px] text-text-muted">{opp.city}</p>
            </div>
          )}
        </div>
      </div>

      {(opp.tags_cache?.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {opp.tags_cache.slice(0, 3).map((tag) => (
            <span key={tag} className="px-1 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-600">
              {tag}
            </span>
          ))}
          {opp.tags_cache.length > 3 && (
            <span className="text-[9px] text-text-muted">+{opp.tags_cache.length - 3}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 mt-2">
        <Clock className="w-3 h-3 text-text-muted" />
        <span className="text-[10px] text-text-muted">{formatDateTime(opp.created_at)}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {opp.channel && (
          <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-50 text-purple-600 border border-purple-200">
            {opp.channel}
          </span>
        )}
        {duplicateCount > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <Copy className="w-2.5 h-2.5" />
            {duplicateCount}
          </span>
        )}
      </div>
    </div>
  );
}
