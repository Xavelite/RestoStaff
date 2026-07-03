export function countUp(node: HTMLElement, value: number) {
  let current = value;

  function run(from: number, to: number) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.textContent = String(to);
      return;
    }
    const duration = 600;
    const start = performance.now();
    function frame(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = String(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  run(0, value);

  return {
    update(next: number) {
      run(current, next);
      current = next;
    }
  };
}
