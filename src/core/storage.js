/**
 * localStorage wrapper. Storage throws in private windows and in embedded
 * frames with site data blocked, so every call here is guarded and the game
 * simply runs without persistence when it fails.
 */

/** Read and parse a JSON value, or `fallback` if missing or unreadable. */
export function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Serialize and store a value. Returns false if storage is unavailable. */
export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Remove a key, ignoring storage failures. */
export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to do: the key is already unreachable */
  }
}
