import { useQualityGatePassRates } from "../api/quality";
import { ChartCard } from "./ActivityCharts";

function GateRow({ gate, passed, failed, total }: { gate: string; passed: number; failed: number; total: number }) {
  const passRate = total > 0 ? (passed / total) * 100 : 0;
  const color = passRate >= 95 ? "bg-emerald-500" : passRate >= 85 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-22 shrink-0 truncate" title={gate}>
        {gate}
      </span>
      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden flex">
        <div
          className={`h-full rounded-l-full ${color}`}
          style={{ width: `${passRate}%` }}
        />
        <div
          className="h-full bg-red-500/40"
          style={{ width: `${100 - passRate}%` }}
        />
      </div>
      <span className="text-[10px] font-medium tabular-nums w-8 text-right">{Math.round(passRate)}%</span>
    </div>
  );
}

export function QAScorecardGatePassRates() {
  const { data: gates, isLoading, error } = useQualityGatePassRates();

  return (
    <ChartCard title="Gate Pass Rates" subtitle="Per-gate pass/fail">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-xs text-destructive">Failed to load</p>
      ) : gates && gates.length > 0 ? (
        <div className="space-y-2">
          {gates.map((g) => (
            <GateRow key={g.gate} gate={g.gate} passed={g.passed} failed={g.failed} total={g.total} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No gate data</p>
      )}
    </ChartCard>
  );
}
