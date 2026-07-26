import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FolderKanban } from "lucide-react";
import { useCreateProject } from "@/hooks/projects/useProjects";
import { useProjectTemplates } from "@/hooks/projects/useProjectTemplates";
import { useCustomers } from "@/hooks/useCustomers";
import { useEmployees } from "@/hooks/useEmployees";
import { DatePicker } from "@/components/ui/DatePicker";
import type { ProjectPriority, ProjectCategory } from "@/lib/project-types";

const CATEGORY_OPTIONS: { value: ProjectCategory; label: string }[] = [
  { value: "installation", label: "Asennus" },
  { value: "maintenance", label: "Huolto" },
  { value: "inspection", label: "Tarkastus" },
  { value: "repair", label: "Korjaus" },
  { value: "other", label: "Muu" },
];

const PRIORITY_OPTIONS: { value: ProjectPriority; label: string }[] = [
  { value: "low", label: "Matala" },
  { value: "normal", label: "Normaali" },
  { value: "high", label: "Korkea" },
  { value: "urgent", label: "Kiireellinen" },
];

export default function CreateProject() {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const { data: templates } = useProjectTemplates();
  const { data: customers } = useCustomers();
  const { data: employees } = useEmployees();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ProjectCategory>("installation");
  const [priority, setPriority] = useState<ProjectPriority>("normal");
  const [customerId, setCustomerId] = useState("");
  const [budgetEur, setBudgetEur] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");

  const filteredCustomers = customers?.filter((c) => {
    if (!customerSearch) return false;
    const q = customerSearch.toLowerCase();
    return (
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const project = await createProject.mutateAsync({
      title: title.trim(),
      description: description.trim() || null,
      category,
      priority,
      customer_id: customerId || null,
      budget_cents: budgetEur ? Math.round(parseFloat(budgetEur) * 100) : null,
      start_date: startDate || null,
      due_date: dueDate || null,
      template_id: templateId || undefined,
      member_ids: selectedMembers.length ? selectedMembers : undefined,
    } as Parameters<typeof createProject.mutateAsync>[0]);

    navigate(`/projektit/${project.id}`);
  };

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/projektit")}
          className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </button>
        <FolderKanban className="w-5 h-5 text-accent" />
        <h1 className="text-xl font-bold text-text-primary">Uusi projekti</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Template */}
        {templates && templates.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Mallipohja (valinnainen)
            </label>
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const tmpl = templates.find((t) => t.id === e.target.value);
                if (tmpl) setCategory(tmpl.category);
              }}
              className="w-full px-3 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            >
              <option value="">Ei mallipohjaa</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.default_tasks.length} tehtävää)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Projektin nimi *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Esim. Ilmalämpöpumpun asennus, Kerrostalo Oy"
            required
            className="w-full px-3 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Kuvaus</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
          />
        </div>

        {/* Category + Priority */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Kategoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ProjectCategory)}
              className="w-full px-3 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Prioriteetti</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as ProjectPriority)}
              className="w-full px-3 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Customer */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Asiakas</label>
          {customerId ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-primary">
                {customers?.find((c) => c.id === customerId)?.first_name}{" "}
                {customers?.find((c) => c.id === customerId)?.last_name}
              </span>
              <button
                type="button"
                onClick={() => setCustomerId("")}
                className="text-xs text-red-500 hover:underline"
              >
                Poista
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Hae asiakkaan nimellä..."
                className="w-full px-3 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              {filteredCustomers && filteredCustomers.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {filteredCustomers.slice(0, 10).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCustomerId(c.id);
                        setCustomerSearch("");
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-hover"
                    >
                      {c.first_name} {c.last_name}
                      <span className="text-text-muted ml-2">{c.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Budget */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Budjetti (EUR)</label>
          <input
            type="number"
            value={budgetEur}
            onChange={(e) => setBudgetEur(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            className="w-full px-3 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Alkupäivä</label>
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="Valitse alkupäivä"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Eräpäivä</label>
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              placeholder="Valitse eräpäivä"
              className="w-full"
            />
          </div>
        </div>

        {/* Team members */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Tiimin jäsenet
          </label>
          <p className="text-xs text-text-muted mb-2">Ensimmäisestä valitusta tulee projektin vetäjä</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {employees?.filter((e) => e.active !== false).map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => toggleMember(e.id)}
                className={`text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                  selectedMembers.includes(e.id)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border hover:bg-surface-hover text-text-secondary"
                }`}
              >
                {e.first_name} {e.last_name}
                {selectedMembers.indexOf(e.id) === 0 && (
                  <span className="text-xs ml-1 text-accent">(vetäjä)</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/projektit")}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Peruuta
          </button>
          <button
            type="submit"
            disabled={!title.trim() || createProject.isPending}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light transition-colors disabled:opacity-50"
          >
            {createProject.isPending ? "Luodaan..." : "Luo projekti"}
          </button>
        </div>
      </form>
    </div>
  );
}
