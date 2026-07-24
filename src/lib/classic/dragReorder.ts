/**
 * Drag-to-reorder for a table body.
 *
 * Row order is the saved order for employees, areas and positions — each list
 * is written back with its array index as `sort_order` — so dragging a row is a
 * real edit, not a view preference.
 *
 * Applied to the `<tbody>`; every row that should move needs `data-drag` set to
 * its index. Rows without it (an empty-state row, an inline add form) stay put.
 */
export function dragReorder(
  node: HTMLElement,
  options: { onmove: (from: number, to: number) => void; enabled?: boolean }
) {
  let current = options;
  let fromIndex = -1;

  function rowOf(target: EventTarget | null): HTMLElement | null {
    const element = target instanceof Element ? target.closest('[data-drag]') : null;
    return element instanceof HTMLElement ? element : null;
  }

  function indexOf(row: HTMLElement): number {
    return Number(row.dataset.drag);
  }

  function onDragStart(event: DragEvent) {
    if (current.enabled === false) return;
    const row = rowOf(event.target);
    if (!row) return;
    fromIndex = indexOf(row);
    row.classList.add('is-dragging');
    // Firefox will not start a drag without payload on the transfer.
    event.dataTransfer?.setData('text/plain', String(fromIndex));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(event: DragEvent) {
    if (fromIndex < 0) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const row = rowOf(event.target);
    if (!row) return;
    for (const other of node.querySelectorAll('[data-drag]')) {
      other.classList.remove('is-drop-before', 'is-drop-after');
    }
    // Past the midpoint the row lands after the one under the cursor, which is
    // what makes dropping at the very end reachable.
    const box = row.getBoundingClientRect();
    row.classList.add(event.clientY > box.top + box.height / 2 ? 'is-drop-after' : 'is-drop-before');
  }

  function clear() {
    for (const other of node.querySelectorAll('[data-drag]')) {
      other.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after');
    }
  }

  function onDrop(event: DragEvent) {
    if (fromIndex < 0) return;
    event.preventDefault();
    const row = rowOf(event.target);
    if (row) {
      const box = row.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      let to = indexOf(row) + (after ? 1 : 0);
      // Removing the dragged row first shifts every later target down one.
      if (fromIndex < to) to -= 1;
      if (to !== fromIndex) current.onmove(fromIndex, to);
    }
    fromIndex = -1;
    clear();
  }

  function onDragEnd() {
    fromIndex = -1;
    clear();
  }

  node.addEventListener('dragstart', onDragStart);
  node.addEventListener('dragover', onDragOver);
  node.addEventListener('drop', onDrop);
  node.addEventListener('dragend', onDragEnd);

  return {
    update(next: typeof options) {
      current = next;
    },
    destroy() {
      node.removeEventListener('dragstart', onDragStart);
      node.removeEventListener('dragover', onDragOver);
      node.removeEventListener('drop', onDrop);
      node.removeEventListener('dragend', onDragEnd);
    }
  };
}

/** Move an item within a copy of the list. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
