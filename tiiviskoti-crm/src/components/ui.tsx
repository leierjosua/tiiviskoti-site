import type { ComponentProps, ReactNode } from 'react';

/* Pienet toistuvat palaset yhdessä paikassa. Tarkoituksella kevyt: ei
   komponenttikirjastoa, vain ne muodot joita tässä sovelluksessa on. */

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ' +
  'transition-colors disabled:opacity-40 disabled:pointer-events-none';

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-accent-ink hover:bg-accent/90',
  ghost: 'text-muted hover:text-text hover:bg-ink-700',
  outline: 'border border-line text-text hover:bg-ink-700',
  danger: 'border border-danger/40 text-danger hover:bg-danger/10',
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
    <div className={cx('rounded-lg border border-line bg-ink-800', className)}>{children}</div>
  );
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
      <h2 className="text-sm font-semibold tracking-wide text-text">{title}</h2>
      {action}
    </div>
  );
}

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

const CONTROL =
  'w-full rounded-md border border-line bg-ink-900 px-3 py-2 text-sm text-text ' +
  'placeholder:text-faint focus:border-accent focus:outline-none';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cx(CONTROL, 'tabular', className)} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cx(CONTROL, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cx(CONTROL, className)} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-faint">{children}</div>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

const STATUS_STYLES: Record<string, string> = {
  hold: 'border-faint/40 text-faint',
  tentative: 'border-warn/40 text-warn',
  confirmed: 'border-accent/40 text-accent',
  done: 'border-info/40 text-info',
  cancelled: 'border-line text-faint line-through',
};

const STATUS_LABELS: Record<string, string> = {
  hold: 'Varauksessa',
  tentative: 'Alustava',
  confirmed: 'Vahvistettu',
  done: 'Tehty',
  cancelled: 'Peruttu',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cx(
        'inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium',
        STATUS_STYLES[status] ?? 'border-line text-muted',
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
