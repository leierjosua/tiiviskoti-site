import { KanbanCard } from "./KanbanCard";
import type { SalesOpportunity, SalesOpportunityStage } from "@/lib/sales-types";
import type { AwaitingReplyInfo } from "@/hooks/sales/useAwaitingReply";

interface KanbanColumnProps {
  stage: SalesOpportunityStage;
  opportunities: SalesOpportunity[];
  duplicateMap: Map<string, number>;
  awaitingReplyMap: Map<string, AwaitingReplyInfo>;
  isDragOver: boolean;
  draggedId: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onCardClick: (opp: SalesOpportunity) => void;
}

export function KanbanColumn({
  stage,
  opportunities,
  duplicateMap,
  awaitingReplyMap,
  isDragOver,
  draggedId,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onDragEnd,
  onCardClick,
}: KanbanColumnProps) {
  return (
    <div
      className={`flex-shrink-0 w-[260px] sm:w-72 flex flex-col rounded-xl transition-colors ${
        isDragOver ? "bg-accent/5 ring-2 ring-accent/20" : "bg-muted/30"
      }`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
        <span className="text-xs font-semibold flex-1 truncate">{stage.label}</span>
        <span className="text-[11px] font-medium text-text-muted bg-surface border border-border rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
          {opportunities.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 px-2 pb-2 space-y-1.5 overflow-y-auto min-h-[100px]">
        {opportunities.map((opp) => (
          <KanbanCard
            key={opp.id}
            opportunity={opp}
            duplicateCount={duplicateMap.get(opp.id) || 0}
            awaitingReply={awaitingReplyMap.get(opp.id)}
            isDragging={draggedId === opp.id}
            onDragStart={(e) => onDragStart(e, opp.id)}
            onDragEnd={onDragEnd}
            onClick={() => onCardClick(opp)}
          />
        ))}
        {opportunities.length === 0 && (
          <div className="flex items-center justify-center h-20 text-[11px] text-text-muted">
            Tyhjä
          </div>
        )}
      </div>
    </div>
  );
}
