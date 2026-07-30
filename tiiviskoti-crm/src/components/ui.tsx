import type { ComponentProps, ReactNode } from 'react';

/* Pienet toistuvat palaset yhdessä paikassa. Tarkoituksella kevyt: ei
   komponenttikirjastoa, vain ne muodot joita tässä sovelluksessa on. */

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold ' +
  'transition-all disabled:opacity-45 disabled:pointer-events-none';

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-accent-ink shadow-sm hover:bg-[#1A6340] active:translate-y-px',
  ghost: 'text-muted hover:bg-ink-700 hover:text-text',
  outline: 'border border-line bg-ink-800 text-text hover:border-[#D2D9CE] hover:bg-ink-700',
  danger: 'border border-danger/35 bg-ink-800 text-danger hover:bg-danger/8',
} as const;

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return <button {...props} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx(
      'rounded-(--radius-card) border border-line bg-ink-800 shadow-(--shadow-card)',
      className,
    )}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
      <h2 className="text-[13px] font-bold tracking-wide text-text uppercase">{title}</h2>
      {action}
    </div>
  );
}

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs leading-relaxed text-faint">{hint}</span>}
    </label>
  );
}

const CONTROL =
  'w-full rounded-lg border border-line bg-ink-800 px-3 py-2 text-sm text-text ' +
  'placeholder:text-faint transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cx(CONTROL, 'tabular', className)} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cx(CONTROL, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cx(CONTROL, 'leading-relaxed', className)} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-12 text-center text-sm text-faint">{children}</div>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm font-medium text-danger">
      {children}
    </p>
  );
}

export function OkNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-2 text-sm font-medium text-accent">
      {children}
    </p>
  );
}

/* Tilamerkki. Pisteen väri kantaa merkityksen ja teksti toistaa sen, jotta
   tila ei ole pelkän värin varassa. */
const STATUS_STYLES: Record<string, { chip: string; dot: string; label: string }> = {
  hold:      { chip: 'border-line bg-ink-700 text-faint',           dot: 'bg-faint',   label: 'Varauksessa' },
  tentative: { chip: 'border-warn/30 bg-warn/10 text-warn',         dot: 'bg-warn',    label: 'Alustava' },
  confirmed: { chip: 'border-accent/30 bg-accent-dim text-accent',  dot: 'bg-accent',  label: 'Vahvistettu' },
  done:      { chip: 'border-info/30 bg-info/10 text-info',         dot: 'bg-info',    label: 'Tehty' },
  cancelled: { chip: 'border-line bg-ink-700 text-faint line-through', dot: 'bg-faint', label: 'Peruttu' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? {
    chip: 'border-line bg-ink-700 text-muted', dot: 'bg-muted', label: status,
  };
  return (
    <span className={cx(
      'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
      s.chip,
    )}>
      <span className={cx('h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

/** Sivun otsikko. Yhdessä paikassa, jotta jokainen näkymä alkaa samalta. */
export function PageHead({ title, sub, action }: {
  title: string; sub?: ReactNode; action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-text">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </header>
  );
}
