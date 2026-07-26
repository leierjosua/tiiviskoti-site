"use client";

import { openCookieSettings } from "../components/CookieConsent";

export default function CookieSettingsButton() {
  return (
    <button
      onClick={openCookieSettings}
      className="mt-2 bg-[#222] border border-[#333] text-gray-300 font-semibold text-sm py-3 px-6 rounded-xl hover:bg-[#2a2a2a] hover:border-[#444] transition-colors"
    >
      Muokkaa evästeasetuksia
    </button>
  );
}
