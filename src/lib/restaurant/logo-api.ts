import { supabase } from '$lib/supabase/client';

// A restaurant's own logo, shown on the surfaces its staff and guests see (the
// badge terminal and the paired station). Objects live under
// <restaurant_id>/… so storage policies can key on the folder, and the bucket
// is public because a wall-mounted terminal displays it all service.

const BUCKET = 'restaurant-logos';
const MAX_BYTES = 1_048_576;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

export const LOGO_ACCEPT = ACCEPTED.join(',');

export function restaurantLogoUrl(logoPath: string | null | undefined): string {
  if (!logoPath) return '';
  return supabase.storage.from(BUCKET).getPublicUrl(logoPath).data.publicUrl;
}

export async function uploadRestaurantLogo(
  restaurantId: string,
  file: File,
  previousLogoPath: string | null = null
): Promise<string> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error('Use a PNG, JPEG or WebP image.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('That image is larger than 1 MB. Use a smaller file.');
  }

  const extension = file.type.split('/')[1];
  // A stable name per restaurant keeps one logo per tenant; the timestamp query
  // string on read is what defeats caching after a replacement.
  const path = `${restaurantId}/logo.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '300' });
  if (error) throw new Error(error.message || 'The logo could not be uploaded.');

  const { error: recordError } = await supabase.rpc('set_restaurant_logo', {
    p_restaurant_id: restaurantId,
    p_logo_path: path
  });
  if (recordError) throw new Error(recordError.message || 'The logo could not be saved.');

  if (previousLogoPath && previousLogoPath !== path) {
    await supabase.storage.from(BUCKET).remove([previousLogoPath]).catch(() => undefined);
  }

  return path;
}

export async function removeRestaurantLogo(
  restaurantId: string,
  logoPath: string | null
): Promise<void> {
  const { error } = await supabase.rpc('set_restaurant_logo', {
    p_restaurant_id: restaurantId,
    p_logo_path: ''
  });
  if (error) throw new Error(error.message || 'The logo could not be removed.');

  // Best effort: the record is what the app reads, so a stranded object is
  // harmless and must not fail the action.
  if (logoPath) {
    await supabase.storage.from(BUCKET).remove([logoPath]).catch(() => undefined);
  }
}
