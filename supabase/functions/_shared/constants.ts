export const COMPANY_EMAIL = "info@tiiviskoti.fi";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
export const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/directory.readonly";
export const COMPANY_EMAILS = ["info@tiiviskoti.fi"];
export const TIMEZONE = "Europe/Helsinki";
export const SYNC_DAYS = 30;
export const SYNC_REASON = "google_calendar_sync";

export const MONTH_NAMES_SHORT = [
  "tammi", "helmi", "maalis", "huhti", "touko", "kesä",
  "heinä", "elo", "syys", "loka", "marras", "joulu",
];

export const FREQ_LABELS: Record<string, string> = {
  once_yearly: "1x / vuosi",
  twice_yearly: "2x / vuosi",
  custom: "Mukautettu",
};
