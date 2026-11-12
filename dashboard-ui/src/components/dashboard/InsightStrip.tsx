import * as React from "react";

import { useFilters } from "../../app/FilterContext";
import { useDashboard } from "../../hooks/api";
import type { components } from "../../types/api";
import {
  Sparkles,
  ShoppingBag,
  UtensilsCrossed,
  Percent,
} from "lucide-react";

type Insight = components["schemas"]["Insight"];

export interface InsightStripProps {
  insights?: Insight[];
  items?: Insight[];
  data?: { charts?: { insights?: Insight[] } };
  className?: string;
  onApplyFilterPatch?: (patch: Record<string, unknown> | any) => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  most_frequent_platform: ShoppingBag,
  top_restaurant: UtensilsCrossed,
  fee_percentage: Percent,
};

function InsightButton({ insight, onApply }: { insight: Insight; onApply: (patch: any) => void }) {
  const Icon = iconMap[insight.key] ?? Sparkles;
  const value = insight.key === "fee_percentage" && !String(insight.value).includes("%") ? `${insight.value}%` : insight.value;
  return (
    <button
      type="button"
      onClick={() => onApply(insight.filter_patch)}
      className="insight-card flex min-h-[44px] items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left hover:bg-accent transition-colors"
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">{insight.text}</span>
      <strong className="text-right text-sm font-semibold text-foreground tabular-nums">{value}</strong>
    </button>
  );
}

const STRIP = "insight-strip grid grid-cols-1 gap-2 sm:grid-cols-3";

export function InsightStrip(props: InsightStripProps = {}) {
  const { update } = useFilters();

  if (props.insights !== undefined || props.items !== undefined || props.data?.charts?.insights !== undefined) {
    const insights = props.insights ?? props.items ?? props.data?.charts?.insights ?? [];
    const visible = insights.slice(0, 4);
    if (!visible.length) return null;
    const applyPatch = props.onApplyFilterPatch ?? update;
    return (
      <div className={props.className ?? STRIP} role="group" aria-label="Insights">
        {visible.map(insight => <InsightButton key={insight.key} insight={insight} onApply={applyPatch} />)}
      </div>
    );
  }

  return <InsightStripFromQuery />;
}

function InsightStripFromQuery() {
  const { filters, update } = useFilters();
  const query = useDashboard(filters);
  const visible = (query.data?.charts?.insights ?? []).slice(0, 4);
  if (!visible.length) return null;
  return (
    <div className={STRIP} role="group" aria-label="Insights">
      {visible.map(insight => <InsightButton key={insight.key} insight={insight} onApply={update} />)}
    </div>
  );
}

export default InsightStrip;
