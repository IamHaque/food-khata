import * as React from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Maximize2, Table2, BarChart3, Download, FileDown, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { getCurrentChartTheme } from "@/lib/chart-theme";

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  caption?: string;
  infoPopover?: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  tableData?: Array<Record<string, any>>;
  tableHeaders?: string[];
  tableRows?: Array<Array<any>>;
  onExportCsv?: () => void;
  onExportPng?: () => void;
  // controlled view state (optional)
  showTable?: boolean;
  onShowTableChange?: (value: boolean) => void;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chart";
}

export function toCsv(data: Array<Record<string, any>>): string {
  if (!data || data.length === 0) return "";
  const columns = Object.keys(data[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v);
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.join(",");
  const rows = data.map((row) => columns.map((c) => escape(row[c])).join(","));
  return [header, ...rows].join("\n");
}

function triggerDownload(content: string | Blob, filename: string, mime: string) {
  if (typeof document === "undefined") return;
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ChartCard({
  title,
  subtitle,
  caption,
  infoPopover,
  isLoading,
  isEmpty,
  emptyReason,
  error,
  onRetry,
  tableData: tableDataProp,
  tableHeaders,
  tableRows,
  onExportCsv,
  onExportPng,
  showTable: showTableProp,
  onShowTableChange,
  fullscreen: fullscreenProp,
  onFullscreenChange,
  children,
  className,
}: ChartCardProps) {
  const [showTableState, setShowTableState] = React.useState(false);
  const [fullscreenState, setFullscreenState] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const controlledShowTable = showTableProp !== undefined;
  const showTable = controlledShowTable ? !!showTableProp : showTableState;
  const setShowTable = React.useCallback(
    (value: boolean) => {
      if (!controlledShowTable) setShowTableState(value);
      onShowTableChange?.(value);
    },
    [controlledShowTable, onShowTableChange],
  );

  const controlledFullscreen = fullscreenProp !== undefined;
  const fullscreen = controlledFullscreen ? !!fullscreenProp : fullscreenState;
  const setFullscreen = React.useCallback(
    (value: boolean) => {
      if (!controlledFullscreen) setFullscreenState(value);
      onFullscreenChange?.(value);
    },
    [controlledFullscreen, onFullscreenChange],
  );

  const containerRef = React.useRef<HTMLDivElement>(null);

  const tableData = React.useMemo(() => {
    if (tableDataProp) return tableDataProp;
    if (tableHeaders && tableRows) {
      return tableRows.map((row) =>
        Object.fromEntries(tableHeaders.map((header, idx) => [header, row[idx]])),
      );
    }
    return undefined;
  }, [tableDataProp, tableHeaders, tableRows]);

  const hasTable = Array.isArray(tableData) && tableData.length > 0;
  const columns = hasTable ? (tableHeaders ?? Object.keys(tableData![0])) : [];

  const sortedData = React.useMemo(() => {
    if (!hasTable || !tableData) return tableData ?? [];
    if (!sortKey) return tableData;
    const copy = [...tableData];
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const bothNum = typeof va === "number" && typeof vb === "number";
      let cmp = 0;
      if (bothNum) cmp = (va as number) - (vb as number);
      else cmp = String(va ?? "").localeCompare(String(vb ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [tableData, hasTable, sortKey, sortDir]);

  const handleSort = (col: string) => {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  };

  const handleExportCsv = React.useCallback(() => {
    if (onExportCsv) {
      onExportCsv();
      return;
    }
    if (hasTable && tableData) {
      triggerDownload(toCsv(tableData), `${slugify(title)}.csv`, "text/csv;charset=utf-8");
    }
  }, [onExportCsv, hasTable, tableData, title]);

  const handleExportPng = React.useCallback(() => {
    if (onExportPng) {
      onExportPng();
      return;
    }
    if (typeof document === "undefined") return;
    const root = containerRef.current;
    const canvas = root?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    try {
      const theme = getCurrentChartTheme();
      const tmp = document.createElement("canvas");
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const ctx = tmp.getContext("2d");
      if (ctx) {
        // Use theme surface background; fall back to white
        if (theme.tooltipBg) {
          ctx.fillStyle = theme.tooltipBg;
          ctx.fillRect(0, 0, tmp.width, tmp.height);
        }
        ctx.drawImage(canvas, 0, 0);
      }
      const url = (ctx ? tmp : canvas).toDataURL("image/png");
      triggerDownload(new Blob([], { type: "image/png" }), `${slugify(title)}.png`, "image/png");
      // Fallback download via data URL link
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slugify(title)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // ignore
    }
  }, [onExportPng, title]);

  const renderTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead
              key={c}
              aria-sort={
                sortKey === c ? (sortDir === "asc" ? "ascending" : "descending") : "none"
              }
              onClick={() => handleSort(c)}
              className="cursor-pointer select-none"
            >
              <span className="inline-flex items-center gap-1">
                {c}
                {sortKey === c ? (
                  sortDir === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-40" />
                )}
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedData.map((row, i) => (
          <TableRow key={i}>
            {columns.map((c) => (
              <TableCell key={c}>{String(row[c] ?? "")}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div ref={containerRef} className={cn(fullscreen ? "contents" : "")}>
      <Card className={cn(fullscreen ? "fixed inset-4 z-50 overflow-auto" : "", className)}>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-base text-foreground">{title}</CardTitle>
              {infoPopover}
            </div>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1">
            {hasTable && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle table view"
                onClick={() => setShowTable(!showTable)}
              >
                {showTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle fullscreen"
              onClick={() => setFullscreen(true)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            {onExportPng || true ? (
              <Button variant="ghost" size="icon" aria-label="Download PNG" onClick={handleExportPng}>
                <Download className="h-4 w-4" />
              </Button>
            ) : null}
            {(onExportCsv || hasTable) && (
              <Button variant="ghost" size="icon" aria-label="Download CSV" onClick={handleExportCsv}>
                <FileDown className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        {caption && <p className="px-6 text-xs text-muted-foreground">{caption}</p>}
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : error ? (
            <ErrorState
              message={typeof error === "string" ? error : error.message}
              onRetry={onRetry}
            />
          ) : isEmpty ? (
            <EmptyState title="No data" reason={emptyReason} />
          ) : showTable && hasTable ? (
            renderTable()
          ) : (
            children
          )}
        </CardContent>
      </Card>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-5xl w-[90vw] h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {showTable && hasTable ? renderTable() : children}
        </DialogContent>
      </Dialog>
    </div>
  );
}

ChartCard.displayName = "ChartCard";

export { ChartCard };