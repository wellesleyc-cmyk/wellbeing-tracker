// location.js — GPS detection + Nominatim reverse geocoding
// Returns a human-readable city/town name, or null on any failure.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const GEO_TIMEOUT_MS = 10000;

/**
 * Detect the user's current location and reverse-geocode it to a city name.
 *
 * Steps:
 *   1. Request GPS coordinates via the Geolocation API (10 s timeout).
 *   2. GET the lat/lon from Nominatim's reverse-geocoding endpoint.
 *   3. Return the most specific available place name:
 *      city > town > village > county — or null if none is found.
 *
 * Never throws. All error paths return null so callers stay simple.
 *
 * @returns {Promise<string|null>} Place name in English, or null.
 */
export async function detectLocation() {
  // Step 1 — acquire GPS coordinates
  let coords;
  try {
    coords = await _getCurrentPosition();
  } catch {
    // GPS denied, unavailable, or timed out
    return null;
  }

  const { latitude: lat, longitude: lon } = coords;

  // Step 2 — reverse geocode with Nominatim
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('format', 'json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'WellbeingTracker/1.0 (personal health app)',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();

    // Step 3 — extract the most specific available place name
    const address = data?.address;
    if (!address) return null;

    return address.city || address.town || address.village || address.county || null;
  } catch (err) {
    // AbortError, network error, or JSON parse failure
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wrap navigator.geolocation.getCurrentPosition in a Promise.
 * @returns {Promise<GeolocationCoordinates>}
 */
function _getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation API not available'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      (error) => reject(error),
      {
        enableHighAccuracy: false,
        timeout: GEO_TIMEOUT_MS,
        maximumAge: 300000,
      }
    );
  });
}
