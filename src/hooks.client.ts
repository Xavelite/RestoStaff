import { reportClientError } from '$lib/monitoring/client';
import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, status, event }) => {
  reportClientError(error, {
    source: 'svelte',
    route: event.url.pathname,
    status
  });
  return {
    message: 'Something went wrong while loading this page.'
  };
};
