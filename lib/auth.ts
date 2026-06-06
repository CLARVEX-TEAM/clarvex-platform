import { users } from "@/lib/demo-data";
import type { User } from "@/lib/types";

const KEY = "clarvex.session";

export function getSession(): User | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function loginDemo(userId: string) {
  const user = users.find((item) => item.id === userId);
  if (!user) throw new Error("Usuario demo no encontrado");
  window.localStorage.setItem(KEY, JSON.stringify(user));
  return user;
}

export function loginByEmployeeNumber(employeeNumber: string) {
  const cleanNumber = employeeNumber.trim();
  const user = users.find((item) => item.employeeNumber === cleanNumber);
  if (!user) throw new Error("Numero de empleado no encontrado");
  window.localStorage.setItem(KEY, JSON.stringify(user));
  return user;
}

export async function loginByEmployeeNumberFromDb(employeeNumber: string) {
  const response = await fetch("/api/auth/employee-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeNumber })
  });

  if (!response.ok) throw new Error("Numero de empleado no encontrado");
  const payload = await response.json() as { user: User };
  window.localStorage.setItem(KEY, JSON.stringify(payload.user));
  return payload.user;
}

export function logout() {
  window.localStorage.removeItem(KEY);
}

export function saveSession(user: User) {
  window.localStorage.setItem(KEY, JSON.stringify(user));
}
