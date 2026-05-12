import { useQualityMetrics } from "../api/quality";
import { ChartCard, getLast14Days } from "./ActivityCharts";

const trendColors: Record<string, string> = {
  yes: "#10b981",
  somewhat: "#f59e0b",
  no: "#ef4444",
};

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function QAScorecardFeedbackTrends() {
  const { data, isLoading, error } = useQualityMetrics(30);

  const days = getLast14Days().slice(-14);
  const metrics = data?.metrics ?? [];

  const dayMap = new Map(metrics.map((m) => [m.period, m]));
  const chartData = days.map((d) => dayMap.get(d) ?? null);

  const hasData = chartData.some((d) => d && d.totalClassified > 0);

  return (
    <ChartCard title="Feedback Trends" subtitle="Yes / Somewhat / No rate over 30d">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-xs text-destructive">Failed to load</p>
      ) : !hasData ? (
        <p className="text-xs text-muted-foreground">No feedback data</p>
      ) : (
        <div>
          <div className="flex items-end gap-[3px] h-20">
            {chartData.map((d, i) => {
              if (!d) return <div key={i} className="flex-1 bg-muted/30 rounded-sm" style={{ height: 2 }} />;
              const total = d.totalClassified;
              const yesPct = ((d.labelCounts["premium"] ?? 0) / total) * 100;
              const somewhatPct = ((d.labelCounts["standard"] ?? 0) / total) * 100;
              const noPct = (((d.labelCounts["degraded"] ?? 0) + (d.labelCounts["failed"] ?? 0)) / total) * 100;
              const maxPct = Math.max(yesPct, somewhatPct, noPct, 5);
              return (
                <div key={d.period} className="flex-1 h-full flex flex-col justify-end" title={`${d.period}: Yes ${Math.round(yesPct)}% / Somewhat ${Math.round(somewhatPct)}% / No ${Math.round(noPct)}%`}>
                  <div className="flex flex-col-reverse gap-px overflow-hidden rounded-sm" style={{ height: `${maxPct}%`, minHeight: 2 }}>
                    <div style={{ flex: yesPct || 0.5, backgroundColor: trendColors.yes }} />
                    <div style={{ flex: somewhatPct || 0.5, backgroundColor: trendColors.somewhat }} />
                    <div style={{ flex: noPct || 0.5, backgroundColor: trendColors.no }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-[3px] mt-1.5">
            {days.map((day, i) => (
              <div key={day} className="flex-1 text-center">
                {(i === 0 || i === 6 || i === 13) ? (
                  <span className="text-[9px] text-muted-foreground tabular-nums">{formatDayLabel(day)}</span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-2">
            {Object.entries(trendColors).map(([label, color]) => (
              <span key={label} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {label.charAt(0).toUpperCase() + label.slice(1)}
              </span>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}
