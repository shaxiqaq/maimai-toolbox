import { ref, watch } from "vue";

export type ThemeChoice = "system" | "light" | "dark";

function readSaved(): ThemeChoice {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const choice = ref<ThemeChoice>(readSaved());

watch(choice, (value) => {
  const root = document.documentElement;
  if (value === "system") delete root.dataset.theme;
  else root.dataset.theme = value;
  try {
    if (value === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", value);
  } catch {
    // Storage unavailable (private mode); the choice still applies for this visit.
  }
});

const ORDER: ThemeChoice[] = ["system", "light", "dark"];

export function useTheme() {
  return {
    choice,
    cycle: () => {
      choice.value = ORDER[(ORDER.indexOf(choice.value) + 1) % ORDER.length]!;
    },
  };
}
