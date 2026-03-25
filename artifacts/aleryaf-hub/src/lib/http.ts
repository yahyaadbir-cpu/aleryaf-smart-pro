const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const CSRF_COOKIE_NAME = "aleryaf_csrf";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const target = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const value = part.trim();
    if (value.startsWith(target)) {
      return decodeURIComponent(value.slice(target.length));
    }
  }
  return null;
}

export function getCsrfToken() {
  return getCookie(CSRF_COOKIE_NAME);
}

export async function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  const csrfToken = getCsrfToken();
  if (csrfToken && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  return fetch(`${BASE}${input}`, {
    credentials: "same-origin",
    ...init,
    headers,
  });
}

export { BASE };
