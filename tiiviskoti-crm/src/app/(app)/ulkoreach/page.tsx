import Link from 'next/link';
import { requireManager } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Card, PageHead, Button } from '@/components/ui';
import { ProspectTable, type Row } from './ui';
import { setCampaignStatus } from './actions';

export const dynamic = 'force-dynamic';

type Campaign = { id: string; name: string; status: string; daily_cap: number };

const SEGMENTS = [
  { key: 'isannointi', label: 'Isännöinti', campaign: 'Isännöinti Uusimaa' },
  { key: 'taloyhtio', label: 'Taloyhtiöt', campaign: 'Taloyhtiöt Uusimaa' },
] as const;

export default async function UlkoreachPage({
  searchParams,
}: { searchParams: Promise<{ segment?: string }> }) {
  await requireManager();
  const { segment } = await searchParams;
  const seg = SEGMENTS.find((s) => s.key === segment) ?? SEGMENTS[0];
  const sb = supabaseAdmin();

  const { data: campaign } = await sb
    .from('outreach_campaign')
    .select('id, name, status, daily_cap')
    .eq('name', seg.campaign)
    .maybeSingle<Campaign>();

  const { data: rows = [] } = await sb
    .from('outreach_prospect_overview')
    .select('*')
    .eq('segment', seg.key)
    .order('city', { ascending: true })
    .order('company_name', { ascending: true });

  const list = (rows ?? []) as Row[];
  const stat = {
    total: list.length,
    email: list.filter((r) => r.email).length,
    contacted: list.filter((r) => ['contacted', 'opened', 'replied', 'booked', 'won'].includes(r.status)).length,
    opened: list.filter((r) => r.opened).length,
    replied: list.filter((r) => r.replied || r.status === 'replied').length,
    booked: list.filter((r) => ['booked', 'won'].includes(r.status)).length,
  };
  const active = campaign?.status === 'active';

  return (
    <div className="space-y-6">
      <PageHead
        title="Ulkoreach"
        sub="Kylmä B2B-kampanja — automaattinen sähköpostiputki isännöinnille ja taloyhtiöille."
        action={campaign ? (
          <form action={setCampaignStatus}>
            <input type="hidden" name="id" value={campaign.id} />
            <input type="hidden" name="status" value={active ? 'paused' : 'active'} />
            <Button type="submit">{active ? 'Keskeytä kampanja' : 'Aktivoi kampanja'}</Button>
          </form>
        ) : undefined}
      />

      {/* Segment-välilehdet */}
      <div className="flex gap-1 border-b border-line">
        {SEGMENTS.map((s) => {
          const on = s.key === seg.key;
          return (
            <Link key={s.key} href={`/ulkoreach?segment=${s.key}`}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                on ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-text'}`}>
              {s.label}
            </Link>
          );
        })}
      </div>

      {campaign && (
        <p className="text-xs text-muted">
          Kampanja <b>{campaign.name}</b> — tila <b>{active ? 'Aktiivinen' : campaign.status === 'paused' ? 'Tauolla' : 'Luonnos'}</b>.
          Hyväksytyt erät lähtevät automaattisesti (max {campaign.daily_cap}/vrk), kun kampanja on aktiivinen.
        </p>
      )}

      {stat.total === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Ei vielä {seg.label.toLowerCase()}-kohteita. {seg.key === 'taloyhtio'
              ? 'Lisää taloyhtiöiden yhteyshenkilöt (ks. ohje sähköpostien keräämisestä).'
              : 'Tuo prospektit import-skriptillä.'}
          </p>
        </Card>
      ) : (
        <>
          {stat.email < stat.total && (
            <div className="rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
              <b>{stat.total - stat.email}</b> kohteelta puuttuu sähköposti — ne eivät lähde ennen kuin osoite on lisätty.
              {' '}<b>{stat.email}</b> valmiina lähetykseen.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Stat label="Kohteet" value={stat.total} />
            <Stat label="Sähköposti" value={stat.email} />
            <Stat label="Kontaktoitu" value={stat.contacted} />
            <Stat label="Avannut" value={stat.opened} />
            <Stat label="Vastannut" value={stat.replied} accent />
            <Stat label="Varannut" value={stat.booked} accent />
          </div>

          <Card>
            {campaign
              ? <ProspectTable rows={list} campaignId={campaign.id} />
              : <p className="text-sm text-muted">Kampanjaa ei löytynyt tälle segmentille.</p>}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? 'border-accent/40 bg-accent-dim' : 'border-line bg-ink-800'}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${accent ? 'text-accent' : 'text-text'}`}>{value}</div>
    </div>
  );
}
