import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Admin "imitate employee" — swaps the live Supabase session to another
// employee's account so the admin sees and acts exactly as that employee.
// The admin's own session tokens are stashed in localStorage so we can
// restore them when impersonation ends.

const KEY = "aa_impersonation";
const CHANGE_EVENT = "aa-impersonation-change";

export interface ImpersonationState {
  targetEmployeeId: string;
  targetUserId: string;
  targetName: string;
  targetRoles: string[];
  /** Admin session to restore on exit */
  adminAccessToken: string;
  adminRefreshToken: string;
  adminName: string;
}

function readState(): ImpersonationState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ImpersonationState) : null;
  } catch {
    return null;
  }
}

function writeState(state: ImpersonationState | null) {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function portalPath(roles: string[]): string {
  if (roles.includes("seller")) return "/myyja";
  return "/tyontekija";
}

/** Begin impersonating an employee. Reloads into their portal on success. */
export async function startImpersonation(targetEmployeeId: string, adminName: string) {
  // Capture the admin session BEFORE we swap it away
  const { data: { session: adminSession } } = await supabase.auth.getSession();
  if (!adminSession) throw new Error("Ei aktiivista istuntoa");

  const { data, error } = await supabase.functions.invoke("impersonate-user", {
    body: { targetEmployeeId },
  });
  if (error) {
    // Surface the edge function's JSON error message if present
    const msg = (await error.context?.json?.().catch(() => null))?.error;
    throw new Error(msg || error.message || "Imitointi epäonnistui");
  }
  if (data?.error) throw new Error(data.error);

  const { tokenHash, target } = data as {
    tokenHash: string;
    target: { employeeId: string; userId: string; name: string; roles: string[] };
  };

  // Swap the live session to the target employee
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (verifyErr) throw new Error(verifyErr.message || "Istunnon vaihto epäonnistui");

  writeState({
    targetEmployeeId: target.employeeId,
    targetUserId: target.userId,
    targetName: target.name,
    targetRoles: target.roles,
    adminAccessToken: adminSession.access_token,
    adminRefreshToken: adminSession.refresh_token,
    adminName,
  });

  // Hard navigation so every hook/cache re-initialises under the new identity
  window.location.assign(portalPath(target.roles));
}

/** Stop impersonating and restore the admin session. */
export async function stopImpersonation() {
  const state = readState();
  if (!state) {
    window.location.assign("/");
    return;
  }

  const { error } = await supabase.auth.setSession({
    access_token: state.adminAccessToken,
    refresh_token: state.adminRefreshToken,
  });

  writeState(null);

  if (error) {
    // Admin session couldn't be restored (e.g. expired) — fall back to login
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    window.location.assign("/login");
    return;
  }

  window.location.assign("/tyontekijat");
}

/** Reactive hook for the current impersonation state. */
export function useImpersonation() {
  const [state, setState] = useState<ImpersonationState | null>(readState);

  useEffect(() => {
    const sync = () => setState(readState());
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  return { impersonation: state, isImpersonating: !!state };
}
