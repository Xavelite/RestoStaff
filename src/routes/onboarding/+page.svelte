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
        'Tap a cell to say a position works an area. Minimums stay editable later.'
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

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  const serviceCount = $derived(openDayCount * 2);
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
      goto(workspace.active.role === 'employee' ? '/my-service' : '/home', {
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

  // Coverage is a visual matrix now: one tap flips whether a position works an
  // area, instead of building select→select→remove rows. Same draft.assignments
  // shape underneath, so the launch payload is unchanged.
  function hasAssignment(areaId: string, jobFunctionId: string) {
    return draft.assignments.some(
      (assignment) => assignment.areaId === areaId && assignment.jobFunctionId === jobFunctionId
    );
  }

  function toggleAssignment(areaId: string, jobFunctionId: string) {
    if (hasAssignment(areaId, jobFunctionId)) {
      draft.assignments = draft.assignments.filter(
        (assignment) => !(assignment.areaId === areaId && assignment.jobFunctionId === jobFunctionId)
      );
    } else {
      draft.assignments = [...draft.assignments, { areaId, jobFunctionId }];
    }
  }

  function areaRuleCount(areaId: string) {
    return validAssignments.filter((assignment) => assignment.areaId === areaId).length;
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
  <main class="launch">
    <header class="launch-hero" aria-labelledby="launch-title">
      <div class="launch-hero__copy">
        <span class="page-kicker">Launch sequence · {currentStep.eyebrow}</span>
        <h1 id="launch-title">{currentStep.title}</h1>
        <p>{currentStep.description}</p>
      </div>
      <aside class="launch-hero__command" aria-label="Setup readiness">
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

    <div class="launch-body">
      <nav class="step-track" aria-label="Setup steps">
        {#each steps as step, index}
          {@const ready = isStepReady(index)}
          {@const locked = !steps.slice(0, index).every((_, i) => isStepReady(i))}
          <button
            type="button"
            class="step-chip"
            class:is-active={draft.step === index}
            class:is-complete={ready && index !== draft.step}
            class:is-locked={locked}
            disabled={locked}
            onclick={() => goToStep(index)}
          >
            <span class="step-chip__dot">{ready && index !== draft.step ? '✓' : String(index + 1)}</span>
            <span class="step-chip__label">
              <strong>{step.label}</strong>
              <small>{step.eyebrow}</small>
            </span>
          </button>
        {/each}
        <div class="step-track__bar" aria-hidden="true"><span style={`width:${progress}%`}></span></div>
      </nav>

      <FeedbackBanner message={feedback} tone={feedbackTone} />

      <div class="launch-grid">
        <section class="launch-stage" aria-labelledby="stage-title" data-step={draft.step}>
          <header class="stage-head">
            <div>
              <span class="page-kicker">Step {draft.step + 1} of {steps.length}</span>
              <h2 id="stage-title">{currentStep.label}</h2>
            </div>
            <button type="button" class="text-action" onclick={resetDraft}>Reset starter</button>
          </header>

          {#key draft.step}
          <div class="stage-content">
            {#if draft.step === 0}
              <div class="fieldset">
                <label>Owner first name<input bind:value={draft.firstName} autocomplete="given-name" placeholder="Xavier" /></label>
                <label>Owner last name<input bind:value={draft.lastName} autocomplete="family-name" placeholder="Besnard" /></label>
                <label class="wide">Account email<input value={email} disabled /></label>
              </div>
            {:else if draft.step === 1}
              <div class="fieldset">
                <label class="wide">Restaurant name<input bind:value={draft.restaurantName} placeholder="Le Comptoir Restogogo" /></label>
                <label class="wide">City<input bind:value={draft.city} placeholder="Brussels" /></label>
              </div>
            {:else if draft.step === 2}
              <div class="rhythm-cards">
                <section class="rhythm-card is-lunch">
                  <span class="rhythm-card__icon" aria-hidden="true">☀</span>
                  <strong>Lunch</strong>
                  <div>
                    <label>Start<input type="time" bind:value={draft.lunchStart} /></label>
                    <label>End<input type="time" bind:value={draft.lunchEnd} /></label>
                  </div>
                </section>
                <section class="rhythm-card is-evening">
                  <span class="rhythm-card__icon" aria-hidden="true">☾</span>
                  <strong>Evening</strong>
                  <div>
                    <label>Start<input type="time" bind:value={draft.eveningStart} /></label>
                    <label>End<input type="time" bind:value={draft.eveningEnd} /></label>
                  </div>
                </section>
              </div>
              <div class="day-chips" aria-label="Open days">
                {#each WEEKDAYS as day, index}
                  <label class:is-on={draft.openDays[index]}>
                    <input type="checkbox" bind:checked={draft.openDays[index]} />
                    <span>{day}</span>
                  </label>
                {/each}
              </div>
              <p class="stage-hint">{openDayCount}/7 days open · {serviceCount} weekly services seeded.</p>
            {:else if draft.step === 3}
            <div class="build-columns">
              <section>
                <div class="build-head"><strong>Areas</strong><span>{areaItems.length} named</span></div>
                <p class="stage-hint">The rooms and stations work happens in.</p>
                <div class="build-grid">
                  {#each draft.areas as area, index (area.id)}
                    <div class="build-card rst-stagger-in" style={`--rst-i:${index}`}>
                      <input aria-label="Area name" placeholder="Salle, Cuisine, Bar" bind:value={area.name} />
                      <button type="button" class="build-card__x" aria-label="Remove area" onclick={() => removeArea(area.id)}>×</button>
                    </div>
                  {/each}
                  <button type="button" class="ghost-card" onclick={addArea}>
                    <span class="ghost-icon">+</span>
                    <strong>Add area</strong>
                  </button>
                </div>
              </section>
              <section>
                <div class="build-head"><strong>Positions</strong><span>{functionItems.length} named</span></div>
                <p class="stage-hint">The roles people can be assigned to.</p>
                <div class="build-grid">
                  {#each draft.functions as position, index (position.id)}
                    <div class="build-card rst-stagger-in" style={`--rst-i:${index}`}>
                      <input aria-label="Position name" placeholder="Server, Cook, Dishwasher" bind:value={position.name} />
                      <button type="button" class="build-card__x" aria-label="Remove position" onclick={() => removePosition(position.id)}>×</button>
                    </div>
                  {/each}
                  <button type="button" class="ghost-card" onclick={addPosition}>
                    <span class="ghost-icon">+</span>
                    <strong>Add position</strong>
                  </button>
                </div>
              </section>
            </div>
            {:else if draft.step === 4}
              {#if areaItems.length && functionItems.length}
                <div class="matrix" style={`--cols:${functionItems.length}`}>
                  <div class="matrix__corner">Area ╲ Position</div>
                  {#each functionItems as position (position.id)}
                    <div class="matrix__col-head" title={position.name}>{position.name}</div>
                  {/each}
                  {#each areaItems as area (area.id)}
                    <div class="matrix__row-head">
                      <strong>{area.name}</strong>
                      <small>{areaRuleCount(area.id)} rule{areaRuleCount(area.id) === 1 ? '' : 's'}</small>
                    </div>
                    {#each functionItems as position (position.id)}
                      {@const on = hasAssignment(area.id, position.id)}
                      <button
                        type="button"
                        class="matrix__cell"
                        class:is-on={on}
                        aria-pressed={on}
                        aria-label={`${position.name} works ${area.name}`}
                        onclick={() => toggleAssignment(area.id, position.id)}
                      >
                        {on ? '✓' : ''}
                      </button>
                    {/each}
                  {/each}
                </div>
                <p class="stage-hint">{validAssignments.length} staffing pairing{validAssignments.length === 1 ? '' : 's'} · tap a cell to toggle.</p>
              {:else}
                <p class="stage-empty">Add at least one area and one position first.</p>
              {/if}
            {:else if draft.step === 5}
              <div class="team-grid">
                {#each draft.employees as employee, index}
                  <div class="team-card rst-stagger-in" style={`--rst-i:${index}`}>
                    <div class="team-card__row">
                      <input aria-label="First name" placeholder="First name" bind:value={employee.firstName} />
                      <input aria-label="Last name" placeholder="Last name" bind:value={employee.lastName} />
                    </div>
                    <input aria-label="Email" type="email" placeholder="Email (optional)" bind:value={employee.email} />
                    <select aria-label="Position" bind:value={employee.jobFunctionId}>
                      <option value="">No position</option>
                      {#each functionItems as position}
                        <option value={position.id}>{position.name}</option>
                      {/each}
                    </select>
                    <button type="button" class="team-card__x" aria-label="Remove employee" onclick={() => removeEmployee(index)}>×</button>
                  </div>
                {/each}
                <button type="button" class="ghost-card ghost-card--tall" onclick={addEmployee}>
                  <span class="ghost-icon">+</span>
                  <strong>{draft.employees.length ? 'Add employee' : 'Add your first employee'}</strong>
                </button>
              </div>
              <p class="stage-hint">Optional — you can also add the whole team later from the Team page.</p>
            {:else}
              <div class="review-grid">
                <article class="glow-card glow-card--sky">
                  <span class="glow-card__kicker">Owner</span>
                  <strong>{draft.firstName} {draft.lastName}</strong>
                  <p>{email}</p>
                </article>
                <article class="glow-card glow-card--gold">
                  <span class="glow-card__kicker">Restaurant</span>
                  <strong>{draft.restaurantName || 'Unnamed'}</strong>
                  <p>{draft.city || 'City not set'}</p>
                </article>
                <article class="glow-card glow-card--forest">
                  <span class="glow-card__kicker">Rhythm</span>
                  <strong>{serviceCount} services / week</strong>
                  <p>☀ {draft.lunchStart}–{draft.lunchEnd} · ☾ {draft.eveningStart}–{draft.eveningEnd}</p>
                </article>
                <article class="glow-card glow-card--green">
                  <span class="glow-card__kicker">Foundation</span>
                  <strong>{areaItems.length} areas · {functionItems.length} positions</strong>
                  <p>{validAssignments.length} coverage pairings · {starterEmployees.length} starter staff</p>
                </article>
              </div>
            {/if}
          </div>
          {/key}

          <footer class="stage-actions">
            <ActionButton label="Back" disabled={draft.step === 0 || saving} onclick={back} />
            {#if draft.step < steps.length - 1}
              <ActionButton label="Continue" tone="primary" onclick={next} />
            {:else}
              <ActionButton
                label={saving ? 'Creating workspace…' : 'Create workspace'}
                tone="primary"
                disabled={saving}
                onclick={launch}
              />
            {/if}
          </footer>
        </section>

        <aside class="blueprint" aria-label="Live blueprint">
          <div class="blueprint__head">
            <span class="page-kicker">Live blueprint</span>
            <strong>{draft.restaurantName.trim() || 'New restaurant'}</strong>
            <p>{draft.city.trim() || 'City pending'} · {openDayCount}/7 open days</p>
          </div>
          <div class="blueprint__rhythm">
            {#each WEEKDAYS as day, index}
              <span class:is-on={draft.openDays[index]}>{day.slice(0, 2)}</span>
            {/each}
          </div>
          <div class="blueprint__lanes">
            {#each areaItems.slice(0, 5) as area (area.id)}
              <section>
                <header>{area.name}</header>
                <div>
                  {#each validAssignments.filter((a) => a.areaId === area.id) as assignment}
                    <span>{functionItems.find((p) => p.id === assignment.jobFunctionId)?.name}</span>
                  {:else}
                    <em>No rule yet</em>
                  {/each}
                </div>
              </section>
            {:else}
              <p class="blueprint__empty">Areas and their positions appear here as you build them.</p>
            {/each}
          </div>
        </aside>
      </div>
    </div>
  </main>
{/if}

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
    letter-spacing: 0;
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

  .launch {
    width: 100%;
    min-height: 100vh;
    background: var(--rst-ui-bg);
  }

  /* ---- Hero (design-system language) ------------------------------- */
  .launch-hero {
    position: relative;
    overflow: hidden;
    min-height: 260px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 400px);
    gap: 22px;
    align-items: center;
    padding: clamp(26px, 5vw, 52px);
    color: #fffaf2;
    background:
      linear-gradient(95deg, rgba(11, 18, 26, 0.98) 0%, rgba(11, 18, 26, 0.88) 47%, rgba(240, 100, 35, 0.26) 100%),
      url('/module-backgrounds/restaurant.webp') center / cover;
  }

  .launch-hero::before {
    content: '';
    position: absolute;
    inset: -18%;
    z-index: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 18% 18%, rgba(var(--rst-ui-action-rgb), 0.26), transparent 28%),
      radial-gradient(circle at 86% 28%, rgba(247, 183, 51, 0.18), transparent 34%),
      radial-gradient(circle at 74% 88%, rgba(66, 216, 132, 0.13), transparent 32%);
    mix-blend-mode: screen;
    animation: rst-ambient-shift 14s ease-in-out infinite alternate;
  }

  .launch-hero::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    z-index: 2;
    height: 5px;
    background: linear-gradient(90deg, var(--rst-ui-action), var(--rst-gold), var(--rst-green), var(--rst-state-info));
    opacity: 0.92;
  }

  .launch-hero__copy {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 12px;
    max-width: 780px;
    animation: rst-fade-up 0.5s var(--rst-ease-out) backwards;
  }

  .launch-hero h1 {
    margin: 0;
    font-size: clamp(34px, 5.2vw, 64px);
    line-height: 0.94;
    letter-spacing: 0;
  }

  .launch-hero p {
    max-width: 620px;
    margin: 0;
    color: rgba(255, 250, 242, 0.82);
    font-size: clamp(14px, 1.3vw, 17px);
    line-height: 1.45;
  }

  .launch-hero__command {
    position: relative;
    z-index: 1;
    justify-self: end;
    display: flex;
    align-items: center;
    justify-content: end;
    gap: 14px;
    animation: rst-fade-up 0.5s var(--rst-ease-out) 0.08s backwards;
  }

  .launch-body {
    display: grid;
    gap: 16px;
    padding: clamp(20px, 4vw, 36px);
  }

  /* ---- Horizontal step track --------------------------------------- */
  .step-track {
    position: relative;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
    padding: 12px 12px 20px;
    border: 1px solid var(--rst-ui-surface-panel-border);
    border-radius: var(--rst-ui-radius-2xl);
    background: var(--rst-ui-surface-panel);
    box-shadow: var(--rst-ui-shadow-card);
  }

  .step-chip {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px;
    border: 1px solid transparent;
    border-radius: var(--rst-ui-radius-lg);
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s var(--rst-ease-out);
  }

  .step-chip:hover:not(:disabled) {
    background: var(--rst-ui-surface-field);
    transform: translateY(-1px);
  }

  .step-chip.is-active {
    border-color: rgba(var(--rst-ui-action-rgb), 0.4);
    background: rgba(var(--rst-ui-action-rgb), 0.1);
  }

  .step-chip.is-locked {
    opacity: 0.45;
    cursor: default;
  }

  .step-chip__dot {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field-strong);
    font-size: 12px;
    font-weight: var(--rst-fw-display);
  }

  .step-chip.is-active .step-chip__dot {
    color: #fff;
    background: var(--rst-ui-action);
  }

  .step-chip.is-complete .step-chip__dot {
    color: var(--rst-state-success-text);
    background: var(--rst-state-success-bg);
  }

  .step-chip__label {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .step-chip__label strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-chip__label small {
    overflow: hidden;
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-track__bar {
    position: absolute;
    inset: auto 12px 10px;
    height: 4px;
    border-radius: var(--rst-ui-radius-pill);
    background: var(--rst-ui-surface-field-strong);
    overflow: hidden;
  }

  .step-track__bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--rst-ui-action), var(--rst-gold));
    transition: width 0.3s var(--rst-ease-out);
  }

  /* ---- Stage + blueprint ------------------------------------------- */
  .launch-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.85fr);
    gap: 16px;
    align-items: start;
  }

  .launch-stage {
    min-width: 0;
    display: grid;
    gap: 16px;
    padding: clamp(18px, 3vw, 28px);
    border: 1px solid var(--rst-ui-surface-panel-border);
    border-radius: var(--rst-ui-radius-2xl);
    background: var(--rst-ui-surface-panel);
    box-shadow: var(--rst-ui-shadow-card);
  }

  .stage-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
  }

  .stage-head h2 {
    margin: 4px 0 0;
    font-size: clamp(26px, 3.4vw, 40px);
    line-height: 0.96;
    letter-spacing: 0;
  }

  .text-action {
    min-height: 34px;
    padding: 0;
    border: 0;
    color: var(--rst-ui-panel-title);
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }

  .stage-content {
    display: grid;
    gap: 14px;
    min-height: 300px;
    align-content: start;
    animation: rst-fade-up 0.32s var(--rst-ease-out) backwards;
  }

  .stage-hint {
    margin: 0;
    color: var(--rst-ui-muted);
    font-size: 12px;
  }

  .stage-empty {
    margin: 0;
    padding: 40px 20px;
    color: var(--rst-ui-muted);
    text-align: center;
  }

  /* ---- Fields ------------------------------------------------------- */
  .fieldset {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .fieldset .wide {
    grid-column: 1 / -1;
  }

  label {
    display: grid;
    gap: 6px;
    color: var(--rst-ui-muted);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
  }

  input,
  select {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    padding: 8px 2px;
    border: 0;
    border-bottom: 1.5px solid var(--rst-ui-line);
    border-radius: 0;
    color: var(--rst-ui-text);
    background: transparent;
    font: inherit;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  input:focus-visible,
  select:focus-visible {
    border-bottom-color: var(--rst-ui-action);
    outline: none;
    box-shadow: 0 1.5px 0 0 var(--rst-ui-action);
  }

  input:disabled {
    color: var(--rst-ui-muted);
  }

  /* ---- Rhythm ------------------------------------------------------- */
  .rhythm-cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .rhythm-card {
    display: grid;
    gap: 10px;
    padding: 18px;
    border-radius: var(--rst-ui-radius-xl);
    color: #fffaf2;
    background:
      radial-gradient(circle at 90% 8%, rgba(247, 183, 51, 0.34), transparent 40%),
      linear-gradient(145deg, #1a2233, #22150c);
  }

  .rhythm-card.is-evening {
    background:
      radial-gradient(circle at 90% 8%, rgba(122, 167, 255, 0.32), transparent 40%),
      linear-gradient(145deg, #101a2c, #16233a);
  }

  .rhythm-card__icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    background: rgba(255, 255, 255, 0.14);
    font-size: 16px;
  }

  .rhythm-card > strong {
    font-size: 18px;
  }

  .rhythm-card > div {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .rhythm-card label {
    color: rgba(255, 250, 242, 0.7);
  }

  .rhythm-card input {
    color: #fffaf2;
    border-bottom-color: rgba(255, 255, 255, 0.24);
  }

  .day-chips {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
  }

  .day-chips label {
    position: relative;
    min-height: 52px;
    display: grid;
    place-items: center;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
    cursor: pointer;
    transition: transform 0.14s var(--rst-ease-out), border-color 0.14s ease, background-color 0.14s ease;
  }

  .day-chips label:hover {
    transform: translateY(-2px);
  }

  .day-chips label.is-on {
    color: var(--rst-state-success-text);
    border-color: rgba(var(--rst-state-success-rgb), 0.4);
    background: var(--rst-state-success-bg);
  }

  .day-chips input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .day-chips span {
    font-size: 13px;
    font-weight: var(--rst-fw-display);
  }

  /* ---- Work map builders ------------------------------------------- */
  .build-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .build-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .build-head strong {
    font-size: 18px;
  }

  .build-head span {
    color: var(--rst-ui-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .build-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
    margin-top: 8px;
  }

  /* Item cards and the ghost add-card share one height so the grid stays even. */
  .build-grid .build-card,
  .build-grid .ghost-card {
    min-height: 86px;
  }

  .build-card {
    position: relative;
    display: grid;
    align-content: center;
    padding: 14px 34px 14px 18px;
    overflow: hidden;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-xl);
    background: #fff;
    box-shadow: 0 2px 4px rgba(31, 22, 15, 0.05), 0 12px 26px rgba(31, 22, 15, 0.07);
    transition: transform 0.15s var(--rst-ease-out), box-shadow 0.15s var(--rst-ease-out);
  }

  .build-card::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: linear-gradient(180deg, var(--rst-state-success), rgba(22, 163, 74, 0.35));
  }

  .build-card:focus-within {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(31, 22, 15, 0.06), 0 18px 36px rgba(31, 22, 15, 0.12);
  }

  .build-card input {
    min-height: 26px;
    padding: 0;
    border: 0;
    font-size: 15px;
    font-weight: var(--rst-fw-display);
  }

  .build-card input:focus-visible {
    box-shadow: none;
  }

  .build-card__x,
  .team-card__x {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  .build-card__x:hover,
  .team-card__x:hover {
    color: var(--rst-state-danger-text);
    background: var(--rst-state-danger-bg);
  }

  /* ---- Coverage matrix --------------------------------------------- */
  .matrix {
    display: grid;
    grid-template-columns: minmax(120px, 0.8fr) repeat(var(--cols), minmax(60px, 1fr));
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .matrix__corner {
    display: flex;
    align-items: end;
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .matrix__col-head {
    overflow: hidden;
    padding: 8px 4px;
    color: var(--rst-ui-text);
    font-size: 12px;
    font-weight: var(--rst-fw-display);
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .matrix__row-head {
    display: grid;
    gap: 1px;
    align-content: center;
    padding: 8px 10px;
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-surface-field);
  }

  .matrix__row-head strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .matrix__row-head small {
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
  }

  .matrix__cell {
    min-height: 46px;
    display: grid;
    place-items: center;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: #fff;
    background: var(--rst-ui-surface-field);
    font-size: 15px;
    font-weight: var(--rst-fw-display);
    cursor: pointer;
    transition: transform 0.14s var(--rst-ease-out), background-color 0.14s ease, border-color 0.14s ease;
  }

  .matrix__cell:hover {
    transform: translateY(-2px);
    border-color: rgba(var(--rst-ui-action-rgb), 0.5);
  }

  .matrix__cell.is-on {
    border-color: transparent;
    background: linear-gradient(135deg, var(--rst-state-success), #2ea866);
    box-shadow: 0 8px 18px rgba(22, 163, 74, 0.28);
  }

  /* ---- Team --------------------------------------------------------- */
  .team-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }

  .team-card {
    position: relative;
    display: grid;
    gap: 8px;
    padding: 14px 14px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-xl);
    background: #fff;
    box-shadow: 0 2px 4px rgba(31, 22, 15, 0.05), 0 12px 26px rgba(31, 22, 15, 0.07);
  }

  .team-card__row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .team-card input,
  .team-card select {
    min-height: 34px;
  }

  .ghost-card--tall {
    min-height: 128px;
  }

  /* ---- Review ------------------------------------------------------- */
  .review-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .review-grid .glow-card {
    animation: rst-fade-up 0.4s var(--rst-ease-out) backwards;
  }

  .review-grid strong {
    overflow: hidden;
    font-size: 19px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ---- Stage actions ------------------------------------------------ */
  .stage-actions {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding-top: 4px;
    border-top: 1px solid var(--rst-ui-divider-soft);
    margin-top: 2px;
  }

  /* ---- Blueprint instrument ---------------------------------------- */
  .blueprint {
    position: sticky;
    top: 16px;
    display: grid;
    gap: 14px;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--rst-ui-radius-2xl);
    color: #fffaf2;
    overflow: hidden;
    background: linear-gradient(155deg, #131c26, #1a2620);
    box-shadow: var(--rst-ui-shadow-card);
  }

  .blueprint__head {
    display: grid;
    gap: 4px;
  }

  .blueprint__head strong {
    font-size: 19px;
    line-height: 1.05;
    letter-spacing: 0;
  }

  .blueprint__head p {
    margin: 0;
    color: rgba(255, 250, 242, 0.7);
    font-size: 12px;
  }

  .blueprint__rhythm {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }

  .blueprint__rhythm span {
    display: grid;
    place-items: center;
    height: 28px;
    border-radius: var(--rst-ui-radius-md);
    color: rgba(255, 250, 242, 0.5);
    background: rgba(255, 255, 255, 0.08);
    font-size: 9px;
    font-weight: var(--rst-fw-display);
    text-transform: uppercase;
  }

  .blueprint__rhythm span.is-on {
    color: #12301f;
    background: var(--rst-green);
  }

  .blueprint__lanes {
    display: grid;
    gap: 8px;
  }

  .blueprint__lanes section {
    display: grid;
    gap: 7px;
    padding: 12px;
    border-radius: var(--rst-ui-radius-lg);
    background: rgba(255, 255, 255, 0.08);
    animation: rst-fade-up 0.35s var(--rst-ease-out) backwards;
  }

  .blueprint__lanes header {
    color: #fff;
    font-weight: var(--rst-fw-display);
  }

  .blueprint__lanes section > div {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .blueprint__lanes span,
  .blueprint__lanes em {
    min-height: 26px;
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

  .blueprint__lanes em {
    color: rgba(255, 250, 242, 0.6);
    background: rgba(255, 255, 255, 0.08);
  }

  .blueprint__empty {
    margin: 0;
    color: rgba(255, 250, 242, 0.6);
    font-size: 12px;
    line-height: 1.5;
  }

  @media (max-width: 1180px) {
    .launch-hero,
    .launch-grid {
      grid-template-columns: 1fr;
    }

    .launch-hero__command {
      justify-self: start;
      justify-content: start;
    }

    .step-track {
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    }

    .blueprint {
      position: static;
    }
  }

  @media (max-width: 760px) {
    .launch-hero {
      min-height: auto;
    }

    .stage-head {
      align-items: start;
      flex-direction: column;
    }

    .fieldset,
    .rhythm-cards,
    .build-columns,
    .review-grid {
      grid-template-columns: 1fr;
    }

    .day-chips {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
