/** Chart colours shared by the reports, analytics and Mini App views. */
export const STAGE_COLOR: Record<string, string> = {
  CUTTING: 'var(--stage-cutting)', SEWING: 'var(--stage-sewing)', WASHING: 'var(--stage-washing)',
  LASER: 'var(--stage-laser)', PACKING: 'var(--stage-packing)', LOADING: 'var(--stage-loading)',
};

export const STATUS_COLOR: Record<string, string> = {
  NEW: 'var(--primary-500)', CONFIRMED: 'var(--info)', IN_PRODUCTION: 'var(--warning)',
  READY: 'var(--success)', LOADING: 'var(--stage-loading)', COMPLETED: 'var(--stage-sewing)',
  CANCELLED: 'var(--text-3)', DELAYED: 'var(--danger)',
  OK: 'var(--success)', LOW: 'var(--warning)', OUT: 'var(--danger)',
};

export const PALETTE = [
  'var(--stage-cutting)', 'var(--stage-sewing)', 'var(--stage-washing)',
  'var(--stage-laser)', 'var(--stage-packing)', 'var(--stage-loading)',
];
