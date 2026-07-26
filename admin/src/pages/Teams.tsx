import { useState } from "react";
import { Users, Plus, Trash2, X } from "lucide-react";
import { useEmployees } from "@/hooks/useEmployees";
import {
  useTeams,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useAddTeamMember,
  useRemoveTeamMember,
} from "@/hooks/useTeams";
import type { EmployeeTeam } from "@/lib/types";

const PRESET_COLORS = [
  { name: "Harmaa", value: "#6b7280" },
  { name: "Sininen", value: "#3b82f6" },
  { name: "Vihreä", value: "#10b981" },
  { name: "Violetti", value: "#8b5cf6" },
  { name: "Oranssi", value: "#f97316" },
  { name: "Pinkki", value: "#ec4899" },
  { name: "Keltainen", value: "#eab308" },
  { name: "Turkoosi", value: "#06b6d4" },
];

export default function Teams() {
  const { data: teams, isLoading } = useTeams();
  const { data: employees } = useEmployees();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", color: PRESET_COLORS[0].value });

  const selectedTeam = teams?.find((t) => t.id === selectedTeamId) ?? null;
  const installerEmployees = employees?.filter((e) => e.active && (e.roles || []).includes("installer")) ?? [];
  const memberIds = new Set((selectedTeam?.members || []).map((m) => m.employee_id));
  // Across ALL teams: needed to disable employees already in another team
  const allTeamMemberIds = new Set(
    (teams || []).flatMap((t) => (t.members || []).map((m) => m.employee_id))
  );

  async function handleCreate(ev: React.FormEvent) {
    ev.preventDefault();
    if (!createForm.name.trim()) return;
    const team = await createTeam.mutateAsync({ name: createForm.name.trim(), color: createForm.color });
    setSelectedTeamId(team.id);
    setShowCreate(false);
    setCreateForm({ name: "", color: PRESET_COLORS[0].value });
  }

  async function handleDelete(team: EmployeeTeam) {
    if (!confirm(`Poistetaanko tiimi "${team.name}"?`)) return;
    await deleteTeam.mutateAsync(team.id);
    if (selectedTeamId === team.id) setSelectedTeamId(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Tiimit</h1>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 px-3 py-2 sm:px-5 sm:py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Luo tiimi</span>
        </button>
      </div>

      <p className="text-sm text-text-secondary mb-6 max-w-2xl">
        Tiimin jäsenet näkevät toistensa keikat omassa kalenterissaan ja voivat siirtää
        keikkoja keskenään ilman admin-vaihetta. Asiakkaalle ei lähde mitään ilmoitusta
        tiimin sisäisestä siirrosta.
      </p>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-surface rounded-2xl border border-border p-6 mb-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              Tiimin nimi *
            </label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="esim. Alihankkijatiimi 1"
              className="w-full max-w-sm px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              Väri
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCreateForm({ ...createForm, color: c.value })}
                  title={c.name}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    createForm.color === c.value ? "border-text-primary scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createTeam.isPending}
              className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {createTeam.isPending ? "Luodaan..." : "Luo"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Peruuta
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Team list */}
        <div className="md:col-span-1 bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-alt">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Tiimit</h2>
          </div>
          {isLoading ? (
            <p className="p-6 text-center text-sm text-text-muted">Ladataan...</p>
          ) : !teams || teams.length === 0 ? (
            <p className="p-6 text-center text-sm text-text-muted">Ei tiimejä — luo ensimmäinen yllä.</p>
          ) : (
            <ul className="divide-y divide-border">
              {teams.map((team) => (
                <li key={team.id}>
                  <button
                    onClick={() => setSelectedTeamId(team.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                      selectedTeamId === team.id ? "bg-accent/10" : "hover:bg-surface-hover"
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{team.name}</p>
                      <p className="text-xs text-text-muted">
                        {team.members?.length ?? 0} jäsentä
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Team detail */}
        <div className="md:col-span-2">
          {!selectedTeam ? (
            <div className="bg-surface rounded-2xl border border-border p-8 text-center text-sm text-text-muted">
              Valitse tiimi listalta tai luo uusi.
            </div>
          ) : (
            <TeamDetail
              key={selectedTeam.id}
              team={selectedTeam}
              installerEmployees={installerEmployees}
              memberIds={memberIds}
              allTeamMemberIds={allTeamMemberIds}
              onUpdate={(updates) => updateTeam.mutate({ id: selectedTeam.id, ...updates })}
              onDelete={() => handleDelete(selectedTeam)}
              onAddMember={(employee_id) => addMember.mutate({ team_id: selectedTeam.id, employee_id })}
              onRemoveMember={(employee_id) => removeMember.mutate({ team_id: selectedTeam.id, employee_id })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface TeamDetailProps {
  team: EmployeeTeam;
  installerEmployees: NonNullable<ReturnType<typeof useEmployees>["data"]>;
  memberIds: Set<string>;
  allTeamMemberIds: Set<string>;
  onUpdate: (updates: { name?: string; color?: string; active?: boolean }) => void;
  onDelete: () => void;
  onAddMember: (employee_id: string) => void;
  onRemoveMember: (employee_id: string) => void;
}

function TeamDetail({
  team,
  installerEmployees,
  memberIds,
  allTeamMemberIds,
  onUpdate,
  onDelete,
  onAddMember,
  onRemoveMember,
}: TeamDetailProps) {
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color);

  const candidates = installerEmployees.filter(
    (e) => !memberIds.has(e.id) && !allTeamMemberIds.has(e.id)
  );

  const dirty = name !== team.name || color !== team.color;

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 space-y-6">
      {/* Name + color */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Nimi
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Väri
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                title={c.name}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  color === c.value ? "border-text-primary scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        </div>
      </div>
      {dirty && (
        <div className="flex gap-2">
          <button
            onClick={() => onUpdate({ name: name.trim(), color })}
            disabled={!name.trim()}
            className="px-4 py-2 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Tallenna muutokset
          </button>
          <button
            onClick={() => {
              setName(team.name);
              setColor(team.color);
            }}
            className="px-4 py-2 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Peruuta
          </button>
        </div>
      )}

      {/* Members */}
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
          Jäsenet ({team.members?.length ?? 0})
        </h3>
        {!team.members || team.members.length === 0 ? (
          <p className="text-sm text-text-muted py-4">Ei vielä jäseniä — lisää alta.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {team.members.map((m) => (
              <li key={m.employee_id} className="flex items-center justify-between px-4 py-3 bg-surface">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {m.employees?.first_name} {m.employees?.last_name}
                  </p>
                  <p className="text-xs text-text-muted">{m.employees?.email}</p>
                </div>
                <button
                  onClick={() => onRemoveMember(m.employee_id)}
                  className="p-2 text-text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Poista tiimistä"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add member */}
        {candidates.length > 0 ? (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              Lisää jäsen
            </label>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  onAddMember(e.target.value);
                  e.target.value = "";
                }
              }}
              className="w-full max-w-sm px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            >
              <option value="">Valitse asentaja…</option>
              {candidates.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-text-muted mt-4">
            Kaikki aktiiviset asentajat ovat jo jossain tiimissä. Asentaja voi olla vain yhdessä tiimissä kerrallaan.
          </p>
        )}
      </div>

      {/* Danger zone */}
      <div className="pt-6 border-t border-border">
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Poista tiimi
        </button>
      </div>
    </div>
  );
}
