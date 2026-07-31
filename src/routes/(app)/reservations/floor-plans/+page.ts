import { redirect } from '@sveltejs/kit';

export function load(): never {
  redirect(307, '/restaurant/floor-plan?layer=tables');
}
