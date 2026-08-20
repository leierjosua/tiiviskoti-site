# TiivisKoti B2B-ulkoreach — käyttöönotto (Resend + mail.tiiviskoti.fi)

Kylmä B2B-sähköpostiputki isännöintiyrityksille. Erillään Gmail-varaus­sähköposteista
— kylmäposti lähtee **mail.tiiviskoti.fi**-alidomainista, jotta se ei vaaranna
varaussähköpostien toimitettavuutta.

Kaikki koodi on valmis. Alla ne vaiheet, jotka **sinä** teet (tilit + DNS).

---

## 1. Resend-tili + lähetysdomain

1. Luo tili: <https://resend.com> → **API Keys** → luo avain.
2. **Domains → Add Domain** → syötä `mail.tiiviskoti.fi` (alidomain, EI juuridomain).
3. Resend antaa DNS-tietueet. Lisää ne domainisi DNS:ään (esim. Cloudflare):

| Tyyppi | Nimi | Arvo |
|---|---|---|
| MX | `send.mail` | `feedback-smtp.eu-west-1.amazonses.com` (prio 10) |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey.mail` | *(DKIM-avain Resendistä)* |
| TXT | `_dmarc.mail` | `v=DMARC1; p=none; rua=mailto:dmarc@tiiviskoti.fi` |

   *(tarkat arvot näkyvät Resendin Domains-näkymässä — kopioi sieltä)*

4. Odota kunnes Resend näyttää domainin **Verified** (yleensä minuutteja).

> Miksi alidomain: jos kylmäposti joskus saa spam-merkintöjä, se ei tahraa
> juuri­domainista lähteviä varausvahvistuksia.

---

## 2. Supabase-secretit

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxx \
  RESEND_WEBHOOK_SECRET=$(openssl rand -hex 16) \
  OUTREACH_PUBLIC_BASE=https://tiiviskoti.fi
```

## 3. Migraatio + funktiot

```bash
supabase db push                       # luo outreach_*-taulut
supabase functions deploy process-outreach-queue outreach-resend-webhook
```

## 4. Cron (lähetysmoottori 15 min välein)

Lisää `supabase/migrations`-cron tai pg_cron:
```sql
select cron.schedule('outreach-queue', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/process-outreach-queue',
    headers := jsonb_build_object('Authorization', 'Bearer ' || <service_role>)
  );
$$);
```

## 5. Resend-webhook

Resend → **Webhooks → Add** →
`https://<PROJECT_REF>.functions.supabase.co/outreach-resend-webhook`
Lisää header `x-webhook-secret: <RESEND_WEBHOOK_SECRET>`.
Tilaa tapahtumat: `email.delivered, email.opened, email.clicked, email.bounced, email.complained`.

## 6. Unsubscribe-endpoint (tiiviskoti.fi-sivustolle)

Julkinen reitti `/api/outreach/unsubscribe?p=<prospect_id>` kutsuu
`outreach_unsubscribe(p)`-RPC:tä (service_role). Rakennetaan sivustopuolelle.

---

## Turva & laki (B2B-kylmäposti Suomessa)
- **Lähetä vain yrityssähköposteihin** (isännöintitoimistojen info-/työosoitteet).
- Jokaisessa viestissä **selkeä lähettäjä + opt-out** (rakennettu templaatteihin;
  `List-Unsubscribe`-otsake mukana).
- **Approve-a-batch**: mikään ei lähde ennen kuin hyväksyt erän adminissa.
- **Päiväkatto + lähetysikkuna** (oletus 30/vrk, klo 8–17) suojaa domain-mainetta.
- Warmup: aloita pienellä katolla (10–15/vrk) ja nosta viikoittain.
