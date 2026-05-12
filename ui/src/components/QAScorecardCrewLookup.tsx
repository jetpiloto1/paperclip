import { useState } from "react";
import { useQualityCrewScores } from "../api/quality";
import { ChartCard } from "./ActivityCharts";
import { Search, User } from "lucide-react";
import type { CrewMemberScore } from "@paperclipai/shared";

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 90 ? "bg-emerald-500" : value >= 80 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-medium tabular-nums w-7 text-right">{value}</span>
    </div>
  );
}

export function QAScorecardCrewLookup() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: crewScores, isLoading, error } = useQualityCrewScores();

  const filtered = (crewScores ?? []).filter((m) =>
    m.name.toLowerCase().includes(query.toLowerCase()),
  );

  const selected = selectedId ? crewScores?.find((m) => m.id === selectedId) ?? null : null;

  return (
    <ChartCard title="Crew Scorecard" subtitle="30-day rolling scores">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search crew member..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedId(null); }}
          className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground mt-2">Loading...</p>
      ) : error ? (
        <p className="text-xs text-destructive mt-2">Failed to load</p>
      ) : query && !selectedId ? (
        <div className="mt-1 border border-border rounded-md max-h-32 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">No results</p>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => { setSelectedId(m.id); setQuery(""); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent text-left"
              >
                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                {m.name}
              </button>
            ))
          )}
        </div>
      ) : null}
      {selected ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium">{selected.name}</p>
          <ScoreBar label="Overall" value={selected.overall} />
          <ScoreBar label="Accuracy" value={selected.accuracy} />
          <ScoreBar label="Timeliness" value={selected.timeliness} />
          <ScoreBar label="Completeness" value={selected.completeness} />
          <div className="flex items-center gap-1 pt-1">
            <span className="text-[10px] text-muted-foreground">{selected.totalBriefings} briefings</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">Trend:</span>
            <span className={`text-[10px] font-medium ${
              selected.trend === "up" ? "text-emerald-400" :
              selected.trend === "down" ? "text-red-400" : "text-muted-foreground"
            }`}>
              {selected.trend === "up" ? "↑ Improving" : selected.trend === "down" ? "↓ Declining" : "→ Stable"}
            </span>
          </div>
        </div>
      ) : (!isLoading && !error) ? (
        <p className="text-xs text-muted-foreground mt-2">Search and select a crew member to view scores</p>
      ) : null}
    </ChartCard>
  );
}
