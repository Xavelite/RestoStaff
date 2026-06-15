/*
 * restogogo onboarding wizard.
 * Guided setup: owner -> restaurant -> zones -> job functions -> services -> assignments -> optional team/payroll -> launch.
 * The current setup RPC still persists the safe starter defaults; richer setup
 * choices are shown as onboarding intent and remain editable after launch.
 */
(function(){
  const $ = id => document.getElementById(id);

  let currentStep = 1;
  const TOTAL_STEPS = 8;
  let completedSetup = null;

  const formData = {
    firstName:'',
    lastName:'',
    email:'',
    password:'',
    passwordConfirm:'',
    restaurantName:'',
    city:'',
    zones:['Restaurant'],
    jobFunctions:['Staff'],
    services:{lunch:{start:'12:00',end:'15:00'}, evening:{start:'18:00',end:'23:00'}},
    assignments:[],
    employees:[]
  };

  function ensureMarkup(){
    window.RestogogoOnboardingTemplate?.render?.($('onboarding'));
  }

  function defaultZoneName(){return formData.zones[0] || 'Restaurant';}
  function defaultJobFunctionName(){return formData.jobFunctions[0] || 'Staff';}
  function normalizeSpaces(value=''){return String(value || '').trim().replace(/\s+/g, ' ');}
  const esc = window.RestogogoPrimitives.esc;

  function resetForm(){
    Object.assign(formData, {
      firstName:'',
      lastName:'',
      email:'',
      password:'',
      passwordConfirm:'',
      restaurantName:'',
      city:'',
      zones:['Restaurant'],
      jobFunctions:['Staff'],
      services:{lunch:{start:'12:00',end:'15:00'}, evening:{start:'18:00',end:'23:00'}},
      assignments:[],
      employees:[]
    });
    completedSetup = null;
    ['obFirstName','obLastName','obEmail','obPassword','obPasswordConfirm','obRestaurantName','obCity','obCustomZone','obCustomJobFunction'].forEach(id => {
      const el = $(id);
      if(el) el.value = '';
    });
    setValue('obLunchStart','12:00');
    setValue('obLunchEnd','15:00');
    setValue('obEveningStart','18:00');
    setValue('obEveningEnd','23:00');
    document.querySelectorAll('input[name="obZoneChoice"]').forEach(input => { input.checked = input.value === 'Restaurant'; });
    document.querySelectorAll('input[name="obJobFunctionChoice"]').forEach(input => { input.checked = input.value === 'Staff'; });
    $('obAddEmpForm')?.remove?.();
    clearAllErrors();
    syncChoiceState();
    renderAssignments();
    renderEmployeeList();
  }

  function setValue(id, value){
    const el = $(id);
    if(el) el.value = value;
  }

  function clearAllErrors(){
    ['obStep1Error','obStep2Error','obStep3Error','obStep4Error','obStep5Error','obStep6Error','obStep7Error','obStep8Error'].forEach(clearError);
  }

  function show(){
    ensureMarkup();
    const onboarding = $('onboarding');
    const login = $('login');
    if(onboarding) onboarding.style.display = 'block';
    if(login) login.style.display = 'none';
    document.body.classList.add('logged-out');
    resetForm();
    goToStep(1);
  }

  function hide(){
    const onboarding = $('onboarding');
    if(onboarding) onboarding.style.display = 'none';
    void window.Restogogo?.auth?.showRestaurantLogin?.();
  }

  function goToStep(n){
    currentStep = Math.max(1, Math.min(TOTAL_STEPS, n));
    document.querySelectorAll('.onboarding-step').forEach(el => {
      const step = Number(el.dataset.step);
      el.classList.toggle('is-active', step === currentStep);
      el.classList.toggle('is-done', step < currentStep);
      el.classList.toggle('is-pending', step > currentStep);
    });
    document.querySelectorAll('.onboarding-step-panel').forEach(el => {
      el.classList.toggle('is-active', Number(el.dataset.stepPanel) === currentStep);
    });
    syncChoiceState();
    if(currentStep === 6) renderAssignments();
    if(currentStep === 8) renderSummary();
    const panel = document.querySelector(`.onboarding-step-panel[data-step-panel="${currentStep}"]`);
    const first = panel?.querySelector('input:not([type=hidden]), select');
    setTimeout(() => first?.focus?.(), 80);
  }

  function setError(id, msg){
    const el = $(id);
    if(el) el.textContent = msg;
  }

  function clearError(id){
    const el = $(id);
    if(el) el.textContent = '';
  }

  function emailLooksValid(email){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function resetSetupResult(){
    if(completedSetup){
      completedSetup = null;
      renderSummary();
    }
    const label = $('obEnterApp')?.querySelector('span');
    if(label) label.textContent = 'Launch workspace';
    clearError('obStep8Error');
  }

  function selectedValues(name){
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(input => normalizeSpaces(input.value)).filter(Boolean);
  }

  function uniqueNames(values){
    const seen = new Set();
    return values.map(normalizeSpaces).filter(value => {
      const key = value.toLowerCase();
      if(!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function syncChoiceState(){
    formData.zones = uniqueNames(selectedValues('obZoneChoice'));
    formData.jobFunctions = uniqueNames(selectedValues('obJobFunctionChoice'));
    formData.services = {
      lunch:{start:$('obLunchStart')?.value || '12:00', end:$('obLunchEnd')?.value || '15:00'},
      evening:{start:$('obEveningStart')?.value || '18:00', end:$('obEveningEnd')?.value || '23:00'}
    };
    setText('obZonePreview', formData.zones.length ? formData.zones.join(', ') : 'None selected');
    setText('obJobFunctionPreview', formData.jobFunctions.length ? formData.jobFunctions.join(', ') : 'None selected');
    normalizeAssignments();
  }

  function setText(id, text){
    const el = $(id);
    if(el) el.textContent = text;
  }

  function normalizeAssignments(){
    const existing = new Map(formData.assignments.map(item => [item.zone, item.functions || []]));
    formData.assignments = formData.zones.map((zone, index) => {
      const selected = existing.get(zone);
      const fallback = index === 0 ? [defaultJobFunctionName()] : [];
      return {zone, functions:uniqueNames((selected && selected.length ? selected : fallback).filter(name => formData.jobFunctions.includes(name)))};
    });
  }

  function renderAssignments(){
    syncChoiceState();
    const list = $('obAssignmentList');
    if(!list) return;
    list.replaceChildren(...formData.assignments.map((assignment, index) => {
      const row = document.createElement('section');
      const zoneCol = document.createElement('div');
      const zoneName = document.createElement('strong');
      const zoneMeta = document.createElement('span');
      const functionCol = document.createElement('div');
      row.className = 'onboarding-assignment-row';
      row.dataset.assignmentZone = assignment.zone;
      zoneCol.className = 'onboarding-assignment-zone';
      zoneName.textContent = assignment.zone;
      zoneMeta.textContent = index === 0 ? 'Starter zone' : 'Optional zone';
      zoneCol.replaceChildren(zoneName, zoneMeta);
      functionCol.className = 'onboarding-assignment-functions';
      functionCol.replaceChildren(...formData.jobFunctions.map(fn => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        const text = document.createElement('span');
        label.className = 'onboarding-choice onboarding-choice--compact';
        input.type = 'checkbox';
        input.dataset.assignmentFunction = fn;
        input.dataset.assignmentZone = assignment.zone;
        input.checked = assignment.functions.includes(fn);
        text.textContent = fn;
        label.replaceChildren(input, text);
        return label;
      }));
      row.replaceChildren(zoneCol, functionCol);
      return row;
    }));
  }

  function validateStep1(){
    clearError('obStep1Error');
    const firstName = normalizeSpaces($('obFirstName')?.value || '');
    const lastName = normalizeSpaces($('obLastName')?.value || '');
    const email = normalizeSpaces($('obEmail')?.value || '');
    const password = ($('obPassword')?.value || '').trim();
    const passwordConfirm = ($('obPasswordConfirm')?.value || '').trim();
    if(!firstName){ setError('obStep1Error', 'Please enter your first name.'); return false; }
    if(!lastName){ setError('obStep1Error', 'Please enter your last name.'); return false; }
    if(!emailLooksValid(email)){ setError('obStep1Error', 'Please enter a valid email address.'); return false; }
    if(password.length < 6){ setError('obStep1Error', 'Password must be at least 6 characters.'); return false; }
    if(password !== passwordConfirm){ setError('obStep1Error', 'Passwords do not match.'); return false; }
    Object.assign(formData, {firstName, lastName, email, password, passwordConfirm});
    return true;
  }

  function validateStep2(){
    clearError('obStep2Error');
    const restaurantName = normalizeSpaces($('obRestaurantName')?.value || '');
    const city = normalizeSpaces($('obCity')?.value || '');
    if(!restaurantName){ setError('obStep2Error', 'Please enter your restaurant name.'); return false; }
    Object.assign(formData, {restaurantName, city});
    return true;
  }

  function validateStep3(){
    clearError('obStep3Error');
    syncChoiceState();
    if(!formData.zones.length){ setError('obStep3Error', 'Select at least one zone.'); return false; }
    return true;
  }

  function validateStep4(){
    clearError('obStep4Error');
    syncChoiceState();
    if(!formData.jobFunctions.length){ setError('obStep4Error', 'Select at least one job function.'); return false; }
    return true;
  }

  function validateStep5(){
    clearError('obStep5Error');
    syncChoiceState();
    const valid = Object.values(formData.services).every(service => service.start && service.end && service.start < service.end);
    if(!valid){ setError('obStep5Error', 'Each service needs a valid start and end time.'); return false; }
    return true;
  }

  function validateStep6(){
    clearError('obStep6Error');
    collectAssignments();
    if(!formData.assignments.some(item => item.functions.length)){
      setError('obStep6Error', 'Assign at least one job function to one zone.');
      return false;
    }
    return true;
  }

  function validateStep7(){
    clearError('obStep7Error');
    return true;
  }

  function collectAssignments(){
    normalizeAssignments();
    formData.assignments = formData.assignments.map(assignment => {
      const selector = `input[data-assignment-zone="${cssEscape(assignment.zone)}"]:checked`;
      const functions = Array.from(document.querySelectorAll(selector)).map(input => input.dataset.assignmentFunction).filter(Boolean);
      return {...assignment, functions:uniqueNames(functions)};
    });
  }

  function cssEscape(value){
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function addChoice(name, inputId, errorId){
    const input = $(inputId);
    const value = normalizeSpaces(input?.value || '');
    if(!value){ input?.focus?.(); return; }
    const list = document.querySelector(`input[name="${name}"]`)?.closest('.onboarding-choice-grid');
    if(!list) return;
    const duplicate = Array.from(document.querySelectorAll(`input[name="${name}"]`)).some(item => item.value.toLowerCase() === value.toLowerCase());
    if(duplicate){
      setError(errorId, 'This item is already selected or available.');
      input?.focus?.();
      return;
    }
    const label = document.createElement('label');
    label.className = 'onboarding-choice';
    label.innerHTML = `<input type="checkbox" name="${name}" value="${esc(value)}" checked/><span>${esc(value)}</span>`;
    list.appendChild(label);
    input.value = '';
    clearError(errorId);
    syncChoiceState();
    resetSetupResult();
  }

  function renderEmployeeList(){
    const list = $('obEmployeeList');
    if(!list) return;
    if(!formData.employees.length){
      const empty = document.createElement('div');
      const title = document.createElement('strong');
      const text = document.createElement('span');
      empty.className = 'onboarding-employee-empty';
      title.textContent = 'No employees added yet.';
      text.textContent = 'Skip this step if you prefer to build Team after launch.';
      empty.replaceChildren(title, text);
      list.replaceChildren(empty);
      return;
    }
    list.innerHTML = formData.employees.map((emp, i) => `
      <div class="onboarding-employee-row">
        <div class="onboarding-employee-info">
          <strong>${esc(emp.name)}</strong>
          <small>${esc(emp.jobFunction || defaultJobFunctionName())}${emp.payroll?.enabled ? ` - ${esc(emp.payroll.contractType || 'Contract')} - ${esc(emp.payroll.weeklyHours || '')}h/week` : ' - payroll later'}</small>
        </div>
        <button class="onboarding-remove-employee" data-testid="onboarding-remove-employee" data-emp-index="${i}" type="button" aria-label="Remove ${esc(emp.name)}">x</button>
      </div>
    `).join('');
    list.querySelectorAll('.onboarding-remove-employee').forEach(btn => {
      btn.addEventListener('click', () => {
        formData.employees.splice(Number(btn.dataset.empIndex), 1);
        resetSetupResult();
        renderEmployeeList();
      });
    });
  }

  function jobFunctionOptions(selected=''){
    return formData.jobFunctions.map(name => `<option value="${esc(name)}" ${name === selected ? 'selected' : ''}>${esc(name)}</option>`).join('');
  }

  function showAddEmployeeDialog(){
    const list = $('obEmployeeList');
    if(!list || $('obAddEmpForm')) return;
    syncChoiceState();
    const form = document.createElement('div');
    form.id = 'obAddEmpForm';
    form.className = 'onboarding-add-emp-form';
    form.innerHTML = `
      <div class="onboarding-form-row">
        <label class="brand-field"><span class="brand-field-label">First name <span class="onboarding-required">*</span></span><span class="brand-field-control"><input id="obNewEmpFirstName" data-testid="onboarding-new-employee-first-name" placeholder="First name" type="text" autocomplete="off"/></span></label>
        <label class="brand-field"><span class="brand-field-label">Last name <span class="onboarding-required">*</span></span><span class="brand-field-control"><input id="obNewEmpLastName" data-testid="onboarding-new-employee-last-name" placeholder="Last name" type="text" autocomplete="off"/></span></label>
      </div>
      <div class="onboarding-form-row">
        <label class="brand-field"><span class="brand-field-label">Job function <span class="onboarding-optional">Optional</span></span><span class="brand-field-control"><select id="obNewEmpJobFunction">${jobFunctionOptions(defaultJobFunctionName())}</select></span></label>
        <label class="brand-field"><span class="brand-field-label">Phone <span class="onboarding-optional">Optional</span></span><span class="brand-field-control"><input id="obNewEmpPhone" placeholder="Contact number" type="tel" autocomplete="off"/></span></label>
      </div>
      <div class="onboarding-payroll-mini" id="obPayrollMini">
        <div class="onboarding-form-row">
          <label class="brand-field"><span class="brand-field-label">Contract type</span><span class="brand-field-control"><input id="obNewEmpContractType" placeholder="Full-time" type="text"/></span></label>
          <label class="brand-field"><span class="brand-field-label">Weekly hours</span><span class="brand-field-control"><input id="obNewEmpWeeklyHours" min="0" step="0.5" placeholder="38" type="number"/></span></label>
        </div>
        <label class="brand-field"><span class="brand-field-label">Hourly wage rate</span><span class="brand-field-control"><input id="obNewEmpHourlyRate" min="0" step="0.01" placeholder="Optional" type="number"/></span></label>
      </div>
      <p class="onboarding-inline-error" id="obNewEmpError" aria-live="polite"></p>
      <div class="onboarding-add-emp-actions"><button class="brand-secondary-button" id="obCancelEmp" type="button">Cancel</button><button class="brand-primary-button rs-primary-button" id="obConfirmEmp" data-testid="onboarding-confirm-employee" type="button">Add employee</button></div>
    `;
    list.after(form);
    $('obNewEmpFirstName')?.focus?.();
    $('obCancelEmp')?.addEventListener('click', () => form.remove());
    const confirm = () => {
      const firstName = normalizeSpaces($('obNewEmpFirstName')?.value || '');
      const lastName = normalizeSpaces($('obNewEmpLastName')?.value || '');
      const error = $('obNewEmpError');
      if(error) error.textContent = '';
      if(!firstName || !lastName){
        if(error) error.textContent = 'Please enter first and last name.';
        (!firstName ? $('obNewEmpFirstName') : $('obNewEmpLastName'))?.focus?.();
        return;
      }
      const name = `${firstName} ${lastName}`;
      if(formData.employees.some(employee => employee.name.toLowerCase() === name.toLowerCase())){
        if(error) error.textContent = 'This employee is already in the setup list.';
        return;
      }
      const contractType = normalizeSpaces($('obNewEmpContractType')?.value || '');
      const weeklyHours = normalizeSpaces($('obNewEmpWeeklyHours')?.value || '');
      const hourlyWageRate = normalizeSpaces($('obNewEmpHourlyRate')?.value || '');
      const hasPayroll = !!(contractType || weeklyHours || hourlyWageRate);
      formData.employees.push({
        firstName,
        lastName,
        name,
        jobFunction:$('obNewEmpJobFunction')?.value || defaultJobFunctionName(),
        phone:normalizeSpaces($('obNewEmpPhone')?.value || ''),
        payroll:hasPayroll ? {
          enabled:true,
          contractType:contractType || 'Full-time',
          weeklyHours,
          hourlyWageRate
        } : {enabled:false}
      });
      resetSetupResult();
      form.remove();
      renderEmployeeList();
    };
    $('obConfirmEmp')?.addEventListener('click', confirm);
    form.addEventListener('keydown', e => {
      if(e.key === 'Enter' && !e.target.matches('textarea')) confirm();
    });
  }

  function renderSummary(){
    const el = $('obSummary');
    if(!el) return;
    syncChoiceState();
    collectAssignments();
    const created = Boolean(completedSetup);
    const teamSummary = formData.employees.length
      ? `${formData.employees.length} optional ${formData.employees.length === 1 ? 'employee' : 'employees'} added`
      : 'No employees added yet';
    const serviceSummary = `Lunch ${formData.services.lunch.start}-${formData.services.lunch.end}, Evening ${formData.services.evening.start}-${formData.services.evening.end}`;
    const assignmentSummary = formData.assignments.map(item => `${item.zone}: ${item.functions.join(', ') || 'later'}`).join(' | ');
    const payrollExamples = formData.employees.filter(emp => emp.payroll?.enabled).length;
    el.innerHTML = `
      <div class="onboarding-summary-card ${created ? 'is-created' : ''}">
        <div class="onboarding-summary-hero"><span class="onboarding-summary-mark" aria-hidden="true">${created ? 'OK' : 'GO'}</span><div><strong>${created ? 'Workspace created' : 'Ready to create workspace'}</strong><span>${created ? 'Open the app and continue setup inside Restaurant and Team.' : 'Review the essentials below. Nothing is created until you launch.'}</span></div></div>
        <div class="onboarding-summary-row"><span class="onboarding-summary-label">Owner</span><span class="onboarding-summary-value">${esc(formData.firstName)} ${esc(formData.lastName)} - ${esc(formData.email)}</span></div>
        <div class="onboarding-summary-row"><span class="onboarding-summary-label">Restaurant</span><span class="onboarding-summary-value">${esc(formData.restaurantName)}${formData.city ? ', '+esc(formData.city) : ''}</span></div>
        <div class="onboarding-summary-row"><span class="onboarding-summary-label">Zones</span><span class="onboarding-summary-value">${esc(formData.zones.join(', '))}</span></div>
        <div class="onboarding-summary-row"><span class="onboarding-summary-label">Functions</span><span class="onboarding-summary-value">${esc(formData.jobFunctions.join(', '))}</span></div>
        <div class="onboarding-summary-row"><span class="onboarding-summary-label">Services</span><span class="onboarding-summary-value">${esc(serviceSummary)}</span></div>
        <div class="onboarding-summary-row"><span class="onboarding-summary-label">Assignments</span><span class="onboarding-summary-value">${esc(assignmentSummary)}</span></div>
        <div class="onboarding-summary-row"><span class="onboarding-summary-label">Team</span><span class="onboarding-summary-value">${esc(teamSummary)}${payrollExamples ? ` - ${payrollExamples} payroll example${payrollExamples === 1 ? '' : 's'}` : ''}</span></div>
        <div class="onboarding-summary-row"><span class="onboarding-summary-label">Later</span><span class="onboarding-summary-value">Opening days, detailed coverage, contracts, payroll data and staff invites stay editable after launch.</span></div>
        ${created ? accessSummary() : ''}
      </div>`;
  }

  function accessSummary(){
    return '<div class="onboarding-summary-row"><span class="onboarding-summary-label">Next step</span><span class="onboarding-summary-value">Open Restaurant setup, then invite staff by email from Team when their profile is ready.</span></div>';
  }

  async function enterApp(){
    const btn = $('obEnterApp');
    const label = btn?.querySelector('span');
    const resetSubmitButton = () => {
      if(btn) btn.disabled = false;
      if(label) label.textContent = completedSetup ? 'Open workspace' : 'Launch workspace';
    };
    if(btn) btn.disabled = true;
    if(label) label.textContent = 'Setting up...';
    clearError('obStep8Error');
    try{
      if(!validateStep1()){ goToStep(1); resetSubmitButton(); return; }
      if(!validateStep2()){ goToStep(2); resetSubmitButton(); return; }
      if(!validateStep3()){ goToStep(3); resetSubmitButton(); return; }
      if(!validateStep4()){ goToStep(4); resetSubmitButton(); return; }
      if(!validateStep5()){ goToStep(5); resetSubmitButton(); return; }
      if(!validateStep6()){ goToStep(6); resetSubmitButton(); return; }
      if(!validateStep7()){ goToStep(7); resetSubmitButton(); return; }
      if(!window.RestogogoAuthService?.isEnabled?.()) throw new Error('Secure onboarding is not enabled for this build.');
      if(completedSetup){
        const restaurantId = completedSetup?.restaurant_id || completedSetup?.restaurantId;
        if(!restaurantId) throw new Error('Restaurant setup completed but no workspace id was returned.');
        window.DataAdapter?.setWorkspaceId?.(restaurantId);
        if(label) label.textContent = 'Opening workspace...';
        await window.Restogogo?.auth?.enterAuthenticatedWorkspace?.(restaurantId);
        const onboardingEl = $('onboarding');
        if(onboardingEl) onboardingEl.style.display = 'none';
        return;
      }
      const result = await window.RestogogoAuthService.signUpOwnerAndSetup({
        firstName:formData.firstName,
        lastName:formData.lastName,
        email:formData.email,
        password:formData.password,
        restaurantName:formData.restaurantName,
        city:formData.city,
        defaultZoneName:defaultZoneName(),
        defaultJobFunctionName:defaultJobFunctionName(),
        employees:formData.employees.map(employee => ({name:employee.name}))
      });
      const restaurantId = result?.restaurant_id || result?.restaurantId;
      if(!restaurantId) throw new Error('Restaurant setup completed but no workspace id was returned.');
      completedSetup = result;
      renderSummary();
      if(btn) btn.disabled = false;
      if(label) label.textContent = 'Open workspace';
    }catch(error){
      resetSubmitButton();
      setError('obStep8Error', error?.message || 'Restaurant setup failed.');
    }
  }

  function validateCurrentStep(){
    if(currentStep === 1) return validateStep1();
    if(currentStep === 2) return validateStep2();
    if(currentStep === 3) return validateStep3();
    if(currentStep === 4) return validateStep4();
    if(currentStep === 5) return validateStep5();
    if(currentStep === 6) return validateStep6();
    if(currentStep === 7) return validateStep7();
    return true;
  }

  function bind(){
    $('onboardingBackToLogin')?.addEventListener('click', hide);
    document.querySelector('#onboarding')?.addEventListener('click', e => {
      const nextBtn = e.target.closest('[data-ob-next]');
      const backBtn = e.target.closest('[data-ob-back]');
      if(nextBtn){
        const target = Number(nextBtn.dataset.obNext);
        if(validateCurrentStep()) goToStep(target);
      }
      if(backBtn) goToStep(Number(backBtn.dataset.obBack));
    });
    $('obAddZone')?.addEventListener('click', () => addChoice('obZoneChoice', 'obCustomZone', 'obStep3Error'));
    $('obAddJobFunction')?.addEventListener('click', () => addChoice('obJobFunctionChoice', 'obCustomJobFunction', 'obStep4Error'));
    $('obAddEmployee')?.addEventListener('click', showAddEmployeeDialog);
    $('obEnterApp')?.addEventListener('click', () => void enterApp());
    ['obFirstName','obLastName','obEmail','obPassword','obPasswordConfirm'].forEach(id => $(id)?.addEventListener('input', () => { clearError('obStep1Error'); resetSetupResult(); }));
    ['obRestaurantName','obCity'].forEach(id => $(id)?.addEventListener('input', () => { clearError('obStep2Error'); resetSetupResult(); }));
    ['obLunchStart','obLunchEnd','obEveningStart','obEveningEnd'].forEach(id => $(id)?.addEventListener('input', () => { clearError('obStep5Error'); syncChoiceState(); resetSetupResult(); }));
    ['obCustomZone','obCustomJobFunction'].forEach(id => $(id)?.addEventListener('keydown', e => {
      if(e.key !== 'Enter') return;
      e.preventDefault();
      if(id === 'obCustomZone') addChoice('obZoneChoice', 'obCustomZone', 'obStep3Error');
      if(id === 'obCustomJobFunction') addChoice('obJobFunctionChoice', 'obCustomJobFunction', 'obStep4Error');
    }));
    document.querySelector('#onboarding')?.addEventListener('change', e => {
      if(e.target.matches('input[name="obZoneChoice"], input[name="obJobFunctionChoice"]')){
        clearError('obStep3Error');
        clearError('obStep4Error');
        syncChoiceState();
        renderAssignments();
        resetSetupResult();
      }
      if(e.target.matches('[data-assignment-function]')){
        clearError('obStep6Error');
        collectAssignments();
        resetSetupResult();
      }
    });
  }

  ensureMarkup();
  bind();

  window.Restogogo = window.Restogogo || {};
  window.Restogogo.onboarding = Object.freeze({show, hide, goToStep});
})();
