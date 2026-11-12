import type { components } from "./schema";
import { request } from "./client";

export type Account = components["schemas"]["AccountRead"];
export type AccountCreateInput = components["schemas"]["AccountCreate"];
export type AccountUpdateInput = components["schemas"]["AccountUpdate"];
export type AccountStatus = components["schemas"]["AccountStatus"];
export type CookieImportInput = components["schemas"]["CookieImportRequest"];

export function listAccounts(params?: {
  status?: AccountStatus;
  q?: string;
}): Promise<Account[]> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.q) search.set("q", params.q);
  const qs = search.toString();
  return request<Account[]>(`/api/v1/accounts${qs ? `?${qs}` : ""}`);
}

export function createAccount(input: AccountCreateInput): Promise<Account> {
  return request<Account>("/api/v1/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAccount(id: number, input: AccountUpdateInput): Promise<Account> {
  return request<Account>(`/api/v1/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function importCookie(input: CookieImportInput): Promise<Account> {
  return request<Account>("/api/v1/accounts/import-cookie", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function verifyAccount(id: number): Promise<Account> {
  return request<Account>(`/api/v1/accounts/${id}/verify`, { method: "POST" });
}

export function deleteAccount(id: number): Promise<void> {
  return request<void>(`/api/v1/accounts/${id}`, { method: "DELETE" });
}
