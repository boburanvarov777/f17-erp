const GAP = 8;
const PAD = 8;

let tipEl: HTMLDivElement | null = null;
let active: HTMLElement | null = null;

function ensureTip(): HTMLDivElement {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'app-tooltip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function fits(left: number, top: number, w: number, h: number): boolean {
  return left >= PAD && top >= PAD && left + w <= window.innerWidth - PAD && top + h <= window.innerHeight - PAD;
}

function positionTip(target: HTMLElement, tip: HTMLDivElement): void {
  const text = target.getAttribute('data-tip');
  if (!text) return;

  tip.textContent = text;
  tip.style.visibility = 'hidden';
  tip.style.display = 'block';
  tip.classList.add('visible');

  const rect = target.getBoundingClientRect();
  const box = tip.getBoundingClientRect();

  const pref =
    target.getAttribute('data-tip-prefer') ??
    target.closest('[data-tip-prefer]')?.getAttribute('data-tip-prefer') ??
    target.closest('[data-tip-zone]')?.getAttribute('data-tip-zone') ??
    null;
  const all = [
    { place: 'top', top: rect.top - box.height - GAP, left: rect.left + rect.width / 2 - box.width / 2 },
    { place: 'bottom', top: rect.bottom + GAP, left: rect.left + rect.width / 2 - box.width / 2 },
    { place: 'right', top: rect.top + rect.height / 2 - box.height / 2, left: rect.right + GAP },
    { place: 'left', top: rect.top + rect.height / 2 - box.height / 2, left: rect.left - box.width - GAP },
  ];

  const order = pref && all.some((c) => c.place === pref)
    ? [all.find((c) => c.place === pref)!, ...all.filter((c) => c.place !== pref)]
    : all;

  const chosen = order.find((c) => fits(c.left, c.top, box.width, box.height)) ?? order[1] ?? order[0];

  tip.style.left = `${Math.max(PAD, Math.min(chosen.left, window.innerWidth - box.width - PAD))}px`;
  tip.style.top = `${Math.max(PAD, Math.min(chosen.top, window.innerHeight - box.height - PAD))}px`;
  tip.dataset.place = chosen.place;
  tip.style.visibility = 'visible';
}

/** Tooltips are a hover affordance — on touch they only ever get stuck. */
function hoverCapable(): boolean {
  return window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;
}

function showTip(target: HTMLElement): void {
  const text = target.getAttribute('data-tip');
  if (!text || !hoverCapable()) return;
  active = target;
  positionTip(target, ensureTip());
}

function hideTip(): void {
  active = null;
  if (!tipEl) return;
  tipEl.classList.remove('visible');
  tipEl.style.display = 'none';
}

function bindTip(el: HTMLElement): void {
  if (el.dataset['tipBound'] === '1') return;
  el.dataset['tipBound'] = '1';

  const sync = () => {
    const tip = el.getAttribute('data-tip');
    el.removeAttribute('title');
    if (tip) el.setAttribute('aria-label', tip);
    else el.removeAttribute('aria-label');
  };
  sync();

  el.addEventListener('mouseenter', () => showTip(el));
  el.addEventListener('mouseleave', hideTip);
  el.addEventListener('focus', () => showTip(el));
  el.addEventListener('blur', hideTip);
}

/** Wires [data-tip] elements to a viewport-aware floating tooltip. */
export function syncDataTips(root: ParentNode = document.body): void {
  root.querySelectorAll<HTMLElement>('[data-tip]').forEach(bindTip);
}

export function startTooltipSync(): void {
  if (typeof document === 'undefined') return;

  syncDataTips();

  const obs = new MutationObserver(() => {
    // A trigger removed while shown (modal close button) never fires blur.
    if (active && !active.isConnected) hideTip();
    syncDataTips();
  });
  obs.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-tip'],
  });

  window.addEventListener('pointerdown', hideTip, true);
  window.addEventListener('scroll', () => { if (active) positionTip(active, ensureTip()); }, true);
  window.addEventListener('resize', () => { if (active) positionTip(active, ensureTip()); });
}
