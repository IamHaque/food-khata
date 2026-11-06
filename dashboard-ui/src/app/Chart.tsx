import {useEffect,useRef} from 'react';
import * as echarts from 'echarts/core';
import {BarChart,LineChart,HeatmapChart,ScatterChart,PieChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent,VisualMapComponent,CalendarComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import type {EChartsCoreOption} from 'echarts/core';
echarts.use([BarChart,LineChart,HeatmapChart,ScatterChart,PieChart,GridComponent,TooltipComponent,LegendComponent,VisualMapComponent,CalendarComponent,CanvasRenderer]);
export function Chart({option,summary,headers,rows}:{option:EChartsCoreOption;summary:string;headers:string[];rows:(string|number|null)[][]}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const node=ref.current;if(!node)return;let chart:echarts.ECharts;function render(){chart?.dispose();const css=getComputedStyle(document.documentElement);chart=echarts.init(node);chart.setOption({color:[css.getPropertyValue('--v2-primary').trim(),css.getPropertyValue('--v2-chart-2').trim(),css.getPropertyValue('--v2-chart-3').trim(),css.getPropertyValue('--v2-chart-4').trim()],textStyle:{fontSize:12,color:css.getPropertyValue('--v2-foreground').trim()},animation:!matchMedia('(prefers-reduced-motion: reduce)').matches,...option});}render();const resize=new ResizeObserver(()=>chart.resize());resize.observe(node);const theme=new MutationObserver(render);theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-v2theme']});return()=>{theme.disconnect();resize.disconnect();chart.dispose();};},[option]);
 return <div><div ref={ref} role="img" aria-label={summary} style={{height:320,width:'100%'}}/><details><summary>View as table</summary><div className="overview-scroll" tabIndex={0} role="region" aria-label={`${summary} table`}><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell??'Unknown'}</td>)}</tr>)}</tbody></table></div></details></div>;
}
