import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Skeleton } from '../components/ui/skeleton';
import { Chip } from '../components/ui/chip';
import { SegmentedControl } from '../components/ui/segmented-control';
import { ToolbarButton } from '../components/ui/toolbar-button';
import { KpiCard, ChartCard, EmptyState, ErrorState } from '../components/dashboard';
import { RefreshCw, BarChart3 } from 'lucide-react';

export function DesignSystem() {
  const [seg, setSeg] = useState('a');
  const [chipActive, setChipActive] = useState(false);

  return (
    <section className="space-y-6">
      <div className="border-b pb-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Design system</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Use the theme selector to inspect light, dark and system appearance.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Revenue" value="₹1,234" subtitle="+12% vs last" icon={<BarChart3 className="h-4 w-4" />} />
        <KpiCard title="Loading" isLoading />
      </div>

      <ChartCard
        title="Sample chart"
        subtitle="Last 7 days"
        caption="Takeaway: up 12%"
        tableData={[{ day: 'Mon', value: 10 }, { day: 'Tue', value: 14 }]}
        onExportCsv={() => {}}
        onExportPng={() => {}}
      >
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Chart placeholder</div>
      </ChartCard>

      <ChartCard title="Loading chart" isLoading>
        <div />
      </ChartCard>

      <ChartCard title="Empty chart" isEmpty emptyReason="No orders match filters">
        <div />
      </ChartCard>

      <ChartCard title="Error chart" error="Data could not load" onRetry={() => {}}>
        <div />
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">Chips & badges</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Chip label="Default" />
          <Chip label="Active" active={chipActive} onClick={() => setChipActive((v) => !v)} />
          <Chip label="Removable" onRemove={() => {}} />
          <Badge variant="default">Primary</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">Segmented control</CardTitle>
        </CardHeader>
        <CardContent>
          <SegmentedControl
            options={[
              { value: 'a', label: 'Option A' },
              { value: 'b', label: 'Option B' },
            ]}
            value={seg}
            onChange={setSeg}
          />
          <p className="text-xs text-muted-foreground mt-2">Selected: {seg}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">Popover, Select, Sheet, Tooltip</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Open popover</Button>
            </PopoverTrigger>
            <PopoverContent className="text-xs">Popover content</PopoverContent>
          </Popover>

          <Select>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Option A</SelectItem>
              <SelectItem value="b">Option B</SelectItem>
            </SelectContent>
          </Select>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Open sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Sheet title</SheetTitle>
              </SheetHeader>
              <p className="text-sm text-muted-foreground mt-2">Sheet content</p>
            </SheetContent>
          </Sheet>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Hover me</Button>
              </TooltipTrigger>
              <TooltipContent>Tooltip text</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">Toolbar buttons</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <ToolbarButton icon={<RefreshCw className="h-4 w-4" />} tooltip="Refresh" />
          <ToolbarButton icon={<BarChart3 className="h-4 w-4" />} active tooltip="Chart" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">Skeleton / Empty / Error</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Nothing here" description="No data yet" />
          <ErrorState message="Failed to load" onRetry={() => {}} />
        </CardContent>
      </Card>
    </section>
  );
}