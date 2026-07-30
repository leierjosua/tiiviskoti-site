'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';
import { Button, ErrorNote, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={action} className="w-full max-w-sm space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded bg-accent" aria-hidden />
            <span className="text-lg font-semibold tracking-tight">TiivisKoti</span>
          </div>
          <p className="text-sm text-muted">Kirjaudu hallintaan.</p>
        </div>

        <ErrorNote>{state.error}</ErrorNote>

        <Field label="Sähköposti">
          <Input name="email" type="email" autoComplete="username" required autoFocus />
        </Field>
        <Field label="Salasana">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Kirjaudutaan…' : 'Kirjaudu'}
        </Button>
      </form>
    </main>
  );
}
