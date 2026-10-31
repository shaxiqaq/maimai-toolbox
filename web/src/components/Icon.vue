<script lang="ts">
// Material Design Icons (round), Apache-2.0. Only the icons listed here end up in the bundle.
import Home from "@material-design-icons/svg/round/home.svg?raw";
import EmojiEvents from "@material-design-icons/svg/round/emoji_events.svg?raw";
import FormatListBulleted from "@material-design-icons/svg/round/format_list_bulleted.svg?raw";
import DonutLarge from "@material-design-icons/svg/round/donut_large.svg?raw";
import TrendingUp from "@material-design-icons/svg/round/trending_up.svg?raw";
import Calculate from "@material-design-icons/svg/round/calculate.svg?raw";
import Casino from "@material-design-icons/svg/round/casino.svg?raw";
import Star from "@material-design-icons/svg/round/star.svg?raw";
import Group from "@material-design-icons/svg/round/group.svg?raw";
import Place from "@material-design-icons/svg/round/place.svg?raw";
import LibraryMusic from "@material-design-icons/svg/round/library_music.svg?raw";
import Insights from "@material-design-icons/svg/round/insights.svg?raw";
import MilitaryTech from "@material-design-icons/svg/round/military_tech.svg?raw";
import GridView from "@material-design-icons/svg/round/grid_view.svg?raw";
import Face from "@material-design-icons/svg/round/face.svg?raw";
import Feedback from "@material-design-icons/svg/round/feedback.svg?raw";
import Person from "@material-design-icons/svg/round/person.svg?raw";
import DarkMode from "@material-design-icons/svg/round/dark_mode.svg?raw";
import LightMode from "@material-design-icons/svg/round/light_mode.svg?raw";
import BrightnessAuto from "@material-design-icons/svg/round/brightness_auto.svg?raw";
import Search from "@material-design-icons/svg/round/search.svg?raw";
import ChevronRight from "@material-design-icons/svg/round/chevron_right.svg?raw";
import AdminPanelSettings from "@material-design-icons/svg/round/admin_panel_settings.svg?raw";
import Apps from "@material-design-icons/svg/round/apps.svg?raw";
import Login from "@material-design-icons/svg/round/login.svg?raw";
import ArrowBack from "@material-design-icons/svg/round/arrow_back.svg?raw";
import MusicNote from "@material-design-icons/svg/round/music_note.svg?raw";

const ICONS = {
  home: Home,
  emoji_events: EmojiEvents,
  format_list_bulleted: FormatListBulleted,
  donut_large: DonutLarge,
  trending_up: TrendingUp,
  calculate: Calculate,
  casino: Casino,
  star: Star,
  group: Group,
  place: Place,
  library_music: LibraryMusic,
  insights: Insights,
  military_tech: MilitaryTech,
  grid_view: GridView,
  face: Face,
  feedback: Feedback,
  person: Person,
  dark_mode: DarkMode,
  light_mode: LightMode,
  brightness_auto: BrightnessAuto,
  search: Search,
  chevron_right: ChevronRight,
  admin_panel_settings: AdminPanelSettings,
  apps: Apps,
  login: Login,
  arrow_back: ArrowBack,
  music_note: MusicNote,
};

export type IconName = keyof typeof ICONS;
</script>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ name: IconName; size?: number }>();
/** The SVG body without its 24px width/height, so CSS sizes it. */
const svg = computed(() => ICONS[props.name].replace(/ width="24" height="24"/, ""));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- trusted SVG from the icon package -->
  <span class="icon" :style="size ? { fontSize: `${size}px` } : undefined" aria-hidden="true" v-html="svg" />
</template>

<style scoped>
.icon {
  display: inline-flex;
  flex: none;
  width: 1em;
  height: 1em;
  font-size: 20px;
}

.icon :deep(svg) {
  width: 100%;
  height: 100%;
  fill: currentColor;
}
</style>
