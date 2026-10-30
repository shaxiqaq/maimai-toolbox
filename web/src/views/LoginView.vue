<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const mode = ref<"login" | "register">(route.query.invite ? "register" : "login");
const username = ref("");
const password = ref("");
const invite = ref(typeof route.query.invite === "string" ? route.query.invite : "");
const busy = ref(false);
const error = ref<string | null>(null);

const canSubmit = computed(
  () => username.value.trim() && password.value && (mode.value === "login" || invite.value.trim()) && !busy.value,
);

/** Only follow same-site relative redirects. */
function nextPath(): string {
  const next = route.query.next;
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

async function submit() {
  if (!canSubmit.value) return;
  busy.value = true;
  error.value = null;
  try {
    if (mode.value === "login") await auth.login(username.value.trim(), password.value);
    else await auth.register(username.value.trim(), password.value, invite.value.trim());
    await router.replace(nextPath());
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="page narrow">
    <form class="card box" @submit.prevent="submit">
      <div class="modes">
        <button type="button" :class="{ on: mode === 'login' }" @click="mode = 'login'">登录</button>
        <button type="button" :class="{ on: mode === 'register' }" @click="mode = 'register'">用邀请码注册</button>
      </div>

      <label>
        用户名
        <input v-model="username" class="field" autocomplete="username" maxlength="20" required />
      </label>
      <label>
        密码
        <input
          v-model="password"
          class="field"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          minlength="8"
          maxlength="128"
          required
        />
      </label>
      <label v-if="mode === 'register'">
        邀请码
        <input v-model="invite" class="field" autocomplete="off" spellcheck="false" required />
      </label>

      <p v-if="mode === 'register'" class="muted hint">
        本站只对好友开放，需要站长给的邀请码。用户名 2–20 位，密码至少 8 位。账号只用来同步收藏夹和保存 B50 存档；
        查分本身不需要登录。
      </p>
      <p v-if="error" class="error">{{ error }}</p>

      <button class="primary" type="submit" :disabled="!canSubmit">
        {{ busy ? "请稍候…" : mode === "login" ? "登录" : "注册并登录" }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.narrow {
  max-width: 420px;
}

.box {
  padding: 18px;
  display: grid;
  gap: 12px;
}

.modes {
  display: flex;
  gap: 6px;
}

.modes button {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 13px;
  cursor: pointer;
}

.modes button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

label {
  display: grid;
  gap: 4px;
  font-size: 13px;
}

.hint {
  margin: 0;
  font-size: 12px;
}

.error {
  margin: 0;
  color: var(--warn);
  font-size: 13px;
}

.primary {
  min-height: 42px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 700;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
