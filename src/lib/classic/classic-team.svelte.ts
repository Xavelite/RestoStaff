import { untrack } from 'svelte';
import type { TeamReadModel } from '$lib/api/workspace-snapshot';
import type { WorkspaceRole } from '$lib/api/workspace';
import { saveTeam } from '$lib/api/mutations';
import { employeeDrafts, teamSavePayload, type EmployeeDraft } from '$lib/team/team-model';
import { workspace } from '$lib/workspace/workspace.svelte';

/**
 * The team being edited in the classic Team module.
 *
 * save_team_model takes the whole roster in one call, so an edit to one person
 * is still a save of everyone — the draft list therefore lives here and is
 * shared by People, Contracts, Access and Absences rather than being rebuilt
 * per page.
 */
class ClassicTeamDraft {
  employees = $state<EmployeeDraft[]>([]);

  /** Identity of the snapshot the draft was built from; plain, so sync() is
      not reactive and can be called safely from an $effect. */
  #loadedCount = -1;
  #loadedIds = '';

  sync(snapshot: TeamReadModel): void {
    const ids = snapshot.employees.map((employee) => employee.id).join(',');
    const stale = untrack(
      () => this.#loadedIds !== ids || this.#loadedCount !== snapshot.employees.length
    );
    if (!stale) return;
    this.#loadedIds = ids;
    this.#loadedCount = snapshot.employees.length;
    this.employees = employeeDrafts(snapshot);
  }

  /** Force a rebuild after a save, so server-assigned values come back. */
  invalidate(): void {
    this.#loadedIds = '';
    this.#loadedCount = -1;
  }

  update(id: string, patch: Partial<EmployeeDraft>): void {
    this.employees = this.employees.map((employee) =>
      employee.id === id ? { ...employee, ...patch } : employee
    );
  }

  /**
   * Persist the whole roster. Every classic Team page saves through here, so
   * the payload is built the same way wherever the edit started.
   */
  async save(restaurantId: string, role: WorkspaceRole): Promise<void> {
    await saveTeam(restaurantId, teamSavePayload(restaurantId, this.employees, role));
    this.invalidate();
    await workspace.loadTeam(true);
  }
}

export const teamDraft = new ClassicTeamDraft();
