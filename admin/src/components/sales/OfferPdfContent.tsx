/**
 * Reusable offer PDF content — renders the branded offer document.
 * Used both inline in OfferWizard (step 3 preview) and in the standalone OfferPdfPreview page.
 */

import { getPlanText, INSTALLER_QUALIFICATIONS_NOTE } from "@/lib/installPlanText";

const BRAND = "#1e3a8a";
const ACCENT = "#3b82f6";
const ALV_RATE = 25.5;

export interface OfferPdfLineItem {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;      // EUR (not cents)
  totalPrice: number;     // EUR
  lineType: string;
  laborPortion?: number;  // EUR
  optionGroup?: string | null;
  isUpsell?: boolean;
}

export interface OfferPdfData {
  offerNumber: string;
  title: string;
  createdAt: string;
  customerName: string;
  customerAddress: string;
  customerContact: string;
  customerEmail?: string;
  customerPhone?: string;
  lineItems: OfferPdfLineItem[];
  subtotal: number;       // EUR
  discount: number;       // EUR
  total: number;          // EUR
  sellerName?: string;
  noteTitle?: string;
  noteContent?: string;
  signatureDataUrl?: string;
  signerName?: string;
  installPlan?: {
    lapivienti: "sisayksikon_taakse" | "asennuskotelolla";
    lapivienti_text?: string;
    teline: "seinateline" | "parvekkeen_lattia" | "maateline";
    teline_text?: string;
    sahko: "kiintea" | "pistotulppa";
    sahko_text?: string;
    kondenssi: "maahan" | "sadevesikaivoon" | "parveke" | "parveke_astia";
    kondenssi_text?: string;
  };
  // Optional visibility flags for template builder
  hideCustomer?: boolean;
  hideTotals?: boolean;
  hideTermsPages?: boolean;
  hideOfferMeta?: boolean;
  validityDays?: number;
  // Multi-section support: when provided, renders separate tables per section
  sections?: { title: string; items: OfferPdfLineItem[] }[];
  // Option group names — auto-builds sections from lineItems if present
  optionGroups?: string[];
}

export function OfferPdfContent({ data }: { data: OfferPdfData }) {
  const { offerNumber, customerName, customerAddress, lineItems, discount, total } = data;

  // Auto-build sections from optionGroups if no explicit sections provided
  const hasOptionGroups = !!(data.optionGroups && data.optionGroups.length > 0);
  const baseItems = lineItems.filter((li) => !li.optionGroup && !li.isUpsell);

  const effectiveSections = data.sections ?? (() => {
    if (!hasOptionGroups) return undefined;
    const sections: { title: string; items: OfferPdfLineItem[]; showSubtotal?: boolean }[] = [];
    // Base items merged INTO each package (not separate)
    for (const g of data.optionGroups!) {
      const groupItems = lineItems.filter((li) => li.optionGroup === g);
      if (groupItems.length > 0) {
        sections.push({
          title: `Vaihtoehto: ${g}`,
          items: [...groupItems, ...baseItems],
          showSubtotal: true,
        });
      }
    }
    const upsellItems = lineItems.filter((li) => li.isUpsell);
    if (upsellItems.length > 0) sections.push({ title: "Ekstrat (valinnaiset)", items: upsellItems });
    return sections.length > 0 ? sections : undefined;
  })();

  const offerDate = new Date(data.createdAt).toLocaleDateString("fi-FI", { timeZone: "Europe/Helsinki" });
  const validUntil = new Date(new Date(data.createdAt).getTime() + (data.validityDays ?? 30) * 86400000).toLocaleDateString("fi-FI", { timeZone: "Europe/Helsinki" });

  const laborTotal = lineItems
    .filter((li) => li.lineType !== "product")
    .reduce((sum, li) => sum + (li.laborPortion ?? li.unitPrice) * li.quantity, 0);
  const vatExclTotal = total / (1 + ALV_RATE / 100);
  const vatAmount = total - vatExclTotal;
  const termsPageCount = data.hideTermsPages ? 0 : 4;
  const pages = 1 + termsPageCount + (data.installPlan ? 1 : 0) + (data.signatureDataUrl ? 1 : 0);

  return (
    <div style={{ fontFamily: "'Outfit', 'Inter', 'Helvetica Neue', Arial, sans-serif", color: "#1f2937", lineHeight: 1.4 }}>

      {/* ═══ PAGE 1 ═══ */}
      <div style={{ padding: "40px", minHeight: "1122px", position: "relative" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
          <Logo size={76} />
          <div style={{ textAlign: "right" }}>
            <h1 style={{ color: BRAND, fontSize: "32px", fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 4px 0", lineHeight: 1 }}>TARJOUS</h1>
            {!data.hideOfferMeta && <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>Tarjous #{offerNumber}</p>}
          </div>
        </div>

        <div style={{ height: "3px", background: `linear-gradient(to right, ${BRAND}, ${ACCENT})`, borderRadius: "2px", marginBottom: "24px" }} />

        {/* Customer + meta cards */}
        {(!data.hideCustomer || !data.hideOfferMeta) && (
          <div style={{ display: "flex", gap: "16px", marginBottom: "32px" }}>
            {!data.hideCustomer && (
              <div style={{ flex: 1, background: "#f8fafc", borderRadius: "10px", padding: "16px 20px", borderLeft: `4px solid ${BRAND}` }}>
                <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Asiakas</p>
                <p style={{ fontSize: "15px", fontWeight: 700, color: BRAND, margin: 0 }}>{customerName}</p>
                {customerAddress && <p style={{ fontSize: "12px", color: "#4b5563", margin: "4px 0 0" }}>{customerAddress}</p>}
                {data.customerEmail && <p style={{ fontSize: "12px", color: "#4b5563", margin: "4px 0 0" }}>{data.customerEmail}</p>}
                {data.customerPhone && <p style={{ fontSize: "12px", color: "#4b5563", margin: "4px 0 0" }}>{data.customerPhone}</p>}
              </div>
            )}
            {!data.hideOfferMeta && (
              <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "16px 20px", borderLeft: `4px solid ${ACCENT}`, minWidth: "200px", flex: data.hideCustomer ? 1 : undefined }}>
                  <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Tarjouksen tiedot</p>
                  <p style={{ fontSize: "12px", color: "#4b5563", margin: 0 }}><span style={{ color: "#9ca3af" }}>Tarjous:</span> #{offerNumber}</p>
                  <p style={{ fontSize: "12px", color: "#4b5563", margin: "4px 0 0" }}><span style={{ color: "#9ca3af" }}>Päivämäärä:</span> {offerDate}</p>
                  <p style={{ fontSize: "12px", color: "#4b5563", margin: "4px 0 0" }}><span style={{ color: "#9ca3af" }}>Voimassa:</span> {validUntil}</p>
                  {data.sellerName && <p style={{ fontSize: "12px", color: "#4b5563", margin: "4px 0 0" }}><span style={{ color: "#9ca3af" }}>Myyjä:</span> {data.sellerName}</p>}
              </div>
            )}
          </div>
        )}

        <p style={{ fontSize: "11px", color: "#9ca3af", textAlign: "right", marginBottom: "8px" }}>Hinnat sis. ALV {ALV_RATE} %</p>

        {/* Table(s) — sections or flat */}
        {effectiveSections && effectiveSections.length > 0 ? (
          effectiveSections.map((section, si) => {
            const sectionTotal = section.items.reduce((sum, li) => sum + li.totalPrice, 0);
            return (
              <div key={si} style={{ marginBottom: "24px" }}>
                {section.title && (
                  <h3 style={{ fontSize: "14px", fontWeight: 700, color: BRAND, marginBottom: "8px", borderBottom: `2px solid ${ACCENT}`, paddingBottom: "4px" }}>
                    {section.title}
                  </h3>
                )}
                <ItemTable items={section.items} />
                {(section as { showSubtotal?: boolean }).showSubtotal && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: BRAND, padding: "6px 12px", background: "#f0f4ff", borderRadius: "6px" }}>
                      Yhteensä: {fmtEur(sectionTotal)}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <ItemTable items={lineItems.filter((li) => !li.isUpsell)} />
        )}

        {/* Totals — hidden when option groups are present (each package shows its own total) */}
        {!data.hideTotals && !hasOptionGroups && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ width: "320px" }}>
              {[
                { label: "Työn osuus", value: laborTotal },
                { label: "Veroton hinta", value: vatExclTotal },
                { label: `ALV ${ALV_RATE} %`, value: vatAmount },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "12px", color: "#4b5563", whiteSpace: "nowrap" }}>
                  <span>{row.label}</span><span style={{ textAlign: "right", minWidth: "120px" }}>{fmtEur(row.value)}</span>
                </div>
              ))}
              {discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "12px", color: "#dc2626", whiteSpace: "nowrap" }}>
                  <span>Alennus</span><span style={{ textAlign: "right", minWidth: "120px" }}>-{fmtEur(discount)}</span>
                </div>
              )}
              <div style={{ background: BRAND, borderRadius: "8px", padding: "12px 16px", marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "20px", fontWeight: 800, color: "white", whiteSpace: "nowrap" }}>
                <span>YHTEENSÄ</span><span style={{ textAlign: "right" }}>{fmtEur(total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Upsells / extras — shown below totals */}
        {!effectiveSections && lineItems.some((li) => li.isUpsell) && (
          <div style={{ marginTop: "24px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, color: BRAND, marginBottom: "8px", borderBottom: `2px solid ${ACCENT}`, paddingBottom: "6px" }}>
              Ekstrat (valinnaiset)
            </h3>
            <ItemTable items={lineItems.filter((li) => li.isUpsell)} headerColor={ACCENT} />
          </div>
        )}

        {data.noteContent && (
          <div style={{ marginTop: "24px", padding: "16px 20px", background: "#f8fafc", borderRadius: "10px", borderLeft: `4px solid ${ACCENT}` }}>
            {data.noteTitle && <p style={{ fontSize: "12px", fontWeight: 700, color: BRAND, marginBottom: "8px" }}>{data.noteTitle}</p>}
            <p style={{ fontSize: "12px", color: "#4b5563", lineHeight: 1.6, whiteSpace: "pre-line" }}>{data.noteContent}</p>
          </div>
        )}

        <Footer page={1} totalPages={pages} />
      </div>

      {/* ═══ PAGES 2-5: Terms (conditional) ═══ */}
      {!data.hideTermsPages && <>
      <div style={{ padding: "40px", minHeight: "1122px", position: "relative", pageBreakBefore: "always" }}>
        <SmallHeader />

        <Section title="Hinta sisältää (ilmalämpöpumppu perusasennettuna)">
          <p style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>Perusasennus sisältää seuraavat työt ja tarvikkeet</p>
          <BulletList items={[
            "Ilmalämpöpumpun sisä- ja ulkoyksikön asennus",
            "1 kpl läpivienti puuläpivienti ulkoseinään",
            "Enintään 5 m kylmäaineputkitusta asennettuna (kytkennät ja tarvikkeet mukana, pinta-asennus)",
            "Kylmäaineputkien kotelointi (valkoinen tai ruskea asennuskouru)",
            "Ilmalämpöpumpun sähköistys pistotulpalla lähimmältä pistorasialta (sis. max. 5 m sähkövedon)",
            "Seinäteline asennettuna ulkoyksikön alle",
            "Käyttöönotto ja käyttöopastus",
            "Asennuspöytäkirja",
          ]} />
        </Section>

        <Section title="Erikseen veloitettavat mahdolliset lisätyöt ja tarvikkeet">
          <p style={{ fontSize: "12px", color: "#4b5563", marginBottom: "10px" }}>Seuraavat lisätyöt ja tarvikkeet veloitetaan erikseen toteutuneen / sovitun mukaisesti:</p>
          <BulletList items={[
            "Lisämetrit kylmäaineputkitukseen 5 m ylittävältä osalta: 45,00 € / m",
            "Sähkösyöttö sähkökeskukselta alkaen: 300,00 €",
            "Sähköistyksen lisämetrit 5 m ylittävältä osalta: 9,00 € / m",
            "Erikseen sovittavat lisätyöt: 90,00 € / h",
            "Lisäläpiviennit ja läpivienti tiili- tai laattaseinään: 70,00 € / kpl (puuseinään: 50,00 € / kpl)",
            "Timanttiporaus betonielementtiin tms. alle 150 cm korkeuteen: 300,00 € / läpivienti (yli 150 cm: 350,00 €)",
            "Korkean paikan työskentely yli 4 m korkeudessa: 95,00 € / alkaen",
            "Porrastikkaat (sisäyksikkö asennetaan korkealle kierreportaisiin): 70,00 €",
            "Ulkoyksikön maatukiteline asennettuna: 75,00 € / kpl",
          ]} />
          <p style={{ fontSize: "12px", fontWeight: 600, marginTop: "12px" }}>Hinnat sisältävät ALV {ALV_RATE} %.</p>
        </Section>

        <Section title="Muuta">
          <BulletList items={[
            "Hinta ei sisällä mahdollisen sisäänrakennetun wifi-sovittimen käyttöönottoa ja ohjelmointia.",
            "Timanttiporauksen aikana käytetään imurikaulusta, jotta porauksen aikana syntyvän lietteen poisto saadaan hallitusti tehtyä. Tämän vuoksi poraamisen yhteydessä maalikerros saattaa tapauskohtaisesti kärsiä noin 15 cm alueella läpivientireiän ympärillä. Tämän pienen pintavaurion korjaamisesta vastaa tilaaja.",
          ]} />
        </Section>

        <Section title="Takuut">
          <BulletList items={[
            "Yleinen laitetakuu: 2 vuotta",
            ...(lineItems.some((li) => /arctic/i.test(li.name)) ? ["Toshiba Arctic -sarjan laitetakuu: 3 vuotta"] : []),
            "Asennustakuu: 2 vuotta",
          ]} />
        </Section>

        <Footer page={2} totalPages={pages} />
      </div>

      {/* ═══ PAGE 3: Toimitusehdot ═══ */}
      <div style={{ padding: "40px", minHeight: "1122px", position: "relative", pageBreakBefore: "always" }}>
        <SmallHeader />

        <Section title="Toimitusehdot (Lasikiilto Oy)">
          <p style={{ fontSize: "12px", marginBottom: "8px" }}>
            <strong>Myyjä:</strong> Lasikiilto.fi
          </p>
          <p style={{ fontSize: "12px", marginBottom: "16px" }}>
            Tuotteiden hinnat sisältävät ALV {ALV_RATE} %. Kaikki maksut suoritetaan euroissa. Pidätämme oikeuden hinnanmuutoksiin. Mikäli jonkin tuotteen saatavuus loppuu tai pitkittyy kohtuuttomasti, pidätämme oikeuden yksipuolisesti perua osia tilauksesta toimituksen nopeuttamiseksi. Sopimus syntyy tilauksen yhteydessä. Tilauksen loppusummaan sisällytetään kiinteät toimituskulut maksutavasta riippumatta.
          </p>

          <SubSection title="TOIMITUSAIKA">
            Tuotteiden toimitusaika vaihtelee tuotteittain ja tavarantoimittajasta riippuen. Mikäli toimitusaika viivästyy Lasikiilto Oy:stä riippumattomasta syystä (esim. maahantuojan toimitusvaikeudet), emme voi taata tuotteen saatavuutta tai toimitusta sovitun toimitusajan puitteissa. Jos tilaus viivästyy tai muuttuu vastoin ennalta annettua saapumistietoa, tiedotamme siitä asiakkaalle. Tilauksen tilaa voi tiedustella sähköpostilla palautelomakkeemme kautta.
          </SubSection>

          <SubSection title="ASENNUKSEN TOIMITUSAIKA">
            Asennuksen toimitusaika sovitaan erikseen. Tyypillisesti asennus tapahtuu noin 2–6 viikon kuluessa sesongista ja tilauskannasta riippuen. Aikataulu riippuu työtilanteesta, työmaiden määrästä sekä tilausten määrästä.
          </SubSection>

          <SubSection title="ASENNUKSEN PERUMINEN (Lasikiilto Oy:stä riippumattomista syistä)">
            Mikäli tilaaja peruu sovitun asennuksen toimitusajan alle 7 vuorokautta ennen sovittua asennuspäivämäärää, Lasikiilto Oy:llä on oikeus veloittaa asiakkaalta korvauksena 200,00 € (sis. ALV 25,5 %).
          </SubSection>

          <SubSection title="LAITTEEN TOIMITUS">
            Lähtökohtaisesti Lasikiilto Oy toimittaa tuotteet ja laitteet asennuksen yhteydessä. Lasikiilto Oy voi myös toimittaa tuotteet ennen asennusta tilaajan ilmoittamaan osoitteeseen. Tilaaja ottaa toimituksen vastaan.
            <br /><br />
            Tavarat tuodaan toimitusosoitteeseen, mikäli osoitteeseen pääsee pakettiautolla (minimikorkeus 2,5 m). Muussa tapauksessa toimitus tapahtuu kuljettavissa olevan tien päähän. Lasikiilto Oy ilmoittaa asiakkaalle toimitusajan ennen toimitusta.
          </SubSection>

          <SubSection title="TUOTTEEN PALAUTUSOIKEUS">
            Kuluttajansuojalain mukainen palautusoikeus on <strong>14 päivää</strong>. Palautusoikeus koskee tuotteita ja laitteita, mutta ei työtä sisältäviä tuotteita. Maksettu summa hyvitetään tilillenne <strong>30 päivän</strong> kuluessa, mikäli tilinumero ilmoitetaan välittömästi ja teillä on lähettää kaupan yhteydessä saatu laskukopio.
            <br /><br />
            Palautettavan tuotteen tulee olla alkuperäisessä kunnossa, käyttämätön ja jälleenmyyntikelpoinen. Jos tuote on vioittunut, se vaihdetaan uuteen. Palautuksesta tai vaihdosta tulee ilmoittaa viipymättä kirjallisesti (esim. sähköpostitse).
            <br /><br />
            Tilaukset, jotka sisältävät asennus- tai muuta työtä, laskutetaan tavallisesti vasta työn valmistuttua.
          </SubSection>
        </Section>

        <Footer page={3} totalPages={pages} />
      </div>

      {/* ═══ PAGE 4: Takuu tarkennus + rajoitukset ═══ */}
      <div style={{ padding: "40px", minHeight: "1122px", position: "relative", pageBreakBefore: "always" }}>
        <SmallHeader />

        <Section title="Laite- ja asennustakuu (tarkennus)">
          <p style={{ fontSize: "12px", marginBottom: "12px" }}>
            Lasikiilto Oy myöntää myymilleen laitteille maahantuojan ja/tai valmistajan takuun. Lasikiilto Oy:n kylmäasentajat ovat sertifioituja ja Tukesin hyväksymiä kylmäasentajia. Kylmäainetta sisältävien laitteiden asennus tapahtuu Lasikiilto Oy:n omien tai Lasikiilto Oy:n valtuuttamien asentajien toimesta standardien ja takuu-ehtojen mukaisesti.
          </p>
          <p style={{ fontSize: "12px", marginBottom: "12px" }}>
            Asennustyön takuu on yksityishenkilöille <strong>2 vuotta</strong> ja yrityksille/yhteisöille <strong>1 vuosi</strong>.
          </p>
        </Section>

        <Section title="Takuun ja vastuun rajoitukset">
          <p style={{ fontSize: "12px", marginBottom: "12px" }}>
            Takuu ei ole voimassa, jos laite on asennettu ilman asianmukaisia lupia tai asentajan ammattitaidon/lupien puutteen vuoksi virheellisesti. Asianmukaisesti tehty asennus on edellytys myös laitteen tehdastakuulle.
          </p>
          <p style={{ fontSize: "12px", marginBottom: "10px" }}>
            Lasikiilto Oy ei vastaa takuutyönä vioista, jotka johtuvat ulkoisista olosuhteista, väärästä käytöstä tai huolimattomuudesta. Takuun ulkopuolelle kuuluvat mm.:
          </p>
          <BulletList items={[
            "Kolmannen osapuolen virheellinen asennus/mitoitus tai teknisten arvojen ylitys",
            "Lain mukaiset määräaikaistarkistukset on laiminlyöty",
            "Huolimattomuudesta johtuvat viat (esim. jäätä kertyy ulkoyksikköön niin, että puhallin vahingoittuu)",
            "Huoltotoimenpiteiden laiminlyönti (esim. suodattimien puhdistuksen laiminlyönti)",
            "Sähköverkon poikkeukselliset jännitevaihtelut",
            "Myrsky-, ukkonen-, lumi-/jääkuormavahingot",
            "Eläinten aiheuttamat vahingot",
            "Terävillä esineillä aiheutetut kylmäpiirin vuodot",
            "Aggressiivinen ympäristö (syövyttävät epäpuhtaudet ilmassa)",
            "Tarvikkeet kuten suodattimet",
            "Normaalista kulumisesta johtuvat komponenttivaihdot",
            "Vahingot, joita tuote aiheuttaa toiselle esineelle tai henkilölle",
            "Toiminnan kannalta merkityksettömät viat tai puutteet",
            "Normaaliin toimintaan liittyvät äänet (esim. sulatusjaksojen aikana)",
            "Poikkeuksellisesta asennuspaikasta johtuvat lisäkustannukset (korkea asennus, vaikeasti saavutettavat kohteet)",
            "Komponenttien käyttö muuhun kuin suunniteltuun tarkoitukseen",
            "Ilma-vesilämpöpumppujen viat, jotka johtuvat vesivirtaaman muutoksista (esim. lian erotin tukossa)",
          ]} />
          <p style={{ fontSize: "12px", marginTop: "12px" }}>
            Takuu on voimassa näiden ehtojen mukaisesti vain Suomessa. Lasikiilto Oy ei ole velvollinen korvaamaan välillisiä tai välittömiä vahinkoja (esim. saamatta jäänyt energiansäästö tai laitteen aiheuttamat vahingot).
          </p>
        </Section>

        <Footer page={4} totalPages={pages} />
      </div>

      {/* ═══ PAGE 5: Tietosuoja, maksaminen, muuta, läpiviennit, tilaajan vastuut ═══ */}
      <div style={{ padding: "40px", minHeight: "1122px", position: "relative", pageBreakBefore: "always" }}>
        <SmallHeader />

        <Section title="Asiakkaan tietosuoja">
          <p style={{ fontSize: "12px", marginBottom: "12px" }}>
            Tilauksen yhteydessä kysytyt yhteystiedot ovat ainoastaan Lasikiilto Oy:n käytössä, lukuun ottamatta ulkoisia palveluntarjoajia. Tietoja ei luovuteta Lasikiilto Oy:n ulkopuolelle tai yhteistyökumppaneille omaan käyttöön, pois lukien luottohakemukseen, perintään tai laskutukseen liittyvät asiat sekä lainsäädännön velvoitteet.
          </p>
          <p style={{ fontSize: "12px" }}>
            Henkilötietoja ei siirretä EU:n ulkopuolelle, ellei se ole teknisen toteutuksen varmistamiseksi tarpeellista. Vanhentunut tai virheellinen tieto hävitetään.
          </p>
        </Section>

        <Section title="Maksaminen">
          <p style={{ fontSize: "12px" }}>
            Lasikiilto Oy:ltä tilatut laitteet ja palvelut maksetaan aina laskulla tai muulla Lasikiilto Oy:n tarjoamalla maksutavalla. Kaikki maksut suoritetaan euroissa.
          </p>
        </Section>

        <Section title="Muuta (tarkennus)">
          <p style={{ fontSize: "12px", marginBottom: "12px" }}>
            Mikäli Lasikiilto Oy:n materiaaleissa tai hinnoissa esiintyy ilmeisiä kirjoitus-, laskenta- tai tietojenkäsittelyvirheitä, Lasikiilto Oy ei ole velvollinen toimittamaan tuotteita näiden virheellisten tietojen mukaisesti. Tilaaja päättää, haluaako toimituksen korjatuin ehdoin ja tiedoin.
          </p>
          <p style={{ fontSize: "12px" }}>
            Tavara on myyjän omaisuutta, kunnes tuotteesta saatu lasku on kokonaisuudessaan maksettu.
          </p>
        </Section>

        <Section title="Läpiviennit">
          <p style={{ fontSize: "12px", marginBottom: "12px" }}>
            Läpivienteihin liittyy aina riskejä. Mikäli pora joudutaan kiinnittämään seinään, seinään voi jäädä jälkiä, jotka tilaaja korjaa itse. Jälkien suuruus pyritään minimoimaan. Vanhassa betonissa voi syntyä murtumia.
          </p>
          <p style={{ fontSize: "12px", marginBottom: "12px" }}>
            Tilaaja vastaa siitä, ettei läpiviennin kohdalla ole sähkö-, vesi- tai viemärilinjoja tai muuta talotekniikkaa, joka voi rikkoutua läpivientiä tehtäessä. Timanttiporauksen yhteydessä maalikerros saattaa tapauskohtaisesti kärsiä noin 15 cm alueella läpivientireiän reunasta. Pienen pintavaurion korjaamisesta vastaa tilaaja.
          </p>
          <p style={{ fontSize: "12px" }}>
            Lasikiilto Oy tekee läpiviennit kohteessa tehtävän katselmuksen ja asiakkaalta saatujen tietojen perusteella. Asiakas vastaa annettujen tietojen oikeellisuudesta. Läpivientityön tilaaminen vahvistetaan kirjallisesti (esim. sähköpostitse). Läpivientityön peruminen ei ole mahdollista työn tekemisen aloittamisen jälkeen.
          </p>
        </Section>

        <Section title="Tilaajan vastuut">
          <p style={{ fontSize: "12px", marginBottom: "12px" }}>
            Tilaaja vastaa Lasikiilto Oy:n ja tilaajan teknisten vaatimusten riittävästä yhdenmukaisuudesta. Tilaajan vastuulla on verrata Lasikiilto Oy:n toimitussisällön yhdenmukaisuutta ja riittävyyttä tilaajalta vaadittuihin ehtoihin (esim. taloyhtiön toimitus- ja muut ehdot) asennuksen ja laitteiston osalta.
          </p>
          <p style={{ fontSize: "12px" }}>
            Hyväksymällä Lasikiilto Oy:n tilauksen tilaaja hyväksyy toimitussisällön ja vahvistaa verranneensa sitä tilaajan asettamiin vaatimuksiin.
          </p>
        </Section>

        <Footer page={5} totalPages={pages} />
      </div>
      </>}

      {/* ═══ Asennussuunnitelma (conditional) ═══ */}
      {data.installPlan && (() => {
        const plan = data.installPlan;
        const pageNum = 1 + termsPageCount + 1;
        return (
          <div style={{ padding: "40px", minHeight: "1122px", position: "relative", pageBreakBefore: "always" }}>
            <SmallHeader />

            <h2 style={{ fontSize: "18px", fontWeight: 800, color: BRAND, marginBottom: "4px", textTransform: "uppercase" }}>
              Asennussuunnitelma
            </h2>
            <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "20px" }}>Ilmalämpöpumpun asennuskuvaus</p>

            <div style={{ fontSize: "12px", color: "#374151", marginBottom: "12px" }}>
              <p><strong>{customerName}</strong></p>
              {customerAddress && <p style={{ color: "#6b7280" }}>{customerAddress}</p>}
              <p style={{ color: "#9ca3af", marginTop: "4px" }}>{offerDate}</p>
            </div>

            <div style={{ fontSize: "12px", color: "#374151", lineHeight: 1.8 }}>
              <p style={{ marginBottom: "16px" }}>
                Ilmalämpöpumpun asennustyö aloitetaan sisäyksikön asennuksesta. Sisäyksikkö asennetaan seinälle.
              </p>

              <h3 style={{ fontSize: "13px", fontWeight: 700, color: BRAND, marginBottom: "6px" }}>Läpivienti</h3>
              {getPlanText(plan, "lapivienti").split(/\r?\n/).filter((l) => l.trim()).map((l, i) => (
                <p key={i} style={{ marginBottom: "8px" }}>{l}</p>
              ))}
              <p style={{ marginBottom: "16px" }}>
                Ulkoseinään tehtävä läpivientireikä on halkaisijaltaan noin 7 cm ja se tehdään ulospäin kaatavaksi tarvittaessa timanttiporauksella. Kosteusongelmien välttämiseksi ulkoseinän läpiviennissä käytetään muovista läpivientiputkea, jonka ympärykset eristetään. Mahdollisen höyrysulun kohdalle laitetaan tiivistysmassa ja läpivienti eristetään tavallisesti PU-vaahdolla.
              </p>

              <h3 style={{ fontSize: "13px", fontWeight: 700, color: BRAND, marginBottom: "6px" }}>Ulkoyksikön asennus</h3>
              <p style={{ marginBottom: "4px" }}>Ilmalämpöpumpun ulkoyksikkö asennetaan:</p>
              {getPlanText(plan, "teline").split(/\r?\n/).filter((l) => l.trim()).map((l, i) => (
                <p key={i} style={{ paddingLeft: "12px", marginBottom: "4px" }}>– {l}</p>
              ))}
              <p style={{ marginBottom: "16px" }}>
                Sisä- ja ulkoyksikön väliin asennetaan kylmäaineputket, kondenssivesiputki sekä sähkökaapeli, jotka jäävät muovisen asennuskotelon (väriltään joko valkoinen tai ruskea) alle piiloon.
              </p>

              <h3 style={{ fontSize: "13px", fontWeight: 700, color: BRAND, marginBottom: "6px" }}>Sähkökytkentä</h3>
              <p style={{ marginBottom: "4px" }}>Sähkö otetaan:</p>
              {getPlanText(plan, "sahko").split(/\r?\n/).filter((l) => l.trim()).map((l, i) => (
                <p key={i} style={{ paddingLeft: "12px", marginBottom: "16px" }}>– {l}</p>
              ))}

              <h3 style={{ fontSize: "13px", fontWeight: 700, color: BRAND, marginBottom: "6px" }}>Kondenssivesi</h3>
              <p style={{ marginBottom: "4px" }}>Jäähdytyskäytössä syntyvä kondenssivesi johdetaan sisäyksiköltä kondenssivesiputkella (sisämitta 16 mm):</p>
              {getPlanText(plan, "kondenssi").split(/\r?\n/).filter((l) => l.trim()).map((l, i) => (
                <p key={i} style={{ paddingLeft: "12px", marginBottom: "16px" }}>– {l}</p>
              ))}

              <h3 style={{ fontSize: "13px", fontWeight: 700, color: BRAND, marginBottom: "6px" }}>Lopputoimenpiteet</h3>
              <p style={{ marginBottom: "8px" }}>
                Sisä- ja ulkoyksikön väliset putket kytketään ja järjestelmä tyhjiöidään järjestelmässä mahdollisesti olevan kosteuden vuoksi. Tavallisesti ilmalämpöpumpun tyhjiöinti kestää noin yhden tunnin. Tyhjiöinnin loputtua järjestelmän tiiveys tarkastetaan.
              </p>
              <p>
                Kun ilmalämpöpumpun asennus on valmis, työstä tehdään asennuspöytäkirjat asiakkaalle ja asennusliikkeelle sekä annetaan asiakkaalle käyttöopastus laitteen toiminnasta.
              </p>
            </div>

            <p style={{ position: "absolute", bottom: "112px", left: "40px", right: "40px", fontSize: "11px", color: "#6b7280", fontStyle: "italic", textAlign: "center" }}>
              {INSTALLER_QUALIFICATIONS_NOTE}
            </p>
            <Footer page={pageNum} totalPages={pages} />
          </div>
        );
      })()}

      {/* ═══ Hyväksyminen & allekirjoitus (conditional) ═══ */}
      {data.signatureDataUrl && (
        <div style={{ padding: "40px", minHeight: "1122px", position: "relative", pageBreakBefore: "always" }}>
          <SmallHeader />

          <h2 style={{ fontSize: "18px", fontWeight: 800, color: BRAND, marginBottom: "24px", textTransform: "uppercase" }}>
            Tarjouksen hyväksyminen
          </h2>

          {/* Summary recap */}
          <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "20px 24px", marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
              <span style={{ color: "#9ca3af" }}>Tarjous</span>
              <span style={{ fontWeight: 600 }}>#{offerNumber}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
              <span style={{ color: "#9ca3af" }}>Asiakas</span>
              <span style={{ fontWeight: 600 }}>{customerName}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
              <span style={{ color: "#9ca3af" }}>Päivämäärä</span>
              <span style={{ fontWeight: 600 }}>{offerDate}</span>
            </div>
            <div style={{ height: "1px", background: "#e5e7eb", margin: "12px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "18px", fontWeight: 800, color: BRAND }}>
              <span>Yhteensä</span>
              <span>{fmtEur(total)}</span>
            </div>
          </div>

          {/* Acceptance text */}
          <div style={{ borderLeft: `3px solid ${BRAND}`, paddingLeft: "16px", marginBottom: "32px" }}>
            <p style={{ fontSize: "12px", color: "#374151", lineHeight: 1.8 }}>
              Allekirjoittamalla tämän tarjouksen hyväksyn yllä mainitun tarjouksen ja sitoudun noudattamaan
              tarjouksessa ja sen liitteissä mainittuja toimitusehtoja. Olen tutustunut tarjouksen sisältöön,
              toimitusehtoihin sekä takuuehtoihin.
            </p>
          </div>

          {/* Signatures side by side */}
          <div style={{ display: "flex", gap: "40px", marginTop: "16px" }}>
            {/* Customer signature */}
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>
                Tilaaja
              </p>
              <img src={data.signatureDataUrl} alt="Allekirjoitus" style={{ height: "70px", width: "auto", marginBottom: "4px" }} />
              <div style={{ borderTop: "2px solid #1f2937", width: "100%", marginBottom: "6px" }} />
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#1f2937" }}>{data.signerName || customerName}</p>
              {customerAddress && <p style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{customerAddress}</p>}
              <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "6px" }}>{offerDate}</p>
            </div>

            {/* Seller (automatic) */}
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>
                Myyjä
              </p>
              <div style={{ height: "70px", display: "flex", alignItems: "flex-end", marginBottom: "4px" }}>
                <p style={{ fontSize: "16px", fontWeight: 700, color: BRAND, fontStyle: "italic" }}>{data.sellerName || "Lasikiilto Oy"}</p>
              </div>
              <div style={{ borderTop: "2px solid #1f2937", width: "100%", marginBottom: "6px" }} />
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#1f2937" }}>{data.sellerName || "Lasikiilto Oy"}</p>
              <p style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>Lasikiilto Oy</p>
              <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "6px" }}>{offerDate}</p>
            </div>
          </div>

          <Footer page={pages} totalPages={pages} />
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Logo({ size = 48 }: { size?: number }) {
  return <img src="/logo-dark.svg" alt="Lasikiilto" style={{ height: `${size}px`, width: "auto" }} />;
}

function SmallHeader() {
  return (
    <div style={{ marginBottom: "20px" }}>
      <Logo size={54} />
      <div style={{ height: "2px", background: `linear-gradient(to right, ${BRAND}, ${ACCENT})`, borderRadius: "1px", marginTop: "8px" }} />
    </div>
  );
}

function Footer({ page, totalPages }: { page: number; totalPages: number }) {
  return (
    <div style={{ position: "absolute", bottom: "40px", left: "40px", right: "40px" }}>
      <div style={{ height: "2px", background: `linear-gradient(to right, ${BRAND}, ${ACCENT})`, borderRadius: "1px", marginBottom: "10px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#9ca3af" }}>
        <div>Lasikiilto.fi</div>
        <div style={{ textAlign: "center" }}>Puh: 045 875 5996<br />www.lasikiilto.fi<br />info@lasikiilto.fi</div>
        <div style={{ textAlign: "right" }}><span style={{ fontWeight: 600 }}>Sivu {page}/{totalPages}</span></div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "24px", paddingLeft: "16px", borderLeft: `3px solid ${BRAND}` }}>
      <h2 style={{ fontSize: "14px", fontWeight: 800, color: BRAND, marginBottom: "12px", textTransform: "uppercase", lineHeight: 1 }}>{title}</h2>
      <div style={{ fontSize: "12px", color: "#374151", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <h4 style={{ fontSize: "11px", fontWeight: 700, color: BRAND, margin: "0 0 4px" }}>{title}</h4>
      <p style={{ fontSize: "11px", margin: 0 }}>{children}</p>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ paddingLeft: "0", margin: 0, listStyle: "none" }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: "4px", paddingLeft: "16px", position: "relative" }}>
          <span style={{ position: "absolute", left: 0, top: "6px", width: "6px", height: "6px", borderRadius: "1px", background: ACCENT, display: "inline-block" }} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ItemTable({ items, headerColor = BRAND }: { items: OfferPdfLineItem[]; headerColor?: string }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
      <thead>
        <tr>
          {["Tuote/Palvelu", "Määrä", "Hinta", "Yhteensä"].map((h, i) => (
            <th key={h} style={{
              background: headerColor, color: "white", fontSize: "11px", fontWeight: 600, padding: "10px 14px", verticalAlign: "middle",
              textAlign: i === 0 ? "left" : i === 1 ? "center" : "right",
              borderRadius: i === 0 ? "8px 0 0 0" : i === 3 ? "0 8px 0 0" : undefined,
              width: i === 1 ? "70px" : i >= 2 ? "110px" : undefined,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((li, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #e5e7eb", background: i % 2 === 0 ? "#f9fafb" : "white" }}>
            <td style={{ padding: "10px 14px", fontSize: "13px", fontWeight: 500 }}>
              {li.name}
              {li.description && <span style={{ display: "block", fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{li.description}</span>}
            </td>
            <td style={{ padding: "10px 14px", fontSize: "13px", textAlign: "center", color: "#4b5563" }}>{li.quantity}</td>
            <td style={{ padding: "10px 14px", fontSize: "13px", textAlign: "right", color: "#4b5563" }}>{fmtEur(li.unitPrice)}</td>
            <td style={{ padding: "10px 14px", fontSize: "13px", textAlign: "right", fontWeight: 600 }}>{fmtEur(li.totalPrice)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmtEur(val: number): string {
  return val.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
