/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOOTLOCKER_API_BASE?: string;
  readonly VITE_LOOTLOCKER_API_KEY?: string;
  readonly VITE_LOOTLOCKER_GAME_VERSION?: string;
  readonly VITE_LOOTLOCKER_LEADERBOARD_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
