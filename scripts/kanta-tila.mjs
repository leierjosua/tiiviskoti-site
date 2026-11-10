#!/usr/bin/env node
/* Tietokannan sessiot ja lukot: mikä jumittaa CRM:n?
   (10.11.2026: työsivun yhden rivin haku tk.job_reportsista jäi 20 s:iin ja
   kanta perui kyselyitä statement timeoutilla → jokin pitää lukkoa.)

   Aja:  node scripts/kanta-tila.mjs            (vain luku)
         node scripts/kanta-tila.mjs --lopeta   (katkaisee tk_app-roolin sessiot jotka
                                                ovat olleet "idle in transaction" > 60 s
                                                tai estävät muita > 60 s)
   tk_app saa katkaista vain omia sessioitaan; muiden roolien sessiot näkyvät
   ilman kyselytekstiä. */
import fs from 'node:fs';
import path from 'node:path';

const CRM = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'tiiviskoti-crm');
const env = {};
for (const raw of fs.readFileSync(path.join(CRM, '.env.local'), 'utf8').split('\n')) {
  const m = raw.replace(/\r$/, '').match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { default: postgres } = await import(path.join(CRM, 'node_modules/postgres/src/index.js'));
const sql = postgres(env.DATABASE_URL, { ssl: 'require', prepare: false, max: 1 });
const LOPETA = process.argv.includes('--lopeta');

const rows = await sql`
  select pid, usename, application_name app, client_addr::text addr, state,
         wait_event_type, wait_event,
         extract(epoch from now() - xact_start)::int  as tx_s,
         extract(epoch from now() - query_start)::int as q_s,
         pg_blocking_pids(pid) as blocked_by,
         left(regexp_replace(coalesce(query, ''), '\\s+', ' ', 'g'), 110) as query
    from pg_stat_activity
   where datname = current_database() and pid <> pg_backend_pid()
     and (state is distinct from 'idle' or xact_start is not null)
   order by xact_start nulls last`;

console.log(`\n== Aktiiviset sessiot (${rows.length}) ==`);
for (const r of rows) {
  console.log(`pid ${r.pid} ${r.usename ?? '?'} ${r.state ?? '-'}`
    + `${r.wait_event ? ` odottaa ${r.wait_event_type}/${r.wait_event}` : ''}`
    + ` | tx ${r.tx_s ?? '-'} s, kysely ${r.q_s ?? '-'} s`
    + `${r.blocked_by?.length ? ` | ESTÄÄ: ${r.blocked_by.join(',')}` : ''}`
    + `\n    ${r.query || '(ei näkyvissä)'}`);
}

const locks = await sql`
  select l.pid, l.mode, l.granted, c.relname
    from pg_locks l join pg_class c on c.oid = l.relation
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'tk' and (not l.granted or l.mode in ('AccessExclusiveLock','ExclusiveLock','ShareRowExclusiveLock'))
   order by c.relname`;
console.log(`\n== Raskaat tai odottavat lukot tk-skeemassa (${locks.length}) ==`);
for (const l of locks) console.log(`pid ${l.pid} ${l.granted ? 'PITÄÄ' : 'ODOTTAA'} ${l.mode} ${l.relname}`);

const [st] = await sql`select current_setting('statement_timeout') st, current_setting('lock_timeout') lt,
  (select count(*) from pg_stat_activity where usename = current_user)::int omat`;
console.log(`\nstatement_timeout ${st.st}, lock_timeout ${st.lt}, tk_app-sessioita ${st.omat}`);

if (LOPETA) {
  const kohteet = rows.filter((r) => r.usename === 'tk_app' && (
    (r.state === 'idle in transaction' && r.tx_s > 60) ||
    (rows.some((o) => o.blocked_by?.includes(r.pid)) && r.tx_s > 60)));
  console.log(`\n== Katkaistaan ${kohteet.length} sessiota ==`);
  for (const r of kohteet) {
    const [x] = await sql`select pg_terminate_backend(${r.pid}) ok`;
    console.log(`pid ${r.pid} → ${x.ok ? 'katkaistu' : 'EI onnistunut'}`);
  }
}
await sql.end();
