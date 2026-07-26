/** Shared email utility functions and constants. */

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.readAsDataURL(file);
  });
}

export const GMAIL_COLORS = [
  { bg: "#4986e7", text: "#ffffff" }, { bg: "#a479e2", text: "#ffffff" },
  { bg: "#f691b2", text: "#994a64" }, { bg: "#f2b2a8", text: "#8a1c0a" },
  { bg: "#ffc8af", text: "#7a4706" }, { bg: "#fdedc1", text: "#684e07" },
  { bg: "#b3efd3", text: "#0d652d" }, { bg: "#a2dcc1", text: "#094228" },
  { bg: "#98d7e4", text: "#1a6580" }, { bg: "#c9daf8", text: "#3d4592" },
  { bg: "#e3d7ff", text: "#3d188e" }, { bg: "#fbd3e0", text: "#711a36" },
  { bg: "#cccccc", text: "#666666" }, { bg: "#fb4c2f", text: "#ffffff" },
  { bg: "#16a765", text: "#ffffff" }, { bg: "#ffad46", text: "#ffffff" },
];

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDate.getTime() === today.getTime()) {
    return d.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("fi-FI", { day: "numeric", month: "short", timeZone: "Europe/Helsinki" });
  }
  return d.toLocaleDateString("fi-FI", { day: "numeric", month: "short", year: "2-digit", timeZone: "Europe/Helsinki" });
}
