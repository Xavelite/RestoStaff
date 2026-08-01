type BadgeAction = 'in' | 'out';

export type BadgePolicy = {
  photoClockInRequired: boolean;
  photoClockOutRequired: boolean;
  locationCaptureEnabled: boolean;
  employeeMobileBadgingEnabled: boolean;
  revision: number;
};

export type BadgeLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export const DEFAULT_BADGE_POLICY: BadgePolicy = {
  photoClockInRequired: false,
  photoClockOutRequired: false,
  locationCaptureEnabled: false,
  employeeMobileBadgingEnabled: false,
  revision: 0
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/** Parse the RPC snake_case contract. Missing policy is deliberately permissive. */
export function parseBadgePolicy(value: unknown): BadgePolicy {
  const source = record(value);
  return {
    photoClockInRequired: source.photo_clock_in_required === true,
    photoClockOutRequired: source.photo_clock_out_required === true,
    locationCaptureEnabled: source.location_capture_enabled === true,
    employeeMobileBadgingEnabled: source.employee_mobile_badging_enabled === true,
    revision: nonNegativeInteger(source.revision)
  };
}

/** Parse the typed restaurant_settings row included in workspace read models. */
export function badgePolicyFromSettings(value: unknown): BadgePolicy {
  const source = record(value);
  return {
    photoClockInRequired: source.badge_photo_clock_in_required === true,
    photoClockOutRequired: source.badge_photo_clock_out_required === true,
    locationCaptureEnabled: source.badge_location_capture_enabled === true,
    employeeMobileBadgingEnabled: source.employee_mobile_badging_enabled === true,
    revision: nonNegativeInteger(source.badge_policy_revision)
  };
}

export function photoRequiredForAction(policy: BadgePolicy, action: BadgeAction): boolean {
  return action === 'in' ? policy.photoClockInRequired : policy.photoClockOutRequired;
}

export function captureBadgeLocation(): Promise<BadgeLocation> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('Location is not supported on this device.'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          reject(new Error('Your location could not be read.'));
          return;
        }
        resolve({
          latitude,
          longitude,
          accuracyMeters: Number.isFinite(accuracy) ? Math.max(0, accuracy) : 0
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('Allow location access to record this badge.'));
        } else if (error.code === error.TIMEOUT) {
          reject(new Error('Location took too long. Move near a window and try again.'));
        } else {
          reject(new Error('Your location is unavailable. Check device location services and try again.'));
        }
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 }
    );
  });
}
