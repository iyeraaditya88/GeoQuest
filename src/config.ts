// App-wide configuration.

/**
 * Built-in Mapillary client token, so anyone you share GeoQuest with can play the
 * Street View challenge without creating their own.
 *
 * Mapillary *client* tokens are meant to ship inside client-side apps (they're read-only
 * and tied to the "Geo quest" app in the Mapillary dashboard), so this is visible to
 * anyone who opens the app's code. To rotate or revoke it, use the Mapillary
 * developer dashboard. A token saved from the in-app setup card (stored in .env)
 * takes priority over this one.
 */
export const DEFAULT_MAPILLARY_TOKEN = 'MLY|28837812209238039|a676c88f69472224ed7d13af3dd250f2';
