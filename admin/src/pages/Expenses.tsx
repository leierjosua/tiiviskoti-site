import { useState } from "react";
import {
  useExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  EXPENSE_CATEGORIES,
  type Expense,
} from "@/hooks/useExpenses";
import { formatCents, formatDate } from "@/lib/utils";
import { inputCls, selectCls } from "@/lib/constants";
import { Plus, Pencil, Trash2, Repeat, CircleDot, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/DatePicker";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";

interface ExpenseForm {
  name: string;
  amount: string;
  expense_type: "recurring" | "one_time";
  category: string;
  start_date: string;
  end_date: string;
  notes: string;
}

const emptyForm: ExpenseForm = {
  name: "",
  amount: "",
  expense_type: "recurring",
  category: "other",
  start_date: "",
  end_date: "",
  notes: "",
};

function toForm(e: Expense): ExpenseForm {
  return {
    name: e.name,
    amount: String(e.amount_cents / 100),
    expense_type: e.expense_type,
    category: e.category,
    start_date: e.start_date || "",
    end_date: e.end_date || "",
    notes: e.notes || "",
  };
}

function formToData(f: ExpenseForm) {
  return {
    name: f.name,
    amount_cents: Math.round(parseFloat(f.amount.replace(",", ".") || "0") * 100),
    expense_type: f.expense_type as "recurring" | "one_time",
    category: f.category,
    start_date: f.start_date || null,
    end_date: f.end_date || null,
    notes: f.notes.trim() || null,
  };
}

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5";

export default function Expenses() {
  const { data: expenses, isLoading } = useExpenses();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const confirm = useConfirm();
  const toast = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);

  const recurring = expenses?.filter((e) => e.expense_type === "recurring") || [];
  const oneTime = expenses?.filter((e) => e.expense_type === "one_time") || [];
  const monthlyTotal = recurring.reduce((sum, e) => sum + e.amount_cents, 0);

  function openCreate(type: "recurring" | "one_time") {
    setEditingId(null);
    setForm({ ...emptyForm, expense_type: type });
    setShowForm(true);
  }

  function openEdit(e: Expense) {
    setEditingId(e.id);
    setForm(toForm(e));
    setShowForm(true);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const data = formToData(form);
    if (!data.name || data.amount_cents <= 0) return;

    if (editingId) {
      await updateExpense.mutateAsync({ id: editingId, ...data });
      toast.success("Kulu päivitetty");
    } else {
      await createExpense.mutateAsync(data);
      toast.success("Kulu lisätty");
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleDelete(e: Expense) {
    const ok = await confirm({
      title: "Poista kulu",
      message: `Haluatko varmasti poistaa kulun "${e.name}"?`,
      confirmLabel: "Poista",
      variant: "danger",
    });
    if (!ok) return;
    await deleteExpense.mutateAsync(e.id);
    toast.success("Kulu poistettu");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Kulut</h1>
          <p className="text-sm text-text-muted mt-0.5">Toistuvat ja kertaluonteiset kulut</p>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-text-primary">
              {editingId ? "Muokkaa kulua" : form.expense_type === "recurring" ? "Uusi toistuva kulu" : "Uusi kertaluonteinen kulu"}
            </h2>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1.5 rounded-lg hover:bg-surface-hover">
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Nimi</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="esim. Toimiston vuokra"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Summa (€/kk)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0,00"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Kategoria</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={selectCls}
              >
                {Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tyyppi</label>
              <select
                value={form.expense_type}
                onChange={(e) => setForm({ ...form, expense_type: e.target.value as "recurring" | "one_time" })}
                className={selectCls}
              >
                <option value="recurring">Toistuva (kuukausittainen)</option>
                <option value="one_time">Kertaluonteinen</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>
                {form.expense_type === "recurring" ? "Alkaa" : "Päivämäärä"}
              </label>
              <DatePicker
                value={form.start_date}
                onChange={(v) => setForm({ ...form, start_date: v })}
                placeholder={form.expense_type === "recurring" ? "Valitse alkupäivä" : "Valitse päivämäärä"}
                className="w-full"
              />
            </div>
            {form.expense_type === "recurring" && (
              <div>
                <label className={labelCls}>Päättyy</label>
                <DatePicker
                  value={form.end_date}
                  onChange={(v) => setForm({ ...form, end_date: v })}
                  placeholder="Jatkuva"
                  className="w-full"
                />
                <p className="text-[11px] text-text-muted mt-1">Tyhjä = jatkuva</p>
              </div>
            )}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>Muistiinpanot</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Vapaaehtoinen lisätieto"
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={createExpense.isPending || updateExpense.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {editingId ? "Tallenna" : "Lisää"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Peruuta
            </button>
          </div>
        </form>
      )}

      {/* Recurring expenses */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-accent" />
            <h2 className="font-semibold text-text-primary">Toistuvat kulut</h2>
            <Badge className="bg-accent-muted text-accent-dark text-xs">{formatCents(monthlyTotal)}/kk</Badge>
          </div>
          {!showForm && (
            <button
              onClick={() => openCreate("recurring")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent-dark text-white transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Lisää
            </button>
          )}
        </div>
        {recurring.length === 0 ? (
          <p className="text-sm text-text-muted px-5 py-6 text-center">Ei toistuvia kuluja</p>
        ) : (
          <div className="divide-y divide-border">
            {recurring.map((e) => (
              <div key={e.id} className="px-5 py-3 flex items-center justify-between group hover:bg-surface-hover transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-text-primary">{e.name}</p>
                    <Badge className="bg-gray-100 text-text-muted text-[10px]">{EXPENSE_CATEGORIES[e.category] || e.category}</Badge>
                  </div>
                  {(e.start_date || e.end_date || e.notes) && (
                    <p className="text-xs text-text-muted mt-0.5">
                      {e.start_date && `Alkaen ${formatDate(e.start_date)}`}
                      {e.start_date && e.end_date && " — "}
                      {e.end_date && `Asti ${formatDate(e.end_date)}`}
                      {e.notes && ` · ${e.notes}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-sm text-text-primary tabular-nums">{formatCents(e.amount_cents)}/kk</p>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
                      <Pencil className="w-3.5 h-3.5 text-text-muted" />
                    </button>
                    <button onClick={() => handleDelete(e)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* One-time expenses */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CircleDot className="w-4 h-4 text-purple-500" />
            <h2 className="font-semibold text-text-primary">Kertaluonteiset kulut</h2>
          </div>
          {!showForm && (
            <button
              onClick={() => openCreate("one_time")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500 hover:bg-purple-600 text-white transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Lisää
            </button>
          )}
        </div>
        {oneTime.length === 0 ? (
          <p className="text-sm text-text-muted px-5 py-6 text-center">Ei kertaluonteisia kuluja</p>
        ) : (
          <div className="divide-y divide-border">
            {oneTime.map((e) => (
              <div key={e.id} className="px-5 py-3 flex items-center justify-between group hover:bg-surface-hover transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-text-primary">{e.name}</p>
                    <Badge className="bg-gray-100 text-text-muted text-[10px]">{EXPENSE_CATEGORIES[e.category] || e.category}</Badge>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    {e.start_date ? formatDate(e.start_date) : "Ei päivämäärää"}
                    {e.notes && ` · ${e.notes}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-sm text-text-primary tabular-nums">{formatCents(e.amount_cents)}</p>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
                      <Pencil className="w-3.5 h-3.5 text-text-muted" />
                    </button>
                    <button onClick={() => handleDelete(e)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
