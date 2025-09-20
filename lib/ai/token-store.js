// Simple token store per provider using localStorage. JS only.

const STORAGE_KEY_PREFIX = 'ai:token:';

export function getToken(provider) {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY_PREFIX + provider) || null;
  } catch (e) {
    console.warn('Token store read error', e);
    return null;
  }
}

export function setToken(provider, token) {
  if (typeof window === 'undefined') return false;
  try {
    if (!token) return false;
    localStorage.setItem(STORAGE_KEY_PREFIX + provider, token);
    return true;
  } catch (e) {
    console.warn('Token store write error', e);
    return false;
  }
}

export function removeToken(provider) {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.removeItem(STORAGE_KEY_PREFIX + provider);
    return true;
  } catch (e) {
    console.warn('Token store remove error', e);
    return false;
  }
}
