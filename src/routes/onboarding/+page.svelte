<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    clearOwnerOnboardingDraft,
    getOwnerOnboardingDraft,
    saveOwnerOnboardingDraft,
    setupOwnerWorkspace
  } from '$lib/api/mutations';
  import { auth } from '$lib/auth/session.svelte';
  import { supabase } from '$lib/supabase/client';
  import type { Json } from '$lib/supabase/database.types';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  type SetupItem = { id: string; name: string };
  type AssignmentInput = { areaId: string; jobFunctionId: string };
  type EmployeeInput = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    jobFunctionId: string;
  };
  type Draft = {
    step: number;
    firstName: string;
    lastName: string;
    restaurantName: string;
    city: string;
    lunchStart: string;
    lunchEnd: string;
    eveningStart: string;
    eveningEnd: string;
    openDays: boolean[];
    areas: SetupItem[];
    functions: SetupItem[];
    assignments: AssignmentInput[];
    employees: EmployeeInput[];
  };
  type Step = {
    key: string;
    label: string;
    eyebrow: string;
    title: string;
    description: string;
  };

  const draftKey = 'restogogo:onboarding';
  const steps: Step[] = [
    {
      key: 'owner',
      label: 'Owner',
      eyebrow: 'Account',
      title: 'Put a real person on the workspace.',
      description:
        'The owner profile anchors invitations, approvals and payroll exports.'
    },
    {
      key: 'venue',
      label: 'Venue',
      eyebrow: 'Restaurant',
      title: 'Name the restaurant and its city.',
      description:
        'This becomes the visible workspace identity for managers and staff.'
    },
    {
      key: 'rhythm',
      label: 'Rhythm',
      eyebrow: 'Services',
      title: 'Set the weekly service rhythm.',
      description:
        'Lunch and evening defaults seed Schedule, Timesheet and Coverage.'
    },
    {
      key: 'map',
      label: 'Work map',
      eyebrow: 'Operations',
      title: 'Build the areas and positions.',
      description:
        'Areas are where work happens. Positions are what people can do.'
    },
    {
      key: 'coverage',
      label: 'Coverage',
      eyebrow: 'Staffing rules',
      title: 'Pair positions with work areas.',
      description:
        'Coverage starts with sensible minimums, then stays editable later.'
    },
    {
      key: 'team',
      label: 'Team',
      eyebrow: 'Starter staff',
      title: 'Add the first employees.',
      description:
        'Create the first records now. Access invitations stay managed from Team.'
    },
    {
      key: 'launch',
      label: 'Launch',
      eyebrow: 'Review',
      title: 'Bring the workspace online.',
      description:
        'Review the foundation before restogogo creates the restaurant workspace.'
    }
  ];

  const initial: Draft = {
    step: 0,
    firstName: '',
    lastName: '',
    restaurantName: '',
    city: '',
    lunchStart: '12:00',
    lunchEnd: '15:00',
    eveningStart: '18:00',
    eveningEnd: '23:00',
    openDays: [true, true, true, true, true, true, false],
    areas: [
      { id: 'area-salle', name: 'Salle' },
      { id: 'area-cuisine', name: 'Cuisine' },
      { id: 'area-bar', name: 'Bar' }
    ],
    functions: [
      { id: 'position-server', name: 'Server' },
      { id: 'position-cook', name: 'Cook' },
      { id: 'position-dishwasher', name: 'Dishwasher' }
    ],
    assignments: [
      { areaId: 'area-salle', jobFunctionId: 'position-server' },
      { areaId: 'area-cuisine', jobFunctionId: 'position-cook' },
      { areaId: 'area-cuisine', jobFunctionId: 'position-dishwasher' },
      { areaId: 'area-bar', jobFunctionId: 'position-server' }
    ],
    employees: []
  };

  let draft = $state<Draft>(structuredClone(initial));
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  let saving = $state(false);
  let hydrated = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const email = $derived(auth.user?.email ?? '');
  const currentStep = $derived(steps[draft.step] ?? steps[0]);
  const progress = $derived(Math.round(((draft.step + 1) / steps.length) * 100));
  const areaItems = $derived(
    draft.areas
      .map((item) => ({ ...item, name: item.name.trim() }))
      .filter((item) => item.name)
  );
  const functionItems = $derived(
    draft.functions
      .map((item) => ({ ...item, name: item.name.trim() }))
      .filter((item) => item.name)
  );
  const areaNames = $derived(areaItems.map((item) => item.name));
  const functionNames = $derived(functionItems.map((item) => item.name));
  const validAssignments = $derived(
    draft.assignments.filter(
      (assignment) =>
        areaItems.some((area) => area.id === assignment.areaId) &&
        functionItems.some((position) => position.id === assignment.jobFunctionId)
    )
  );
  const starterEmployees = $derived(
    draft.employees.filter((employee) => employee.firstName.trim() || employee.lastName.trim())
  );
  const openDayCount = $derived(draft.openDays.filter(Boolean).length);
  const launchStats = $derived([
    { label: 'Areas', value: String(areaItems.length), ready: areaItems.length > 0 },
    { label: 'Positions', value: String(functionItems.length), ready: functionItems.length > 0 },
    { label: 'Rules', value: String(validAssignments.length), ready: validAssignments.length > 0 },
    { label: 'Staff', value: String(starterEmployees.length), ready: starterEmployees.length > 0 }
  ]);
  const readyCount = $derived([
    isStepReady(0),
    isStepReady(1),
    isStepReady(2),
    isStepReady(3),
    isStepReady(4),
    true,
    isStepReady(6)
  ].filter(Boolean).length);
  const readyPercent = $derived(Math.round((readyCount / steps.length) * 100));

  onMount(() => {
    let active = true;
    void (async () => {
      const saved = localStorage.getItem(draftKey);
      let localDraft: Partial<Draft> = {};
      if (saved) {
        try {
          localDraft = JSON.parse(saved) as Partial<Draft>;
        } catch {
          localStorage.removeItem(draftKey);
        }
      }

      let serverDraft: Partial<Draft> = {};
      try {
        const remote = await getOwnerOnboardingDraft();
        if (remote) serverDraft = { ...(remote.draft as Partial<Draft>), step: remote.step };
      } catch {
        // Local recovery remains available when the draft RPC is not deployed yet.
      }

      if (!active) return;
      draft = normalizeDraft(Object.keys(serverDraft).length ? serverDraft : localDraft);
      hydrated = true;
    })();
    return () => {
      active = false;
      if (saveTimer) clearTimeout(saveTimer);
    };
  });

  $effect(() => {
    if (!hydrated || typeof localStorage === 'undefined') return;
    const next = JSON.stringify(draft);
    localStorage.setItem(draftKey, next);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void saveOwnerOnboardingDraft(
        draft.step,
        JSON.parse(next) as Record<string, Json>
      ).catch(() => undefined);
    }, 500);
    return () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
    };
  });

  $effect(() => {
    if (auth.session && !workspace.loaded && !workspace.loading) {
      void workspace.load();
    }
  });

  $effect(() => {
    if (workspace.active) {
      goto(workspace.active.role === 'employee' ? '/shifts' : '/home', {
        replaceState: true
      });
    }
  });

  function normalizeDraft(candidate: Partial<Draft>): Draft {
    const merged = {
      ...structuredClone(initial),
      ...candidate
    };
    return {
      ...merged,
      step: Math.min(steps.length - 1, Math.max(0, Number(merged.step ?? 0))),
      openDays: Array.from({ length: 7 }, (_, index) =>
        typeof merged.openDays?.[index] === 'boolean'
          ? Boolean(merged.openDays[index])
          : initial.openDays[index]
      ),
      areas: normalizeItems(merged.areas, initial.areas),
      functions: normalizeItems(merged.functions, initial.functions),
      assignments: Array.isArray(merged.assignments) ? merged.assignments : initial.assignments,
      employees: Array.isArray(merged.employees) ? merged.employees : []
    };
  }

  function normalizeItems(source: unknown, fallback: SetupItem[]): SetupItem[] {
    if (!Array.isArray(source)) return structuredClone(fallback);
    return source
      .map((item, index) => {
        const record = item as Partial<SetupItem>;
        return {
          id: String(record.id || crypto.randomUUID?.() || `item-${index}`),
          name: String(record.name ?? '')
        };
      })
      .filter((item) => item.id);
  }

  function id(prefix: string) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  function isStepReady(index: number): boolean {
    if (index === 0) return Boolean(draft.firstName.trim() && draft.lastName.trim());
    if (index === 1) return Boolean(draft.restaurantName.trim());
    if (index === 2) {
      return Boolean(
        openDayCount > 0 &&
          draft.lunchStart &&
          draft.lunchEnd &&
          draft.eveningStart &&
          draft.eveningEnd
      );
    }
    if (index === 3) return Boolean(areaItems.length && functionItems.length);
    if (index === 4) return Boolean(validAssignments.length);
    if (index === 5) return true;
    return steps.slice(0, 5).every((_, stepIndex) => isStepReady(stepIndex));
  }

  function validationMessage(): string {
    if (draft.step === 0 && !isStepReady(0)) return 'Enter the owner first and last name.';
    if (draft.step === 1 && !isStepReady(1)) return 'Enter the restaurant name.';
    if (draft.step === 2 && !isStepReady(2)) return 'Open at least one day and complete both service periods.';
    if (draft.step === 3 && !isStepReady(3)) return 'Add at least one area and one position.';
    if (draft.step === 4 && !isStepReady(4)) return 'Pair at least one position with a work area.';
    if (draft.step === 6 && !isStepReady(6)) return 'Complete the required setup sections before launch.';
    return '';
  }

  function validStep(): boolean {
    const message = validationMessage();
    if (!message) {
      feedback = '';
      return true;
    }
    feedback = message;
    feedbackTone = 'warning';
    return false;
  }

  function goToStep(index: number) {
    const target = Math.min(steps.length - 1, Math.max(0, index));
    const allowed = steps.slice(0, target).every((_, stepIndex) => isStepReady(stepIndex));
    if (!allowed) {
      feedback = 'Finish the required sections before jumping ahead.';
      feedbackTone = 'warning';
      return;
    }
    feedback = '';
    draft.step = target;
  }

  function next() {
    if (validStep()) draft.step = Math.min(steps.length - 1, draft.step + 1);
  }

  function back() {
    feedback = '';
    draft.step = Math.max(0, draft.step - 1);
  }

  function addArea() {
    draft.areas = [...draft.areas, { id: id('area'), name: '' }];
  }

  function removeArea(areaId: string) {
    draft.areas = draft.areas.filter((area) => area.id !== areaId);
    draft.assignments = draft.assignments.filter((assignment) => assignment.areaId !== areaId);
  }

  function addPosition() {
    draft.functions = [...draft.functions, { id: id('position'), name: '' }];
  }

  function removePosition(jobFunctionId: string) {
    draft.functions = draft.functions.filter((position) => position.id !== jobFunctionId);
    draft.assignments = draft.assignments.filter(
      (assignment) => assignment.jobFunctionId !== jobFunctionId
    );
    draft.employees = draft.employees.map((employee) =>
      employee.jobFunctionId === jobFunctionId ? { ...employee, jobFunctionId: '' } : employee
    );
  }

  function addAssignment() {
    const candidate = areaItems
      .flatMap((area) =>
        functionItems.map((position) => ({
          areaId: area.id,
          jobFunctionId: position.id
        }))
      )
      .find(
        (item) =>
          !draft.assignments.some(
            (assignment) =>
              assignment.areaId === item.areaId &&
              assignment.jobFunctionId === item.jobFunctionId
          )
      );
    if (candidate) draft.assignments = [...draft.assignments, candidate];
  }

  function removeAssignment(index: number) {
    draft.assignments = draft.assignments.filter((_, itemIndex) => itemIndex !== index);
  }

  function addEmployee() {
    draft.employees = [
      ...draft.employees,
      {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        jobFunctionId: functionItems[0]?.id ?? ''
      }
    ];
  }

  function addEmployeeRows(count: number) {
    for (let index = 0; index < count; index += 1) addEmployee();
  }

  function removeEmployee(index: number) {
    draft.employees = draft.employees.filter((_, itemIndex) => itemIndex !== index);
  }

  function resetDraft() {
    draft = structuredClone(initial);
    feedback = 'Draft reset to the recommended restaurant starter.';
    feedbackTone = 'info';
  }

  async function launch() {
    if (!auth.session || !email || saving || !validStep()) return;
    saving = true;
    try {
      const openingHours = Array.from({ length: 7 }, (_, index) =>
        [
          {
            weekday: index + 1,
            service_key: 'lunch',
            is_open: Boolean(draft.openDays[index]),
            opens_at: draft.lunchStart,
            closes_at: draft.lunchEnd
          },
          {
            weekday: index + 1,
            service_key: 'evening',
            is_open: Boolean(draft.openDays[index]),
            opens_at: draft.eveningStart,
            closes_at: draft.eveningEnd
          }
        ]
      ).flat();
      const areas = areaItems.map((area) => ({
        name: area.name,
        lunch_start: draft.lunchStart,
        lunch_end: draft.lunchEnd,
        evening_start: draft.eveningStart,
        evening_end: draft.eveningEnd
      }));
      const coverage = validAssignments.map((assignment) => ({
        area: areaItems.find((area) => area.id === assignment.areaId)?.name ?? '',
        job_function:
          functionItems.find((position) => position.id === assignment.jobFunctionId)?.name ?? ''
      }));
      await setupOwnerWorkspace({
        ownerFirstName: draft.firstName.trim(),
        ownerLastName: draft.lastName.trim(),
        ownerEmail: email,
        restaurantName: draft.restaurantName.trim(),
        city: draft.city.trim(),
        openingHours,
        areas,
        jobFunctions: functionNames,
        coverage,
        employees: draft.employees
          .filter((employee) => employee.firstName.trim() || employee.lastName.trim())
          .map((employee) => ({
            display_name: `${employee.firstName} ${employee.lastName}`.trim(),
            first_name: employee.firstName.trim() || null,
            last_name: employee.lastName.trim() || null,
            email: employee.email.trim() || null,
            phone: employee.phone.trim() || null,
            job_function:
              functionItems.find((position) => position.id === employee.jobFunctionId)?.name ??
              functionNames[0]
          }))
      });
      if (!auth.user?.email_confirmed_at) {
        await supabase.auth
          .resend({
            type: 'signup',
            email,
            options: { emailRedirectTo: `${location.origin}/home` }
          })
          .catch(() => undefined);
      }
      localStorage.removeItem(draftKey);
      await clearOwnerOnboardingDraft().catch(() => undefined);
      workspace.reset();
      await workspace.load();
      await goto('/home');
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Launch restaurant · restogogo</title>
  <meta
    name="description"
    content="Create a restogogo restaurant workspace with services, areas, coverage and starter staff."
  />
</svelte:head>

{#if !auth.session}
  <main class="setup-gate">
    <section class="gate-hero">
      <span class="page-kicker">Restaurant launch</span>
      <h1>Sign in, then build the workspace.</h1>
      <p>The setup board saves progress to the account and turns the restaurant model into real operational data.</p>
      <a href="/login?next=/onboarding">Open sign in</a>
    </section>
  </main>
{:else}
  <main class="launch-shell">
    <header class="launch-hero" aria-labelledby="launch-title">
      <div class="launch-hero__copy">
        <span class="page-kicker">{currentStep.eyebrow}</span>
        <h1 id="launch-title">{currentStep.title}</h1>
        <p>{currentStep.description}</p>
      </div>
      <aside class="launch-dial" aria-label="Setup readiness">
        <div class:has-issues={readyPercent < 100} class="readiness-dial" style={`--ready:${readyPercent}%`}>
          <strong>{readyPercent}%</strong>
          <span>ready</span>
        </div>
        <dl class="hero-stats">
          {#each launchStats as stat}
            <div class:is-complete={stat.ready}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          {/each}
        </dl>
      </aside>
    </header>

    <div class="launch-layout">
      <aside class="launch-rail" aria-label="Setup steps">
        <div class="rail-brand">
          <strong>restogogo</strong>
          <span>{restaurantNameLabel(draft.restaurantName)}</span>
        </div>
        <nav>
          {#each steps as step, index}
            <button
              type="button"
              class:is-active={draft.step === index}
              class:is-complete={isStepReady(index) && index < draft.step}
              onclick={() => goToStep(index)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step.label}</strong>
              <small>{step.eyebrow}</small>
            </button>
          {/each}
        </nav>
        <div class="rail-progress" aria-label={`Step ${draft.step + 1} of ${steps.length}`}>
          <span style={`width:${progress}%`}></span>
        </div>
      </aside>

      <section class="launch-workspace" aria-labelledby="step-title">
        <header class="step-head">
          <div>
            <span class="page-kicker">Step {draft.step + 1} of {steps.length}</span>
            <h2 id="step-title">{currentStep.label}</h2>
          </div>
          <button type="button" class="text-action" onclick={resetDraft}>Reset starter</button>
        </header>

        <FeedbackBanner message={feedback} tone={feedbackTone} />

        <div class="step-grid">
          <section class="step-main">
            {#if draft.step === 0}
              <div class="field-grid">
                <label>
                  <span>First name</span>
                  <input bind:value={draft.firstName} autocomplete="given-name" />
                </label>
                <label>
                  <span>Last name</span>
                  <input bind:value={draft.lastName} autocomplete="family-name" />
                </label>
                <label class="wide">
                  <span>Account email</span>
                  <input value={email} disabled />
                </label>
              </div>
            {:else if draft.step === 1}
              <div class="field-grid">
                <label class="wide">
                  <span>Restaurant name</span>
                  <input bind:value={draft.restaurantName} placeholder="Le Comptoir Restogogo" />
                </label>
                <label>
                  <span>City</span>
                  <input bind:value={draft.city} placeholder="Brussels" />
                </label>
              </div>
            {:else if draft.step === 2}
              <div class="rhythm-board">
                <section class="service-editor is-lunch">
                  <span>Lunch</span>
                  <div>
                    <label>
                      <small>Start</small>
                      <input type="time" bind:value={draft.lunchStart} />
                    </label>
                    <label>
                      <small>End</small>
                      <input type="time" bind:value={draft.lunchEnd} />
                    </label>
                  </div>
                </section>
                <section class="service-editor is-evening">
                  <span>Evening</span>
                  <div>
                    <label>
                      <small>Start</small>
                      <input type="time" bind:value={draft.eveningStart} />
                    </label>
                    <label>
                      <small>End</small>
                      <input type="time" bind:value={draft.eveningEnd} />
                    </label>
                  </div>
                </section>
              </div>
              <div class="day-strip" aria-label="Open days">
                {#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as day, index}
                  <label class:checked={draft.openDays[index]}>
                    <input type="checkbox" bind:checked={draft.openDays[index]} />
                    <span>{day}</span>
                  </label>
                {/each}
              </div>
            {:else if draft.step === 3}
              <div class="split-builder">
                <section>
                  <div class="builder-head">
                    <strong>Areas</strong>
                    <ActionButton label="Add area" onclick={addArea} />
                  </div>
                  <div class="editable-list">
                    {#each draft.areas as area (area.id)}
                      <div>
                        <input aria-label="Area name" placeholder="Salle, Cuisine, Bar" bind:value={area.name} />
                        <button type="button" aria-label="Remove area" onclick={() => removeArea(area.id)}>Remove</button>
                      </div>
                    {/each}
                  </div>
                </section>
                <section>
                  <div class="builder-head">
                    <strong>Positions</strong>
                    <ActionButton label="Add position" onclick={addPosition} />
                  </div>
                  <div class="editable-list">
                    {#each draft.functions as position (position.id)}
                      <div>
                        <input aria-label="Position name" placeholder="Server, Cook, Dishwasher" bind:value={position.name} />
                        <button type="button" aria-label="Remove position" onclick={() => removePosition(position.id)}>Remove</button>
                      </div>
                    {/each}
                  </div>
                </section>
              </div>
            {:else if draft.step === 4}
              <div class="assignment-board">
                {#each draft.assignments as assignment, index (`${assignment.areaId}-${assignment.jobFunctionId}-${index}`)}
                  <div class="assignment-row">
                    <select aria-label="Assignment area" bind:value={assignment.areaId}>
                      {#each areaItems as area}
                        <option value={area.id}>{area.name}</option>
                      {/each}
                    </select>
                    <select aria-label="Assignment position" bind:value={assignment.jobFunctionId}>
                      {#each functionItems as position}
                        <option value={position.id}>{position.name}</option>
                      {/each}
                    </select>
                    <button type="button" aria-label="Remove assignment" onclick={() => removeAssignment(index)}>Remove</button>
                  </div>
                {/each}
              </div>
              <ActionButton label="Add pairing" onclick={addAssignment} />
            {:else if draft.step === 5}
              <div class="team-toolbar">
                <ActionButton label="Add employee" onclick={addEmployee} />
                <ActionButton label="Add 3 rows" onclick={() => addEmployeeRows(3)} />
              </div>
              <div class="employee-table" aria-label="Starter employees">
                {#each draft.employees as employee, index}
                  <section class="employee-row">
                    <input aria-label="Employee first name" placeholder="First name" bind:value={employee.firstName} />
                    <input aria-label="Employee last name" placeholder="Last name" bind:value={employee.lastName} />
                    <input aria-label="Employee email" type="email" placeholder="Email" bind:value={employee.email} />
                    <select aria-label="Employee position" bind:value={employee.jobFunctionId}>
                      <option value="">Position</option>
                      {#each functionItems as position}
                        <option value={position.id}>{position.name}</option>
                      {/each}
                    </select>
                    <button type="button" aria-label="Remove employee" onclick={() => removeEmployee(index)}>Remove</button>
                  </section>
                {:else}
                  <p class="empty-line">No starter employees yet.</p>
                {/each}
              </div>
            {:else}
              <div class="review-grid">
                <article>
                  <span>Owner</span>
                  <strong>{draft.firstName} {draft.lastName}</strong>
                  <small>{email}</small>
                </article>
                <article>
                  <span>Restaurant</span>
                  <strong>{draft.restaurantName}</strong>
                  <small>{draft.city || 'City not set'}</small>
                </article>
                <article>
                  <span>Services</span>
                  <strong>{draft.lunchStart}-{draft.lunchEnd}</strong>
                  <small>{draft.eveningStart}-{draft.eveningEnd} evening</small>
                </article>
                <article>
                  <span>Foundation</span>
                  <strong>{areaItems.length} areas / {functionItems.length} positions</strong>
                  <small>{validAssignments.length} coverage pairings</small>
                </article>
                <article>
                  <span>Starter team</span>
                  <strong>{starterEmployees.length} employees</strong>
                  <small>Invitations stay in Team</small>
                </article>
              </div>
            {/if}
          </section>

          <aside class="blueprint-preview" aria-label="Workspace preview">
            <span class="page-kicker">Live blueprint</span>
            <strong>{draft.restaurantName.trim() || 'New restaurant'}</strong>
            <p>{openDayCount}/7 open days · {draft.lunchStart}-{draft.lunchEnd} lunch · {draft.eveningStart}-{draft.eveningEnd} evening</p>
            <div class="preview-lanes">
              {#each areaItems.slice(0, 4) as area}
                <section>
                  <header>{area.name}</header>
                  <div>
                    {#each validAssignments.filter((assignment) => assignment.areaId === area.id).slice(0, 3) as assignment}
                      <span>{functionItems.find((position) => position.id === assignment.jobFunctionId)?.name}</span>
                    {:else}
                      <em>No rule yet</em>
                    {/each}
                  </div>
                </section>
              {:else}
                <p class="empty-line">Areas appear here as you build them.</p>
              {/each}
            </div>
          </aside>
        </div>

        <footer class="step-actions">
          <ActionButton label="Back" disabled={draft.step === 0 || saving} onclick={back} />
          {#if draft.step < steps.length - 1}
            <ActionButton label="Continue" tone="primary" onclick={next} />
          {:else}
            <ActionButton
              label={saving ? 'Creating workspace...' : 'Create workspace'}
              tone="primary"
              disabled={saving}
              onclick={launch}
            />
          {/if}
        </footer>
      </section>
    </div>
  </main>
{/if}

<script lang="ts" module>
  function restaurantNameLabel(name: string) {
    return name.trim() || 'Launch board';
  }
</script>

<style>
  .setup-gate {
    width: 100vw;
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px;
    overflow: hidden;
    background:
      linear-gradient(90deg, rgba(11, 18, 26, 0.94), rgba(11, 18, 26, 0.68)),
      url('/module-backgrounds/restaurant.webp') center / cover;
  }

  .gate-hero {
    width: min(680px, 100%);
    display: grid;
    gap: 14px;
    color: #fffaf2;
  }

  .gate-hero h1 {
    margin: 0;
    font-size: clamp(40px, 8vw, 76px);
    line-height: 0.92;
    letter-spacing: -0.055em;
  }

  .gate-hero p {
    max-width: 520px;
    margin: 0;
    color: rgba(255, 250, 242, 0.78);
    line-height: 1.5;
  }

  .gate-hero a {
    width: fit-content;
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    padding: 0 16px;
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-on-accent-text);
    background: var(--rst-ui-action);
    font-weight: var(--rst-fw-bold);
    text-decoration: none;
  }

  .launch-shell {
    min-height: 100vh;
    background: var(--rst-ui-bg);
  }

  .launch-hero {
    position: relative;
    overflow: hidden;
    min-height: 300px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 440px);
    align-items: end;
    gap: 24px;
    padding: clamp(26px, 5vw, 54px);
    color: #fffaf2;
    background:
      linear-gradient(92deg, rgba(9, 15, 23, 0.98), rgba(9, 15, 23, 0.86) 48%, rgba(240, 100, 35, 0.2)),
      url('/module-backgrounds/restaurant.webp') center / cover;
  }

  .launch-hero::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 5px;
    background: linear-gradient(90deg, var(--rst-ui-action), var(--rst-gold), var(--rst-green), var(--rst-state-info));
  }

  .launch-hero__copy {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 12px;
    max-width: 850px;
  }

  .launch-hero h1 {
    max-width: 820px;
    margin: 0;
    font-size: clamp(40px, 6.4vw, 78px);
    line-height: 0.9;
    letter-spacing: -0.058em;
  }

  .launch-hero p {
    max-width: 600px;
    margin: 0;
    color: rgba(255, 250, 242, 0.78);
    font-size: 16px;
    line-height: 1.45;
  }

  .launch-dial {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: end;
    justify-content: end;
    gap: 14px;
  }

  .launch-layout {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    align-items: start;
  }

  .launch-rail {
    position: sticky;
    top: 0;
    min-height: 100vh;
    display: grid;
    align-content: start;
    gap: 18px;
    padding: 24px;
    border-right: 1px solid var(--rst-ui-line);
    background: var(--rst-ui-bg-2);
  }

  .rail-brand {
    display: grid;
    gap: 4px;
  }

  .rail-brand strong {
    font-size: 22px;
    letter-spacing: -0.04em;
  }

  .rail-brand span {
    color: var(--rst-ui-muted);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
  }

  .launch-rail nav {
    display: grid;
    gap: 7px;
  }

  .launch-rail button {
    min-width: 0;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 2px 10px;
    align-items: center;
    padding: 12px;
    border: 1px solid transparent;
    border-radius: var(--rst-ui-radius-lg);
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .launch-rail button:hover {
    background: var(--rst-ui-hover-bg);
  }

  .launch-rail button.is-active {
    border-color: rgba(var(--rst-ui-action-rgb), 0.26);
    background: var(--rst-state-selected-bg);
    box-shadow: inset 3px 0 0 var(--rst-ui-action);
  }

  .launch-rail button.is-complete span {
    color: var(--rst-state-success-text);
    background: var(--rst-state-success-bg);
  }

  .launch-rail button span {
    grid-row: span 2;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field-strong);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
  }

  .launch-rail button strong,
  .launch-rail button small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .launch-rail button strong {
    font-size: 13px;
  }

  .launch-rail button small {
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .rail-progress {
    height: 8px;
    overflow: hidden;
    border-radius: var(--rst-ui-radius-pill);
    background: var(--rst-ui-surface-field-strong);
  }

  .rail-progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--rst-ui-action), var(--rst-gold));
    transition: width 0.22s var(--rst-ease-out);
  }

  .launch-workspace {
    min-width: 0;
    display: grid;
    gap: 16px;
    padding: clamp(22px, 4vw, 38px);
  }

  .step-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
  }

  .step-head h2 {
    margin: 4px 0 0;
    font-size: clamp(30px, 4vw, 48px);
    line-height: 0.95;
    letter-spacing: -0.045em;
  }

  .text-action {
    min-height: 36px;
    padding: 0;
    border: 0;
    color: var(--rst-ui-panel-title);
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }

  .step-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.8fr);
    gap: 16px;
    align-items: start;
  }

  .step-main,
  .blueprint-preview {
    border: 1px solid rgba(76, 48, 26, 0.08);
    border-radius: var(--rst-ui-radius-2xl);
    background: rgba(255, 255, 255, 0.52);
    box-shadow: 0 18px 42px rgba(31, 22, 15, 0.08);
  }

  .step-main {
    min-height: 410px;
    padding: clamp(18px, 3vw, 28px);
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .field-grid .wide {
    grid-column: 1 / -1;
  }

  label {
    display: grid;
    gap: 7px;
    color: var(--rst-ui-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  input,
  select {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    background: var(--rst-ui-surface-field-strong);
    font: inherit;
    text-transform: none;
  }

  input:focus-visible,
  select:focus-visible {
    border-color: var(--rst-ui-action);
    outline: none;
    box-shadow: var(--rst-ui-focus);
  }

  .rhythm-board {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .service-editor {
    display: grid;
    gap: 16px;
    padding: 18px;
    border-radius: var(--rst-ui-radius-xl);
    color: #17304f;
    background: #fff4dc;
  }

  .service-editor.is-evening {
    background: #e5eefb;
  }

  .service-editor > span {
    font-size: 18px;
    font-weight: var(--rst-fw-display);
  }

  .service-editor > div {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .service-editor small {
    color: rgba(23, 48, 77, 0.62);
  }

  .day-strip {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
    margin-top: 14px;
  }

  .day-strip label {
    min-height: 54px;
    display: grid;
    place-items: center;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field-strong);
    cursor: pointer;
  }

  .day-strip label.checked {
    color: #12301f;
    border-color: rgba(var(--rst-state-success-rgb), 0.38);
    background: var(--rst-state-success-bg);
  }

  .day-strip input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .split-builder {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .split-builder > section,
  .assignment-board,
  .employee-table {
    display: grid;
    gap: 10px;
  }

  .builder-head,
  .team-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .builder-head strong {
    font-size: 18px;
  }

  .editable-list {
    display: grid;
    gap: 8px;
  }

  .editable-list > div,
  .assignment-row,
  .employee-row {
    display: grid;
    gap: 8px;
    align-items: center;
  }

  .editable-list > div {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .assignment-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  }

  .employee-row {
    grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  }

  .editable-list button,
  .assignment-row button,
  .employee-row button {
    min-height: 38px;
    padding: 0 10px;
    border: 1px solid var(--rst-state-danger-border);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-state-danger-text);
    background: var(--rst-state-danger-bg);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }

  .team-toolbar {
    justify-content: flex-start;
    margin-bottom: 10px;
  }

  .review-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .review-grid article {
    min-width: 0;
    display: grid;
    gap: 5px;
    padding: 16px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-xl);
    background: #fff;
  }

  .review-grid span {
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .review-grid strong,
  .review-grid small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .review-grid strong {
    font-size: 17px;
  }

  .review-grid small {
    color: var(--rst-ui-muted);
  }

  .blueprint-preview {
    position: sticky;
    top: 18px;
    display: grid;
    gap: 12px;
    padding: 20px;
    color: #fffaf2;
    background:
      linear-gradient(145deg, rgba(16, 29, 45, 0.96), rgba(19, 34, 53, 0.96)),
      url('/module-backgrounds/planning.webp') center / cover;
  }

  .blueprint-preview > strong {
    font-size: 26px;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .blueprint-preview > p {
    margin: 0;
    color: rgba(255, 250, 242, 0.7);
    font-size: 12px;
    line-height: 1.4;
  }

  .preview-lanes {
    display: grid;
    gap: 8px;
  }

  .preview-lanes section {
    display: grid;
    gap: 7px;
    padding: 12px;
    border-radius: var(--rst-ui-radius-lg);
    background: rgba(255, 255, 255, 0.08);
  }

  .preview-lanes header {
    color: #fff;
    font-weight: var(--rst-fw-display);
  }

  .preview-lanes div {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .preview-lanes span,
  .preview-lanes em {
    min-height: 27px;
    display: inline-flex;
    align-items: center;
    padding: 0 9px;
    border-radius: var(--rst-ui-radius-pill);
    color: #19304b;
    background: #fff4dc;
    font-size: 11px;
    font-style: normal;
    font-weight: var(--rst-fw-bold);
  }

  .preview-lanes em {
    color: rgba(255, 250, 242, 0.62);
    background: rgba(255, 255, 255, 0.08);
  }

  .empty-line {
    margin: 0;
    padding: 18px;
    color: var(--rst-ui-muted);
    text-align: center;
  }

  .blueprint-preview .empty-line {
    color: rgba(255, 250, 242, 0.62);
  }

  .step-actions {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  @media (max-width: 1180px) {
    .launch-hero,
    .launch-layout,
    .step-grid {
      grid-template-columns: 1fr;
    }

    .launch-rail,
    .blueprint-preview {
      position: static;
    }

    .launch-rail {
      min-height: 0;
      border-right: 0;
      border-bottom: 1px solid var(--rst-ui-line);
    }

    .launch-rail nav {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
  }

  @media (max-width: 760px) {
    .launch-hero {
      min-height: auto;
      padding: 24px 18px;
    }

    .launch-dial {
      display: grid;
      justify-content: start;
    }

    .launch-workspace {
      padding: 18px;
    }

    .step-head {
      align-items: start;
      flex-direction: column;
    }

    .field-grid,
    .rhythm-board,
    .split-builder,
    .review-grid,
    .assignment-row,
    .employee-row {
      grid-template-columns: 1fr;
    }

    .field-grid .wide {
      grid-column: auto;
    }

    .day-strip {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
