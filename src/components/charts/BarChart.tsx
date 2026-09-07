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
    const height = 120;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };

    const svg = select(ref.current)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', 'auto');

    svg.selectAll('*').remove();

    // Add background with subtle grid
    svg
      .append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .attr('stroke', 'none');

    const x = scaleBand()
      .domain(labels)
      .range([margin.left, width - margin.right])
      .padding(0.3);

    const y = scaleLinear()
      .domain([0, max(values) || 0])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Add subtle grid lines
    const gridLines = svg.append('g').attr('class', 'grid');
    
    // Horizontal grid lines
    gridLines
      .selectAll('.grid-line')
      .data(y.ticks(4))
      .enter()
      .append('line')
      .attr('class', 'grid-line')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', d => y(d))
      .attr('y2', d => y(d))
      .attr('stroke', 'var(--border)')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.3);

    // Create bars with modern styling
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
      .attr('fill', 'var(--chart-1)')
      .attr('rx', 4)
      .attr('ry', 4)
      .style('transition', 'all 0.2s ease')
      .on('mouseover', function() {
        select(this)
          .attr('fill', 'var(--chart-2)')
          .attr('opacity', 0.8);
      })
      .on('mouseout', function() {
        select(this)
          .attr('fill', 'var(--chart-1)')
          .attr('opacity', 1);
      });

    // Style the axes with modern typography
    const xAxis = (g: any) =>
      g
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(axisBottom(x).tickSizeOuter(0))
        .call((g: any) => g.select('.domain').attr('stroke', 'var(--border)'))
        .selectAll('text')
        .attr('fill', 'var(--muted-foreground)')
        .style('font-size', '11px')
        .style('font-weight', '500');

    const yAxis = (g: any) =>
      g
        .attr('transform', `translate(${margin.left},0)`)
        .call(axisLeft(y).ticks(4).tickSizeOuter(0))
        .call((g: any) => g.select('.domain').attr('stroke', 'var(--border)'))
        .selectAll('text')
        .attr('fill', 'var(--muted-foreground)')
        .style('font-size', '11px')
        .style('font-weight', '500');

    // Style tick lines
    svg.append('g').call(xAxis)
      .selectAll('.tick line')
      .attr('stroke', 'var(--border)')
      .attr('opacity', 0.5);

    svg.append('g').call(yAxis)
      .selectAll('.tick line')
      .attr('stroke', 'var(--border)')
      .attr('opacity', 0.5);

  }, [spec]);

  return (
    <div className="w-full rounded-lg border bg-card p-4">
      {spec.title && (
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-card-foreground">{spec.title}</h4>
        </div>
      )}
      <div className="rounded-md bg-muted/20 p-2">
        <svg ref={ref} className="overflow-visible"></svg>
      </div>
    </div>
  );
};

export default BarChart; 