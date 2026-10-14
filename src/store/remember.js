// "Don't remember on this device". Browser storage is shared more widely than it looks: in Chrome
// and Edge every file:// page can read what another file:// page stored, and on a hosting origin
// every page of that origin can. With this choice set, the app keeps imported data in memory only
// and nothing outlives the page. The choice itself is a per-browser preference in localStorage,
// like theme and language; it holds no statement data.

const KEY = 'bsd-remember';

export function rememberOnDevice() {
  try { return localStorage.getItem(KEY) !== 'no'; } catch { return true; }
}

export function setRememberOnDevice(on) {
  try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, 'no'); } catch { /* storage blocked */ }
}
