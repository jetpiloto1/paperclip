import type { QualityScorecard } from "@paperclipai/shared";
import { useQualityScorecard } from "../api/quality";
import { ChartCard } from "./ActivityCharts";

const labelColors: Record<string, string> = {
  premium: "#10b981",
  standard: "#3b82f6",
  degraded: "#f59e0b",
  failed: "#ef4444",
};

const labelOrder = ["premium", "standard", "degraded", "failed"] as const;

interface DonutChartProps {
  breakdown: { label: string; count: number }[];
  total: number;
}

function DonutChart({ breakdown, total }: DonutChartProps) {
  if (total === 0) return <p className="text-xs text-muted-foreground">No data</p>;

  const sorted = labelOrder
    .map((l) => breakdown.find((b) => b.label === l) ?? { label: l, count: 0 })
    .filter((b) => b.count > 0);

  const circumference = 2 * Math.PI * 40;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width="120" height="120" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
        {sorted.map((b) => {
          const segment = (b.count / total) * circumference;
          const dash = `${segment} ${circumference - segment}`;
          const el = (
            <circle
              key={b.label}
              cx="50" cy="50" r="40"
              fill="none"
              stroke={labelColors[b.label] ?? "#6b7280"}
              strokeWidth="12"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += segment;
          return el;
        })}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {sorted.map((b) => (
          <span key={b.label} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: labelColors[b.label] ?? "#6b7280" }} />
            <span className="capitalize text-muted-foreground">{b.label}</span>
            <span className="font-medium tabular-nums">{Math.round((b.count / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function QAScorecardDonutChart() {
  const { data, isLoading, error } = useQualityScorecard();

  return (
    <ChartCard title="Quality Tier Distribution" subtitle="Rolling 7 days">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-xs text-destructive">Failed to load</p>
      ) : data ? (
        <DonutChart breakdown={data.labelBreakdown} total={data.totalClassified} />
      ) : (
        <p className="text-xs text-muted-foreground">No data</p>
      )}
    </ChartCard>
  );
}
