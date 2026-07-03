import {
  getCurrentMemberships,
  getEmployeeOperationsReadModel,
  getManagerOperationsReadModel,
  getRestaurantReadModel,
  getTeamReadModel,
  getWorkspaceBootstrap,
  type Membership
} from '$lib/api/workspace';
import type {
  EmployeeOperationsReadModel,
  ManagerOperationsReadModel,
  RestaurantReadModel,
  TeamReadModel,
  WorkspaceBootstrap
} from '$lib/api/workspace-snapshot';
import { untrack } from 'svelte';
import { preferredMembership } from './workspace-selection';

const ACTIVE_WORKSPACE_KEY = 'restogogo.active-workspace';

type DateRange = { from: string; to: string };

function storedWorkspaceId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
}

function rememberWorkspaceId(restaurantId: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (restaurantId) localStorage.setItem(ACTIVE_WORKSPACE_KEY, restaurantId);
  else localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
}

class WorkspaceStore {
  memberships = $state<Membership[]>([]);
  activeId = $state<string | null>(null);
  bootstrap = $state<WorkspaceBootstrap | null>(null);
  operations = $state<ManagerOperationsReadModel | null>(null);
  employeeOperations = $state<EmployeeOperationsReadModel | null>(null);
  team = $state<TeamReadModel | null>(null);
  restaurant = $state<RestaurantReadModel | null>(null);
  loaded = $state(false);
  loading = $state(false);
  moduleLoading = $state(false);
  error = $state('');
  #requestId = 0;
  #operationsRequestId = 0;
  #employeeRequestId = 0;
  #teamRequestId = 0;
  #restaurantRequestId = 0;
  #moduleLoads = 0;
  #operationsRange: DateRange | null = null;
  #employeeRange: DateRange | null = null;

  get active(): Membership | null {
    return (
      this.memberships.find((membership) => membership.restaurant_id === this.activeId) ??
      this.memberships[0] ??
      null
    );
  }

  async load(): Promise<void> {
    const requestId = ++this.#requestId;
    this.loading = true;
    this.loaded = false;
    this.error = '';
    try {
      const memberships = await getCurrentMemberships();
      const activeId =
        preferredMembership(memberships, storedWorkspaceId())?.restaurant_id ?? null;
      const bootstrap = activeId ? await getWorkspaceBootstrap(activeId) : null;
      if (requestId !== this.#requestId) return;
      this.memberships = memberships;
      this.activeId = activeId;
      this.bootstrap = bootstrap;
      this.clearModules();
      rememberWorkspaceId(activeId);
    } catch (error) {
      if (requestId !== this.#requestId) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.bootstrap = null;
      this.clearModules();
    } finally {
      if (requestId !== this.#requestId) return;
      this.loading = false;
      this.loaded = true;
    }
  }

  async select(restaurantId: string): Promise<void> {
    if (restaurantId === this.activeId || this.loading) return;
    const membership = this.memberships.find(
      (item) => item.restaurant_id === restaurantId
    );
    if (!membership) throw new Error('That workspace is not available to this account.');

    const requestId = ++this.#requestId;
    this.loading = true;
    this.error = '';
    try {
      const bootstrap = await getWorkspaceBootstrap(restaurantId);
      if (requestId !== this.#requestId) return;
      this.activeId = restaurantId;
      this.bootstrap = bootstrap;
      this.clearModules();
      rememberWorkspaceId(restaurantId);
    } catch (error) {
      if (requestId === this.#requestId) {
        this.error = error instanceof Error ? error.message : String(error);
      }
      throw error;
    } finally {
      if (requestId === this.#requestId) this.loading = false;
    }
  }

  async reloadBootstrap(): Promise<void> {
    if (!this.activeId) return;
    const bootstrap = await getWorkspaceBootstrap(this.activeId);
    this.bootstrap = bootstrap;
  }

  async loadOperations(from: string, to: string, force = false): Promise<void> {
    if (!this.activeId) return;
    const range = { from, to };
    const currentOperations = untrack(() => this.operations);
    if (
      !force &&
      currentOperations &&
      this.#operationsRange?.from === from &&
      this.#operationsRange.to === to
    ) return;
    // Keep the current snapshot visible while the new range loads — the request
    // guard below discards stale results, and each page filters to its own
    // range, so client navigation never flashes a blank screen.
    const requestId = ++this.#operationsRequestId;
    await this.loadModule(async () => {
      const model = await getManagerOperationsReadModel(this.activeId!, from, to);
      if (requestId !== this.#operationsRequestId) return;
      this.operations = model;
      this.#operationsRange = range;
    });
  }

  async loadEmployeeOperations(from: string, to: string, force = false): Promise<void> {
    if (!this.activeId) return;
    const range = { from, to };
    const currentEmployeeOperations = untrack(() => this.employeeOperations);
    if (
      !force &&
      currentEmployeeOperations &&
      this.#employeeRange?.from === from &&
      this.#employeeRange.to === to
    ) return;
    // Keep the current snapshot visible while the new range loads — the request
    // guard below discards stale results, and each page filters to its own
    // range, so navigating Shifts (week) <-> Calendar (month) never blanks.
    const requestId = ++this.#employeeRequestId;
    await this.loadModule(async () => {
      const model = await getEmployeeOperationsReadModel(this.activeId!, from, to);
      if (requestId !== this.#employeeRequestId) return;
      this.employeeOperations = model;
      this.#employeeRange = range;
    });
  }

  async loadTeam(force = false): Promise<void> {
    if (!this.activeId || (!force && untrack(() => this.team))) return;
    const requestId = ++this.#teamRequestId;
    await this.loadModule(async () => {
      const model = await getTeamReadModel(this.activeId!);
      if (requestId === this.#teamRequestId) this.team = model;
    });
  }

  async loadRestaurant(force = false): Promise<void> {
    if (!this.activeId || (!force && untrack(() => this.restaurant))) return;
    const requestId = ++this.#restaurantRequestId;
    await this.loadModule(async () => {
      const model = await getRestaurantReadModel(this.activeId!);
      if (requestId === this.#restaurantRequestId) this.restaurant = model;
    });
  }

  async reloadOperations(): Promise<void> {
    if (this.#operationsRange) {
      await this.loadOperations(
        this.#operationsRange.from,
        this.#operationsRange.to,
        true
      );
    }
  }

  async reloadEmployeeOperations(): Promise<void> {
    if (this.#employeeRange) {
      await this.loadEmployeeOperations(
        this.#employeeRange.from,
        this.#employeeRange.to,
        true
      );
    }
  }

  async reloadForRoute(pathname: string): Promise<void> {
    if (pathname === '/team') {
      await Promise.all([this.reloadBootstrap(), this.loadTeam(true)]);
      return;
    }
    if (pathname === '/restaurant' || pathname === '/coverage') {
      await Promise.all([this.reloadBootstrap(), this.loadRestaurant(true)]);
      return;
    }
    if (pathname === '/shifts' || pathname === '/calendar') {
      await this.reloadEmployeeOperations();
      return;
    }
    if (
      pathname === '/home' ||
      pathname === '/planning' ||
      pathname === '/actuals' ||
      pathname === '/badge-terminal'
    ) {
      await this.reloadOperations();
      return;
    }
    await this.reloadBootstrap();
  }

  reset(): void {
    this.#requestId += 1;
    this.#operationsRequestId += 1;
    this.#employeeRequestId += 1;
    this.#teamRequestId += 1;
    this.#restaurantRequestId += 1;
    this.memberships = [];
    this.activeId = null;
    this.bootstrap = null;
    this.clearModules();
    this.loaded = false;
    this.loading = false;
    this.moduleLoading = false;
    this.error = '';
    rememberWorkspaceId(null);
  }

  private async loadModule(loader: () => Promise<void>): Promise<void> {
    this.#moduleLoads += 1;
    this.moduleLoading = true;
    this.error = '';
    try {
      await loader();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.#moduleLoads = Math.max(0, this.#moduleLoads - 1);
      this.moduleLoading = this.#moduleLoads > 0;
    }
  }

  private clearModules(): void {
    this.#operationsRequestId += 1;
    this.#employeeRequestId += 1;
    this.#teamRequestId += 1;
    this.#restaurantRequestId += 1;
    this.operations = null;
    this.employeeOperations = null;
    this.team = null;
    this.restaurant = null;
    this.#operationsRange = null;
    this.#employeeRange = null;
    this.#moduleLoads = 0;
    this.moduleLoading = false;
  }
}

export const workspace = new WorkspaceStore();
