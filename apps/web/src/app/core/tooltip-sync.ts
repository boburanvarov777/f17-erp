/** Mirrors [data-tip] to native title/aria-label so tooltips work inside overflow containers. */
export function syncDataTips(root: ParentNode = document.body): void {
  root.querySelectorAll<HTMLElement>('[data-tip]').forEach((el) => {
    const tip = el.getAttribute('data-tip');
    if (!tip) return;
    if (el.getAttribute('title') !== tip) el.setAttribute('title', tip);
    if (el.getAttribute('aria-label') !== tip) el.setAttribute('aria-label', tip);
  });
}

export function startTooltipSync(): void {
  if (typeof document === 'undefined') return;
  syncDataTips();
  const obs = new MutationObserver(() => syncDataTips());
  obs.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-tip'],
  });
}
