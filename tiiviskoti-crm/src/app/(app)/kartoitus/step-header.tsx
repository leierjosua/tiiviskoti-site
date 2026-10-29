'use client';

/* Numeroitu osion otsikko. Numero kertoo missä kohtaa lomaketta ollaan ja
   kuinka paljon on jäljellä; ohjelause kertoo mitä osiossa tehdään. */
export function StepHeader({ n, title, hint, action }: { n: number; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-[17px] font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[21px] leading-tight font-bold text-text">{title}</h2>
        {hint && <p className="mt-0.5 text-[15px] leading-snug text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

