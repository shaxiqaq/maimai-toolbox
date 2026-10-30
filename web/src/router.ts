import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: () => import("./views/HomeView.vue") },
    { path: "/b50", name: "b50", component: () => import("./views/B50View.vue") },
    { path: "/records", name: "records", component: () => import("./views/RecordsView.vue") },
    { path: "/progress", name: "progress", component: () => import("./views/ProgressView.vue") },
    { path: "/recommend", name: "recommend", component: () => import("./views/RecommendView.vue") },
    { path: "/calculator", name: "calculator", component: () => import("./views/CalculatorView.vue") },
    { path: "/lottery", name: "lottery", component: () => import("./views/LotteryView.vue") },
    { path: "/favorites", name: "favorites", component: () => import("./views/FavoritesView.vue") },
    { path: "/arcades", name: "arcades", component: () => import("./views/ArcadesView.vue") },
    { path: "/bingo", name: "bingo", component: () => import("./views/BingoView.vue") },
    { path: "/collections", name: "collections", component: () => import("./views/CollectionsView.vue") },
    { path: "/friends", name: "friends", component: () => import("./views/FriendsView.vue") },
    {
      path: "/friends/:id",
      name: "friend-compare",
      component: () => import("./views/FriendCompareView.vue"),
      props: true,
    },
    { path: "/avatar", name: "avatar", component: () => import("./views/AvatarView.vue") },
    { path: "/login", name: "login", component: () => import("./views/LoginView.vue") },
    { path: "/account", name: "account", component: () => import("./views/AccountView.vue") },
    {
      path: "/archives/:archiveId",
      name: "archive",
      component: () => import("./views/SnapshotView.vue"),
      props: true,
    },
    { path: "/s/:shareId", name: "shared", component: () => import("./views/SnapshotView.vue"), props: true },
    { path: "/songs", name: "songs", component: () => import("./views/SongsView.vue") },
    { path: "/songs/:id", name: "song", component: () => import("./views/SongDetailView.vue"), props: true },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});
