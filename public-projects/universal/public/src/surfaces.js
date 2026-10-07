import { icon } from './icons.js';
import { escapeHTML as esc } from './model.js';

let anchor = null;
export function closePopover(restoreFocus = false) {
  const panel = document.querySelector('#quick-popover');
  if (!panel) return false;
  panel.remove();
  anchor?.setAttribute('aria-expanded', 'false');
  if (restoreFocus && anchor?.isConnected) anchor.focus();
  anchor = null;
  return true;
}
export function openPopover(trigger, title, content, type = '') {
  const toggling = anchor === trigger && document.querySelector('#quick-popover');
  // A submenu trigger can disappear when its parent popover closes.
  const rect = trigger?.getBoundingClientRect() || { left: innerWidth - 400, bottom: 70, top: 70 };
  closePopover();
  if (toggling) return;
  anchor = trigger;
  trigger?.setAttribute('aria-expanded', 'true');
  const panel = document.createElement('section');
  panel.id = 'quick-popover'; panel.className = `quick-popover ${type}`;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', title);
  panel.innerHTML = `<header><h2>${esc(title)}</h2><button class="icon-btn" data-close-popover aria-label="Close ${esc(title)}">${icon('close')}</button></header><div class="quick-popover-body">${content}</div>`;
  document.body.append(panel);
  panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - panel.offsetWidth - 12))}px`;
  const top = Math.max(12, Math.min(rect.bottom + 10, innerHeight - Math.min(panel.offsetHeight, innerHeight - 24) - 12));
  panel.style.top = `${top}px`;
  panel.querySelector('button, input, a')?.focus({ preventScroll: true });
}
document.addEventListener('click', event => {
  if (event.target.closest('[data-close-popover]')) closePopover(true);
  else if (!event.target.closest('#quick-popover') && !anchor?.contains?.(event.target)) closePopover();
}, true);

document.addEventListener('focusin', event => {
  if (!event.target.closest('#quick-popover') && !anchor?.contains?.(event.target)) closePopover();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && closePopover(true)) { event.preventDefault(); event.stopImmediatePropagation(); }
  const panel = event.target.closest('#quick-popover');
  if (!panel || event.target.closest('input,textarea,select') || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
  const buttons = [...panel.querySelectorAll('button:not(:disabled),a[href]')].filter(el => el.getClientRects().length);
  if (!buttons.length) return;
  const at = buttons.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  event.preventDefault(); buttons[next].focus();
}, true);
window.addEventListener('resize', () => closePopover());
document.addEventListener('scroll', event => {
  if (event.target === document || event.target === document.documentElement) closePopover();
}, true);
