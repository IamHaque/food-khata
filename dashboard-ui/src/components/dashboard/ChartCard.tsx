import * as React from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Maximize2, Minimize2, Table2, BarChart3, Download, FileDown } from "lucide-react";

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  caption?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyReason?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  tableData?: Array<Record<string, any>>;
  onExportCsv?: () => void;
  onExportPng?: () => void;
  children: React.ReactNode;
  className?: string;
}

function ChartCard({
  title,
  subtitle,
  caption,
  isLoading,
  isEmpty,
  emptyReason,
  error,
  onRetry,
  tableData,
  onExportCsv,
  onExportPng,
  children,
  className,
}: ChartCardProps) {
  const [showTable, setShowTable] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);

  const hasTable = Array.isArray(tableData) && tableData.length > 0;
  const columns = hasTable ? Object.keys(tableData![0]) : [];

  return (
    <Card className={cn(fullscreen ? "fixed inset-4 z-50 overflow-auto" : "", className)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base text-foreground">{title}</CardTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          {hasTable && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle table view"
              onClick={() => setShowTable((v) => !v)}
            >
              {showTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle fullscreen"
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          {onExportPng && (
            <Button variant="ghost" size="icon" aria-label="Download PNG" onClick={onExportPng}>
              <Download className="h-4 w-4" />
            </Button>
          )}
          {onExportCsv && (
            <Button variant="ghost" size="icon" aria-label="Export CSV" onClick={onExportCsv}>
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
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData!.map((row, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c}>{String(row[c])}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

ChartCard.displayName = "ChartCard";

export { ChartCard };