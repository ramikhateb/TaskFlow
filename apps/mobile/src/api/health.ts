import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";

export interface HealthResponse {
  status: string;
  sharedPackage: string;
  timestamp: string;
}

export function useHealthCheck() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/health"),
    retry: false,
  });
}
