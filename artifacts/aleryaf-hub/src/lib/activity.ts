import { apiFetch } from "@/lib/http";

export async function logActivity(username: string, action: string, details?: string) {
  try {
    await apiFetch("/api/activity-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, action, details }),
    });
  } catch {
  }
}
