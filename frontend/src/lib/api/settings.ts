import type { components } from "./schema";
import { request } from "./client";

export type AppSettings = components["schemas"]["AppSettingRead"];
export type AppSettingsUpdate = components["schemas"]["AppSettingUpdate"];
export type SystemInfo = components["schemas"]["SystemInfo"];

export function getAppSettings(): Promise<AppSettings> {
  return request<AppSettings>("/api/v1/settings");
}

export function updateAppSettings(input: AppSettingsUpdate): Promise<AppSettings> {
  return request<AppSettings>("/api/v1/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getSystemInfo(): Promise<SystemInfo> {
  return request<SystemInfo>("/api/v1/settings/system");
}
