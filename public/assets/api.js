/* Thin API client. Cookies carry the session (httpOnly), so every call
   uses same-origin credentials and never touches a token in JS. */

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('offline', 0);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data ?? {};
}

/* Session state, cached for the current page load. */
let sessionPromise = null;
export function session(force = false) {
  if (!sessionPromise || force) {
    sessionPromise = api('/api/auth/me').catch((e) => (e.status === 401 ? null : Promise.reject(e)));
  }
  return sessionPromise;
}
export function forgetSession() { sessionPromise = null; }

export async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* already gone */ }
  forgetSession();
}
