export function formatDateFi(dateStr: string): string {
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  const fi = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
  const days = ["su", "ma", "ti", "ke", "to", "pe", "la"];
  const months = [
    "tammikuuta", "helmikuuta", "maaliskuuta", "huhtikuuta", "toukokuuta", "kesakuuta",
    "heinakuuta", "elokuuta", "syyskuuta", "lokakuuta", "marraskuuta", "joulukuuta",
  ];
  return `${days[fi.getDay()]} ${fi.getDate()}. ${months[fi.getMonth()]} ${fi.getFullYear()}`;
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr) return "-";
  return new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00").toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Helsinki" });
}

import postalCities from "./postalCities.json" with { type: "json" };

export function formatCentsFi(cents: number): string {
  return (cents / 100).toLocaleString("fi-FI", { minimumFractionDigits: 2 }) + " \u20ac";
}

const _postalCityMap: Record<string, string> = postalCities;

export function postalCity(code: string): string {
  return _postalCityMap[code] || "";
}

export function formatAddress(address: string, postalCode: string): string {
  const city = postalCode ? postalCity(postalCode) : "";
  const parts = [address];
  // Only append postal code / city if they are not already present in the address
  if (postalCode && !address.includes(postalCode)) parts.push(postalCode);
  if (city && !address.toLowerCase().includes(city.toLowerCase())) parts.push(city);
  return parts.filter(Boolean).join(", ");
}

export function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[äå]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");
}
