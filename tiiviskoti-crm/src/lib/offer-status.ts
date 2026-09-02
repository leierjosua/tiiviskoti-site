/* Tarjouksen tilan suomenkieliset nimet.

   MIKSI OMA TIEDOSTO EIKÄ `tarjoukset/ui.tsx`: ui.tsx on `'use client'`, ja
   palvelinkomponentti saa sellaisesta moduulista vain viittauksen — ei oikeaa
   objektia. `OFFER_STATUS[status]` palautti siksi undefined ja tilamerkki
   piirtyi tyhjänä pillerinä (väri tuli oikein, koska sen valitsee client-
   komponentti itse). Tavallinen moduuli toimii molemmilla puolilla. */
export const OFFER_STATUS: Record<string, string> = {
  draft: 'Luonnos',
  sent: 'Lähetetty',
  accepted: 'Hyväksytty',
  declined: 'Hylätty',
  expired: 'Vanhentunut',
};
