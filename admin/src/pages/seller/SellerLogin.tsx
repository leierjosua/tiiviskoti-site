import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/context/UserRoleContext";

export default function SellerLogin() {
  const { user, loading: authLoading, login } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (authLoading || roleLoading) return null;

  if (user) {
    if (role === "seller") return <Navigate to="/myyja" replace />;
    if (role === "admin") return <Navigate to="/" replace />;
    return <Navigate to="/tyontekija" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kirjautuminen epäonnistui");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10 px-4">
        <div className="text-center mb-10">
          <img
            src="/logo-white.svg"
            alt="Lasikiilto"
            className="h-10 mx-auto mb-3"
          />
          <p className="text-white/50 text-sm">Myyjäportaali</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white/50 mb-2">
              Sähköposti
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="nimi@lasikiilto.fi"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/50 mb-2">
              Salasana
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-accent hover:bg-accent-dark text-white rounded-xl font-semibold transition-all disabled:opacity-50 shadow-lg shadow-accent/20"
          >
            {submitting ? "Kirjaudutaan..." : "Kirjaudu sisään"}
          </button>
        </form>

        <p className="text-center text-white/30 text-xs mt-8">
          &copy; {new Date().getFullYear()} Lasikiilto Oy
        </p>
      </div>
    </div>
  );
}
