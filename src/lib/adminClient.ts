// src/lib/adminClient.ts
export function getAdminCsrfToken() {
  if (typeof document === "undefined") return "";
  const raw = document.cookie
    .split("; ")
    .find((row) => row.startsWith("admin_csrf="))
    ?.split("=")[1];
  return raw ? decodeURIComponent(raw) : "";
}

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = String(init.method ?? "GET").toUpperCase();
  const isMutating = ["POST", "PATCH", "PUT", "DELETE"].includes(method);

  const headers = new Headers(init.headers ?? {});
  if (isMutating) {
    const csrf = getAdminCsrfToken();
    if (csrf) headers.set("x-csrf-token", csrf);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}