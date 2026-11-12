import { useHealth } from '../hooks/api';
import { useFilters } from './FilterContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import {
  SyncStatusPanel,
  isSyncDataComplete,
  useSyncPanelState,
  type SyncPanelHealth,
} from './SyncStatusPanel';
import { formatExactTimestamp, formatRelativeSync } from './sync-format';
import { AlertTriangle, RefreshCw } from 'lucide-react';

function chipState(health: SyncPanelHealth | null | undefined, loading: boolean) {
  const incomplete = Boolean(health) && !isSyncDataComplete(health);
  const label = health?.generated_at
    ? formatRelativeSync(health.generated_at)
    : loading
      ? 'Checking sync…'
      : 'Sync status';
  const status = !health
    ? 'Unknown'
    : isSyncDataComplete(health)
      ? 'Complete'
      : 'Incomplete — some history or details are missing';
  const timestamp = formatExactTimestamp(health?.generated_at);
  const title = `Last sync: ${timestamp}\nStatus: ${status}\nDatabase path: not exposed by this API`;
  const tone = incomplete
    ? 'border-warning/50 bg-warning/10 text-warning hover:bg-warning/15'
    : 'border-border/50 bg-muted/60 text-muted-foreground hover:bg-muted';
  return { incomplete, label, title, tone };
}

/** The actual chip button, kept separate from the tooltip wrapper so it stays easy to test. */
export function SyncStatusChipControl({
  health,
  loading = false,
  expanded = false,
  onOpen,
}: {
  health?: SyncPanelHealth | null;
  loading?: boolean;
  expanded?: boolean;
  onOpen: () => void;
}) {
  const { incomplete, label, title, tone } = chipState(health, loading);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={`Sync status: ${label}${incomplete ? ', data incomplete' : ''}. Open data health and sync panel`}
      data-incomplete={incomplete ? 'true' : 'false'}
      title={title}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${tone}`}
    >
      {incomplete ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
      )}
      <span className="max-[420px]:hidden">{label}</span>
    </button>
  );
}

export function SyncStatusChipButton({
  health,
  loading = false,
  expanded = false,
  onOpen,
}: {
  health?: SyncPanelHealth | null;
  loading?: boolean;
  expanded?: boolean;
  onOpen: () => void;
}) {
  const { title } = chipState(health, loading);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <SyncStatusChipControl
            health={health}
            loading={loading}
            expanded={expanded}
            onOpen={onOpen}
          />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs whitespace-pre-line text-left">
          {title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SyncStatusChip() {
  const { filters } = useFilters();
  const health = useHealth(filters);
  const { open, setOpen } = useSyncPanelState();

  return (
    <>
      <SyncStatusChipButton
        health={health.data}
        loading={health.isPending && !health.data}
        expanded={open}
        onOpen={() => setOpen(true)}
      />
      <SyncStatusPanel
        open={open}
        onOpenChange={setOpen}
        health={health.data}
        healthLoading={health.isPending}
        healthError={health.isError}
        onHealthRetry={() => void health.refetch()}
      />
    </>
  );
}
