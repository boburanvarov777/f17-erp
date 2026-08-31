/** Shared chart data shape for bar, rank, and donut charts. */
export interface ChartPoint {
  /** Stable identity, also emitted on click. */
  key: string;
  label: string;
  value: number;
  /** Secondary value stacked on top of `value` — defects in most reports. */
  extra?: number;
  color?: string;
  hint?: string;
}
