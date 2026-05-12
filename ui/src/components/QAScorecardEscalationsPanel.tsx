import { useQualityEscalations } from "../api/quality";
import { ChartCard } from "./ActivityCharts";
import { ShieldAlert, AlertTriangle, Info, AlertCircle } from "lucide-react";
import type { QualityEscalation } from "@paperclipai/shared";

const severityIcon = (level: string | null) => {
  switch (level) {
    case "critical": return <ShieldAlert className="h-3.5 w-3.5 text-red-400 shrink-0" />;
    case "high": return <AlertCircle className="h-3.5 w-3.5 text-orange-400 shrink-0" />;
    case "medium": return <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />;
    default: return <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
};

const severityColors: Record<string, string> = {
  critical: "bg-red-500/10 border-red-500/20",
  high: "bg-orange-500/10 border-orange-500/20",
  medium: "bg-yellow-500/10 border-yellow-500/20",
};

function countBySeverity(escalations: QualityEscalation[]) {
  const counts: Record<string, number> = {};
  for (const e of escalations) {
    const level = e.escalationLevel ?? "info";
    counts[level] = (counts[level] ?? 0) + 1;
  }
  return counts;
}

function EsclationRow({ e }: { e: QualityEscalation }) {
  const level = e.escalationLevel ?? "info";
  return (
    <div className={`flex items-start gap-2 px-2 py-1.5 rounded text-xs border ${severityColors[level] ?? ""}`}>
      {severityIcon(e.escalationLevel)}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{e.triggerReason}</p>
        <p className="text-muted-foreground text-[10px]">
          {e.briefingId.slice(0, 8)} · {new Date(e.createdAt).toLocaleDateString()}
        </p>
      </div>
      <span className="capitalize text-muted-foreground shrink-0 text-[10px]">{e.status}</span>
    </div>
  );
}

export function QAScorecardEscalationsPanel() {
  const { data, isLoading, error } = useQualityEscalations(10);

  return (
    <ChartCard title="Escalations" subtitle="Latest events">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-xs text-destructive">Failed to load</p>
      ) : data && data.length > 0 ? (
        <div className="space-y-2">
          <div className="flex gap-3 flex-wrap">
            {Object.entries(countBySeverity(data)).map(([level, count]) => (
              <div key={level} className="flex items-center gap-1.5 text-xs">
                {severityIcon(level)}
                <span className="capitalize text-muted-foreground">{level}</span>
                <span className="font-medium tabular-nums">{count}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {data.slice(0, 5).map((e) => (
              <EsclationRow key={e.id} e={e} />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No escalations</p>
      )}
    </ChartCard>
  );
}
