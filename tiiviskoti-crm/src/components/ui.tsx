import type { ComponentProps, ReactNode } from 'react';

/* Pienet toistuvat palaset yhdessä paikassa. Tarkoituksella kevyt: ei
   komponenttikirjastoa, vain ne muodot joita tässä sovelluksessa on. */

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/* Napit vähintään 52 px korkeita ja 17 px tekstiä: osuu varmasti myös
   vapisevalla sormella. Painalluspalaute tulee globals.css:stä. */
const BUTTON_BASE =
  'inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-[17px] font-semibold ' +
  'disabled:opacity-45 disabled:pointer-events-none';

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-accent-ink hover:bg-[#1A6340] active:bg-[#16573A]',
  ghost: 'text-accent hover:bg-accent-dim',
  outline: 'border-[1.5px] border-line bg-ink-800 text-text hover:bg-ink-700',
  danger: 'border-[1.5px] border-danger/40 bg-ink-800 text-danger hover:bg-danger/8',
} as const;

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return <button {...props} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} />;
}

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={cx(
      'rounded-(--radius-card) border border-line-soft bg-ink-800 shadow-(--shadow-card)',
      className,
    )}>
      {children}
    </div>
  );
}

/* Otsikko on tavallista tekstiä, ei harvennettua pikkuversaalia. Versaali
   luetaan kirjain kerrallaan eikä sanan muotona, ja 13 px:n harvennettuna
   se oli tämän panelin vaikeimmin luettava elementti. */
export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
      <h2 className="text-[20px] leading-tight font-bold text-text">{title}</h2>
      {action}
    </div>
  );
}

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[17px] font-semibold text-text">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-faint">{hint}</span>}
    </label>
  );
}

const CONTROL =
  'w-full min-h-[52px] rounded-[12px] border-[1.5px] border-line bg-ink-800 px-4 py-3 text-[17px] text-text ' +
  'placeholder:text-faint transition-colors focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none';

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
  return <div className="px-5 py-12 text-center text-[17px] text-muted">{children}</div>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-[12px] border-[1.5px] border-danger/40 bg-danger/8 px-4 py-3 text-[17px] font-semibold text-danger">
      {children}
    </p>
  );
}

export function OkNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-[12px] border-[1.5px] border-accent/40 bg-accent-dim px-4 py-3 text-[17px] font-semibold text-accent">
      {children}
    </p>
  );
}

/* Tilamerkki. Pisteen väri kantaa merkityksen ja teksti toistaa sen, jotta
   tila ei ole pelkän värin varassa. */
const STATUS_STYLES: Record<string, { chip: string; dot: string; label: string }> = {
  hold:      { chip: 'border-line bg-ink-700 text-muted',           dot: 'bg-faint',   label: 'Varauksessa' },
  tentative: { chip: 'border-warn/35 bg-warn/12 text-warn',         dot: 'bg-warn',    label: 'Alustava' },
  confirmed: { chip: 'border-accent/35 bg-accent-dim text-accent',  dot: 'bg-accent',  label: 'Vahvistettu' },
  done:      { chip: 'border-info/35 bg-info/12 text-info',         dot: 'bg-info',    label: 'Tehty' },
  cancelled: { chip: 'border-line bg-ink-700 text-muted line-through', dot: 'bg-faint', label: 'Peruttu' },
  /* Nämä kaksi EIVÄT ole job_status-arvoja vaan johdettuja: ks. jobBadge(). */
  invoiced:  { chip: 'border-warn/35 bg-warn/12 text-warn',         dot: 'bg-warn',    label: 'Lasku lähetetty' },
  paid:      { chip: 'border-accent/35 bg-accent-dim text-accent',  dot: 'bg-accent',  label: 'Maksettu' },
};

/* Työn NÄYTETTÄVÄ tila.

   Kannassa laskutus ja maksu ovat omat kenttänsä (`invoiced_at`, `paid`)
   eivätkä `job_status`-arvoja — muuten jokainen `status = 'done'` -kysely
   olisi alkanut ohittaa laskutetut työt (ks. db/032). Käyttäjälle ne ovat
   silti saman jonon vaiheita, joten ne yhdistetään vasta tässä.

   Järjestys on tarkoituksellinen: maksettu voittaa laskutetun, koska
   käteisellä maksettu työ ei käy laskutuksen kautta lainkaan. */
export function jobBadge(job: {
  status: string;
  invoiced_at?: Date | string | null;
  paid?: boolean | null;
}): string {
  if (job.status !== 'done') return job.status;
  if (job.paid) return 'paid';
  if (job.invoiced_at) return 'invoiced';
  return 'done';
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? {
    chip: 'border-line bg-ink-700 text-muted', dot: 'bg-muted', label: status,
  };
  return (
    <span className={cx(
      'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[15px] font-bold whitespace-nowrap',
      s.chip,
    )}>
      <span className={cx('h-2.5 w-2.5 rounded-full', s.dot)} />
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
        <h1 className="text-[34px] leading-[1.1] font-bold tracking-[-0.02em] text-text">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-[17px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {action}
    </header>
  );
}
