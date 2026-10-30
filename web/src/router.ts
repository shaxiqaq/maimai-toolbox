import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: () => import("./views/HomeView.vue") },
    { path: "/b50", name: "b50", component: () => import("./views/B50View.vue") },
    { path: "/records", name: "records", component: () => import("./views/RecordsView.vue") },
    { path: "/progress", name: "progress", component: () => import("./views/ProgressView.vue") },
    { path: "/recommend", name: "recommend", component: () => import("./views/RecommendView.vue") },
    { path: "/songs", name: "songs", component: () => import("./views/SongsView.vue") },
    { path: "/songs/:id", name: "song", component: () => import("./views/SongDetailView.vue"), props: true },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});
