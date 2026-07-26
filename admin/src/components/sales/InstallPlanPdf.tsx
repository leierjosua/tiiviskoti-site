/**
 * Standalone install plan PDF renderer.
 * Renders a single-page branded installation plan document.
 */

import type { InstallPlan } from "@/pages/sales/offer-wizard/types";
import { getPlanText, INSTALLER_QUALIFICATIONS_NOTE } from "@/lib/installPlanText";

const BRAND = "#1e3a8a";
const ACCENT = "#3b82f6";

interface Props {
  installPlan: InstallPlan;
  customerName: string;
  customerAddress: string;
  date: string;
}

function fDate(iso: string) {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "24px", paddingLeft: "16px", borderLeft: `3px solid ${BRAND}` }}>
      <h2 style={{ fontSize: "14px", fontWeight: 800, color: BRAND, marginBottom: "12px", textTransform: "uppercase", lineHeight: 1 }}>{title}</h2>
      <div style={{ fontSize: "12px", color: "#374151", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: "12px", color: "#374151", paddingLeft: "18px", marginBottom: "6px", lineHeight: 1.5, position: "relative" }}>
      <span style={{ position: "absolute", left: 0, top: "6px", width: "7px", height: "7px", borderRadius: "1px", background: ACCENT, display: "inline-block" }} />
      {children}
    </p>
  );
}

export function InstallPlanPdf({ installPlan: plan, customerName, customerAddress, date }: Props) {
  return (
    <div style={{ padding: "40px", minHeight: "1122px", position: "relative", fontFamily: "'Outfit', 'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <img src="/logo-dark.svg" alt="Lasikiilto" style={{ height: "54px", width: "auto" }} />
        <div style={{ height: "2px", background: `linear-gradient(to right, ${BRAND}, ${ACCENT})`, borderRadius: "1px", marginTop: "8px" }} />
      </div>

      <h2 style={{ fontSize: "18px", fontWeight: 800, color: BRAND, marginBottom: "4px", textTransform: "uppercase" }}>
        Asennussuunnitelma
      </h2>
      <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "20px" }}>Ilmalämpöpumpun asennuskuvaus</p>

      <div style={{ fontSize: "12px", color: "#374151", marginBottom: "12px" }}>
        <p><strong>{customerName}</strong></p>
        {customerAddress && <p style={{ color: "#6b7280" }}>{customerAddress}</p>}
        <p style={{ color: "#9ca3af", marginTop: "4px" }}>{fDate(date)}</p>
      </div>

      <div style={{ fontSize: "12px", color: "#374151", lineHeight: 1.8 }}>
        <p style={{ marginBottom: "16px" }}>
          Ilmalämpöpumpun asennustyö aloitetaan sisäyksikön asennuksesta. Sisäyksikkö asennetaan seinälle.
        </p>

        <Section title="Läpivienti">
          {getPlanText(plan, "lapivienti").split(/\r?\n/).filter((l) => l.trim()).map((l, i) => (
            <Bullet key={i}>{l}</Bullet>
          ))}
          <p style={{ marginBottom: "16px", marginTop: "8px" }}>
            Ulkoseinään tehtävä läpivientireikä on halkaisijaltaan noin 7 cm ja se tehdään ulospäin kaatavaksi tarvittaessa timanttiporauksella. Kosteusongelmien välttämiseksi ulkoseinän läpiviennissä käytetään muovista läpivientiputkea, jonka ympärykset eristetään. Mahdollisen höyrysulun kohdalle laitetaan tiivistysmassa ja läpivienti eristetään tavallisesti PU-vaahdolla.
          </p>
        </Section>

        <Section title="Ulkoyksikön asennus">
          <p style={{ marginBottom: "4px" }}>Ilmalämpöpumpun ulkoyksikkö asennetaan:</p>
          {getPlanText(plan, "teline").split(/\r?\n/).filter((l) => l.trim()).map((l, i) => (
            <Bullet key={i}>{l}</Bullet>
          ))}
          <p style={{ marginBottom: "16px", marginTop: "8px" }}>
            Sisä- ja ulkoyksikön väliin asennetaan kylmäaineputket, kondenssivesiputki sekä sähkökaapeli, jotka jäävät muovisen asennuskotelon (väriltään joko valkoinen tai ruskea) alle piiloon.
          </p>
        </Section>

        <Section title="Sähkökytkentä">
          <p style={{ marginBottom: "4px" }}>Sähkö otetaan:</p>
          {getPlanText(plan, "sahko").split(/\r?\n/).filter((l) => l.trim()).map((l, i) => (
            <Bullet key={i}>{l}</Bullet>
          ))}
        </Section>

        <Section title="Kondenssivesi">
          <p style={{ marginBottom: "4px" }}>Jäähdytyskäytössä syntyvä kondenssivesi johdetaan sisäyksiköltä kondenssivesiputkella (sisämitta 16 mm):</p>
          {getPlanText(plan, "kondenssi").split(/\r?\n/).filter((l) => l.trim()).map((l, i) => (
            <Bullet key={i}>{l}</Bullet>
          ))}
        </Section>

        <Section title="Lopputoimenpiteet">
          <Bullet>
            Sisä- ja ulkoyksikön väliset putket kytketään ja järjestelmä tyhjiöidään järjestelmässä mahdollisesti olevan kosteuden vuoksi. Tavallisesti ilmalämpöpumpun tyhjiöinti kestää noin yhden tunnin. Tyhjiöinnin loputtua järjestelmän tiiveys tarkastetaan.
          </Bullet>
          <Bullet>
            Kun ilmalämpöpumpun asennus on valmis, työstä tehdään asennuspöytäkirjat asiakkaalle ja asennusliikkeelle sekä annetaan asiakkaalle käyttöopastus laitteen toiminnasta.
          </Bullet>
        </Section>

        {plan.huomiot && plan.huomiot.trim() && (
          <Section title="Lisätiedot">
            {plan.huomiot
              .split(/\r?\n/)
              .filter((line) => line.trim())
              .map((line, i) => (
                <Bullet key={i}>{line}</Bullet>
              ))}
          </Section>
        )}
      </div>

      {/* Footer */}
      <div style={{ position: "absolute", bottom: "40px", left: "40px", right: "40px" }}>
        <p style={{ fontSize: "11px", color: "#6b7280", fontStyle: "italic", marginBottom: "10px", textAlign: "center" }}>
          {INSTALLER_QUALIFICATIONS_NOTE}
        </p>
        <div style={{ height: "2px", background: `linear-gradient(to right, ${BRAND}, ${ACCENT})`, borderRadius: "1px", marginBottom: "10px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#9ca3af" }}>
          <div>Lasikiilto.fi</div>
          <div style={{ textAlign: "center" }}>Puh: 045 875 5996<br />www.lasikiilto.fi<br />info@lasikiilto.fi</div>
          <div style={{ textAlign: "right" }}></div>
        </div>
      </div>
    </div>
  );
}
