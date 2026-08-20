'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager } from '@/lib/session';

/**
 * Ulkoreach-toiminnot. Data on public-skeeman outreach_*-tauluissa, joten
 * käytämme service_role-clientiä (supabaseAdmin), ei tk_app-suorayhteyttä.
 * Kutsuja tarkistetaan aina requireManagerilla.
 */

export async function setCampaignStatus(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !['draft', 'active', 'paused'].includes(status)) return;
  await supabaseAdmin().from('outreach_campaign').update({ status }).eq('id', id);
  revalidatePath('/ulkoreach');
}

/**
 * Hyväksy erä: enrolloi valitut prospektit kampanjaan ja merkitse hyväksytyiksi.
 * Vain ne joilla on sähköposti eikä do_not_contact. Cron lähettää hyväksytyt.
 */
export async function approveBatch(formData: FormData): Promise<void> {
  await requireManager();
  const campaignId = String(formData.get('campaignId') ?? '');
  const ids = formData.getAll('ids').map((v) => String(v)).filter(Boolean);
  if (!campaignId || ids.length === 0) return;

  const sb = supabaseAdmin();
  const now = new Date().toISOString();

  // Hae valitut prospektit (varmista sähköposti + ei opt-out)
  const { data: prospects } = await sb
    .from('outreach_prospect')
    .select('id, email, do_not_contact, status')
    .in('id', ids);

  for (const p of prospects ?? []) {
    if (!p.email || p.do_not_contact) continue;

    // Onko jo liittymä?
    const { data: existing } = await sb
      .from('outreach_enrollment')
      .select('id')
      .eq('prospect_id', p.id)
      .eq('campaign_id', campaignId)
      .maybeSingle();

    if (existing) {
      await sb.from('outreach_enrollment').update({
        status: 'active', approved_at: now, approved_by: null, next_send_at: now,
      }).eq('id', existing.id);
    } else {
      await sb.from('outreach_enrollment').insert({
        prospect_id: p.id, campaign_id: campaignId, status: 'active',
        current_step: 0, next_send_at: now, approved_at: now, approved_by: null,
      });
      await sb.from('outreach_prospect').update({ status: 'queued' }).eq('id', p.id);
    }
  }
  revalidatePath('/ulkoreach');
}
