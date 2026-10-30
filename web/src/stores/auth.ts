import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "@/api";

export interface User {
  id: number;
  username: string;
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  /** False until the first /auth/me answer, so pages can avoid flashing "please log in". */
  const ready = ref(false);

  async function refresh(): Promise<void> {
    try {
      user.value = (await api<{ user: User | null }>("GET", "/auth/me")).user;
    } catch {
      user.value = null;
    } finally {
      ready.value = true;
    }
  }

  async function login(username: string, password: string): Promise<void> {
    user.value = (await api<{ user: User }>("POST", "/auth/login", { username, password })).user;
  }

  async function register(username: string, password: string, invite: string): Promise<void> {
    user.value = (await api<{ user: User }>("POST", "/auth/register", { username, password, invite })).user;
  }

  async function logout(): Promise<void> {
    await api("POST", "/auth/logout").catch(() => undefined);
    user.value = null;
  }

  return { user, ready, refresh, login, register, logout };
});
