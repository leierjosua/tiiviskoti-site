import type { EmployeeRole, InstallerTier } from "@/lib/types";

// ─── Employee ───

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  installer: "Asentaja",
  seller: "Myyjä",
  admin: "Admin",
};

export const TIER_LABELS: Record<InstallerTier, string> = {
  yrittaja: "Yrittäjä",
  alihankkija: "Alihankkija",
  palkallinen: "Palkallinen",
};

export const ROLE_STYLES: Record<EmployeeRole, string> = {
  installer: "bg-accent-muted text-accent-dark border border-accent/30",
  seller: "bg-blue-50 text-blue-700 border border-blue-200",
  admin: "bg-purple-50 text-purple-700 border border-purple-200",
};

// ─── Form styles ───

export const inputCls =
  "w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export const selectCls =
  "w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent appearance-none";
