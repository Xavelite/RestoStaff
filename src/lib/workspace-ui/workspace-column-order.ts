import { t } from '$lib/i18n/i18n.svelte';
import { reorderedColumns } from './workspace-column-order-model';

type ColumnState = {
  sourceKeys: string[];
  order: string[];
  applying: boolean;
  dragKey: string;
  dropKey: string;
  dropAfter: boolean;
};

const states = new WeakMap<HTMLTableElement, ColumnState>();

function cleanKey(value: string, index: number): string {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || `column-${index + 1}`;
}

function headerKey(cell: HTMLTableCellElement, index: number): string {
  const explicit = cell.querySelector<HTMLElement>('[data-column-key]')?.dataset.columnKey;
  return cleanKey(explicit || cell.getAttribute('aria-label') || cell.textContent || '', index);
}

function tableStorageKey(table: HTMLTableElement, sourceKeys: string[]): string {
  const tables = [...document.querySelectorAll<HTMLTableElement>('table.cl-table')];
  const index = Math.max(0, tables.indexOf(table));
  const identity =
    table.dataset.columnOrderKey ||
    table.getAttribute('aria-label') ||
    sourceKeys[0] ||
    `table-${index + 1}`;
  return `rst-column-order:${location.pathname}:${index}:${cleanKey(identity, index)}`;
}

function fixedColumn(
  cell: HTMLTableCellElement,
  index: number,
  cells: HTMLTableCellElement[]
): boolean {
  const firstIsGrip = cells[0]?.classList.contains('cl-grip');
  return (
    index === 0 ||
    (firstIsGrip && index === 1) ||
    cell.dataset.columnFixed === 'true' ||
    cell.classList.contains('chooser-col') ||
    cell.classList.contains('menu-cell') ||
    Boolean(cell.querySelector('.colchooser')) ||
    (index === cells.length - 1 && !(cell.textContent ?? '').trim())
  );
}

function readStoredOrder(key: string, movable: string[]): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(parsed)) return movable;
    const stored = parsed.filter(
      (value): value is string => typeof value === 'string' && movable.includes(value)
    );
    return [...stored, ...movable.filter((value) => !stored.includes(value))];
  } catch {
    return movable;
  }
}

function persistOrder(table: HTMLTableElement, state: ColumnState): void {
  try {
    localStorage.setItem(tableStorageKey(table, state.sourceKeys), JSON.stringify(state.order));
  } catch {
    // Reordering remains useful for the current page when storage is unavailable.
  }
}

function reorderRow(
  row: HTMLTableRowElement,
  sourceKeys: string[],
  desired: string[]
): void {
  const cells = [...row.cells];
  if (
    cells.length !== sourceKeys.length ||
    cells.some((cell) => cell.colSpan !== 1)
  ) {
    return;
  }

  const fullyTagged = cells.every((cell) => Boolean(cell.dataset.workspaceColumnKey));
  if (!fullyTagged) {
    cells.forEach((cell, index) => {
      cell.dataset.workspaceColumnKey = sourceKeys[index];
    });
  }

  const byKey = new Map(
    [...row.cells].map((cell) => [cell.dataset.workspaceColumnKey || '', cell])
  );
  const current = [...row.cells].map((cell) => cell.dataset.workspaceColumnKey || '');
  if (current.every((key, index) => key === desired[index])) return;
  for (const key of desired) {
    const cell = byKey.get(key);
    if (cell) row.append(cell);
  }
}

function applyOrder(table: HTMLTableElement, state: ColumnState): void {
  if (state.applying) return;
  const headRow = table.tHead?.rows[0];
  if (!headRow) return;
  const headerCells = [...headRow.cells];
  if (headerCells.length !== state.sourceKeys.length) return;

  const leftFixed: string[] = [];
  const rightFixed: string[] = [];
  const movable: string[] = [];
  let metMovable = false;
  headerCells.forEach((cell, index) => {
    const key = cell.dataset.workspaceColumnKey || state.sourceKeys[index];
    if (fixedColumn(cell, index, headerCells)) {
      (metMovable ? rightFixed : leftFixed).push(key);
    } else {
      metMovable = true;
      movable.push(key);
    }
  });
  state.order = [
    ...state.order.filter((key) => movable.includes(key)),
    ...movable.filter((key) => !state.order.includes(key))
  ];
  const desired = [...leftFixed, ...state.order, ...rightFixed];

  state.applying = true;
  const headersByKey = new Map(
    [...headRow.cells].map((cell) => [cell.dataset.workspaceColumnKey || '', cell])
  );
  const currentHeaders = [...headRow.cells].map(
    (cell) => cell.dataset.workspaceColumnKey || ''
  );
  if (!currentHeaders.every((key, index) => key === desired[index])) {
    for (const key of desired) {
      const cell = headersByKey.get(key);
      if (cell) headRow.append(cell);
    }
  }
  for (const body of table.tBodies) {
    for (const row of body.rows) reorderRow(row, state.sourceKeys, desired);
  }
  state.applying = false;
}

function sameKeys(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((key) => right.includes(key))
  );
}

function clearDropState(table: HTMLTableElement, state: ColumnState): void {
  state.dropKey = '';
  state.dropAfter = false;
  table.querySelectorAll('.is-column-drop, .is-column-drop-after').forEach((item) => {
    item.classList.remove('is-column-drop', 'is-column-drop-after');
  });
}

function moveColumn(
  table: HTMLTableElement,
  state: ColumnState,
  source: string,
  target: string,
  after: boolean
): void {
  const next = reorderedColumns(state.order, source, target, after);
  if (next === state.order) return;
  state.order = next;
  persistOrder(table, state);
  applyOrder(table, state);
}

function installDragHandle(
  table: HTMLTableElement,
  cell: HTMLTableCellElement,
  key: string,
  state: ColumnState
): void {
  if (cell.querySelector(':scope .workspace-column-drag')) return;
  const host = cell.querySelector<HTMLElement>('.colhead') ?? cell;
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'workspace-column-drag';
  handle.title = `${t('Drag to reorder')} · ${cell.textContent?.trim() ?? ''}`;
  handle.setAttribute('aria-label', handle.title);
  handle.innerHTML =
    '<svg viewBox="0 0 20 20" width="12" height="12" fill="currentColor" aria-hidden="true"><circle cx="7" cy="5" r="1.2"/><circle cx="13" cy="5" r="1.2"/><circle cx="7" cy="10" r="1.2"/><circle cx="13" cy="10" r="1.2"/><circle cx="7" cy="15" r="1.2"/><circle cx="13" cy="15" r="1.2"/></svg>';
  host.prepend(handle);
  let ghost: HTMLDivElement | null = null;

  const removeGhost = () => {
    ghost?.remove();
    ghost = null;
  };

  const moveGhost = (clientX: number, clientY: number) => {
    if (!ghost) return;
    const left = Math.max(
      12,
      Math.min(clientX - ghost.offsetWidth / 2, window.innerWidth - ghost.offsetWidth - 12)
    );
    const below = clientY + 18;
    const top = below + ghost.offsetHeight <= window.innerHeight - 12
      ? below
      : Math.max(12, clientY - ghost.offsetHeight - 18);
    ghost.style.left = `${left}px`;
    ghost.style.top = `${top}px`;
  };

  const finishPointerDrag = (event: PointerEvent, commit: boolean) => {
    if (state.dragKey !== key) return;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    if (commit && state.dropKey) {
      moveColumn(table, state, key, state.dropKey, state.dropAfter);
    }
    state.dragKey = '';
    cell.classList.remove('is-column-dragging');
    document.documentElement.classList.remove('is-reordering-column');
    removeGhost();
    clearDropState(table, state);
  };

  const updateDropTarget = (clientX: number, clientY: number) => {
    const target = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLTableCellElement>('th');
    const targetKey = target?.dataset.workspaceColumnKey ?? '';
    if (!target || !table.contains(target) || !state.order.includes(targetKey) || targetKey === key) {
      clearDropState(table, state);
      return;
    }
    const rect = target.getBoundingClientRect();
    const after = clientX > rect.left + rect.width / 2;
    if (state.dropKey === targetKey && state.dropAfter === after) return;
    clearDropState(table, state);
    state.dropKey = targetKey;
    state.dropAfter = after;
    target.classList.add('is-column-drop');
    target.classList.toggle('is-column-drop-after', after);
  };

  const beginDrag = (clientX: number, clientY: number) => {
    state.dragKey = key;
    clearDropState(table, state);
    cell.classList.add('is-column-dragging');
    document.documentElement.classList.add('is-reordering-column');
    ghost = document.createElement('div');
    ghost.className = 'workspace-column-drag-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    const rect = cell.getBoundingClientRect();
    ghost.style.setProperty('--drag-column-width', `${Math.min(320, Math.max(152, rect.width))}px`);
    const copy = document.createElement('span');
    copy.className = 'workspace-column-drag-ghost__copy';
    const label = document.createElement('strong');
    label.textContent =
      cell.querySelector<HTMLElement>('.colhead__copy > span')?.textContent?.trim() ||
      cell.textContent?.trim() ||
      t('Column');
    copy.append(label);
    const metaText = cell.querySelector<HTMLElement>('.colhead__copy small')?.textContent?.trim();
    if (metaText) {
      const meta = document.createElement('small');
      meta.textContent = metaText;
      copy.append(meta);
    }
    ghost.append(copy);
    document.body.append(ghost);
    moveGhost(clientX, clientY);
  };

  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    beginDrag(event.clientX, event.clientY);
    const move = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      moveGhost(moveEvent.clientX, moveEvent.clientY);
      updateDropTarget(moveEvent.clientX, moveEvent.clientY);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (state.dragKey === key && state.dropKey) {
        moveColumn(table, state, key, state.dropKey, state.dropAfter);
      }
      state.dragKey = '';
      cell.classList.remove('is-column-dragging');
      document.documentElement.classList.remove('is-reordering-column');
      removeGhost();
      clearDropState(table, state);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, { once: true });
  });

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // Mouse movement is tracked above; pointer capture covers touch and pen.
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    beginDrag(event.clientX, event.clientY);
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', (event) => {
    if (state.dragKey !== key) return;
    event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    updateDropTarget(event.clientX, event.clientY);
  });

  handle.addEventListener('pointerup', (event) => finishPointerDrag(event, true));
  handle.addEventListener('pointercancel', (event) => finishPointerDrag(event, false));
  handle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    const index = state.order.indexOf(key);
    const targetIndex = event.key === 'ArrowLeft' ? index - 1 : index + 1;
    const targetKey = state.order[targetIndex];
    if (!targetKey) return;
    moveColumn(table, state, key, targetKey, event.key === 'ArrowRight');
  });
}

function prepareTable(table: HTMLTableElement): void {
  if (
    table.classList.contains('board') ||
    table.dataset.columnOrder === 'off'
  ) {
    return;
  }
  const headRow = table.tHead?.rows[0];
  if (!headRow || headRow.cells.length < 3) return;
  const headerCells = [...headRow.cells];
  if (headerCells.some((cell) => cell.colSpan !== 1)) return;

  const renderedKeys = headerCells.map((cell, index) => {
    const key = cell.dataset.workspaceColumnKey || headerKey(cell, index);
    cell.dataset.workspaceColumnKey = key;
    return key;
  });
  if (new Set(renderedKeys).size !== renderedKeys.length) return;

  let state = states.get(table);
  if (!state) {
    const movable = renderedKeys.filter(
      (_, index) => !fixedColumn(headerCells[index], index, headerCells)
    );
    state = {
      sourceKeys: renderedKeys,
      order: readStoredOrder(tableStorageKey(table, renderedKeys), movable),
      applying: false,
      dragKey: '',
      dropKey: '',
      dropAfter: false
    };
    states.set(table, state);
  } else if (!sameKeys(state.sourceKeys, renderedKeys)) {
    const movable = renderedKeys.filter(
      (_, index) => !fixedColumn(headerCells[index], index, headerCells)
    );
    state.sourceKeys = renderedKeys;
    state.order = readStoredOrder(tableStorageKey(table, renderedKeys), movable);
    state.dragKey = '';
    clearDropState(table, state);
  }

  headerCells.forEach((cell, index) => {
    if (!fixedColumn(cell, index, headerCells)) {
      installDragHandle(
        table,
        cell,
        cell.dataset.workspaceColumnKey || renderedKeys[index],
        state!
      );
    }
  });
  applyOrder(table, state);
}

export function installWorkspaceColumnOrdering(): () => void {
  let queued = false;
  const scan = () => {
    queued = false;
    document
      .querySelectorAll<HTMLTableElement>('table.cl-table')
      .forEach(prepareTable);
  };
  const queueScan = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(scan);
  };

  scan();
  const observer = new MutationObserver(queueScan);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', queueScan);
  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', queueScan);
  };
}
