'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { BrandMark } from '@/components/brand';

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <main className="flex min-h-screen">
      {/* Vasen puoli: brändi. Piilotetaan puhelimessa, jossa tila menee
          lomakkeelle. */}
      {/* overflow-hidden on pakollinen: alanurkan hehku on isompi kuin palkki
          ja vuotaisi muuten vaalealle puolelle. */}
      <aside className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-nav p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <BrandMark size={28} tone="dark" />
          <span className="text-base font-extrabold tracking-tight text-nav-text">
            Tiivis<span className="text-nav-muted">Koti</span>
          </span>
        </div>

        <div>
          <h2 className="max-w-sm text-[30px] leading-[1.15] font-extrabold tracking-tight text-nav-text">
            Vedoton koti.<br />Lämpö sisällä.
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-nav-muted">
            Varausten, kalenterien ja palvelualueiden hallinta.
          </p>
        </div>

        <p className="text-xs text-nav-muted/70">Ovien ja ikkunoiden tiivistys · Uusimaa</p>

        {/* Hillitty vihreä hehku alanurkkaan, ettei suuri tumma pinta jää
            täysin litteäksi. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle,#2E9E63 0%,transparent 70%)' }}
        />
      </aside>

      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <form action={action} className="w-full max-w-[360px] space-y-5">
          <div className="lg:hidden">
            <div className="flex items-center gap-2.5">
              <BrandMark size={28} tone="light" />
              <span className="text-base font-extrabold tracking-tight text-text">
                Tiivis<span className="text-accent">Koti</span>
              </span>
            </div>
          </div>

          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight text-text">Kirjaudu hallintaan</h1>
            <p className="mt-1 text-sm text-muted">Käytä työsähköpostiasi.</p>
          </div>

          <ErrorNote>{state.error}</ErrorNote>

          <Field label="Sähköposti">
            <Input name="email" type="email" autoComplete="username" required autoFocus />
          </Field>
          <Field label="Salasana">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>

          <Button type="submit" disabled={pending} className="w-full py-2.5">
            {pending ? 'Kirjaudutaan…' : 'Kirjaudu'}
          </Button>

          <p className="text-xs leading-relaxed text-faint">
            Pääsy vaatii sekä tunnuksen että aktiivisen työntekijärivin. Jos kirjautuminen ei onnistu,
            pyydä omistajaa tarkistamaan tilisi.
          </p>
        </form>
      </div>
    </main>
  );
}
