export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body instanceof FormData ? undefined : { "content-type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/auth") && location.pathname !== "/login") {
      location.href = "/login";
    }
    throw new ApiError(res.status, (data as { error?: string }).error ?? `request failed (${res.status})`);
  }
  return data as T;
}

export type Category = { id: number; name: string; emoji: string; sort_order: number; doc_count: number };
export type DocMeta = { id: number; category_id: number; title: string; slug: string; updated_at: string };
export type Doc = DocMeta & { content_html: string; created_at: string; updated_by: string };
export type User = { id: number; email: string; name: string; role: "admin" | "editor" | "viewer" };
