import type { components } from "./schema";
import { request } from "./client";

export type ProxyNode = components["schemas"]["ProxyRead"];
export type ProxyList = components["schemas"]["ProxyListResponse"];
export type ProxyCreateInput = components["schemas"]["ProxyCreate"];
export type ProxyUpdateInput = components["schemas"]["ProxyUpdate"];
export type ProxyTestResult = components["schemas"]["ProxyTestResult"];
export type ProxyBulkImportResult = components["schemas"]["ProxyBulkImportResult"];

export function listProxies(params?: {
  q?: string;
  status?: "active" | "inactive" | "failed";
}): Promise<ProxyList> {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  return request<ProxyList>(`/api/v1/proxies${qs ? `?${qs}` : ""}`);
}

export function createProxy(input: ProxyCreateInput): Promise<ProxyNode> {
  return request<ProxyNode>("/api/v1/proxies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProxy(id: number, input: ProxyUpdateInput): Promise<ProxyNode> {
  return request<ProxyNode>(`/api/v1/proxies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteProxy(id: number): Promise<void> {
  return request<void>(`/api/v1/proxies/${id}`, { method: "DELETE" });
}

export function testProxy(id: number): Promise<ProxyTestResult> {
  return request<ProxyTestResult>(`/api/v1/proxies/${id}/test`, {
    method: "POST",
  });
}

export function bindProxyAccounts(
  id: number,
  accountIds: number[]
): Promise<ProxyNode> {
  return request<ProxyNode>(`/api/v1/proxies/${id}/bind`, {
    method: "PUT",
    body: JSON.stringify({ account_ids: accountIds }),
  });
}

export function bulkImportProxies(raw: string): Promise<ProxyBulkImportResult> {
  return request<ProxyBulkImportResult>("/api/v1/proxies/bulk", {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
}
