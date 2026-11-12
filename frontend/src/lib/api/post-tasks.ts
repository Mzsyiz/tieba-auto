import type { components } from "./schema";
import { request } from "./client";

export type PostTask = components["schemas"]["PostTaskRead"];
export type PostTaskCreateInput = components["schemas"]["PostTaskCreate"];
export type PostTaskList = components["schemas"]["PostTaskListResponse"];
export type PostTaskDetail = components["schemas"]["PostTaskDetailResponse"];
export type PostTaskLog = components["schemas"]["PostTaskLogRead"];
export type PostTaskManagerStatus = components["schemas"]["PostTaskManagerStatus"];

export function listPostTasks(): Promise<PostTaskList> {
  return request<PostTaskList>("/api/v1/post-tasks");
}

export function createPostTask(input: PostTaskCreateInput): Promise<PostTask> {
  return request<PostTask>("/api/v1/post-tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPostTask(id: number): Promise<PostTaskDetail> {
  return request<PostTaskDetail>(`/api/v1/post-tasks/${id}`);
}

export function updatePostTask(
  id: number,
  input: PostTaskCreateInput
): Promise<PostTask> {
  return request<PostTask>(`/api/v1/post-tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function clonePostTask(id: number): Promise<PostTask> {
  return request<PostTask>(`/api/v1/post-tasks/${id}/clone`, {
    method: "POST",
  });
}

export function startPostTask(id: number): Promise<PostTask> {
  return request<PostTask>(`/api/v1/post-tasks/${id}/start`, { method: "POST" });
}

export function stopPostTask(id: number): Promise<PostTask> {
  return request<PostTask>(`/api/v1/post-tasks/${id}/stop`, { method: "POST" });
}

export function deletePostTask(id: number): Promise<void> {
  return request<void>(`/api/v1/post-tasks/${id}`, { method: "DELETE" });
}

export function getPostTaskStatus(): Promise<PostTaskManagerStatus> {
  return request<PostTaskManagerStatus>("/api/v1/post-tasks/status");
}
