import { t } from '$lib/i18n/i18n.svelte';

type ColumnState = {
  sourceKeys: string[];
  order: string[];
  applying: boolean;
  dragKey: string;
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
  for (const key of desired) {
    const cell = headersByKey.get(key);
    if (cell) headRow.append(cell);
  }
  for (const body of table.tBodies) {
    for (const row of body.rows) reorderRow(row, state.sourceKeys, desired);
  }
  state.applying = false;
}

function installDragHandle(
  table: HTMLTableElement,
  cell: HTMLTableCellElement,
  key: string,
  state: ColumnState
): void {
  if (cell.querySelector(':scope .workspace-column-drag')) return;
  const host = cell.querySelector<HTMLElement>('.colhead') ?? cell;
  const handle = document.createElement('span');
  handle.className = 'workspace-column-drag';
  handle.draggable = true;
  handle.tabIndex = -1;
  handle.setAttribute('aria-hidden', 'true');
  handle.title = t('Drag to reorder');
  handle.innerHTML =
    '<svg viewBox="0 0 20 20" width="12" height="12" fill="currentColor" aria-hidden="true"><circle cx="7" cy="5" r="1.2"/><circle cx="13" cy="5" r="1.2"/><circle cx="7" cy="10" r="1.2"/><circle cx="13" cy="10" r="1.2"/><circle cx="7" cy="15" r="1.2"/><circle cx="13" cy="15" r="1.2"/></svg>';
  host.prepend(handle);

  handle.addEventListener('dragstart', (event) => {
    state.dragKey = key;
    cell.classList.add('is-column-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', key);
    }
  });
  handle.addEventListener('dragend', () => {
    state.dragKey = '';
    cell.classList.remove('is-column-dragging');
    table.querySelectorAll('.is-column-drop').forEach((item) =>
      item.classList.remove('is-column-drop')
    );
  });
  cell.addEventListener('dragover', (event) => {
    if (!state.dragKey || state.dragKey === key) return;
    event.preventDefault();
    cell.classList.add('is-column-drop');
  });
  cell.addEventListener('dragleave', () => cell.classList.remove('is-column-drop'));
  cell.addEventListener('drop', (event) => {
    cell.classList.remove('is-column-drop');
    const source = state.dragKey || event.dataTransfer?.getData('text/plain') || '';
    if (!source || source === key) return;
    event.preventDefault();
    const withoutSource = state.order.filter((candidate) => candidate !== source);
    const target = withoutSource.indexOf(key);
    const rect = cell.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    withoutSource.splice(
      target < 0 ? withoutSource.length : target + (after ? 1 : 0),
      0,
      source
    );
    state.order = withoutSource;
    persistOrder(table, state);
    applyOrder(table, state);
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

  const sourceKeys = headerCells.map((cell, index) => {
    const key = cell.dataset.workspaceColumnKey || headerKey(cell, index);
    cell.dataset.workspaceColumnKey = key;
    return key;
  });
  if (new Set(sourceKeys).size !== sourceKeys.length) return;

  let state = states.get(table);
  if (!state || state.sourceKeys.join('|') !== sourceKeys.join('|')) {
    const movable = sourceKeys.filter(
      (_, index) => !fixedColumn(headerCells[index], index, headerCells)
    );
    state = {
      sourceKeys,
      order: readStoredOrder(tableStorageKey(table, sourceKeys), movable),
      applying: false,
      dragKey: ''
    };
    states.set(table, state);
  }

  headerCells.forEach((cell, index) => {
    if (!fixedColumn(cell, index, headerCells)) {
      installDragHandle(table, cell, sourceKeys[index], state!);
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
