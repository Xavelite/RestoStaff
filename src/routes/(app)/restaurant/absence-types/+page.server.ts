import { redirect } from '@sveltejs/kit';

export function load(): never {
  redirect(308, '/settings/absence-types');
}
