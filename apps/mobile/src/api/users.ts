import { userSearchResponseSchema, type UserSearchResponse } from "@taskflow/shared";
import { apiFetch } from "./client";

export async function searchUsersRequest(q: string): Promise<UserSearchResponse> {
  const params = new URLSearchParams({ q });
  const data = await apiFetch<unknown>(`/users/search?${params.toString()}`, { auth: true });
  return userSearchResponseSchema.parse(data);
}
