import type { InstallPlanData } from "@/lib/sales-types";

/**
 * Trust statement printed at the bottom of the install plan (above footer).
 * Kept here so both InstallPlanPdf and OfferPdfContent share the same wording.
 */
export const INSTALLER_QUALIFICATIONS_NOTE =
  "Kaikilla asentajillamme on TUKESin vaatima kylmäainepätevyys sekä sähköalan pätevyydet.";

/**
 * Default bullet texts rendered on the install plan PDF for each preset choice.
 * The editor exposes these as starting points; users can override per-opportunity
 * via the `<field>_text` fields on InstallPlanData.
 */
export const INSTALL_PLAN_DEFAULTS = {
  lapivienti: {
    sisayksikon_taakse:
      "Läpivienti tehdään sisäyksikön taakse. Kylmäaineputket saadaan tällöin vietyä läpiviennistä suoraan ulkoyksikölle ja sisälle jää näkyviin vain sisäyksikkö.",
    asennuskotelolla:
      "Kylmäaineputket, sähköjohto ja kondenssivesiputki kulkevat seinällä valkoisessa tai ruskeassa, muovisessa, noin 8 cm levyisessä asennuskotelossa ulkoseinälle kohtaan, johon läpivientireikä porataan.",
  },
  teline: {
    seinateline: "Seinätelineelle (sisältää tärinävaimennin).",
    parvekkeen_lattia:
      "Neljälle tärinävaimennetulle säätöjalalle terassille/parvekkeen lattialle. (Ulkoyksikkö ei ole kosketuksissa talon seinärakenteisiin. Ulkoyksikön yläreuna jää parvekekaiteen alapuolelle. Ulkoyksikön max. korkeus 60–70 cm.)",
    maateline: "Maatelineelle.",
  },
  sahko: {
    kiintea:
      "Kiinteänä lähimmältä käyttöön soveltuvalta sähköpisteeltä. Ulkoyksikön viereen asennetaan turvakytkin.",
    pistotulppa: "Pistotulpalla lähimmältä maadoitetulta pistorasialta.",
  },
  kondenssi: {
    maahan: "Maahan, poispäin talon seinärakenteista.",
    sadevesikaivoon: "Ulkoyksikön lähellä olevaan sadevesikaivoon.",
    parveke: "Parvekkeen sadevesijärjestelmään.",
    parveke_astia: "Asiakkaan hankkimaan erilliseen, tyhjennettävään astiaan parvekkeella.",
  },
} as const;

export type InstallPlanField = "lapivienti" | "teline" | "sahko" | "kondenssi";

/** Field → display label used in editor headings. */
export const INSTALL_PLAN_FIELD_LABELS: Record<InstallPlanField, string> = {
  lapivienti: "Läpivienti",
  teline: "Ulkoyksikön asennus",
  sahko: "Sähkökytkentä",
  kondenssi: "Kondenssivesi",
};

/**
 * Editor button options per field — short label + secondary description.
 * Kept in one place so all three editors (InstallPlanTab, InstallPlanStep,
 * InstallPlanModal) stay consistent.
 */
export const INSTALL_PLAN_OPTIONS = {
  lapivienti: [
    {
      value: "sisayksikon_taakse",
      label: "Sisäyksikön taakse",
      desc: "Putket suoraan sisäyksikön takaa seinän läpi — siisti, ei näkyviä koteloita",
    },
    {
      value: "asennuskotelolla",
      label: "Asennuskotelolla",
      desc: "Putket seinällä asennuskotelossa (valkoinen tai ruskea)",
    },
  ],
  teline: [
    {
      value: "seinateline",
      label: "Seinäteline",
      desc: "Seinään kiinnitettävä teline tärinävaimentimella",
    },
    {
      value: "parvekkeen_lattia",
      label: "Parvekkeen lattialle",
      desc: "Tärinävaimennetut säätöjalat lattialle, ei kiinnitystä seinään",
    },
    {
      value: "maateline",
      label: "Maateline",
      desc: "Maahan asennettava teline ulkoyksikölle",
    },
  ],
  sahko: [
    {
      value: "pistotulppa",
      label: "Pistotulppa",
      desc: "Pistotulppa lähimpään maadoitettuun pistorasiaan",
    },
    {
      value: "kiintea",
      label: "Kiinteä kytkentä",
      desc: "Kiinteä kytkentä + turvakytkin ulkoyksikön viereen",
    },
  ],
  kondenssi: [
    {
      value: "maahan",
      label: "Maahan",
      desc: "Maahan poispäin talon seinärakenteista",
    },
    {
      value: "sadevesikaivoon",
      label: "Sadevesikaivoon",
      desc: "Lähimpään sadevesikaivoon",
    },
    {
      value: "parveke",
      label: "Parvekkeen sadevesijärjestelmään",
      desc: "Sulamisvesi parvekkeen sadevesijärjestelmään",
    },
    {
      value: "parveke_astia",
      label: "Erillinen astia parvekkeella",
      desc: "Asiakkaan hankkima, tyhjennettävä astia parvekkeella",
    },
  ],
} as const;

type AnyInstallPlan = Pick<
  InstallPlanData,
  | "lapivienti"
  | "lapivienti_text"
  | "teline"
  | "teline_text"
  | "sahko"
  | "sahko_text"
  | "kondenssi"
  | "kondenssi_text"
>;

/**
 * Resolve the bullet text rendered for a plan field: the user's override if
 * present and non-empty, otherwise the preset default.
 */
export function getPlanText(plan: AnyInstallPlan, field: InstallPlanField): string {
  const override = plan[`${field}_text` as keyof AnyInstallPlan] as string | undefined;
  if (override && override.trim()) return override;
  const presetKey = plan[field] as keyof (typeof INSTALL_PLAN_DEFAULTS)[typeof field];
  return INSTALL_PLAN_DEFAULTS[field][presetKey];
}

/** Default text for a given preset (no override consideration). Used as editor starting value. */
export function getPresetDefault(field: InstallPlanField, presetKey: string): string {
  const fieldMap = INSTALL_PLAN_DEFAULTS[field] as Record<string, string>;
  return fieldMap[presetKey] ?? "";
}
