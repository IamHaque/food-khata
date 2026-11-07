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
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  most_frequent_platform: ShoppingBag,
  top_restaurant: UtensilsCrossed,
  fee_percentage: Percent,
};

export function InsightStrip(props: InsightStripProps = {}) {
  const { update } = useFilters();

  if (props.insights !== undefined || props.items !== undefined || props.data?.charts?.insights !== undefined) {
    const insights = props.insights ?? props.items ?? props.data?.charts?.insights ?? [];
    const visible = insights.slice(0, 4);
    if (!visible.length) return null;
    return (
      <div
        className={props.className ?? "insight-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"}
        role="group"
        aria-label="Insights"
      >
        {visible.map(insight => {
          const Icon = iconMap[insight.key] ?? Sparkles;
          return (
            <button
              type="button"
              key={insight.key}
              onClick={() => update(insight.filter_patch)}
              className="insight-card inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left shadow-xs hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Icon className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <span className="text-sm text-foreground truncate">{insight.text}</span>
              <strong className="text-sm font-bold text-primary ml-auto">{insight.value}</strong>
            </button>
          );
        })}
      </div>
    );
  }

  return <InsightStripFromQuery />;
}

function InsightStripFromQuery() {
  const { filters } = useFilters();
  const query = useDashboard(filters);
  const insights = query.data?.charts?.insights ?? [];
  const visible = insights.slice(0, 4);
  if (!visible.length) return null;
  // delegate rendering to a nested component to keep hooks valid
  return <InsightStripQueryView insights={visible} />;
}

function InsightStripQueryView({ insights }: { insights: Insight[] }) {
  const { update } = useFilters();
  return (
    <div className="insight-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" role="group" aria-label="Insights">
      {insights.map(insight => {
        const Icon = iconMap[insight.key] ?? Sparkles;
        return (
          <button
            type="button"
            key={insight.key}
            onClick={() => update(insight.filter_patch)}
            className="insight-card inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left shadow-xs hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Icon className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm text-foreground truncate">{insight.text}</span>
            <strong className="text-sm font-bold text-primary ml-auto">{insight.value}</strong>
          </button>
        );
      })}
    </div>
  );
}

export default InsightStrip;
