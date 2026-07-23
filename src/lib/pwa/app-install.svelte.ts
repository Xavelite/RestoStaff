type InstallOutcome = 'accepted' | 'dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome }>;
};

const INSTALLED_KEY = 'rst-app-installed';

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

class AppInstallController {
  installed = $state(false);
  standalone = $state(false);
  ios = $state(false);
  promptAvailable = $state(false);
  #prompt: BeforeInstallPromptEvent | null = null;

  start(): () => void {
    this.ios = isIosDevice();
    this.standalone = isStandaloneDisplay();
    this.installed = this.standalone || localStorage.getItem(INSTALLED_KEY) === 'yes';
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      localStorage.removeItem(INSTALLED_KEY);
      this.installed = false;
      this.#prompt = event as BeforeInstallPromptEvent;
      this.promptAvailable = true;
    };
    const installed = () => {
      localStorage.setItem(INSTALLED_KEY, 'yes');
      this.installed = true;
      this.promptAvailable = false;
      this.#prompt = null;
    };
    const displayChanged = () => {
      this.standalone = isStandaloneDisplay();
      if (this.standalone) installed();
    };

    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    displayMode.addEventListener('change', displayChanged);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      displayMode.removeEventListener('change', displayChanged);
    };
  }

  async prompt(): Promise<InstallOutcome | 'unavailable'> {
    if (!this.#prompt) return 'unavailable';
    const prompt = this.#prompt;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem(INSTALLED_KEY, 'yes');
      this.installed = true;
      this.promptAvailable = false;
      this.#prompt = null;
    }
    return outcome;
  }
}

export const appInstall = new AppInstallController();
