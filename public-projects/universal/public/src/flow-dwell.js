/** One activation per visit, after uninterrupted time on a settled card. */
export function createFlowDwell(onReady, { delay = 2000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let current = null, timer = null, fired = false, generation = 0;
  function cancelTimer() { generation++; if (timer !== null) clearTimer(timer); timer = null; }
  return {
    update(key, { eligible = true, restart = false } = {}) {
      if (current !== key) { cancelTimer(); current = key; fired = false; }
      if (!eligible || key === null) { cancelTimer(); return; }
      if (fired) return;
      if (restart) cancelTimer();
      if (timer !== null) return;
      const token = ++generation;
      timer = setTimer(() => {
        if (token !== generation || current !== key) return;
        timer = null; fired = true; onReady(key);
      }, delay);
    },
    dismiss(key) { cancelTimer(); current = key; fired = true; },
    reset() { cancelTimer(); current = null; fired = false; },
  };
}
