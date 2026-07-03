import { env } from '$env/dynamic/public';

type ClientErrorContext = {
  source: 'svelte' | 'window' | 'promise';
  route?: string;
  status?: number;
};

let started = false;

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown client error';
}

export function reportClientError(error: unknown, context: ClientErrorContext): void {
  const payload = JSON.stringify({
    message: message(error).slice(0, 500),
    source: context.source,
    route: context.route ?? (typeof location === 'undefined' ? '' : location.pathname),
    status: context.status ?? null,
    occurredAt: new Date().toISOString(),
    release: env.PUBLIC_APP_RELEASE ?? 'development'
  });
  const endpoint = env.PUBLIC_ERROR_ENDPOINT;
  if (endpoint && typeof navigator !== 'undefined') {
    navigator.sendBeacon(
      endpoint,
      new Blob([payload], { type: 'application/json' })
    );
    return;
  }
  console.error('[restogogo]', payload);
}

export function startClientMonitoring(): () => void {
  if (started || typeof window === 'undefined') return () => undefined;
  started = true;
  const onError = (event: ErrorEvent) =>
    reportClientError(event.error ?? event.message, { source: 'window' });
  const onRejection = (event: PromiseRejectionEvent) =>
    reportClientError(event.reason, { source: 'promise' });
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    started = false;
  };
}
