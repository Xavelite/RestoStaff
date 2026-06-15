/* restogogo onboarding template.
 * Owns wizard markup so index.html stays an app shell.
 */
(function(){
  const icon = {
    user:'<svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>',
    mail:'<svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>',
    lock:'<svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    check:'<svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    fork:'<svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><path d="M7 3v6a4 4 0 0 0 4 4h6"/><path d="M17 7v12"/><path d="M13 15l4 4 4-4"/></svg>',
    pin:'<svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    zone:'<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 9l9-6 9 6"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
    role:'<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>',
    link:'<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/></svg>',
    clock:'<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    people:'<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>',
    plus:'<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'
  };

  function choice(name, value, label, checked){
    return `<label class="onboarding-choice"><input type="checkbox" name="${name}" value="${value}" ${checked ? 'checked' : ''}/><span>${label}</span></label>`;
  }

  const MARKUP = `
  <div class="brand-backdrop" aria-hidden="true"></div>
  <main class="onboarding-shell">
    <header class="onboarding-topbar">
      <button class="brand-soft-link onboarding-back-to-login" id="onboardingBackToLogin" data-testid="onboarding-back-to-login" type="button">Back to sign in</button>
      <img alt="restogogo" class="onboarding-logo" src="assets/img/brand/restogogo_logo_transparent.png"/>
      <span class="onboarding-support">Need help? Contact support</span>
    </header>

    <section class="onboarding-workspace" aria-label="Restaurant setup wizard">
      <ol class="onboarding-steps" id="onboardingSteps" aria-label="Setup steps">
        <li class="onboarding-step is-active" data-step="1"><span class="onboarding-step-num" aria-hidden="true">1</span><span class="onboarding-step-text"><span class="onboarding-step-label">Account</span><small>Owner</small></span></li>
        <li class="onboarding-step" data-step="2"><span class="onboarding-step-num" aria-hidden="true">2</span><span class="onboarding-step-text"><span class="onboarding-step-label">Restaurant</span><small>Identity</small></span></li>
        <li class="onboarding-step" data-step="3"><span class="onboarding-step-num" aria-hidden="true">3</span><span class="onboarding-step-text"><span class="onboarding-step-label">Zones</span><small>Areas</small></span></li>
        <li class="onboarding-step" data-step="4"><span class="onboarding-step-num" aria-hidden="true">4</span><span class="onboarding-step-text"><span class="onboarding-step-label">Functions</span><small>Roles</small></span></li>
        <li class="onboarding-step" data-step="5"><span class="onboarding-step-num" aria-hidden="true">5</span><span class="onboarding-step-text"><span class="onboarding-step-label">Services</span><small>Hours</small></span></li>
        <li class="onboarding-step" data-step="6"><span class="onboarding-step-num" aria-hidden="true">6</span><span class="onboarding-step-text"><span class="onboarding-step-label">Assign</span><small>Coverage</small></span></li>
        <li class="onboarding-step" data-step="7"><span class="onboarding-step-num" aria-hidden="true">7</span><span class="onboarding-step-text"><span class="onboarding-step-label">Team</span><small>Optional</small></span></li>
        <li class="onboarding-step" data-step="8"><span class="onboarding-step-num" aria-hidden="true">8</span><span class="onboarding-step-text"><span class="onboarding-step-label">Review</span><small>Launch</small></span></li>
      </ol>

      <div class="onboarding-stage">
        <div class="onboarding-content" id="onboardingContent">
          <div class="onboarding-step-panel is-active" data-step-panel="1">
            <header class="onboarding-step-head"><p class="onboarding-kicker">Step 1 of 8</p><h1>Create your account</h1><p class="onboarding-step-desc">This owner account signs into the workspace with email and password only.</p></header>
            <div class="onboarding-form">
              <div class="onboarding-form-row">
                <label class="brand-field"><span class="brand-field-label">First name <span class="onboarding-required">*</span></span><span class="brand-field-control">${icon.user}<input autocomplete="given-name" id="obFirstName" data-testid="onboarding-first-name" placeholder="Your first name" type="text"/></span></label>
                <label class="brand-field"><span class="brand-field-label">Last name <span class="onboarding-required">*</span></span><span class="brand-field-control">${icon.user}<input autocomplete="family-name" id="obLastName" data-testid="onboarding-last-name" placeholder="Your last name" type="text"/></span></label>
              </div>
              <label class="brand-field"><span class="brand-field-label">Email address <span class="onboarding-required">*</span></span><span class="brand-field-control">${icon.mail}<input autocomplete="email" id="obEmail" data-testid="onboarding-email" placeholder="owner@restaurant.com" type="email"/></span></label>
              <div class="onboarding-form-row">
                <label class="brand-field"><span class="brand-field-label">Password <span class="onboarding-required">*</span></span><span class="brand-field-control">${icon.lock}<input autocomplete="new-password" id="obPassword" data-testid="onboarding-password" minlength="6" placeholder="At least 6 characters" type="password"/></span></label>
                <label class="brand-field"><span class="brand-field-label">Confirm password <span class="onboarding-required">*</span></span><span class="brand-field-control">${icon.check}<input autocomplete="new-password" id="obPasswordConfirm" data-testid="onboarding-password-confirm" minlength="6" placeholder="Repeat password" type="password"/></span></label>
              </div>
            </div>
            <p class="onboarding-field-error" id="obStep1Error" aria-live="polite"></p>
            <div class="onboarding-actions"><button class="brand-primary-button rs-primary-button" data-ob-next="2" data-testid="onboarding-step1-next" type="button"><span>Continue</span><span class="brand-login-arrow" aria-hidden="true">-></span></button></div>
          </div>

          <div class="onboarding-step-panel" data-step-panel="2">
            <header class="onboarding-step-head"><p class="onboarding-kicker">Step 2 of 8</p><h1>Name the restaurant</h1><p class="onboarding-step-desc">Keep this light. Legal, payroll and detailed contact data belong inside Restaurant setup after launch.</p></header>
            <div class="onboarding-form">
              <label class="brand-field"><span class="brand-field-label">Restaurant name <span class="onboarding-required">*</span></span><span class="brand-field-control">${icon.fork}<input autocomplete="organization" id="obRestaurantName" data-testid="onboarding-restaurant-name" placeholder="e.g. The Garden Bistro" type="text"/></span></label>
              <label class="brand-field"><span class="brand-field-label">City <span class="onboarding-optional">Optional</span></span><span class="brand-field-control">${icon.pin}<input autocomplete="address-level2" id="obCity" data-testid="onboarding-city" placeholder="City" type="text"/></span></label>
            </div>
            <p class="onboarding-field-error" id="obStep2Error" aria-live="polite"></p>
            <div class="onboarding-actions"><button class="brand-secondary-button onboarding-prev" data-ob-back="1" type="button">Back</button><button class="brand-primary-button rs-primary-button" data-ob-next="3" data-testid="onboarding-step2-next" type="button"><span>Continue</span><span class="brand-login-arrow" aria-hidden="true">-></span></button></div>
          </div>

          <div class="onboarding-step-panel" data-step-panel="3">
            <header class="onboarding-step-head"><p class="onboarding-kicker">Step 3 of 8</p><h1>Choose your zones</h1><p class="onboarding-step-desc">Select the areas you already know. The first selected zone becomes the starter zone.</p></header>
            <div class="onboarding-choice-panel">
              <div class="onboarding-card-head"><span class="onboarding-card-icon" aria-hidden="true">${icon.zone}</span><div><h2>Restaurant areas</h2><p>Pick one or more. Keep it simple for launch.</p></div></div>
              <div class="onboarding-choice-grid" id="obZoneChoices">${choice('obZoneChoice','Restaurant','Restaurant',true)}${choice('obZoneChoice','Bar','Bar',false)}${choice('obZoneChoice','Kitchen','Kitchen',false)}${choice('obZoneChoice','Terrace','Terrace',false)}${choice('obZoneChoice','Takeaway','Takeaway',false)}${choice('obZoneChoice','Events','Events',false)}</div>
              <div class="onboarding-inline-add"><label class="brand-field"><span class="brand-field-label">Custom zone <span class="onboarding-optional">Optional</span></span><span class="brand-field-control"><input id="obCustomZone" data-testid="onboarding-custom-zone" placeholder="e.g. Rooftop" type="text"/></span></label><button class="brand-secondary-button" id="obAddZone" data-testid="onboarding-add-zone" type="button">Add zone</button></div>
              <p class="onboarding-setup-note">Selected now: <strong id="obZonePreview">Restaurant</strong></p>
            </div>
            <p class="onboarding-field-error" id="obStep3Error" aria-live="polite"></p>
            <div class="onboarding-actions"><button class="brand-secondary-button onboarding-prev" data-ob-back="2" type="button">Back</button><button class="brand-primary-button rs-primary-button" data-ob-next="4" data-testid="onboarding-step3-next" type="button"><span>Continue</span><span class="brand-login-arrow" aria-hidden="true">-></span></button></div>
          </div>

          <div class="onboarding-step-panel" data-step-panel="4">
            <header class="onboarding-step-head"><p class="onboarding-kicker">Step 4 of 8</p><h1>Choose job functions</h1><p class="onboarding-step-desc">Select the roles your team uses. The first selected job function becomes the starter function.</p></header>
            <div class="onboarding-choice-panel">
              <div class="onboarding-card-head"><span class="onboarding-card-icon" aria-hidden="true">${icon.role}</span><div><h2>Operational roles</h2><p>Use broad names now; contracts and payroll details come later.</p></div></div>
              <div class="onboarding-choice-grid" id="obJobFunctionChoices">${choice('obJobFunctionChoice','Staff','Staff',true)}${choice('obJobFunctionChoice','Server','Server',false)}${choice('obJobFunctionChoice','Cook','Cook',false)}${choice('obJobFunctionChoice','Manager','Manager',false)}${choice('obJobFunctionChoice','Dishwasher','Dishwasher',false)}${choice('obJobFunctionChoice','Runner','Runner',false)}</div>
              <div class="onboarding-inline-add"><label class="brand-field"><span class="brand-field-label">Custom job function <span class="onboarding-optional">Optional</span></span><span class="brand-field-control"><input id="obCustomJobFunction" data-testid="onboarding-custom-job-function" placeholder="e.g. Bartender" type="text"/></span></label><button class="brand-secondary-button" id="obAddJobFunction" data-testid="onboarding-add-job-function" type="button">Add function</button></div>
              <p class="onboarding-setup-note">Selected now: <strong id="obJobFunctionPreview">Staff</strong></p>
            </div>
            <p class="onboarding-field-error" id="obStep4Error" aria-live="polite"></p>
            <div class="onboarding-actions"><button class="brand-secondary-button onboarding-prev" data-ob-back="3" type="button">Back</button><button class="brand-primary-button rs-primary-button" data-ob-next="5" data-testid="onboarding-step4-next" type="button"><span>Continue</span><span class="brand-login-arrow" aria-hidden="true">-></span></button></div>
          </div>

          <div class="onboarding-step-panel" data-step-panel="5">
            <header class="onboarding-step-head"><p class="onboarding-kicker">Step 5 of 8</p><h1>Set service hours</h1><p class="onboarding-step-desc">Add the first lunch and evening windows. You can refine opening days and exceptions in Restaurant setup.</p></header>
            <div class="onboarding-service-grid">
              <section class="onboarding-service-row"><div class="onboarding-card-head"><span class="onboarding-card-icon" aria-hidden="true">${icon.clock}</span><div><h2>Lunch</h2><p>Main daytime service.</p></div></div><div class="onboarding-form-row"><label class="brand-field"><span class="brand-field-label">Start</span><span class="brand-field-control"><input id="obLunchStart" type="time" value="12:00"/></span></label><label class="brand-field"><span class="brand-field-label">End</span><span class="brand-field-control"><input id="obLunchEnd" type="time" value="15:00"/></span></label></div></section>
              <section class="onboarding-service-row"><div class="onboarding-card-head"><span class="onboarding-card-icon" aria-hidden="true">${icon.clock}</span><div><h2>Evening</h2><p>Main dinner service.</p></div></div><div class="onboarding-form-row"><label class="brand-field"><span class="brand-field-label">Start</span><span class="brand-field-control"><input id="obEveningStart" type="time" value="18:00"/></span></label><label class="brand-field"><span class="brand-field-label">End</span><span class="brand-field-control"><input id="obEveningEnd" type="time" value="23:00"/></span></label></div></section>
            </div>
            <p class="onboarding-field-error" id="obStep5Error" aria-live="polite"></p>
            <div class="onboarding-actions"><button class="brand-secondary-button onboarding-prev" data-ob-back="4" type="button">Back</button><button class="brand-primary-button rs-primary-button" data-ob-next="6" data-testid="onboarding-step5-next" type="button"><span>Continue</span><span class="brand-login-arrow" aria-hidden="true">-></span></button></div>
          </div>

          <div class="onboarding-step-panel" data-step-panel="6">
            <header class="onboarding-step-head"><p class="onboarding-kicker">Step 6 of 8</p><h1>Assign roles to zones</h1><p class="onboarding-step-desc">Create a simple starter coverage map so the restaurant understands how zones and job functions work together.</p></header>
            <div class="onboarding-link-panel">
              <div class="onboarding-card-head"><span class="onboarding-card-icon" aria-hidden="true">${icon.link}</span><div><h2>Starter coverage</h2><p>Choose the job functions normally used in each selected zone.</p></div></div>
              <div class="onboarding-assignment-list" id="obAssignmentList" data-testid="onboarding-assignment-list"></div>
              <p class="onboarding-setup-note">This is saved as onboarding intent for now. Detailed coverage rules remain in Restaurant and Planning setup.</p>
            </div>
            <p class="onboarding-field-error" id="obStep6Error" aria-live="polite"></p>
            <div class="onboarding-actions"><button class="brand-secondary-button onboarding-prev" data-ob-back="5" type="button">Back</button><button class="brand-primary-button rs-primary-button" data-ob-next="7" data-testid="onboarding-step6-next" type="button"><span>Continue</span><span class="brand-login-arrow" aria-hidden="true">-></span></button></div>
          </div>

          <div class="onboarding-step-panel" data-step-panel="7">
            <header class="onboarding-step-head"><p class="onboarding-kicker">Step 7 of 8</p><h1>Add first employees</h1><p class="onboarding-step-desc">Optional. Add a starter role and payroll example now, or skip and finish Team later.</p></header>
            <div class="onboarding-choice-panel">
              <div class="onboarding-employee-list" id="obEmployeeList" data-testid="onboarding-employee-list"></div>
              <button class="onboarding-add-employee" id="obAddEmployee" data-testid="onboarding-add-employee" type="button">${icon.plus} Add employee</button>
            </div>
            <p class="onboarding-field-error" id="obStep7Error" aria-live="polite"></p>
            <div class="onboarding-actions"><button class="brand-secondary-button onboarding-prev" data-ob-back="6" type="button">Back</button><button class="brand-primary-button rs-primary-button" data-ob-next="8" data-testid="onboarding-step7-next" type="button"><span>Review setup</span><span class="brand-login-arrow" aria-hidden="true">-></span></button></div>
          </div>

          <div class="onboarding-step-panel" data-step-panel="8">
            <header class="onboarding-step-head"><p class="onboarding-kicker">Step 8 of 8</p><h1>Review and launch</h1><p class="onboarding-step-desc">This creates the owner workspace. The deeper setup remains editable in the app.</p></header>
            <div class="onboarding-summary" id="obSummary" data-testid="onboarding-summary"></div>
            <p class="onboarding-field-error" id="obStep8Error" aria-live="polite"></p>
            <div class="onboarding-actions"><button class="brand-secondary-button onboarding-prev" data-ob-back="7" type="button">Back</button><button class="brand-primary-button rs-primary-button onboarding-enter" id="obEnterApp" data-testid="onboarding-enter-app" type="button"><span>Launch workspace</span><span class="brand-login-arrow" aria-hidden="true">-></span></button></div>
          </div>
        </div>

        <aside class="onboarding-media-panel" aria-label="restogogo workspace preview">
          <div class="onboarding-media-copy"><strong>Your workspace comes online cleanly.</strong><span>Start with the essentials, then finish Restaurant and Team setup from the real product screens.</span></div>
          <div class="onboarding-media-frame" aria-hidden="true"><div class="onboarding-media-scene"><span class="onboarding-media-ring"></span><span class="onboarding-media-bar is-wide"></span><span class="onboarding-media-bar"></span><span class="onboarding-media-bar is-short"></span></div></div>
        </aside>
      </div>
    </section>
  </main>`;

  function render(root){
    if(!root)return null;
    if(root.querySelector('#onboardingContent'))return root;
    root.innerHTML = MARKUP;
    return root;
  }

  window.RestogogoOnboardingTemplate = Object.freeze({render});
})();
