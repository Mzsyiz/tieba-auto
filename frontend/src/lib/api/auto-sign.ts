import type { components } from "./schema";
import { request } from "./client";

export type AutoSignSettings = components["schemas"]["AutoSignSettingsRead"];
export type AutoSignSettingsUpdate = components["schemas"]["AutoSignSettingsUpdate"];
export type AutoSignStartInput = components["schemas"]["AutoSignStartRequest"];
export type AutoSignState = components["schemas"]["AutoSignStateRead"];

export function getAutoSignSettings(): Promise<AutoSignSettings> {
  return request<AutoSignSettings>("/api/v1/sign/auto/settings");
}

export function updateAutoSignSettings(
  input: AutoSignSettingsUpdate
): Promise<AutoSignSettings> {
  return request<AutoSignSettings>("/api/v1/sign/auto/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function startAutoSign(accountIds: number[] | null): Promise<AutoSignState> {
  const body: AutoSignStartInput = { account_ids: accountIds };
  return request<AutoSignState>("/api/v1/sign/auto/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function stopAutoSign(): Promise<AutoSignState> {
  return request<AutoSignState>("/api/v1/sign/auto/stop", {
    method: "POST",
  });
}

export function getAutoSignStatus(): Promise<AutoSignState> {
  return request<AutoSignState>("/api/v1/sign/auto/status");
}
