import { Link } from "react-router-dom";
import type { ElementType, ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ElementType;
  /** Tailwind text color for the icon, e.g. "text-accent-dark" */
  iconColor: string;
  /** Tailwind bg color for the icon chip, e.g. "bg-accent-muted" */
  iconBg: string;
  /** Left accent border color, e.g. "border-l-accent" */
  accent: string;
  to?: string;
  onClick?: () => void;
  /** Optional element after the value (e.g. a chevron) */
  trailing?: ReactNode;
}

/**
 * Mobile-first KPI card: label + icon on top, value as the hero below.
 * Vertical layout so the label gets the full card width and never truncates
 * against the value in narrow (2-column) mobile grids.
 */
export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  iconBg,
  accent,
  to,
  onClick,
  trailing,
}: KpiCardProps) {
  const interactive = !!(to || onClick);
  const cls = `bg-surface rounded-xl border border-border border-l-3 ${accent} p-3.5 sm:p-4${
    interactive ? " hover:bg-surface-hover transition-colors text-left w-full block" : ""
  }`;

  const content = (
    <>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-medium text-text-muted truncate min-w-0">
          {label}
        </p>
        <div className={`p-1.5 rounded-lg ${iconBg} flex-shrink-0`}>
          <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-bold text-text-primary tabular-nums leading-none truncate min-w-0">
          {value}
        </p>
        {trailing && <span className="flex-shrink-0">{trailing}</span>}
      </div>
      {sub && (
        <p className="text-[10px] text-text-muted/70 mt-1 truncate">{sub}</p>
      )}
    </>
  );

  if (to) return <Link to={to} className={cls}>{content}</Link>;
  if (onClick) return <button onClick={onClick} className={cls}>{content}</button>;
  return <div className={cls}>{content}</div>;
}
