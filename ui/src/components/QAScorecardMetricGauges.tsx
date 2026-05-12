import { useQualityScorecard, useQualityMetrics } from "../api/quality";
import { ChartCard } from "./ActivityCharts";

function Gauge({ label, value, max, unit, color }: { label: string; value: number; max: number; unit?: string; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
        <circle
          cx="36" cy="36" r="28"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        <text x="36" y="36" textAnchor="middle" dominantBaseline="central" className="text-xs font-semibold fill-foreground tabular-nums">
          {Math.round(value)}{unit ?? ""}
        </text>
      </svg>
      <span className="text-[10px] text-muted-foreground text-center">{label}</span>
    </div>
  );
}

export function QAScorecardMetricGauges() {
  const { data: scorecard, isLoading: loadingScorecard, error: errorScorecard } = useQualityScorecard();
  const { data: metrics, isLoading: loadingMetrics, error: errorMetrics } = useQualityMetrics(30);

  const isLoading = loadingScorecard || loadingMetrics;
  const error = errorScorecard ?? errorMetrics;

  const premiumPct = scorecard && scorecard.totalClassified > 0
    ? (scorecard.labelBreakdown.find((b) => b.label === "premium")?.count ?? 0) / scorecard.totalClassified * 100
    : 0;
  const degradedFailedPct = scorecard && scorecard.totalClassified > 0
    ? ((scorecard.labelBreakdown.find((b) => b.label === "degraded")?.count ?? 0) +
       (scorecard.labelBreakdown.find((b) => b.label === "failed")?.count ?? 0)) / scorecard.totalClassified * 100
    : 0;
  const avgScore = scorecard?.averageScore ?? 0;
  const avgResponseTime = metrics?.metrics.length
    ? Math.round(metrics.metrics.reduce((s, m) => s + m.averageScore, 0) / metrics.metrics.length * 10) / 10
    : 0;

  return (
    <ChartCard title="Metric Gauges" subtitle="Key indicators">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-xs text-destructive">Failed to load</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Gauge label="Premium %" value={Math.round(premiumPct)} max={100} unit="%" color="#10b981" />
          <Gauge label="Issues %" value={Math.round(degradedFailedPct)} max={100} unit="%" color="#ef4444" />
          <Gauge label="Avg Score" value={Math.round(avgScore * 10) / 10} max={100} color="#3b82f6" />
          <Gauge label="Avg Rating" value={avgResponseTime} max={100} color="#8b5cf6" />
        </div>
      )}
    </ChartCard>
  );
}
