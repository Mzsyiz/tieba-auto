import type { components } from "./schema";
import { ApiError, request } from "./client";

export type Material = components["schemas"]["MaterialRead"];
export type MaterialStats = components["schemas"]["MaterialStats"];
export type MaterialList = components["schemas"]["MaterialListResponse"];
export type MaterialCreateInput = components["schemas"]["MaterialCreate"];
export type MaterialUpdateInput = components["schemas"]["MaterialUpdate"];
export type MaterialUploadResult = components["schemas"]["MaterialUploadResponse"];

export function listMaterials(params?: {
  q?: string;
  status?: "available" | "used" | "disabled";
}): Promise<MaterialList> {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  return request<MaterialList>(`/api/v1/materials${qs ? `?${qs}` : ""}`);
}

export function createMaterial(input: MaterialCreateInput): Promise<Material> {
  return request<Material>("/api/v1/materials", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateMaterial(id: number, input: MaterialUpdateInput): Promise<Material> {
  return request<Material>(`/api/v1/materials/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function useMaterial(id: number): Promise<Material> {
  return request<Material>(`/api/v1/materials/${id}/use`, { method: "POST" });
}

export function deleteMaterial(id: number): Promise<void> {
  return request<void>(`/api/v1/materials/${id}`, { method: "DELETE" });
}

export async function uploadMaterialImage(file: File): Promise<MaterialUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/v1/materials/upload", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    let message = `上传失败（HTTP ${response.status}）`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // 非 JSON 响应使用默认提示
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as MaterialUploadResult;
}

export async function uploadMaterialVideo(file: File): Promise<MaterialUploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/v1/materials/upload-video", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    let message = "视频上传失败";
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // 响应体不是 JSON 时使用默认文案
    }
    throw new Error(message);
  }
  return (await response.json()) as MaterialUploadResult;
}
