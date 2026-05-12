import { useEffect } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { QAScorecardDonutChart } from "../components/QAScorecardDonutChart";
import { QAScorecardEscalationsPanel } from "../components/QAScorecardEscalationsPanel";
import { QAScorecardCrewLookup } from "../components/QAScorecardCrewLookup";
import { QAScorecardFeedbackTrends } from "../components/QAScorecardFeedbackTrends";
import { QAScorecardMetricGauges } from "../components/QAScorecardMetricGauges";
import { QAScorecardGatePassRates } from "../components/QAScorecardGatePassRates";

export function QAScorecardDashboard() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Dashboard", href: "/dashboard" }, { label: "QA Scorecard" }]);
  }, [setBreadcrumbs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">QA Scorecard</h1>
        <p className="text-sm text-muted-foreground">Quality metrics, escalations, and crew performance</p>
      </div>

      {/* Top row: gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <QAScorecardMetricGauges />
      </div>

      {/* Middle row: donut + escalations + crew lookup */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <QAScorecardDonutChart />
        <QAScorecardEscalationsPanel />
        <QAScorecardCrewLookup />
      </div>

      {/* Bottom row: feedback trends + gate pass rates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <QAScorecardFeedbackTrends />
        <QAScorecardGatePassRates />
      </div>
    </div>
  );
}
