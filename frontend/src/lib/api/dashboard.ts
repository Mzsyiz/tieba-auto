import type { components } from "./schema";
import { request } from "./client";

export type Dashboard = components["schemas"]["DashboardResponse"];

export function getDashboard(): Promise<Dashboard> {
  return request<Dashboard>("/api/v1/dashboard");
}
