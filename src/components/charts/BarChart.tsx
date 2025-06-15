import React, { useEffect, useRef } from 'react';
import { select } from 'd3-selection';
import { scaleBand, scaleLinear } from 'd3-scale';
import { max } from 'd3-array';
import { axisBottom, axisLeft } from 'd3-axis';

export interface BarChartSpec {
  type: 'bar';
  title?: string;
  labels: string[];
  values: number[];
}

interface Props { spec: BarChartSpec }

const BarChart: React.FC<Props> = ({ spec }) => {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const { labels, values } = spec;
    const width = 400;
    const height = 160;
    const margin = { top: 10, right: 10, bottom: 20, left: 30 };

    const svg = select(ref.current)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', 'auto');

    svg.selectAll('*').remove();

    const x = scaleBand()
      .domain(labels)
      .range([margin.left, width - margin.right])
      .padding(0.2);

    const y = scaleLinear()
      .domain([0, max(values) || 0])
      .nice()
      .range([height - margin.bottom, margin.top]);

    svg
      .append('g')
      .selectAll('rect')
      .data(values)
      .enter()
      .append('rect')
      .attr('x', (_, i) => x(labels[i])!)
      .attr('y', d => y(d))
      .attr('width', x.bandwidth())
      .attr('height', d => y(0) - y(d))
      .attr('class', 'fill-primary/70 hover:fill-primary transition-colors');

    const xAxis = (g: any) =>
      g
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(axisBottom(x).tickSizeOuter(0))
        .selectAll('text')
        .attr('class', 'text-xs fill-muted-foreground');

    const yAxis = (g: any) =>
      g
        .attr('transform', `translate(${margin.left},0)`)
        .call(axisLeft(y).ticks(4))
        .selectAll('text')
        .attr('class', 'text-xs fill-muted-foreground');

    svg.append('g').call(xAxis);
    svg.append('g').call(yAxis);
  }, [spec]);

  return (
    <div className="w-full">
      {spec.title && <h4 className="text-sm font-medium mb-2">{spec.title}</h4>}
      <svg ref={ref}></svg>
    </div>
  );
};

export default BarChart; 