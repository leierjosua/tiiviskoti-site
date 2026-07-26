import { useState } from "react";
import { Send } from "lucide-react";

/** Count SMS segments (160 chars for GSM-7, 70 for Unicode). */
function smsSegments(text: string): { chars: number; segments: number; limit: number } {
  // Check if text contains non-GSM characters
  const gsmRegex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-.\/0-9:;<=>?¡A-ZÄÖÑÜa-zäöñüà§]*$/;
  const isGsm = gsmRegex.test(text);
  const limit = isGsm ? 160 : 70;
  const chars = text.length;
  const segments = chars === 0 ? 0 : Math.ceil(chars / (chars > limit ? (isGsm ? 153 : 67) : limit));
  return { chars, segments, limit };
}

export function SmsComposer({
  onSend,
  isSending,
}: {
  onSend: (body: string) => void;
  isSending: boolean;
}) {
  const [text, setText] = useState("");
  const { chars, segments, limit } = smsSegments(text);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="border-t border-gray-200 p-3">
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Kirjoita viesti..."
          rows={2}
          className="flex-1 resize-none text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || isSending}
          className="self-end p-2.5 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-[10px] text-gray-400">
          Shift+Enter rivinvaihto
        </span>
        <span
          className={`text-[10px] ${
            chars > limit ? "text-amber-500" : "text-gray-400"
          }`}
        >
          {chars}/{limit} merkkiä
          {segments > 1 && ` (${segments} SMS)`}
        </span>
      </div>
    </div>
  );
}
