/**
 * Line plot with explicit axis units and an accessible data table.
 *
 * The table is always rendered (visually hidden) so the same information is
 * available to screen readers and to users who cannot read the chart. No value
 * is interpolated or invented: only the given points are drawn.
 */

import { useId, useMemo } from "react";

export interface PlotSeries {
  name: string;
  x: number[];
  y: number[];
}

export interface LinePlotProps {
  series: PlotSeries;
  xLabel: string;
  yLabel: string;
  xUnit: string;
  yUnit: string;
  height?: number;
  caption?: string;
  title?: string;
}

function extent(values: number[]): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

function ticks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => min + i * step);
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 1e-3 || magnitude >= 1e5)) return value.toExponential(2);
  if (magnitude >= 100) return value.toFixed(1);
  if (magnitude >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

export function LinePlot({
  series,
  xLabel,
  yLabel,
  xUnit,
  yUnit,
  height = 260,
  caption,
  title,
}: LinePlotProps): JSX.Element {
  const clipId = useId();
  const width = 720;
  const padding = { top: 16, right: 18, bottom: 38, left: 56 };

  const geometry = useMemo(() => {
    const [xMin, xMax] = extent(series.x);
    const [yMin, yMax] = extent(series.y);
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const toX = (value: number): number =>
      padding.left + ((value - xMin) / (xMax - xMin)) * innerWidth;
    const toY = (value: number): number =>
      padding.top + innerHeight - ((value - yMin) / (yMax - yMin)) * innerHeight;
    const points: string[] = [];
    for (let i = 0; i < Math.min(series.x.length, series.y.length); i++) {
      const x = series.x[i]!;
      const y = series.y[i]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push(`${toX(x).toFixed(2)},${toY(y).toFixed(2)}`);
    }
    return {
      points: points.join(" "),
      xTicks: ticks(xMin, xMax).map((value) => ({ value, x: toX(value) })),
      yTicks: ticks(yMin, yMax).map((value) => ({ value, y: toY(value) })),
      innerWidth,
      innerHeight,
      xMin,
      xMax,
      yMin,
      yMax,
    };
  }, [series, height]);

  return (
    <figure style={{ margin: 0 }}>
      {title && (
        <figcaption className="panel-title" style={{ marginBottom: 6 }}>
          {title}
        </figcaption>
      )}
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${yLabel} (${yUnit}) against ${xLabel} (${xUnit})`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={padding.left}
              y={padding.top}
              width={geometry.innerWidth}
              height={geometry.innerHeight}
            />
          </clipPath>
        </defs>
        <g className="grid">
          {geometry.yTicks.map((tick) => (
            <line
              key={`gy-${tick.value}`}
              x1={padding.left}
              x2={padding.left + geometry.innerWidth}
              y1={tick.y}
              y2={tick.y}
            />
          ))}
        </g>
        <g className="axis">
          <line
            x1={padding.left}
            x2={padding.left}
            y1={padding.top}
            y2={padding.top + geometry.innerHeight}
          />
          <line
            x1={padding.left}
            x2={padding.left + geometry.innerWidth}
            y1={padding.top + geometry.innerHeight}
            y2={padding.top + geometry.innerHeight}
          />
          {geometry.xTicks.map((tick) => (
            <line
              key={`tx-${tick.value}`}
              x1={tick.x}
              x2={tick.x}
              y1={padding.top + geometry.innerHeight}
              y2={padding.top + geometry.innerHeight + 4}
            />
          ))}
          {geometry.yTicks.map((tick) => (
            <line
              key={`ty-${tick.value}`}
              x1={padding.left - 4}
              x2={padding.left}
              y1={tick.y}
              y2={tick.y}
            />
          ))}
        </g>
        <g>
          {geometry.xTicks.map((tick) => (
            <text key={`lx-${tick.value}`} x={tick.x} y={height - 20} textAnchor="middle">
              {fmt(tick.value)}
            </text>
          ))}
          {geometry.yTicks.map((tick) => (
            <text key={`ly-${tick.value}`} x={padding.left - 8} y={tick.y + 3} textAnchor="end">
              {fmt(tick.value)}
            </text>
          ))}
          <text x={padding.left + geometry.innerWidth / 2} y={height - 4} textAnchor="middle">
            {xLabel} ({xUnit})
          </text>
          <text
            x={10}
            y={padding.top + geometry.innerHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 10 ${padding.top + geometry.innerHeight / 2})`}
          >
            {yLabel} ({yUnit})
          </text>
        </g>
        <polyline className="series" points={geometry.points} clipPath={`url(#${clipId})`} />
      </svg>
      {caption && <figcaption className="table-caption">{caption}</figcaption>}
      <table className="sr-only">
        <caption>{`${yLabel} (${yUnit}) against ${xLabel} (${xUnit})`}</caption>
        <thead>
          <tr>
            <th scope="col">{`${xLabel} (${xUnit})`}</th>
            <th scope="col">{`${yLabel} (${yUnit})`}</th>
          </tr>
        </thead>
        <tbody>
          {series.x.slice(0, 500).map((x, index) => (
            <tr key={index}>
              <td>{x}</td>
              <td>{series.y[index] ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
