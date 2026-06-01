/*
 * restogogo onboarding wizard.
 * Full-page guided setup: owner account → restaurant → team → ready.
 * Auth-backed: validates fields, creates a Supabase user, then calls the
 * secure setup RPC to create the restaurant workspace.
 */
(function(){
  const Restogogo = window.Restogogo;
  const $ = id => document.getElementById(id);

  /* ── State ──────────────────────────────────────────────────────────── */

  let currentStep = 1;
  const TOTAL_STEPS = 4;

  // Collected form data across steps
  let completedSetup = null;

  function ensureMarkup(){
    const root = $('onboarding');
    window.RestogogoOnboardingTemplate?.render?.(root);
  }

  const formData = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    restaurantName: '',
    city: '',
    defaultZoneName: 'Restaurant',
    defaultPositionName: 'Staff',
    employees: [], // [{name}] — auth/access is created by the setup RPC
  };

  /* ── Navigation ─────────────────────────────────────────────────────── */

  function resetForm(){
    Object.assign(formData, {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      restaurantName: '',
      city: '',
      defaultZoneName: 'Restaurant',
      defaultPositionName: 'Staff',
      employees: []
    });
    completedSetup = null;
    [
      'obFirstName',
      'obLastName',
      'obEmail',
      'obPassword',
      'obRestaurantName',
      'obCity',
      'obNewEmpName'
    ].forEach(id => { const el = $(id); if(el) el.value = ''; });
    const zone = $('obDefaultZoneName');
    const position = $('obDefaultPositionName');
    if(zone) zone.value = formData.defaultZoneName;
    if(position) position.value = formData.defaultPositionName;
    $('obAddEmpForm')?.remove?.();
    ['obStep1Error','obStep2Error','obStep3Error','obStep4Error'].forEach(clearError);
    renderEmployeeList();
  }

  function show(){
    ensureMarkup();
    const onboarding = $('onboarding');
    const login      = $('login');
    if(onboarding) onboarding.style.display = 'block';
    if(login)      login.style.display = 'none';
    document.body.classList.add('logged-out');
    // Reset form data and step on every open
    resetForm();
    goToStep(1);
    syncRestaurantSelect();
  }

  function hide(){
    const onboarding = $('onboarding');
    if(onboarding) onboarding.style.display = 'none';
    // Restore login via the proper auth flow so state is clean
    void window.Restogogo?.auth?.showRestaurantLogin?.();
  }

  function goToStep(n){
    currentStep = Math.max(1, Math.min(TOTAL_STEPS, n));

    // Update sidebar steps
    document.querySelectorAll('.onboarding-step').forEach(el => {
      const step = Number(el.dataset.step);
      el.classList.toggle('is-active',  step === currentStep);
      el.classList.toggle('is-done',    step < currentStep);
      el.classList.toggle('is-pending', step > currentStep);
    });

    // Update panels
    document.querySelectorAll('.onboarding-step-panel').forEach(el => {
      el.classList.toggle('is-active', Number(el.dataset.stepPanel) === currentStep);
    });

    // Auto-focus first input in new panel
    const panel = document.querySelector(`.onboarding-step-panel[data-step-panel="${currentStep}"]`);
    if(panel){
      const first = panel.querySelector('input:not([type=hidden])');
      setTimeout(() => first?.focus?.(), 80);
    }

    // Render step-4 summary when reached
    if(currentStep === 4) renderSummary();
  }

  /* ── Validation ─────────────────────────────────────────────────────── */

  function setError(id, msg){
    const el = $(id);
    if(el) el.textContent = msg;
  }
  function clearError(id){
    const el = $(id);
    if(el) el.textContent = '';
  }
  function emailLooksValid(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());}
  function resetSetupResult(){
    if(completedSetup){
      completedSetup = null;
      renderSummary();
    }
    const btn = $('obEnterApp');
    const label = btn?.querySelector('span');
    if(label) label.textContent = 'Enter restogogo';
    clearError('obStep4Error');
  }


  function validateStep1(){
    clearError('obStep1Error');
    const firstName = ($('obFirstName')?.value || '').trim();
    const lastName  = ($('obLastName')?.value  || '').trim();
    const email     = ($('obEmail')?.value     || '').trim();
    const password  = ($('obPassword')?.value  || '').trim();
    if(!firstName)  { setError('obStep1Error', 'Please enter your first name.'); return false; }
    if(!lastName)   { setError('obStep1Error', 'Please enter your last name.');  return false; }
    if(!emailLooksValid(email)){ setError('obStep1Error', 'Please enter a valid email address.'); return false; }
    if(password.length < 6){ setError('obStep1Error', 'Password must be at least 6 characters.'); return false; }
    Object.assign(formData, {firstName, lastName, email, password});
    return true;
  }

  function validateStep2(){
    clearError('obStep2Error');
    const restaurantName = normalizeSpaces($('obRestaurantName')?.value || '');
    const defaultZoneName = normalizeSpaces($('obDefaultZoneName')?.value || '');
    const defaultPositionName = normalizeSpaces($('obDefaultPositionName')?.value || '');
    if(!restaurantName){ setError('obStep2Error', 'Please enter your restaurant name.'); return false; }
    if(!defaultZoneName){ setError('obStep2Error', 'Please enter the first zone name.'); return false; }
    if(!defaultPositionName){ setError('obStep2Error', 'Please enter the default position name.'); return false; }
    Object.assign(formData, {
      restaurantName,
      city: normalizeSpaces($('obCity')?.value || ''),
      defaultZoneName,
      defaultPositionName,
    });
    return true;
  }

  function validateStep3(){
    clearError('obStep3Error');
    if(formData.employees.length === 0){
      setError('obStep3Error', 'Please add at least one employee to continue.');
      return false;
    }
    return true;
  }

  /* ── Step 3: Employee list ───────────────────────────────────────────── */

  function renderEmployeeList(){
    const list = $('obEmployeeList');
    if(!list) return;
    if(formData.employees.length === 0){
      list.innerHTML = '<p class="onboarding-employee-empty">No employees added yet.</p>';
      return;
    }
    list.innerHTML = formData.employees.map((emp, i) => `
      <div class="onboarding-employee-row">
        <div class="onboarding-employee-info">
          <strong>${esc(emp.name)}</strong>
          <small>Temporary PIN will be generated at setup.</small>
        </div>
        <button class="onboarding-remove-employee" data-testid="onboarding-remove-employee" data-emp-index="${i}" type="button" aria-label="Remove ${esc(emp.name)}">×</button>
      </div>
    `).join('');
    list.querySelectorAll('.onboarding-remove-employee').forEach(btn => {
      btn.addEventListener('click', () => {
        formData.employees.splice(Number(btn.dataset.empIndex), 1);
        resetSetupResult();
        renderEmployeeList();
        clearError('obStep3Error');
      });
    });
  }

  function showAddEmployeeDialog(){
    // Inline mini-form appended to the list area (no popup/modal).
    const list = $('obEmployeeList');
    if(!list || $('obAddEmpForm')) return;

    const form = document.createElement('div');
    form.id = 'obAddEmpForm';
    form.className = 'onboarding-add-emp-form';
    form.innerHTML = `
      <label class="brand-field">
        <span class="brand-field-label">Employee full name <span class="onboarding-required" aria-hidden="true">*</span></span>
        <span class="brand-field-control">
          <input id="obNewEmpName" data-testid="onboarding-new-employee-name" placeholder="First and last name" type="text" autocomplete="off"/>
        </span>
      </label>
      <p class="onboarding-inline-error" id="obNewEmpError" aria-live="polite"></p>
      <div class="onboarding-add-emp-actions">
        <button class="brand-secondary-button" id="obCancelEmp" data-testid="onboarding-cancel-employee" type="button">Cancel</button>
        <button class="brand-primary-button rs-primary-button" id="obConfirmEmp" data-testid="onboarding-confirm-employee" type="button">Add employee</button>
      </div>
    `;
    list.after(form);
    $('obAddEmpForm')?.querySelector('input')?.focus?.();

    $('obCancelEmp')?.addEventListener('click', () => form.remove());
    const confirm = () => {
      const name = normalizeSpaces($('obNewEmpName')?.value || '');
      const error = $('obNewEmpError');
      if(error) error.textContent = '';
      if(!name){ $('obNewEmpName')?.focus?.(); return; }
      if(name.split(' ').length < 2){
        if(error) error.textContent = 'Please enter first and last name.';
        $('obNewEmpName')?.focus?.();
        return;
      }
      if(formData.employees.some(employee => employee.name.toLowerCase() === name.toLowerCase())){
        if(error) error.textContent = 'This employee is already in the setup list.';
        $('obNewEmpName')?.focus?.();
        return;
      }
      formData.employees.push({ name });
      resetSetupResult();
      form.remove();
      renderEmployeeList();
      clearError('obStep3Error');
    };
    $('obConfirmEmp')?.addEventListener('click', confirm);
    $('obNewEmpName')?.addEventListener('keydown', e => { if(e.key === 'Enter') confirm(); });
  }

  /* ── Step 4: Summary ──────────────────────────────────────────────── */

  function renderSummary(){
    const el = $('obSummary');
    if(!el) return;
    el.innerHTML = `
      <div class="onboarding-summary-card">
        <div class="onboarding-summary-row">
          <span class="onboarding-summary-label">Owner</span>
          <span class="onboarding-summary-value">${esc(formData.firstName)} ${esc(formData.lastName)}</span>
        </div>
        <div class="onboarding-summary-row">
          <span class="onboarding-summary-label">Email</span>
          <span class="onboarding-summary-value">${esc(formData.email)}</span>
        </div>
        <div class="onboarding-summary-row">
          <span class="onboarding-summary-label">Restaurant</span>
          <span class="onboarding-summary-value">${esc(formData.restaurantName)}${formData.city ? ', '+esc(formData.city) : ''}</span>
        </div>
        <div class="onboarding-summary-row">
          <span class="onboarding-summary-label">Employees</span>
          <span class="onboarding-summary-value">${formData.employees.length} ${formData.employees.length === 1 ? 'employee' : 'employees'} added</span>
        </div>
        <div class="onboarding-summary-row">
          <span class="onboarding-summary-label">Defaults</span>
          <span class="onboarding-summary-value">${esc(formData.defaultZoneName)} zone, ${esc(formData.defaultPositionName)} position and 2 services created — customise in Restaurant settings</span>
        </div>
        ${completedSetup ? accessSummary(completedSetup) : ''}
      </div>
    `;
  }

  function accessSummary(result){
    const rows = Array.isArray(result?.access_credentials) ? result.access_credentials : [];
    if(!rows.length)return `<div class="onboarding-summary-row"><span class="onboarding-summary-label">Next step</span><span class="onboarding-summary-value">Open Team later to reset or manage employee access.</span></div>`;
    return `<div class="onboarding-access-summary">
      <strong>Temporary quick access</strong>
      <small>Share these first-use PINs once. Each person must choose a personal PIN before entering the app.</small>
      ${rows.map(row=>`<div class="onboarding-access-row"><span>${esc(row.display_name || 'Team member')}</span><code>${esc(row.login_name || '')}</code><b>${esc(row.temporary_pin || '')}</b></div>`).join('')}
    </div>`;
  }

  /* ── Enter app ────────────────────────────────────────────────────── */

  async function enterApp(){
    const btn = $('obEnterApp');
    const label = btn?.querySelector('span');
    const resetSubmitButton = () => {
      if(btn) btn.disabled = false;
      if(label) label.textContent = completedSetup ? 'Open workspace' : 'Enter restogogo';
    };
    if(btn) btn.disabled = true;
    if(label) label.textContent = 'Setting up…';
    clearError('obStep4Error');

    try{
      const step1Valid = validateStep1();
      if(!step1Valid){goToStep(1); resetSubmitButton(); return;}
      const step2Valid = validateStep2();
      if(!step2Valid){goToStep(2); resetSubmitButton(); return;}
      const step3Valid = validateStep3();
      if(!step3Valid){goToStep(3); resetSubmitButton(); return;}
      if(!window.RestogogoAuthService?.isEnabled?.()){
        throw new Error('Secure onboarding is not enabled for this build.');
      }
      if(completedSetup){
        const restaurantId = completedSetup?.restaurant_id || completedSetup?.restaurantId;
        if(!restaurantId)throw new Error('Restaurant setup completed but no workspace id was returned.');
        window.DataAdapter?.setWorkspaceId?.(restaurantId);
        if(label) label.textContent = 'Opening workspace…';
        await window.Restogogo?.auth?.enterAuthenticatedWorkspace?.(restaurantId);
        // Hide the onboarding overlay — enterApp() in app-shell only hides #login, not #onboarding.
        const onboardingEl = $('onboarding');
        if(onboardingEl) onboardingEl.style.display = 'none';
        return;
      }
      const result = await window.RestogogoAuthService.signUpOwnerAndSetup({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        restaurantName: formData.restaurantName,
        city: formData.city,
        defaultZoneName: formData.defaultZoneName,
        defaultPositionName: formData.defaultPositionName,
        employees: formData.employees
      });
      const restaurantId = result?.restaurant_id || result?.restaurantId;
      if(!restaurantId)throw new Error('Restaurant setup completed but no workspace id was returned.');
      completedSetup = result;
      renderSummary();
      if(btn) btn.disabled = false;
      if(label) label.textContent = 'Open workspace';
      return;
    }catch(error){
      resetSubmitButton();
      setError('obStep4Error', error?.message || 'Restaurant setup failed.');
    }
  }

  /* ── Sync restaurant select in employee tab ──────────────────────── */

  function syncRestaurantSelect(){
    const src  = $('emailLoginRestaurant');
    const dest = $('quickLoginRestaurant');
    if(!src || !dest) return;
    dest.innerHTML = src.innerHTML;
  }

  /* ── Local esc helper ────────────────────────────────────────────── */

  function normalizeSpaces(value=''){
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  const esc = window.RestogogoPrimitives.esc;

  /* ── Bind events ─────────────────────────────────────────────────── */

  function bind(){
    // Back to sign in
    $('onboardingBackToLogin')?.addEventListener('click', hide);

    // Next / Back buttons (delegated)
    document.querySelector('#onboarding')?.addEventListener('click', e => {
      const nextBtn = e.target.closest('[data-ob-next]');
      const backBtn = e.target.closest('[data-ob-back]');
      if(nextBtn){
        const target = Number(nextBtn.dataset.obNext);
        let valid = true;
        if(currentStep === 1) valid = validateStep1();
        if(currentStep === 2) valid = validateStep2();
        if(currentStep === 3) valid = validateStep3();
        if(valid) goToStep(target);
      }
      if(backBtn){
        goToStep(Number(backBtn.dataset.obBack));
      }
    });

    // Add employee
    $('obAddEmployee')?.addEventListener('click', showAddEmployeeDialog);

    // Enter app
    $('obEnterApp')?.addEventListener('click', () => void enterApp());

    // Clear step errors as soon as the user corrects fields. Step-4 result is
    // invalidated only when the setup input itself changes.
    ['obFirstName','obLastName','obEmail','obPassword'].forEach(id => {
      $(id)?.addEventListener('input', () => {clearError('obStep1Error'); resetSetupResult();});
    });
    ['obRestaurantName','obCity','obDefaultZoneName','obDefaultPositionName'].forEach(id => {
      $(id)?.addEventListener('input', () => {clearError('obStep2Error'); resetSetupResult();});
    });

    // Keep employee restaurant select in sync
    $('emailLoginRestaurant')?.addEventListener('change', syncRestaurantSelect);
  }

  ensureMarkup();
  bind();

  window.Restogogo = window.Restogogo || {};
  window.Restogogo.onboarding = Object.freeze({ show, hide, goToStep });
})();
