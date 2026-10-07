const positions = new Map();
function updateRail(rail) {
  if (!rail.isConnected) return;
  positions.set(rail.dataset.rail, rail.scrollLeft);
  const arrows = rail.closest('.collection-section').querySelector('.rail-buttons');
  if (arrows) arrows.hidden = rail.scrollWidth <= rail.clientWidth + 2;
  rail.closest('.collection-section').querySelectorAll('[data-action="scroll-rail"]').forEach(button => {
    button.disabled = Number(button.dataset.direction) < 0 ? rail.scrollLeft < 2 : rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
  });
}
const observer = new ResizeObserver(entries => entries.forEach(entry => updateRail(entry.target)));
export function hydrateRails() {
  observer.disconnect();
  document.querySelectorAll('[data-rail]').forEach(rail => {
    observer.observe(rail);
    if (rail.dataset.ready) return;
    rail.dataset.ready = 'true';
    rail.scrollLeft = positions.get(rail.dataset.rail) || 0;
    rail.addEventListener('scroll', () => updateRail(rail), { passive: true });
    updateRail(rail);
  });
}
export function scrollRail(button) {
  const rail = button.closest('.collection-section').querySelector('[data-rail]');
  if (!rail) return;
  rail.scrollBy({ left: Number(button.dataset.direction) * rail.clientWidth * .84, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
