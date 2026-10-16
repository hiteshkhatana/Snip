import { triggerLogout } from "./AuthContext";

const API_URL = import.meta.env.VITE_API_URL;

export type AuthResponse = { token: string };
export type ApiError = { error: string };

export class UnauthorizedError extends Error {}

async function request<T>(
  path: string,
  options: { method?: string; body?: object; token?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    // Only treat a 401 as "your session is dead" for requests that were
    // actually sending a token. Login/signup also return 401 for wrong
    // credentials, which is a normal form error, not an expired session.
    if (options.token) {
      triggerLogout();
      window.location.href = "/login";
    }
    throw new UnauthorizedError("Unauthorized");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (data as ApiError).error ?? "Something went wrong. Please try again.";
    throw new Error(message);
  }

  return data as T;
}

export function signup(email: string, password: string) {
  return request<AuthResponse>("/api/auth/signup", { method: "POST", body: { email, password } });
}

export function login(email: string, password: string) {
  return request<AuthResponse>("/api/auth/login", { method: "POST", body: { email, password } });
}

export type MeResponse = { userId: string };

export function getMe(token: string) {
  return request<MeResponse>("/api/me", { token });
}

export type Link = {
  id: string;
  shortCode: string;
  originalUrl: string;
  expiresAt: string | null;
  createdAt: string;
  clickCount: number;
};

export type PaginatedLinks = {
  data: Link[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export function getLinks(token: string, page: number, limit: number) {
  return request<PaginatedLinks>(`/api/links?page=${page}&limit=${limit}`, { token });
}

export type CreateLinkInput = { url: string; alias?: string; expiresAt?: string };

export function createLink(token: string, input: CreateLinkInput) {
  return request<Link>("/api/links", { method: "POST", body: input, token });
}

export type UpdateLinkInput = { url?: string; expiresAt?: string | null };

export function updateLink(token: string, id: string, input: UpdateLinkInput) {
  return request<Link>(`/api/links/${id}`, { method: "PATCH", body: input, token });
}

export function deleteLink(token: string, id: string) {
  return request<void>(`/api/links/${id}`, { method: "DELETE", token });
}

export type ClicksByDay = { day: string; count: number };
export type TopReferrer = { referrer: string; count: number };

export type LinkStats = {
  totalClicks: number;
  clicksByDay: ClicksByDay[];
  topReferrers: TopReferrer[];
};

export function getLinkStats(token: string, id: string) {
  return request<LinkStats>(`/api/links/${id}/stats`, { token });
}
