/* restogogo onboarding template.
 * Owns wizard markup so index.html stays as an app shell.
 */
(function(){
  const MARKUP = `

  <div class="brand-backdrop" aria-hidden="true"></div>
  <main class="onboarding-shell">

    <!-- Progress sidebar -->
    <nav class="onboarding-nav" aria-label="Setup steps">
      <img alt="restogogo" class="onboarding-logo" src="assets/img/brand/restogogo_logo_transparent.png"/>
      <ol class="onboarding-steps" id="onboardingSteps">
        <li class="onboarding-step is-active" data-step="1">
          <span class="onboarding-step-num" aria-hidden="true">1</span>
          <span class="onboarding-step-label">Your account</span>
        </li>
        <li class="onboarding-step" data-step="2">
          <span class="onboarding-step-num" aria-hidden="true">2</span>
          <span class="onboarding-step-label">Restaurant</span>
        </li>
        <li class="onboarding-step" data-step="3">
          <span class="onboarding-step-num" aria-hidden="true">3</span>
          <span class="onboarding-step-label">Team</span>
        </li>
        <li class="onboarding-step" data-step="4">
          <span class="onboarding-step-num" aria-hidden="true">4</span>
          <span class="onboarding-step-label">Ready</span>
        </li>
      </ol>
      <button class="brand-soft-link onboarding-back-to-login" id="onboardingBackToLogin" data-testid="onboarding-back-to-login" type="button">← Back to sign in</button>
    </nav>

    <!-- Step content -->
    <div class="onboarding-content" id="onboardingContent">

      <!-- Step 1: Account -->
      <div class="onboarding-step-panel is-active" data-step-panel="1">
        <header class="onboarding-step-head">
          <p class="onboarding-kicker">Step 1 of 4</p>
          <h1>Create your owner account</h1>
          <p class="onboarding-step-desc">This account gives you full access to manage your restaurant in restogogo.</p>
        </header>
        <div class="onboarding-form">
          <div class="onboarding-form-row">
            <label class="brand-field">
              <span class="brand-field-label">First name <span aria-hidden="true" class="onboarding-required">*</span></span>
              <span class="brand-field-control">
                <input autocomplete="given-name" id="obFirstName" data-testid="onboarding-first-name" placeholder="Your first name" type="text"/>
              </span>
            </label>
            <label class="brand-field">
              <span class="brand-field-label">Last name <span aria-hidden="true" class="onboarding-required">*</span></span>
              <span class="brand-field-control">
                <input autocomplete="family-name" id="obLastName" data-testid="onboarding-last-name" placeholder="Your last name" type="text"/>
              </span>
            </label>
          </div>
          <label class="brand-field">
            <span class="brand-field-label">Email address <span aria-hidden="true" class="onboarding-required">*</span></span>
            <span class="brand-field-control">
              <svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
              <input autocomplete="email" id="obEmail" data-testid="onboarding-email" placeholder="owner@yourrestaurant.com" type="email"/>
            </span>
          </label>
          <label class="brand-field">
            <span class="brand-field-label">Password <span aria-hidden="true" class="onboarding-required">*</span></span>
            <span class="brand-field-control">
              <svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
              <input autocomplete="new-password" id="obPassword" data-testid="onboarding-password" minlength="6" placeholder="At least 6 characters" type="password"/>
            </span>
          </label>
          <p class="onboarding-field-error" id="obStep1Error" aria-live="polite"></p>
        </div>
        <div class="onboarding-actions">
          <button class="brand-primary-button rs-primary-button" data-ob-next="2" data-testid="onboarding-step1-next" type="button">
            <span>Continue</span><span class="brand-login-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <!-- Step 2: Restaurant -->
      <div class="onboarding-step-panel" data-step-panel="2">
        <header class="onboarding-step-head">
          <p class="onboarding-kicker">Step 2 of 4</p>
          <h1>Your restaurant</h1>
          <p class="onboarding-step-desc">Tell us the basics we need to create the first working restaurant setup.</p>
        </header>
        <div class="onboarding-form">
          <label class="brand-field">
            <span class="brand-field-label">Restaurant name <span aria-hidden="true" class="onboarding-required">*</span></span>
            <span class="brand-field-control">
              <svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><path d="M7 2v20"/><path d="M4 2v6a3 3 0 0 0 6 0V2"/><path d="M15 2v20"/><path d="M15 2c3 2 5 5 5 9h-5"/></svg>
              <input autocomplete="organization" id="obRestaurantName" data-testid="onboarding-restaurant-name" placeholder="e.g. The Garden Bistro" type="text"/>
            </span>
          </label>
          <label class="brand-field">
            <span class="brand-field-label">City</span>
            <span class="brand-field-control">
              <svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <input autocomplete="address-level2" id="obCity" data-testid="onboarding-city" placeholder="City" type="text"/>
            </span>
          </label>
          <div class="onboarding-form-row">
            <label class="brand-field">
              <span class="brand-field-label">Main zone <span aria-hidden="true" class="onboarding-required">*</span></span>
              <span class="brand-field-control">
                <svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><path d="M3 9l9-6 9 6"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
                <input id="obDefaultZoneName" data-testid="onboarding-default-zone" placeholder="Restaurant" type="text" value="Restaurant"/>
              </span>
            </label>
            <label class="brand-field">
              <span class="brand-field-label">Default position <span aria-hidden="true" class="onboarding-required">*</span></span>
              <span class="brand-field-control">
                <svg aria-hidden="true" class="brand-field-svg" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M17 11h4"/><path d="M19 9v4"/></svg>
                <input id="obDefaultPositionName" data-testid="onboarding-default-position" placeholder="Staff" type="text" value="Staff"/>
              </span>
            </label>
          </div>
          <p class="onboarding-helper">Creates the first working area and role so Team and Planning are usable immediately.</p>
          <p class="onboarding-field-error" id="obStep2Error" aria-live="polite"></p>
        </div>
        <div class="onboarding-actions">
          <button class="brand-secondary-button onboarding-prev" data-ob-back="1" data-testid="onboarding-step2-back" type="button">← Back</button>
          <button class="brand-primary-button rs-primary-button" data-ob-next="3" data-testid="onboarding-step2-next" type="button">
            <span>Continue</span><span class="brand-login-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <!-- Step 3: Team -->
      <div class="onboarding-step-panel" data-step-panel="3">
        <header class="onboarding-step-head">
          <p class="onboarding-kicker">Step 3 of 4</p>
          <h1>Add your team</h1>
          <p class="onboarding-step-desc">Add at least one employee. You can set their PINs and configure access from the Team page after setup.</p>
        </header>
        <div class="onboarding-form">
          <div class="onboarding-employee-list" id="obEmployeeList" data-testid="onboarding-employee-list">
            <!-- Filled by JS -->
          </div>
          <button class="onboarding-add-employee" id="obAddEmployee" data-testid="onboarding-add-employee" type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>
            Add employee
          </button>
          <p class="onboarding-field-error" id="obStep3Error" aria-live="polite"></p>
        </div>
        <div class="onboarding-actions">
          <button class="brand-secondary-button onboarding-prev" data-ob-back="2" data-testid="onboarding-step3-back" type="button">← Back</button>
          <button class="brand-primary-button rs-primary-button" data-ob-next="4" data-testid="onboarding-step3-next" type="button">
            <span>Continue</span><span class="brand-login-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <!-- Step 4: Ready -->
      <div class="onboarding-step-panel" data-step-panel="4">
        <header class="onboarding-step-head">
          <p class="onboarding-kicker">You're all set</p>
          <h1>Welcome to restogogo</h1>
          <p class="onboarding-step-desc">Your restaurant is ready. You can complete the rest of the configuration inside the app.</p>
        </header>
        <div class="onboarding-summary" id="obSummary" data-testid="onboarding-summary">
          <!-- Filled by JS -->
        </div>
        <p class="onboarding-field-error" id="obStep4Error" aria-live="polite"></p>
        <div class="onboarding-actions">
          <button class="brand-primary-button rs-primary-button onboarding-enter" id="obEnterApp" data-testid="onboarding-enter-app" type="button">
            <span>Enter restogogo</span><span class="brand-login-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>

    </div><!-- /onboarding-content -->
  </main>

`;

  function render(root){
    if(!root)return null;
    if(root.querySelector('#onboardingContent'))return root;
    root.innerHTML = MARKUP;
    return root;
  }

  window.RestogogoOnboardingTemplate = Object.freeze({render});
})();
