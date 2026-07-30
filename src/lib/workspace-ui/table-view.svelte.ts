import { t } from '$lib/i18n/i18n.svelte';

/**
 * One view-state model for every workspace data table.
 *
 * Sorting, grouping, per-column filters and the chosen column set are the same
 * behaviour on every table, so they live here once instead of being re-declared
 * per page. A column filter is stored as the set of EXCLUDED values (empty =
 * show everything), which is what lets "unselect all" mean "show none".
 *
 * Hiding a column also retires whatever that column was driving — its sort, its
 * filter and its grouping — so a hidden column can never keep shaping the table
 * from somewhere the user cannot see.
 */

type SortState<Key extends string> = { key: Key; dir: 'asc' | 'desc' };

type TableColumn = { key: string; label: string };

type TableViewOptions<Key extends string, Group extends string> = {
  /** localStorage key for the chosen column set. Omit to keep it in memory. */
  storageKey?: string;
  /** An earlier storageKey to read once, so a rename keeps the saved columns. */
  legacyStorageKey?: string;
  /** Optional columns the column chooser offers. */
  columns?: readonly TableColumn[];
  /** Columns hidden until the user asks for them, e.g. a costly detail column. */
  defaultHidden?: readonly string[];
  defaultGroupBy?: Group;
  /** Column filters that start with values excluded, e.g. `{ status: ['archived'] }`. */
  defaultExcluded?: Record<string, readonly string[]>;
};

class TableView<Key extends string = string, Group extends string = string> {
  sort = $state<SortState<Key> | null>(null);
  groupBy = $state<Group>('none' as Group);
  hidden = $state<Set<string>>(new Set());

  #collapsed = $state<Set<string>>(new Set());
  #excluded = $state<Record<string, Set<string>>>({});
  #searches = $state<Record<string, string>>({});
  #columns: readonly TableColumn[];
  #storageKey: string;
  #legacyStorageKey: string;
  #defaultHidden: readonly string[];
  #defaultExcluded: Record<string, readonly string[]>;

  constructor(options: TableViewOptions<Key, Group> = {}) {
    this.#columns = options.columns ?? [];
    this.#storageKey = options.storageKey ?? '';
    this.#legacyStorageKey = options.legacyStorageKey ?? '';
    this.#defaultHidden = options.defaultHidden ?? [];
    this.#defaultExcluded = options.defaultExcluded ?? {};
    this.hidden = new Set(this.#defaultHidden);
    this.groupBy = (options.defaultGroupBy ?? 'none') as Group;
    this.#restoreDefaultFilters();
  }

  #restoreDefaultFilters(): void {
    const excluded: Record<string, Set<string>> = {};
    for (const [column, values] of Object.entries(this.#defaultExcluded)) {
      excluded[column] = new Set(values);
    }
    this.#excluded = excluded;
    this.#searches = {};
  }

  // ---- columns ------------------------------------------------------------

  /**
   * Restore the saved column set. Call from onMount — it touches localStorage.
   * Bound, so it can be passed directly as `onMount(view.restore)`.
   */
  restore = (): void => {
    if (!this.#storageKey) return;
    try {
      const raw =
        localStorage.getItem(this.#storageKey) ??
        (this.#legacyStorageKey ? localStorage.getItem(this.#legacyStorageKey) : null);
      if (raw) this.hidden = new Set(JSON.parse(raw) as string[]);
    } catch {
      this.hidden = new Set(this.#defaultHidden);
    }
  };

  shown = (column: string): boolean => !this.hidden.has(column);

  /** Visible optional columns plus the always-on first column. */
  get colCount(): number {
    return 1 + this.#columns.filter((column) => this.shown(column.key)).length;
  }

  get columns(): TableColumn[] {
    return this.#columns.map((column) => ({ key: column.key, label: t(column.label) }));
  }

  toggleColumn = (column: string): void => {
    const next = new Set(this.hidden);
    next.has(column) ? next.delete(column) : next.add(column);
    this.hidden = next;
    if (next.has(column)) {
      // A hidden column stops shaping the table.
      if (this.sort?.key === (column as Key)) this.sort = null;
      if ((this.groupBy as string) === column) this.setGroupBy('none' as Group);
      this.clearFilter(column);
    }
    if (!this.#storageKey) return;
    try {
      localStorage.setItem(this.#storageKey, JSON.stringify([...next]));
    } catch {
      // A device that refuses storage still toggles for this session.
    }
  };

  // ---- sorting ------------------------------------------------------------

  sortDir = (key: Key): 'asc' | 'desc' | null => (this.sort?.key === key ? this.sort.dir : null);

  setSort = (key: Key, dir: 'asc' | 'desc'): void => {
    this.sort = { key, dir };
  };

  /** Sort rows by a caller-supplied comparable value. Stable when no sort is set. */
  ordered = <Row>(rows: Row[], value: (row: Row, key: Key) => string | number): Row[] => {
    const sort = this.sort;
    if (!sort) return rows;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((left, right) => {
      const a = value(left, sort.key);
      const b = value(right, sort.key);
      if (typeof a === 'number' && typeof b === 'number') return factor * (a - b);
      return factor * String(a).localeCompare(String(b));
    });
  };

  // ---- grouping -----------------------------------------------------------

  setGroupBy = (next: Group): void => {
    this.groupBy = next;
    this.#collapsed = new Set();
  };

  get grouping(): boolean {
    return (this.groupBy as string) !== 'none';
  }

  isCollapsed = (key: string): boolean => this.#collapsed.has(key);

  /** Open every group, so a row added into a collapsed one is still visible. */
  expandAll = (): void => {
    this.#collapsed = new Set();
  };

  toggleGroup = (key: string): void => {
    const next = new Set(this.#collapsed);
    next.has(key) ? next.delete(key) : next.add(key);
    this.#collapsed = next;
  };

  // ---- filters ------------------------------------------------------------

  excluded = (column: string): Set<string> => this.#excluded[column] ?? new Set();

  isExcluded = (column: string, value: string): boolean => Boolean(this.#excluded[column]?.has(value));

  toggleValue = (column: string, value: string): void => {
    const next = new Set(this.#excluded[column] ?? []);
    next.has(value) ? next.delete(value) : next.add(value);
    this.#excluded = { ...this.#excluded, [column]: next };
  };

  /** `on` shows every value; `off` excludes them all. */
  selectAll = (column: string, on: boolean, values: readonly { value: string }[]): void => {
    this.#excluded = {
      ...this.#excluded,
      [column]: on ? new Set() : new Set(values.map((item) => item.value))
    };
  };

  search = (column: string): string => this.#searches[column] ?? '';

  setSearch = (column: string, value: string): void => {
    this.#searches = { ...this.#searches, [column]: value };
  };

  /** True when a row's value passes this column's text search. */
  matchesSearch = (column: string, haystack: string): boolean => {
    const term = this.search(column).trim().toLowerCase();
    return !term || haystack.toLowerCase().includes(term);
  };

  clearFilter = (column: string): void => {
    this.#excluded = { ...this.#excluded, [column]: new Set() };
    this.#searches = { ...this.#searches, [column]: '' };
  };

  /**
   * Drop every search and value filter back to the table's defaults — what a
   * freshly added row needs, so it cannot land outside the current filter.
   * Sorting is left alone: it hides nothing.
   */
  resetFilters = (): void => {
    this.#restoreDefaultFilters();
  };
}

export function createTableView<Key extends string = string, Group extends string = string>(
  options: TableViewOptions<Key, Group> = {}
): TableView<Key, Group> {
  return new TableView<Key, Group>(options);
}

/** "1 person" / "4 people" — one place, so every table counts people alike. */
export function peopleCountLabel(count: number): string {
  return count === 1 ? t('1 person') : t('{count} people', { count });
}
