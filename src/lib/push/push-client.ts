import { env } from '$env/dynamic/public';
import {
  registerPushSubscription,
  unregisterPushSubscription,
  type BrowserPushSubscription
} from '$lib/api/push';

export type PhonePushStatus = {
  configured: boolean;
  supported: boolean;
  requiresInstall: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
};

const vapidPublicKey = () => env.PUBLIC_WEB_PUSH_VAPID_KEY?.trim() ?? '';

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function subscriptionValue(subscription: PushSubscription): BrowserPushSubscription {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('The browser returned an incomplete push subscription.');
  }
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

function deviceName(): string {
  const agent = navigator.userAgent;
  if (/iphone/i.test(agent)) return 'iPhone';
  if (/ipad/i.test(agent)) return 'iPad';
  if (/android/i.test(agent)) return 'Android phone';
  if (/macintosh/i.test(agent)) return 'Mac';
  if (/windows/i.test(agent)) return 'Windows device';
  return 'Web device';
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are not supported on this device.');
  return navigator.serviceWorker.ready;
}

export async function phonePushStatus(): Promise<PhonePushStatus> {
  const configured = Boolean(vapidPublicKey());
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const requiresInstall = supported && isIos() && !isStandalone();
  if (!supported) {
    return { configured, supported, requiresInstall: false, permission: 'unsupported', subscribed: false };
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription() ?? null;
  return {
    configured,
    supported,
    requiresInstall,
    permission: Notification.permission,
    subscribed: Boolean(subscription)
  };
}

export async function enablePhonePush(input: {
  restaurantId: string;
  locale: string;
}): Promise<void> {
  if (!vapidPublicKey()) {
    throw new Error('Phone notifications are not configured for this environment.');
  }
  const status = await phonePushStatus();
  if (!status.supported) throw new Error('This browser does not support phone notifications.');
  if (status.requiresInstall) {
    throw new Error('Add Restogogo to your Home Screen before enabling phone notifications.');
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked in your browser settings.'
        : 'Notification permission was not granted.'
    );
  }

  const registration = await readyRegistration();
  const subscription = await registration.pushManager.getSubscription() ??
    await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlBytes(vapidPublicKey())
    });

  await registerPushSubscription({
    restaurantId: input.restaurantId,
    subscription: subscriptionValue(subscription),
    locale: input.locale,
    deviceName: deviceName(),
    userAgent: navigator.userAgent
  });
}

export async function syncPhonePush(input: {
  restaurantId: string;
  locale: string;
}): Promise<boolean> {
  const status = await phonePushStatus();
  if (!status.configured || !status.supported || !status.subscribed) return false;
  const registration = await readyRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;
  await registerPushSubscription({
    restaurantId: input.restaurantId,
    subscription: subscriptionValue(subscription),
    locale: input.locale,
    deviceName: deviceName(),
    userAgent: navigator.userAgent
  });
  return true;
}

export async function disablePhonePush(): Promise<void> {
  const status = await phonePushStatus();
  if (!status.supported || !status.subscribed) return;
  const registration = await readyRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await unregisterPushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}
