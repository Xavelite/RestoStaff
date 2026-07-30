<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth/session.svelte';
  import {
    deleteRestaurant,
    deleteUser,
    getAdminDashboard,
    getAdminFeedback,
    getAdminPilotAccessRequests,
    getAdminRestaurantEntitlements,
    reviewPilotAccess,
    setRestaurantActive,
    setRestaurantModuleEntitlement,
    setUserSuspended,
    updateAdminFeedback,
    type AdminDashboard,
    type AdminEvent,
    type AdminRestaurant,
    type AdminUser,
    type AdminFeedback,
    type AdminPilotAccessRequest,
    type AdminRestaurantEntitlements
  } from '$lib/admin/admin-api';
  import PreviewDialog from '$lib/preview/PreviewDialog.svelte';
  import FeedbackDialog from '$lib/feedback/FeedbackDialog.svelte';

  type View = 'restaurants' | 'users' | 'access' | 'feedback' | 'audit';
  type RestaurantFilter = 'all' | 'active' | 'suspended';
  type UserFilter = 'all' | 'active' | 'suspended' | 'unassigned';
  const MANAGED_MODULES = [
    ['home', 'Home'],
    ['restaurant', 'Restaurant'],
    ['team', 'Team'],
    ['schedule', 'Schedule'],
    ['time', 'Timesheet'],
    ['badge-terminal', 'Badge'],
    ['reservations', 'Reservations (acceptance track)'],
    ['documents', 'Documents'],
    ['payroll', 'Payroll'],
    ['reports', 'Reports (experimental)'],
    ['exports', 'Exports'],
    ['settings', 'Settings'],
    ['my-service', 'My service'],
    ['my-time', 'My time']
  ] as const;

  let dashboard = $state<AdminDashboard | null>(null);
  let loading = $state(true);
  let refreshing = $state(false);
  let denied = $state(false);
  let error = $state('');
  let notice = $state('');
  let busyId = $state('');
  let search = $state('');
  let view = $state<View>('restaurants');
  let restaurantFilter = $state<RestaurantFilter>('all');
  let userFilter = $state<UserFilter>('all');
  let expandedRestaurantId = $state<string | null>(null);
  let deleteTarget = $state<AdminRestaurant | null>(null);
  let deleteConfirm = $state('');
  let userDeleteTarget = $state<AdminUser | null>(null);
  let userDeleteConfirm = $state('');
  let feedback = $state<AdminFeedback[]>([]);
  let pilotRequests = $state<AdminPilotAccessRequest[]>([]);
  let restaurantEntitlements = $state<AdminRestaurantEntitlements[]>([]);
  let pilotReviewNotes = $state<Record<string, string>>({});
  let feedbackNotes = $state<Record<string, string>>({});
  let previewTarget = $state<AdminRestaurant | null>(null);
  let reportOpen = $state(false);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    if (auth.ready && !auth.session) {
      void goto('/login?next=/admin', { replaceState: true });
      return;
    }
    void load();
  });

  async function load(preserve = false) {
    if (preserve) refreshing = true;
    else loading = true;
    error = '';
    try {
      const [nextDashboard, nextFeedback, nextPilotRequests, nextEntitlements] = await Promise.all([
        getAdminDashboard(),
        getAdminFeedback(),
        getAdminPilotAccessRequests(),
        getAdminRestaurantEntitlements()
      ]);
      dashboard = nextDashboard;
      feedback = nextFeedback;
      feedbackNotes = Object.fromEntries(nextFeedback.map((item) => [item.id, item.adminNote]));
      pilotRequests = nextPilotRequests;
      restaurantEntitlements = nextEntitlements;
      pilotReviewNotes = Object.fromEntries(
        nextPilotRequests.map((item) => [item.authUserId, item.reviewNote])
      );
      denied = false;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/administrator access required/i.test(message)) {
        denied = true;
      } else {
        error = message;
      }
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  function announce(message: string) {
    notice = message;
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = ''), 4500);
  }

  async function toggleActive(restaurant: AdminRestaurant) {
    if (busyId) return;
    busyId = restaurant.id;
    error = '';
    try {
      const nextActive = !restaurant.active;
      await setRestaurantActive(restaurant.id, nextActive);
      announce(`${restaurant.name} ${nextActive ? 'reactivated' : 'suspended'}.`);
      await load(true);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busyId = '';
    }
  }

  function entitlementsFor(restaurantId: string) {
    return (
      restaurantEntitlements.find((item) => item.restaurantId === restaurantId)?.modules ?? {}
    );
  }

  async function updateEntitlement(
    restaurantId: string,
    moduleKey: string,
    state: 'enabled' | 'preview' | 'disabled'
  ) {
    const busyKey = `${restaurantId}:${moduleKey}`;
    if (busyId) return;
    busyId = busyKey;
    error = '';
    try {
      await setRestaurantModuleEntitlement(restaurantId, moduleKey, state);
      restaurantEntitlements = restaurantEntitlements.map((item) =>
        item.restaurantId === restaurantId
          ? { ...item, modules: { ...item.modules, [moduleKey]: state } }
          : item
      );
      announce(`${moduleKey} is now ${state}.`);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busyId = '';
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteConfirm !== deleteTarget.name || busyId) return;
    const target = deleteTarget;
    busyId = target.id;
    error = '';
    try {
      await deleteRestaurant(target.id);
      deleteTarget = null;
      deleteConfirm = '';
      announce(`${target.name} and its restaurant data were deleted.`);
      await load(true);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busyId = '';
    }
  }

  async function toggleUserSuspended(user: AdminUser) {
    if (busyId) return;
    busyId = user.id;
    error = '';
    try {
      const nextSuspended = !user.suspended;
      await setUserSuspended(user.id, nextSuspended);
      announce(`${user.email} ${nextSuspended ? 'suspended' : 'reactivated'}.`);
      await load(true);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busyId = '';
    }
  }

  async function confirmDeleteUser() {
    if (!userDeleteTarget || userDeleteConfirm !== userDeleteTarget.email || busyId) return;
    const target = userDeleteTarget;
    busyId = target.id;
    error = '';
    try {
      await deleteUser(target.id);
      userDeleteTarget = null;
      userDeleteConfirm = '';
      announce(`${target.email} was deleted.`);
      await load(true);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busyId = '';
    }
  }

  const query = $derived(search.trim().toLowerCase());
  const restaurants = $derived(
    (dashboard?.restaurants ?? []).filter((restaurant) => {
      if (restaurantFilter === 'active' && !restaurant.active) return false;
      if (restaurantFilter === 'suspended' && restaurant.active) return false;
      if (!query) return true;
      return [restaurant.name, restaurant.city, restaurant.ownerName, restaurant.ownerEmail, restaurant.id]
        .some((value) => value?.toLowerCase().includes(query));
    })
  );
  const users = $derived(
    (dashboard?.users ?? []).filter((user) => {
      if (userFilter === 'active' && user.suspended) return false;
      if (userFilter === 'suspended' && !user.suspended) return false;
      if (userFilter === 'unassigned' && user.memberships.length > 0) return false;
      if (!query) return true;
      return [user.email, user.name, user.id, ...user.memberships.map((item) => item.restaurant)]
        .some((value) => value?.toLowerCase().includes(query));
    })
  );
  const events = $derived(
    (dashboard?.events ?? []).filter((event) => {
      if (!query) return true;
      return [
        event.action,
        event.targetType,
        event.targetId,
        event.adminName,
        event.adminEmail,
        String(event.detail.name ?? ''),
        String(event.detail.email ?? '')
      ].some((value) => value?.toLowerCase().includes(query));
    })
  );
  const feedbackItems = $derived(feedback.filter((item) => {
    if (!query) return true;
    return [item.message, item.restaurantName, item.reporterName, item.reporterEmail, item.pagePath, item.appRelease]
      .some((value) => value?.toLowerCase().includes(query));
  }));
  const pilotAccessItems = $derived(pilotRequests.filter((item) => {
    if (!query) return true;
    return [item.email, item.status, item.requestNote, item.reviewNote]
      .some((value) => value.toLowerCase().includes(query));
  }));

  const searchPlaceholder = $derived(
    view === 'restaurants'
      ? 'Search restaurants, owners or IDs'
      : view === 'users'
        ? 'Search users, access or IDs'
        : view === 'access'
          ? 'Search pilot requests or status'
        : view === 'feedback'
          ? 'Search feedback, pages or reporters'
          : 'Search actions, operators or targets'
  );
  const mfaRequired = $derived(/two-step verification is required/i.test(error));

  async function saveFeedback(item: AdminFeedback, status = item.status) {
    if (busyId) return;
    busyId = item.id;
    error = '';
    try {
      await updateAdminFeedback(item.id, status, feedbackNotes[item.id] ?? '');
      announce('Feedback updated.');
      await load(true);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busyId = '';
    }
  }

  async function decidePilotAccess(item: AdminPilotAccessRequest, approved: boolean) {
    if (busyId) return;
    busyId = item.authUserId;
    error = '';
    try {
      await reviewPilotAccess(
        item.authUserId,
        approved,
        pilotReviewNotes[item.authUserId] ?? ''
      );
      announce(`${item.email} ${approved ? 'approved' : 'declined'} for pilot access.`);
      await load(true);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busyId = '';
    }
  }

  function rel(value: string | null): string {
    if (!value) return 'No activity';
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return 'Unknown';
    const diff = Math.max(0, Date.now() - timestamp);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  }

  function shortDate(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Unknown';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function shortId(value: string | null): string {
    return value ? `${value.slice(0, 8)}...` : 'Removed';
  }

  function countLabel(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function ownsRestaurant(user: AdminUser): boolean {
    return user.memberships.some((membership) => membership.role === 'owner');
  }

  function restaurantUsers(restaurantId: string): AdminUser[] {
    return (dashboard?.users ?? []).filter((user) =>
      user.memberships.some((membership) => membership.restaurantId === restaurantId)
    );
  }

  function restaurantRole(user: AdminUser, restaurantId: string): string {
    return user.memberships.find((membership) => membership.restaurantId === restaurantId)?.role ?? 'member';
  }

  function manageUser(user: AdminUser) {
    view = 'users';
    userFilter = 'all';
    search = user.email;
  }

  function actionLabel(action: string): string {
    return action
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function eventSubject(event: AdminEvent): string {
    return String(event.detail.name ?? event.detail.email ?? shortId(event.targetId));
  }
</script>

<svelte:head><title>Platform admin | Restogogo</title></svelte:head>

<div class="admin-shell">
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true"></span>
      <div>
        <span>RESTOGOGO</span>
        <strong>Platform admin</strong>
      </div>
    </div>
    <div class="topbar-actions">
      {#if dashboard}
        <button class="quiet-button" type="button" disabled={refreshing} onclick={() => load(true)}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      {/if}
      <button class="quiet-button" type="button" onclick={() => (reportOpen = true)}>Report issue</button>
      <a class="quiet-button" href="/home">Exit to app</a>
    </div>
  </header>

  {#if loading}
    <div class="page-state" aria-label="Loading platform admin">
      <span class="spinner" aria-hidden="true"></span>
    </div>
  {:else if denied}
    <main class="gate">
      <span class="eyebrow">Restricted area</span>
      <h1>Platform operator access required</h1>
      <p>This console is separate from restaurant ownership and is limited to the platform allowlist.</p>
      {#if error}<p class="message is-error">{error}</p>{/if}
      <a class="text-link" href="/home">Back to the app</a>
    </main>
  {:else if error}
    <main class="gate">
      <span class="eyebrow">{mfaRequired ? 'Security check' : 'Admin unavailable'}</span>
      <h1>{mfaRequired ? 'Two-step verification required' : 'Platform data could not be loaded'}</h1>
      <p>
        {mfaRequired
          ? 'Open Account settings in the app and verify an authenticator code before returning here.'
          : error}
      </p>
      <div class="gate-actions">
        <button class="quiet-button" type="button" onclick={() => load()}>Try again</button>
        <a class="text-link" href="/home">Open the app</a>
      </div>
    </main>
  {:else if dashboard}
    <main class="admin-main">
      {#if error}<p class="message is-error" role="alert">{error}</p>{/if}
      {#if notice}<p class="message is-success" role="status">{notice}</p>{/if}

      <section class="overview" aria-label="Platform overview">
        <div>
          <span>Restaurants</span>
          <strong>{dashboard.stats.restaurantCount}</strong>
          <small>{dashboard.stats.activeRestaurantCount} active</small>
        </div>
        <div>
          <span>Users</span>
          <strong>{dashboard.stats.userCount}</strong>
          <small>{dashboard.stats.unassignedUserCount} unassigned</small>
        </div>
        <div class="is-positive">
          <span>Signed in</span>
          <strong>{dashboard.stats.active7d}</strong>
          <small>last 7 days</small>
        </div>
        <div class:has-warning={dashboard.stats.suspendedUserCount > 0}>
          <span>Suspended</span>
          <strong>{dashboard.stats.restaurantCount - dashboard.stats.activeRestaurantCount + dashboard.stats.suspendedUserCount}</strong>
          <small>{dashboard.stats.restaurantCount - dashboard.stats.activeRestaurantCount} restaurants / {dashboard.stats.suspendedUserCount} users</small>
        </div>
      </section>

      <section class="workspace">
        <header class="workspace-head">
          <nav class="tabs" aria-label="Admin views">
            <button type="button" class:is-active={view === 'restaurants'} onclick={() => { view = 'restaurants'; search = ''; }}>
              Restaurants <span>{dashboard.stats.restaurantCount}</span>
            </button>
            <button type="button" class:is-active={view === 'users'} onclick={() => { view = 'users'; search = ''; }}>
              Users <span>{dashboard.stats.userCount}</span>
            </button>
            <button type="button" class:is-active={view === 'access'} onclick={() => { view = 'access'; search = ''; }}>
              Pilot access <span>{pilotRequests.filter((item) => item.status === 'pending').length}</span>
            </button>
            <button type="button" class:is-active={view === 'feedback'} onclick={() => { view = 'feedback'; search = ''; }}>
              Feedback <span>{feedback.filter((item) => item.status === 'new').length}</span>
            </button>
            <button type="button" class:is-active={view === 'audit'} onclick={() => { view = 'audit'; search = ''; }}>
              Audit <span>{dashboard.events.length}</span>
            </button>
          </nav>

          <div class="tools">
            {#if view === 'restaurants'}
              <select bind:value={restaurantFilter} aria-label="Filter restaurants by status">
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            {:else if view === 'users'}
              <select bind:value={userFilter} aria-label="Filter users by status">
                <option value="all">All users</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="unassigned">Unassigned</option>
              </select>
            {/if}
            <input aria-label={searchPlaceholder} placeholder={searchPlaceholder} bind:value={search} />
          </div>
        </header>

        {#if view === 'restaurants'}
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Restaurant</th><th>Owner</th><th>People</th><th>Records</th><th>Activity</th><th></th></tr>
              </thead>
              <tbody>
                {#each restaurants as restaurant (restaurant.id)}
                  <tr class:is-muted={!restaurant.active} class:is-expanded={expandedRestaurantId === restaurant.id}>
                    <td data-label="Restaurant">
                      <div class="primary-line">
                        <strong>{restaurant.name}</strong>
                        <span class:status-active={restaurant.active} class:status-suspended={!restaurant.active} class="status">
                          {restaurant.active ? 'Active' : 'Suspended'}
                        </span>
                      </div>
                      <small>{restaurant.city ?? 'No city'} / <span title={restaurant.id}>{shortId(restaurant.id)}</span></small>
                    </td>
                    <td data-label="Owner">
                      <strong>{restaurant.ownerName ?? 'No owner name'}</strong>
                      <small>{restaurant.ownerEmail ?? 'No owner email'}</small>
                    </td>
                    <td data-label="People">
                      <strong>{countLabel(restaurant.employeeCount, 'employee')}</strong>
                      <small>{countLabel(restaurant.memberCount, 'user')}</small>
                    </td>
                    <td data-label="Records">
                      <strong>{countLabel(restaurant.shiftCount, 'shift')} / {countLabel(restaurant.timeEntryCount, 'entry', 'entries')}</strong>
                      <small>{countLabel(restaurant.absenceCount, 'absence')} / {countLabel(restaurant.payrollExportCount, 'export')}</small>
                    </td>
                    <td data-label="Activity">
                      <strong>{rel(restaurant.lastActivity)}</strong>
                      <small>Created {shortDate(restaurant.createdAt)}</small>
                    </td>
                    <td class="row-actions">
                      <button type="button" class="secondary-button" disabled={!restaurant.active} onclick={() => (previewTarget = restaurant)}>
                        Preview
                      </button>
                      <button
                        type="button"
                        class="expand-button"
                        aria-expanded={expandedRestaurantId === restaurant.id}
                        aria-label={`${expandedRestaurantId === restaurant.id ? 'Hide' : 'Show'} ${restaurant.name} details`}
                        title={`${expandedRestaurantId === restaurant.id ? 'Hide' : 'Show'} restaurant details`}
                        onclick={() => (expandedRestaurantId = expandedRestaurantId === restaurant.id ? null : restaurant.id)}
                      >{expandedRestaurantId === restaurant.id ? '-' : '+'}</button>
                      <button type="button" class="secondary-button" disabled={busyId === restaurant.id} onclick={() => toggleActive(restaurant)}>
                        {restaurant.active ? 'Suspend' : 'Reactivate'}
                      </button>
                      <button type="button" class="danger-button" disabled={busyId === restaurant.id} onclick={() => { deleteTarget = restaurant; deleteConfirm = ''; }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {#if expandedRestaurantId === restaurant.id}
                    <tr class="tenant-detail-row">
                      <td colspan="6">
                        <section class="tenant-detail" aria-label={`${restaurant.name} restaurant details`}>
                          <header class="tenant-detail-head">
                            <div>
                              <span class="eyebrow">Users</span>
                              <strong>{restaurantUsers(restaurant.id).length} {restaurantUsers(restaurant.id).length === 1 ? 'person has' : 'people have'} access to this restaurant</strong>
                            </div>
                            <code title="Restaurant ID">{restaurant.id}</code>
                          </header>

                          <div class="tenant-accounts">
                            {#each restaurantUsers(restaurant.id) as user (user.id)}
                              <article class="tenant-account">
                                <div class="account-avatar" aria-hidden="true">
                                  {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                                </div>
                                <div class="account-identity">
                                  <div class="primary-line">
                                    <strong>{user.name ?? user.email.split('@')[0]}</strong>
                                    <span class="role-label">{restaurantRole(user, restaurant.id)}</span>
                                    {#if user.isAdmin}<span class="status is-admin">Admin</span>{/if}
                                  </div>
                                  <small>{user.email}</small>
                                </div>
                                <div class="account-health">
                                  {#if user.suspended}
                                    <span class="status status-suspended">Account suspended</span>
                                  {:else if !restaurant.active}
                                    <span class="status status-suspended">Restaurant suspended</span>
                                  {:else if !user.emailConfirmedAt}
                                    <span class="status is-warning">Unverified</span>
                                  {:else}
                                    <span class="status status-active">Active</span>
                                  {/if}
                                  <small>{user.lastSignInAt ? `Signed in ${rel(user.lastSignInAt)}` : 'Never signed in'}</small>
                                </div>
                                <button type="button" class="secondary-button account-manage" onclick={() => manageUser(user)}>Manage</button>
                              </article>
                            {:else}
                              <p class="tenant-empty">No users have access to this restaurant.</p>
                            {/each}
                          </div>
                          <section class="tenant-modules" aria-label={`${restaurant.name} modules`}>
                            <header>
                              <div>
                                <span class="eyebrow">Feature access</span>
                                <strong>Restaurant modules</strong>
                              </div>
                              <small>Server-enforced for this restaurant</small>
                            </header>
                            <div>
                              {#each MANAGED_MODULES as module (module[0])}
                                <label>
                                  <span>{module[1]}</span>
                                  <select
                                    value={entitlementsFor(restaurant.id)[module[0]] ?? 'disabled'}
                                    disabled={Boolean(busyId)}
                                    onchange={(event) =>
                                      updateEntitlement(
                                        restaurant.id,
                                        module[0],
                                        event.currentTarget.value as 'enabled' | 'preview' | 'disabled'
                                      )}
                                  >
                                    <option value="enabled">Enabled</option>
                                    <option value="preview">Preview</option>
                                    <option value="disabled">Disabled</option>
                                  </select>
                                </label>
                              {/each}
                            </div>
                          </section>
                        </section>
                      </td>
                    </tr>
                  {/if}
                {:else}
                  <tr><td colspan="6" class="empty">No restaurants match this view.</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else if view === 'users'}
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>User</th><th>Restaurant access</th><th>Last sign-in</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {#each users as user (user.id)}
                  <tr>
                    <td data-label="User">
                      <div class="primary-line">
                        <strong>{user.name ?? user.email.split('@')[0]}</strong>
                        {#if user.isAdmin}<span class="status is-admin">Admin</span>{/if}
                      </div>
                      <small>{user.email}</small>
                      <small title={user.id}>{shortId(user.id)}</small>
                    </td>
                    <td data-label="Restaurant access">
                      <div class="access-list">
                        {#each user.memberships as membership}
                          <span class:is-disabled={membership.status !== 'active' || !membership.restaurantActive}>
                            {membership.restaurant} / {membership.role}
                          </span>
                        {:else}
                          <span class="is-unassigned">Unassigned</span>
                        {/each}
                      </div>
                    </td>
                    <td data-label="Last sign-in">
                      <strong>{rel(user.lastSignInAt)}</strong>
                      <small>Created {shortDate(user.createdAt)}</small>
                    </td>
                    <td data-label="Status">
                      {#if user.suspended}<span class="status status-suspended">Suspended</span>
                      {:else if !user.emailConfirmedAt}<span class="status is-warning">Unverified</span>
                      {:else}<span class="status status-active">Active</span>{/if}
                    </td>
                    <td class="row-actions">
                      {#if user.isAdmin}
                        <span class="protected-note">Platform admin</span>
                      {:else}
                        <button type="button" class="secondary-button" disabled={busyId === user.id} onclick={() => toggleUserSuspended(user)}>
                          {user.suspended ? 'Reactivate' : 'Suspend'}
                        </button>
                        <button
                          type="button"
                          class="danger-button"
                          disabled={busyId === user.id || ownsRestaurant(user)}
                          title={ownsRestaurant(user) ? 'Delete or reassign owned restaurants first' : 'Delete user'}
                          onclick={() => { userDeleteTarget = user; userDeleteConfirm = ''; }}
                        >Delete</button>
                      {/if}
                    </td>
                  </tr>
                {:else}
                  <tr><td colspan="5" class="empty">No users match this view.</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else if view === 'access'}
          <div class="feedback-list">
            {#each pilotAccessItems as item (item.authUserId)}
              <article class="feedback-item">
                <header>
                  <div>
                    <span class="feedback-category is-{item.status === 'pending' ? 'confusing' : item.status === 'approved' ? 'suggestion' : 'problem'}">{item.status}</span>
                    <strong>{item.email}</strong>
                  </div>
                  <time>{rel(item.requestedAt)}</time>
                </header>
                <p>{item.requestNote || 'No request note provided.'}</p>
                <div class="feedback-review">
                  <textarea
                    rows="2"
                    placeholder="Review note"
                    value={pilotReviewNotes[item.authUserId] ?? ''}
                    oninput={(event) => (
                      pilotReviewNotes = {
                        ...pilotReviewNotes,
                        [item.authUserId]: event.currentTarget.value
                      }
                    )}
                  ></textarea>
                  <div class="row-actions">
                    <button
                      type="button"
                      class="secondary-button"
                      disabled={busyId === item.authUserId}
                      onclick={() => decidePilotAccess(item, false)}
                    >Decline</button>
                    <button
                      type="button"
                      class="primary-button"
                      disabled={busyId === item.authUserId}
                      onclick={() => decidePilotAccess(item, true)}
                    >Approve</button>
                  </div>
                </div>
              </article>
            {:else}
              <p class="empty">No pilot access requests match this view.</p>
            {/each}
          </div>
        {:else if view === 'feedback'}
          <div class="feedback-list">
            {#each feedbackItems as item (item.id)}
              <article class="feedback-item">
                <header>
                  <div>
                    <span class="feedback-category is-{item.category}">{item.category}</span>
                    <strong>{item.restaurantName ?? 'Platform feedback'}</strong>
                  </div>
                  <time>{rel(item.createdAt)}</time>
                </header>
                <p>{item.message}</p>
                <div class="feedback-context">
                  <span>{item.reporterName ?? item.reporterEmail ?? 'Removed reporter'}</span>
                  <code>{item.pagePath}</code>
                  <span>{item.appRelease} / {item.actorRole ?? 'unknown'} / {item.viewport || 'unknown viewport'}</span>
                </div>
                <div class="feedback-review">
                  <textarea rows="2" placeholder="Internal note" value={feedbackNotes[item.id] ?? ''} oninput={(event) => (feedbackNotes = { ...feedbackNotes, [item.id]: event.currentTarget.value })}></textarea>
                  <select value={item.status} onchange={(event) => saveFeedback(item, event.currentTarget.value as AdminFeedback['status'])} disabled={busyId === item.id}>
                    <option value="new">New</option>
                    <option value="reviewing">Reviewing</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <button type="button" class="secondary-button" disabled={busyId === item.id} onclick={() => saveFeedback(item)}>Save note</button>
                </div>
              </article>
            {:else}
              <p class="empty">No feedback matches this view.</p>
            {/each}
          </div>
        {:else}
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Action</th><th>Target</th><th>Operator</th><th>When</th></tr>
              </thead>
              <tbody>
                {#each events as event (event.id)}
                  <tr>
                    <td data-label="Action"><strong>{actionLabel(event.action)}</strong></td>
                    <td data-label="Target">
                      <strong>{eventSubject(event)}</strong>
                      <small>{event.targetType} / <span title={event.targetId ?? ''}>{shortId(event.targetId)}</span></small>
                    </td>
                    <td data-label="Operator">
                      <strong>{event.adminName ?? 'Removed operator'}</strong>
                      <small>{event.adminEmail ?? 'Account no longer exists'}</small>
                    </td>
                    <td data-label="When">
                      <strong>{rel(event.createdAt)}</strong>
                      <small>{shortDate(event.createdAt)}</small>
                    </td>
                  </tr>
                {:else}
                  <tr><td colspan="4" class="empty">No audit events match this view.</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    </main>
  {/if}
</div>

<PreviewDialog
  open={Boolean(previewTarget)}
  restaurantId={previewTarget?.id ?? null}
  restaurantName={previewTarget?.name ?? ''}
  source="admin"
  returnPath="/admin"
  onclose={() => (previewTarget = null)}
/>

<FeedbackDialog
  open={reportOpen}
  restaurantId={null}
  role="platform_admin"
  onclose={() => (reportOpen = false)}
/>

{#if deleteTarget}
  <div class="modal-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && (deleteTarget = null)}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Delete restaurant">
      <span class="eyebrow is-danger">Permanent restaurant deletion</span>
      <h2>Delete {deleteTarget.name}?</h2>
      <p>The restaurant and all restaurant-owned operational history will be removed. Login accounts remain and become unassigned unless they belong to another restaurant.</p>
      <dl class="deletion-scope">
        <div><dt>Employees</dt><dd>{deleteTarget.employeeCount}</dd></div>
        <div><dt>Users</dt><dd>{deleteTarget.memberCount}</dd></div>
        <div><dt>Planned shifts</dt><dd>{deleteTarget.shiftCount}</dd></div>
        <div><dt>Time entries</dt><dd>{deleteTarget.timeEntryCount}</dd></div>
        <div><dt>Absences</dt><dd>{deleteTarget.absenceCount}</dd></div>
        <div><dt>Payroll exports</dt><dd>{deleteTarget.payrollExportCount}</dd></div>
      </dl>
      <label>
        <span>Type <b>{deleteTarget.name}</b> to confirm</span>
        <input bind:value={deleteConfirm} autocomplete="off" spellcheck="false" />
      </label>
      <div class="modal-actions">
        <button type="button" class="secondary-button" onclick={() => (deleteTarget = null)}>Cancel</button>
        <button type="button" class="danger-button is-solid" disabled={deleteConfirm !== deleteTarget.name || Boolean(busyId)} onclick={confirmDelete}>
          {busyId ? 'Deleting...' : 'Delete restaurant permanently'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if userDeleteTarget}
  <div class="modal-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && (userDeleteTarget = null)}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Delete user">
      <span class="eyebrow is-danger">Permanent account deletion</span>
      <h2>Delete {userDeleteTarget.name ?? userDeleteTarget.email}?</h2>
      <p>The login and profile will be removed. Historical approvals and operational records remain without a person attribution.</p>
      <label>
        <span>Type <b>{userDeleteTarget.email}</b> to confirm</span>
        <input bind:value={userDeleteConfirm} autocomplete="off" spellcheck="false" />
      </label>
      <div class="modal-actions">
        <button type="button" class="secondary-button" onclick={() => (userDeleteTarget = null)}>Cancel</button>
        <button type="button" class="danger-button is-solid" disabled={userDeleteConfirm !== userDeleteTarget.email || Boolean(busyId)} onclick={confirmDeleteUser}>
          {busyId ? 'Deleting...' : 'Delete user permanently'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(body) { margin: 0; }
  :global(*) { box-sizing: border-box; }

  .admin-shell {
    min-height: 100vh;
    color: #e9edf3;
    background: #0d1117;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }
  .topbar {
    position: sticky;
    z-index: 10;
    top: 0;
    min-height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px clamp(16px, 3vw, 36px);
    border-bottom: 1px solid #2a3039;
    background: rgba(13, 17, 23, 0.96);
    backdrop-filter: blur(8px);
  }
  .brand { display: flex; align-items: center; gap: 11px; }
  .brand-mark { width: 8px; height: 28px; border-radius: 3px; background: #f06423; }
  .brand div { display: grid; gap: 1px; }
  .brand span { color: #8792a2; font-size: 9px; font-weight: 800; letter-spacing: 0; }
  .brand strong { font-size: 16px; }
  .topbar-actions { display: flex; align-items: center; gap: 8px; }

  button, input, select { font: inherit; }
  button, a { -webkit-tap-highlight-color: transparent; }
  .quiet-button, .secondary-button, .danger-button {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 7px 11px;
    border: 1px solid #39414d;
    border-radius: 6px;
    color: #dce2eb;
    background: #171c24;
    font-size: 12px;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }
  .quiet-button:hover, .secondary-button:hover:not(:disabled) { background: #222934; }
  .danger-button { border-color: #663933; color: #ffab9c; background: #211718; }
  .danger-button:hover:not(:disabled) { background: #351d1d; }
  .danger-button.is-solid { border-color: #d84d3f; color: #fff; background: #bd3e33; }
  button:disabled { opacity: .48; cursor: default; }
  .feedback-list { display: grid; }
  .feedback-item { display: grid; gap: 11px; padding: 16px; border-bottom: 1px solid #2b323c; background: #11161d; }
  .feedback-item > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .feedback-item > header > div { display: flex; align-items: center; gap: 8px; }
  .feedback-item time { color: #778292; font-size: 10px; }
  .feedback-item p { max-width: 900px; margin: 0; color: #d9dfe8; font-size: 13px; line-height: 1.5; }
  .feedback-category { padding: 4px 7px; border-radius: 5px; color: #ffc6a6; background: #3a2318; font-size: 9px; font-weight: 800; text-transform: uppercase; }
  .feedback-category.is-problem { color: #ffab9c; background: #351d1d; }
  .feedback-category.is-suggestion { color: #8ce1ae; background: #163325; }
  .feedback-context { display: flex; flex-wrap: wrap; gap: 6px 14px; color: #818c9b; font-size: 10px; }
  .feedback-context code { color: #abb5c2; }
  .feedback-review { display: grid; grid-template-columns: minmax(260px, 1fr) 120px auto; gap: 8px; align-items: end; }
  .feedback-review textarea, .feedback-review select { min-height: 36px; padding: 7px 9px; border: 1px solid #343d49; border-radius: 6px; color: #e6ebf2; background: #0d1117; font: inherit; font-size: 11px; }
  .feedback-review textarea { resize: vertical; }

  .page-state { min-height: 70vh; display: grid; place-content: center; }
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #2d3540;
    border-top-color: #f06423;
    border-radius: 50%;
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .gate { max-width: 520px; margin: 16vh auto 0; padding: 28px; text-align: center; }
  .gate h1 { margin: 8px 0; font-size: 28px; }
  .gate p { margin: 0 auto 18px; color: #9ca7b7; line-height: 1.55; }
  .gate-actions { display: flex; align-items: center; justify-content: center; gap: 12px; }
  .text-link { display: block; color: #bdc6d2; font-size: 13px; }
  .eyebrow { color: #8f9baa; font-size: 10px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; }
  .eyebrow.is-danger { color: #ff9e8d; }

  .admin-main { max-width: 1600px; margin: 0 auto; padding: 18px clamp(16px, 3vw, 36px) 48px; }
  .message { margin: 0 0 12px; padding: 10px 12px; border: 1px solid; border-radius: 6px; font-size: 13px; }
  .message.is-error { border-color: #6d3b35; color: #ffb2a5; background: #251818; }
  .message.is-success { border-color: #2e6749; color: #8ce1ae; background: #13251d; }

  .overview {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-bottom: 18px;
    border: 1px solid #2a3039;
    border-radius: 8px;
    background: #131820;
    overflow: hidden;
  }
  .overview > div { min-width: 0; display: grid; gap: 2px; padding: 15px 18px; border-right: 1px solid #2a3039; }
  .overview > div:last-child { border-right: 0; }
  .overview span { color: #8d98a7; font-size: 10px; font-weight: 800; text-transform: uppercase; }
  .overview strong { font-size: 28px; line-height: 1.05; }
  .overview small { color: #747f8e; font-size: 11px; }
  .overview .is-positive strong { color: #61d28e; }
  .overview .has-warning strong { color: #ff9e8d; }

  .workspace { border: 1px solid #2a3039; border-radius: 8px; background: #11161d; overflow: hidden; }
  .workspace-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border-bottom: 1px solid #2a3039;
    background: #151a22;
  }
  .tabs { display: flex; align-items: center; gap: 3px; padding: 3px; border-radius: 7px; background: #0d1117; }
  .tabs button { min-height: 32px; padding: 6px 10px; border: 0; border-radius: 5px; color: #8f9baa; background: transparent; font-size: 12px; font-weight: 750; cursor: pointer; }
  .tabs button.is-active { color: #f2f5f9; background: #2a313c; }
  .tabs span { margin-left: 5px; color: #788391; font-size: 10px; }
  .tools { flex: 1; display: flex; justify-content: flex-end; gap: 8px; }
  .tools input, .tools select {
    min-height: 36px;
    padding: 7px 10px;
    border: 1px solid #353d48;
    border-radius: 6px;
    color: #e5eaf1;
    background: #0d1117;
    font-size: 12px;
    outline: none;
  }
  .tools input { width: min(340px, 42vw); }
  .tools input:focus, .tools select:focus, .modal input:focus { border-color: #e86a30; box-shadow: 0 0 0 2px rgba(240, 100, 35, .18); }
  .tools input::placeholder { color: #657080; }

  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { padding: 10px 14px; color: #768190; font-size: 9px; font-weight: 800; text-align: left; text-transform: uppercase; white-space: nowrap; }
  td { padding: 12px 14px; border-top: 1px solid #242b34; vertical-align: middle; }
  tbody tr:hover { background: #171d25; }
  tbody tr.is-expanded { background: #1a2029; box-shadow: inset 3px 0 #f06423; }
  tr.is-muted > td { background: rgba(100, 49, 45, .08); }
  td strong { display: block; font-size: 12px; font-weight: 700; }
  td small { display: block; margin-top: 3px; color: #798493; font-size: 10px; }
  .primary-line { display: flex; align-items: center; gap: 7px; }
  .primary-line strong { font-size: 13px; }
  .status { display: inline-flex; width: max-content; padding: 2px 6px; border-radius: 999px; font-size: 8px; font-weight: 850; text-transform: uppercase; }
  .status-active { color: #7fe0a5; background: #173225; }
  .status-suspended { color: #ffac9d; background: #3a211f; }
  .status.is-admin, .status.is-warning { color: #f5cf78; background: #392f17; }
  .access-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .access-list span { padding: 3px 6px; border: 1px solid #343c47; border-radius: 4px; color: #c4ccd7; background: #181e27; font-size: 10px; }
  .access-list span.is-disabled { opacity: .5; text-decoration: line-through; }
  .access-list span.is-unassigned { border-color: #594b2c; color: #dfc16e; background: #292415; }
  .row-actions { display: flex; justify-content: flex-end; gap: 6px; white-space: nowrap; }
  .expand-button {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid #3c4653;
    border-radius: 6px;
    color: #cdd4de;
    background: #10151c;
    font-size: 19px;
    line-height: 1;
    cursor: pointer;
  }
  .expand-button:hover { border-color: #697585; background: #252d38; }
  .tenant-detail-row, .tenant-detail-row:hover { background: #0c1117; }
  .tenant-detail-row > td { padding: 0; border-top-color: #343c47; }
  .tenant-detail {
    padding: 16px 18px 18px 28px;
    border-left: 3px solid #f06423;
    background: #10151c;
  }
  .tenant-detail-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #29313b;
  }
  .tenant-detail-head > div { display: grid; gap: 3px; }
  .tenant-detail-head strong { font-size: 13px; }
  .tenant-detail-head code { color: #687483; font-size: 10px; overflow-wrap: anywhere; }
  .tenant-accounts { display: grid; }
  .tenant-account {
    display: grid;
    grid-template-columns: 34px minmax(220px, 1fr) minmax(160px, .6fr) auto;
    align-items: center;
    gap: 12px;
    min-height: 62px;
    padding: 10px 0;
    border-bottom: 1px solid #252c35;
  }
  .tenant-account:last-child { border-bottom: 0; }
  .account-avatar {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 1px solid #3a4653;
    border-radius: 6px;
    color: #ffd2bd;
    background: #302119;
    font-size: 12px;
    font-weight: 850;
  }
  .account-identity { min-width: 0; }
  .account-identity strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .account-identity small, .account-health small { color: #7d8897; font-size: 10px; }
  .role-label { color: #9da8b7; font-size: 9px; font-weight: 750; text-transform: capitalize; }
  .account-health { display: grid; justify-items: start; gap: 5px; }
  .account-manage { min-width: 72px; }
  .tenant-empty { margin: 0; padding: 20px 0 4px; color: #778291; font-size: 12px; }
  .tenant-modules {
    display: grid;
    gap: 11px;
    padding-top: 14px;
    border-top: 1px solid #29313b;
  }
  .tenant-modules > header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 12px;
  }
  .tenant-modules > header > div { display: grid; gap: 3px; }
  .tenant-modules > header strong { font-size: 13px; }
  .tenant-modules > header small { color: #748090; font-size: 10px; }
  .tenant-modules > div {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
    gap: 1px;
    overflow: hidden;
    border: 1px solid #2b333d;
    border-radius: 7px;
    background: #2b333d;
  }
  .tenant-modules label {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 88px;
    align-items: center;
    gap: 8px;
    padding: 8px 9px;
    background: #11171e;
  }
  .tenant-modules label > span {
    overflow: hidden;
    color: #cdd4de;
    font-size: 11px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tenant-modules select {
    min-width: 0;
    min-height: 30px;
    padding: 4px 6px;
    border: 1px solid #38424f;
    border-radius: 5px;
    color: #cbd3de;
    background: #0b1016;
    font: inherit;
    font-size: 10px;
  }
  .protected-note { color: #7c8796; font-size: 10px; }
  .empty { height: 100px; color: #7c8796; text-align: center; }

  .modal-backdrop { position: fixed; z-index: 50; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(4, 7, 11, .76); backdrop-filter: blur(4px); }
  .modal { width: min(540px, 100%); display: grid; gap: 13px; padding: 22px; border: 1px solid #5a3834; border-radius: 8px; color: #e9edf3; background: #151a22; box-shadow: 0 24px 80px rgba(0, 0, 0, .5); }
  .modal h2 { margin: -2px 0 0; font-size: 21px; }
  .modal p { margin: 0; color: #a1abb9; font-size: 12px; line-height: 1.55; }
  .modal label { display: grid; gap: 6px; }
  .modal label span { color: #9ca7b5; font-size: 11px; }
  .modal input { min-height: 40px; padding: 8px 10px; border: 1px solid #3c4551; border-radius: 6px; color: #fff; background: #0d1117; outline: none; }
  .deletion-scope { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0; border: 1px solid #303844; border-radius: 6px; overflow: hidden; }
  .deletion-scope div { padding: 9px 10px; border-right: 1px solid #303844; border-bottom: 1px solid #303844; }
  .deletion-scope div:nth-child(3n) { border-right: 0; }
  .deletion-scope div:nth-last-child(-n + 3) { border-bottom: 0; }
  .deletion-scope dt { color: #828d9c; font-size: 9px; text-transform: uppercase; }
  .deletion-scope dd { margin: 2px 0 0; font-size: 16px; font-weight: 750; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }

  @media (max-width: 980px) {
    .overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .overview > div:nth-child(2) { border-right: 0; }
    .overview > div:nth-child(-n + 2) { border-bottom: 1px solid #2a3039; }
    .workspace-head { align-items: stretch; flex-direction: column; }
    .tools { justify-content: stretch; }
    .tools input { flex: 1; width: auto; }
    .tenant-account { grid-template-columns: 34px minmax(180px, 1fr) minmax(140px, .6fr) auto; }
  }

  @media (max-width: 760px) {
    .topbar { min-height: 58px; }
    .brand span { display: none; }
    .brand strong { font-size: 14px; }
    .topbar-actions .quiet-button:first-child { display: none; }
    .admin-main { padding-top: 12px; }
    .overview > div { padding: 12px; }
    .overview strong { font-size: 23px; }
    .tabs { display: grid; grid-template-columns: repeat(4, 1fr); }
    .tabs button { padding-inline: 6px; }
    .tools { flex-direction: column; }
    .tools input, .tools select { width: 100%; }
    .table-wrap { overflow: visible; }
    table, tbody { display: block; }
    thead { display: none; }
    tr { display: grid; gap: 10px; padding: 14px; border-top: 1px solid #2a3039; }
    tbody tr:first-child { border-top: 0; }
    td { display: grid; grid-template-columns: 106px minmax(0, 1fr); gap: 8px; padding: 0; border: 0; }
    td::before { content: attr(data-label); color: #707b89; font-size: 9px; font-weight: 800; text-transform: uppercase; }
    td > :not(.row-actions) { min-width: 0; }
    td.row-actions { display: flex; justify-content: stretch; padding-top: 4px; }
    td.row-actions::before { display: none; }
    .row-actions button { flex: 1; min-height: 40px; }
    .row-actions .expand-button { flex: 0 0 40px; width: 40px; }
    tr.tenant-detail-row { display: block; padding: 0; border-top: 0; }
    .tenant-detail-row td { display: block; }
    .tenant-detail-row td::before { display: none; }
    .tenant-detail { padding: 15px; border-top: 1px solid #343c47; border-left-width: 3px; }
    .tenant-detail-head { align-items: start; flex-direction: column; gap: 7px; }
    .tenant-account {
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 10px;
      padding: 12px 0;
    }
    .account-health { grid-column: 2 / -1; }
    .account-manage { grid-column: 2 / -1; min-height: 38px; }
    .feedback-review { grid-template-columns: 1fr; }
    .empty { display: block; height: auto; padding: 30px 10px; }
    .empty::before { display: none; }
    .deletion-scope { grid-template-columns: repeat(2, 1fr); }
    .deletion-scope div:nth-child(3n) { border-right: 1px solid #303844; }
    .deletion-scope div:nth-child(2n) { border-right: 0; }
    .deletion-scope div:nth-last-child(-n + 3) { border-bottom: 1px solid #303844; }
    .deletion-scope div:nth-last-child(-n + 2) { border-bottom: 0; }
    .modal-actions { flex-direction: column-reverse; }
    .modal-actions button { min-height: 42px; }
  }
</style>
