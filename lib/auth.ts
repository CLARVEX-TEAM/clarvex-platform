import type { User } from "@/lib/types";

type EmployeeLookup = {
  user: User;
  requiresPinSetup: boolean;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "No fue posible completar la solicitud.");
  return payload;
}

export async function getSession(): Promise<User | null> {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  if (!response.ok) return null;
  return ((await response.json()) as { user: User }).user;
}

export async function inspectEmployee(employeeNumber: string) {
  return request<EmployeeLookup>("/api/auth/employee-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "inspect", employeeNumber })
  });
}

export async function loginWithPin(employeeNumber: string, pin: string) {
  return request<{ user: User }>("/api/auth/employee-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", employeeNumber, pin })
  });
}

export async function createPin(employeeNumber: string, pin: string) {
  return request<{ user: User }>("/api/auth/employee-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setup", employeeNumber, pin })
  });
}

export async function logout() {
  await fetch("/api/auth/session", { method: "DELETE" });
}
