import { useState, useMemo } from "react";
import postalData from "@/data/postalCodes.json";
import { Search, ChevronRight, ChevronDown, Check, Minus } from "lucide-react";

type Region = { region: string; municipalities: { name: string; codes: string[] }[] };
const regions = postalData as Region[];

interface PostalCodePickerProps {
  selected: string[];
  onChange: (codes: string[]) => void;
}

export function PostalCodePicker({ selected, onChange }: PostalCodePickerProps) {
  const [search, setSearch] = useState("");
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [expandedMunis, setExpandedMunis] = useState<Set<string>>(new Set());

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Filter regions/municipalities by search
  const filtered = useMemo(() => {
    if (!search) return regions;
    const q = search.toLowerCase();
    return regions
      .map((r) => {
        const matchRegion = r.region.toLowerCase().includes(q);
        const munis = r.municipalities.filter(
          (m) =>
            matchRegion ||
            m.name.toLowerCase().includes(q) ||
            m.codes.some((c) => c.includes(q))
        );
        if (munis.length === 0) return null;
        return { ...r, municipalities: munis };
      })
      .filter(Boolean) as Region[];
  }, [search]);

  // Auto-expand when searching
  const visibleRegions = useMemo(() => {
    if (search) return new Set(filtered.map((r) => r.region));
    return expandedRegions;
  }, [search, filtered, expandedRegions]);

  const visibleMunis = useMemo(() => {
    if (search) {
      const set = new Set<string>();
      filtered.forEach((r) => r.municipalities.forEach((m) => set.add(`${r.region}/${m.name}`)));
      return set;
    }
    return expandedMunis;
  }, [search, filtered, expandedMunis]);

  function toggleRegion(regionName: string) {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionName)) next.delete(regionName);
      else next.add(regionName);
      return next;
    });
  }

  function toggleMuni(key: string) {
    setExpandedMunis((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllRegion(region: Region) {
    const allCodes = region.municipalities.flatMap((m) => m.codes);
    const allSelected = allCodes.every((c) => selectedSet.has(c));
    if (allSelected) {
      onChange(selected.filter((c) => !allCodes.includes(c)));
    } else {
      const newCodes = allCodes.filter((c) => !selectedSet.has(c));
      onChange([...selected, ...newCodes]);
    }
  }

  function selectAllMuni(codes: string[]) {
    const allSelected = codes.every((c) => selectedSet.has(c));
    if (allSelected) {
      onChange(selected.filter((c) => !codes.includes(c)));
    } else {
      const newCodes = codes.filter((c) => !selectedSet.has(c));
      onChange([...selected, ...newCodes]);
    }
  }

  function toggleCode(code: string) {
    if (selectedSet.has(code)) {
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  }

  function getCheckState(codes: string[]): "all" | "some" | "none" {
    const count = codes.filter((c) => selectedSet.has(c)).length;
    if (count === 0) return "none";
    if (count === codes.length) return "all";
    return "some";
  }

  function CheckBox({ state, onClick }: { state: "all" | "some" | "none"; onClick: () => void }) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`w-5 h-5 rounded flex items-center justify-center border transition-all shrink-0 ${
          state === "all"
            ? "bg-accent border-accent text-white"
            : state === "some"
            ? "bg-accent/30 border-accent text-white"
            : "border-border hover:border-accent/50"
        }`}>
        {state === "all" && <Check className="w-3.5 h-3.5" />}
        {state === "some" && <Minus className="w-3.5 h-3.5" />}
      </button>
    );
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-surface">
      {/* Search */}
      <div className="relative border-b border-border">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hae maakuntaa, kuntaa tai postinumeroa..."
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-transparent focus:outline-none"
        />
      </div>

      {/* Selected count */}
      <div className="px-3 py-2 border-b border-border bg-surface-alt text-xs text-text-muted flex items-center justify-between">
        <span>{selected.length} postinumeroa valittu</span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-red-500 hover:text-red-600 font-medium">
            Tyhjennä
          </button>
        )}
      </div>

      {/* Tree */}
      <div className="max-h-80 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-text-muted text-center">Ei tuloksia</p>
        ) : (
          filtered.map((region) => {
            const regionCodes = region.municipalities.flatMap((m) => m.codes);
            const regionState = getCheckState(regionCodes);
            const isExpanded = visibleRegions.has(region.region);

            return (
              <div key={region.region}>
                {/* Region header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 hover:bg-surface-hover cursor-pointer border-b border-border/50"
                  onClick={() => toggleRegion(region.region)}
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-text-muted shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />}
                  <CheckBox state={regionState} onClick={() => selectAllRegion(region)} />
                  <span className="text-sm font-semibold text-text-primary">{region.region}</span>
                  <span className="text-xs text-text-muted ml-auto">{regionCodes.filter((c) => selectedSet.has(c)).length}/{regionCodes.length}</span>
                </div>

                {/* Municipalities */}
                {isExpanded && region.municipalities.map((muni) => {
                  const muniKey = `${region.region}/${muni.name}`;
                  const muniState = getCheckState(muni.codes);
                  const muniExpanded = visibleMunis.has(muniKey);

                  return (
                    <div key={muniKey}>
                      <div
                        className="flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-surface-hover cursor-pointer"
                        onClick={() => toggleMuni(muniKey)}
                      >
                        {muniExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />}
                        <CheckBox state={muniState} onClick={() => selectAllMuni(muni.codes)} />
                        <span className="text-sm text-text-primary">{muni.name}</span>
                        <span className="text-xs text-text-muted ml-auto">{muni.codes.filter((c) => selectedSet.has(c)).length}/{muni.codes.length}</span>
                      </div>

                      {/* Individual codes */}
                      {muniExpanded && (
                        <div className="pl-16 pr-3 pb-1 flex flex-wrap gap-1">
                          {muni.codes.map((code) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() => toggleCode(code)}
                              className={`px-2 py-0.5 rounded text-xs font-mono transition-all ${
                                selectedSet.has(code)
                                  ? "bg-accent text-white font-medium"
                                  : "bg-surface-alt text-text-secondary hover:bg-surface-hover"
                              }`}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
