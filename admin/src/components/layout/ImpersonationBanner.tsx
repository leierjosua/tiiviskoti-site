import { useState, useEffect } from "react";
import { Eye, LogOut } from "lucide-react";
import { useImpersonation, stopImpersonation } from "@/lib/impersonation";

/**
 * Persistent banner shown while an admin is impersonating an employee.
 * Sits at the very top of the viewport so it's impossible to miss that
 * you're acting as someone else. "Palaa adminiksi" restores the admin session.
 */
export function ImpersonationBanner() {
  const { impersonation, isImpersonating } = useImpersonation();
  const [exiting, setExiting] = useState(false);

  // Push page content down so the fixed banner never hides the top of the UI
  useEffect(() => {
    if (!isImpersonating) return;
    const prev = document.body.style.paddingTop;
    document.body.style.paddingTop = "36px";
    return () => {
      document.body.style.paddingTop = prev;
    };
  }, [isImpersonating]);

  if (!isImpersonating || !impersonation) return null;

  async function handleStop() {
    setExiting(true);
    try {
      await stopImpersonation();
    } catch {
      setExiting(false);
    }
  }

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-amber-950 shadow-md">
      <div className="flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium">
        <Eye className="w-4 h-4 shrink-0" />
        <span className="truncate">
          Imitoit työntekijää:{" "}
          <strong>{impersonation.targetName || "tuntematon"}</strong>
          <span className="hidden sm:inline"> — näet ja toimit kuten he</span>
        </span>
        <button
          type="button"
          onClick={handleStop}
          disabled={exiting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-950/90 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-950 transition-colors disabled:opacity-60"
        >
          <LogOut className="w-3.5 h-3.5" />
          {exiting ? "Palataan…" : "Palaa adminiksi"}
        </button>
      </div>
    </div>
  );
}
