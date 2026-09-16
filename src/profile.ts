import { useSyncExternalStore } from "react";
export type Profile = { name: string; welcomed: boolean };
export function readProfile(storage?: Pick<Storage, "getItem">): Profile {
  try {
    const value = JSON.parse(
      (storage ?? localStorage).getItem("cadentrail:profile") ?? "null",
    );
    return {
      name:
        typeof value?.name === "string" ? value.name.trim().slice(0, 60) : "",
      welcomed: value?.welcomed === true,
    };
  } catch {
    return { name: "", welcomed: false };
  }
}
let profile = readProfile();
const listeners = new Set<() => void>();
export function saveProfile(name: string) {
  profile = { name: name.trim().slice(0, 60), welcomed: true };
  try {
    localStorage.setItem("cadentrail:profile", JSON.stringify(profile));
  } catch {
    /* Works for this visit when browser storage is disabled. */
  }
  listeners.forEach((listener) => listener());
}
export function useProfile() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => profile,
  );
}
