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
import {
  canManageOperations as roleCanManageOperations,
  canViewFinancials as roleCanViewFinancials
} from './capabilities';
import { getPreviewBootstrap, getPreviewModule, getPreviewOperations } from '$lib/preview/preview-api';
import type { WorkspaceRole } from '$lib/api/workspace';

const ACTIVE_WORKSPACE_KEY = 'restogogo.active-workspace';

type DateRange = { from: string; to: string };

type PreviewSession = {
  restaurantId: string;
  restaurantName: string;
  role: WorkspaceRole;
  employeeId: string | null;
  displayName: string;
  source: 'manager' | 'admin';
  returnPath: string;
};

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
  preview = $state<PreviewSession | null>(null);
  #requestId = 0;
  #operationsRequestId = 0;
  #employeeRequestId = 0;
  #teamRequestId = 0;
  #restaurantRequestId = 0;
  #moduleLoads = 0;
  #operationsRange: DateRange | null = null;
  #employeeRange: DateRange | null = null;

  get active(): Membership | null {
    if (this.preview) {
      return {
        restaurant_id: this.preview.restaurantId,
        restaurant_name: this.preview.restaurantName,
        role: this.preview.role,
        employee_id: this.preview.employeeId ?? '',
        status: 'active',
        workspace_slug: 'preview'
      };
    }
    return (
      this.memberships.find((membership) => membership.restaurant_id === this.activeId) ??
      this.memberships[0] ??
      null
    );
  }

  get isPreview(): boolean {
    return this.preview !== null;
  }

  get effectiveRole(): WorkspaceRole | null {
    return this.preview?.role ?? this.active?.role ?? null;
  }

  get effectiveEmployeeId(): string | null {
    return this.preview?.employeeId ?? this.bootstrap?.current_employee?.id ?? this.active?.employee_id ?? null;
  }

  get canManageOperations(): boolean {
    return roleCanManageOperations(this.effectiveRole);
  }

  get canViewFinancials(): boolean {
    return roleCanViewFinancials(this.effectiveRole);
  }

  async startPreview(session: PreviewSession): Promise<void> {
    const bootstrap = await getPreviewBootstrap(
      session.restaurantId,
      session.role,
      session.employeeId
    );
    this.preview = session;
    this.activeId = session.restaurantId;
    this.bootstrap = bootstrap;
    this.loaded = true;
    this.loading = false;
    this.error = '';
    this.clearModules();
  }

  async stopPreview(): Promise<string> {
    const returnPath = this.preview?.returnPath ?? '/home';
    this.preview = null;
    await this.load();
    return returnPath;
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
      const model = this.preview
        ? await getPreviewOperations(this.activeId!, this.preview.role, this.preview.employeeId, from, to)
        : await getManagerOperationsReadModel(this.activeId!, from, to);
      if (requestId !== this.#operationsRequestId) return;
      this.operations = model as ManagerOperationsReadModel;
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
    // range, so navigating My service (week) <-> My time (month) never blanks.
    const requestId = ++this.#employeeRequestId;
    await this.loadModule(async () => {
      const model = this.preview
        ? await getPreviewOperations(this.activeId!, this.preview.role, this.preview.employeeId, from, to)
        : await getEmployeeOperationsReadModel(this.activeId!, from, to);
      if (requestId !== this.#employeeRequestId) return;
      this.employeeOperations = model as EmployeeOperationsReadModel;
      this.#employeeRange = range;
    });
  }

  async loadTeam(force = false): Promise<void> {
    if (!this.activeId || (!force && untrack(() => this.team))) return;
    const requestId = ++this.#teamRequestId;
    await this.loadModule(async () => {
      const model = this.preview
        ? await getPreviewModule(this.activeId!, this.preview.role, this.preview.employeeId, 'team')
        : await getTeamReadModel(this.activeId!);
      if (requestId === this.#teamRequestId) this.team = model;
    });
  }

  async loadRestaurant(force = false): Promise<void> {
    if (!this.activeId || (!force && untrack(() => this.restaurant))) return;
    const requestId = ++this.#restaurantRequestId;
    await this.loadModule(async () => {
      const model = this.preview
        ? await getPreviewModule(this.activeId!, this.preview.role, this.preview.employeeId, 'restaurant')
        : await getRestaurantReadModel(this.activeId!);
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

  async reloadForRoute(routePath: string): Promise<void> {
    // Sub-pages share their module's read model, so refresh by the first path
    // segment: /team/contracts needs exactly what /team needs.
    const pathname = `/${routePath.split('/').filter(Boolean)[0] ?? ''}`;
    if (pathname === '/team') {
      await Promise.all([this.reloadBootstrap(), this.loadTeam(true)]);
      return;
    }
    if (pathname === '/restaurant') {
      await Promise.all([this.reloadBootstrap(), this.loadRestaurant(true)]);
      return;
    }
    if (pathname === '/my-service' || pathname === '/my-time') {
      await this.reloadEmployeeOperations();
      return;
    }
    if (
      pathname === '/home' ||
      pathname === '/schedule' ||
      pathname === '/timesheet' ||
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
    this.preview = null;
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
