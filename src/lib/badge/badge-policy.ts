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

function cameraError(error: unknown): Error {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return new Error('Allow camera access to record this badge.');
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return new Error('No camera is available on this device.');
  }
  return new Error('The badge photo could not be captured. Check the camera and try again.');
}

/** Capture one private badge frame without exposing a file-picker workflow. */
export async function captureBadgePhoto(): Promise<File> {
  if (
    typeof navigator === 'undefined' ||
    typeof document === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    throw new Error('Camera capture is not supported on this device.');
  }

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('Camera start timed out.')),
        10_000
      );
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Camera preview failed.'));
      };
    });
    await video.play();
    // Give auto-exposure one painted frame before preserving the evidence.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const sourceWidth = Math.max(1, video.videoWidth);
    const sourceHeight = Math.max(1, video.videoHeight);
    const scale = Math.min(1, 1280 / sourceWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Camera capture is unavailable.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('Camera capture is unavailable.');
    return new File([blob], `badge-${Date.now()}.jpg`, { type: 'image/jpeg' });
  } catch (error) {
    throw cameraError(error);
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}
