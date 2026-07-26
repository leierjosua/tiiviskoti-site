import { useState, useRef, useCallback, useMemo } from "react";
import { KanbanColumn } from "./KanbanColumn";
import type { SalesOpportunity, SalesOpportunityStage } from "@/lib/sales-types";
import { useAwaitingReply } from "@/hooks/sales/useAwaitingReply";

interface KanbanBoardProps {
  stages: SalesOpportunityStage[];
  opportunities: SalesOpportunity[];
  onMoveOpportunity: (id: string, newStatus: string) => void;
  onCardClick: (opp: SalesOpportunity) => void;
}

export function KanbanBoard({ stages, opportunities, onMoveOpportunity, onCardClick }: KanbanBoardProps) {
  const { data: awaitingReplyMap = new Map() } = useAwaitingReply();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const dragCounter = useRef<Record<string, number>>({});

  const activeStages = stages.filter((s) => s.is_active).sort((a, b) => a.position - b.position);

  // Compute duplicate counts client-side: group by email_norm and phone_norm
  const duplicateMap = useMemo(() => {
    const map = new Map<string, number>();
    const byEmail = new Map<string, string[]>();
    const byPhone = new Map<string, string[]>();

    for (const o of opportunities) {
      if (o.email_norm) {
        const list = byEmail.get(o.email_norm) || [];
        list.push(o.id);
        byEmail.set(o.email_norm, list);
      }
      if (o.phone_norm) {
        const list = byPhone.get(o.phone_norm) || [];
        list.push(o.id);
        byPhone.set(o.phone_norm, list);
      }
    }

    for (const o of opportunities) {
      const emailDups = o.email_norm ? (byEmail.get(o.email_norm)?.length || 0) - 1 : 0;
      const phoneDups = o.phone_norm ? (byPhone.get(o.phone_norm)?.length || 0) - 1 : 0;
      const count = Math.max(emailDups, phoneDups);
      if (count > 0) map.set(o.id, count);
    }

    return map;
  }, [opportunities]);

  const oppsByStage = useCallback(
    (stageKey: string) => opportunities.filter((o) => o.status === stageKey),
    [opportunities]
  );

  function handleDragStart(e: React.DragEvent, oppId: string) {
    e.dataTransfer.setData("text/plain", oppId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedId(oppId);
  }

  function handleDragEnter(stageKey: string) {
    dragCounter.current[stageKey] = (dragCounter.current[stageKey] || 0) + 1;
    setDragOverStage(stageKey);
  }

  function handleDragLeave(stageKey: string) {
    dragCounter.current[stageKey] = (dragCounter.current[stageKey] || 0) - 1;
    if (dragCounter.current[stageKey] <= 0) {
      dragCounter.current[stageKey] = 0;
      if (dragOverStage === stageKey) setDragOverStage(null);
    }
  }

  function handleDrop(e: React.DragEvent, stageKey: string) {
    e.preventDefault();
    const oppId = e.dataTransfer.getData("text/plain");
    if (oppId) {
      const opp = opportunities.find((o) => o.id === oppId);
      if (opp && opp.status !== stageKey) {
        onMoveOpportunity(oppId, stageKey);
      }
    }
    setDraggedId(null);
    setDragOverStage(null);
    dragCounter.current = {};
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverStage(null);
    dragCounter.current = {};
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 min-h-[500px] -mx-4 px-4 sm:mx-0 sm:px-0">
      {activeStages.map((stage) => (
        <KanbanColumn
          key={stage.key}
          stage={stage}
          opportunities={oppsByStage(stage.key)}
          duplicateMap={duplicateMap}
          awaitingReplyMap={awaitingReplyMap}
          isDragOver={dragOverStage === stage.key}
          draggedId={draggedId}
          onDragStart={handleDragStart}
          onDragEnter={() => handleDragEnter(stage.key)}
          onDragLeave={() => handleDragLeave(stage.key)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, stage.key)}
          onDragEnd={handleDragEnd}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  );
}
