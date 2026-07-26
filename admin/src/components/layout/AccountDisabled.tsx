import { useAuth } from "@/hooks/useAuth";
import { Ban } from "lucide-react";

/**
 * Shown when an authenticated user's employee record is blocked (active=false).
 * Rendered inline by the route guards instead of redirecting, so a soft-blocked
 * (not yet auth-banned) session can't bounce back into the app.
 */
export function AccountDisabled() {
  const { logout } = useAuth();
  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="max-w-sm w-full bg-surface rounded-2xl border border-border p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <Ban className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-text-primary mb-2">Pääsy estetty</h1>
        <p className="text-sm text-text-muted mb-6">
          Käyttäjätilisi pääsy järjestelmään on poistettu käytöstä. Ota tarvittaessa yhteyttä ylläpitoon.
        </p>
        <button
          type="button"
          onClick={() => logout()}
          className="w-full px-4 py-2.5 bg-surface-alt text-text-primary text-sm font-semibold rounded-xl border border-border hover:bg-border/50 transition-colors"
        >
          Kirjaudu ulos
        </button>
      </div>
    </div>
  );
}
