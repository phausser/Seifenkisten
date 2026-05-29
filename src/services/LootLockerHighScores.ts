export interface HighScoreEntry {
  name: string;
  time: number;
  date: string;
}

interface LootLockerSession {
  playerId: number;
  sessionToken: string;
}

interface LootLockerLeaderboardItem {
  score?: number | string;
  metadata?: string;
  created_at?: string;
  player?: {
    name?: string;
  };
}

const DEFAULT_API_BASE = 'https://api.lootlocker.io/game';
const DEVICE_ID_KEY = 'seifenkisten.lootlocker.device.v1';
const SESSION_KEY = 'seifenkisten.lootlocker.session.v1';
const SCORE_BASE = 24 * 60 * 60 * 1000;

let sessionPromise: Promise<LootLockerSession | null> | null = null;

function getApiBase(): string {
  return (import.meta.env.VITE_LOOTLOCKER_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
}

function getApiKey(): string {
  return import.meta.env.VITE_LOOTLOCKER_API_KEY?.trim() || '';
}

function getLeaderboardKey(): string {
  return import.meta.env.VITE_LOOTLOCKER_LEADERBOARD_KEY?.trim() || '';
}

function isConfigured(): boolean {
  return getApiKey() !== '' && getLeaderboardKey() !== '';
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; the remote request can still continue.
  }
}

function getDeviceId(): string {
  const stored = readStorage(DEVICE_ID_KEY);
  if (stored) return stored;
  const deviceId = globalThis.crypto?.randomUUID?.() || `anon-${Date.now()}-${Math.random()}`;
  writeStorage(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

function parseStoredSession(): LootLockerSession | null {
  const raw = readStorage(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LootLockerSession>;
    if (
      typeof parsed.sessionToken === 'string' &&
      typeof parsed.playerId === 'number' &&
      Number.isFinite(parsed.playerId)
    ) {
      return { sessionToken: parsed.sessionToken, playerId: parsed.playerId };
    }
  } catch {
    // Ignore invalid cached session state.
  }
  return null;
}

async function createSession(): Promise<LootLockerSession | null> {
  if (!isConfigured()) return null;

  const response = await fetch(`${getApiBase()}/v2/session/guest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      game_key: getApiKey(),
      player_identifier: getDeviceId(),
      game_version: import.meta.env.VITE_LOOTLOCKER_GAME_VERSION || '0.1.0',
    }),
  });

  if (!response.ok) {
    throw new Error(`LootLocker session failed with status ${response.status}`);
  }

  const data = await response.json() as {
    player_id?: number;
    session_token?: string;
  };

  if (typeof data.session_token !== 'string' || typeof data.player_id !== 'number') {
    throw new Error('LootLocker session response is missing required fields');
  }

  const session = {
    playerId: data.player_id,
    sessionToken: data.session_token,
  };
  writeStorage(SESSION_KEY, JSON.stringify(session));
  return session;
}

function clearStoredSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

async function ensureSession(forceNew = false): Promise<LootLockerSession | null> {
  if (!isConfigured()) return null;

  if (!forceNew) {
    const stored = parseStoredSession();
    if (stored) return stored;
  }

  if (!sessionPromise) {
    sessionPromise = createSession().catch(() => null);
  }

  const session = await sessionPromise;
  sessionPromise = null;
  return session;
}

function toLeaderboardScore(time: number): number {
  const milliseconds = Math.max(0, Math.round(time * 1000));
  return Math.max(0, SCORE_BASE - milliseconds);
}

function fromLeaderboardScore(score: number): number {
  return Math.max(0, (SCORE_BASE - score) / 1000);
}

function normalizeName(name: string): string {
  const trimmed = name.trim().toUpperCase().replace(/\s+/g, '');
  return (trimmed || '---').slice(0, 3);
}

function normalizeEntry(entry: Partial<HighScoreEntry> | null | undefined): HighScoreEntry | null {
  if (!entry || typeof entry.name !== 'string' || typeof entry.time !== 'number' || typeof entry.date !== 'string') {
    return null;
  }
  if (!Number.isFinite(entry.time) || entry.time < 0) return null;
  return {
    name: normalizeName(entry.name),
    time: entry.time,
    date: entry.date,
  };
}

function parseEntry(item: LootLockerLeaderboardItem): HighScoreEntry | null {
  if (typeof item.metadata === 'string') {
    try {
      return normalizeEntry(JSON.parse(item.metadata) as Partial<HighScoreEntry>);
    } catch {
      const numericScore = Number(item.score);
      if (Number.isFinite(numericScore)) {
        return {
          name: normalizeName(item.metadata),
          time: fromLeaderboardScore(numericScore),
          date: item.created_at || new Date().toISOString(),
        };
      }
    }
  }

  const numericScore = Number(item.score);
  if (!Number.isFinite(numericScore)) return null;

  return {
    name: normalizeName(item.player?.name || '---'),
    time: fromLeaderboardScore(numericScore),
    date: item.created_at || new Date().toISOString(),
  };
}

function sortEntries(entries: HighScoreEntry[]): HighScoreEntry[] {
  return entries
    .sort((a, b) => a.time - b.time)
    .slice(0, entries.length);
}

export async function loadRemoteHighScores(count: number): Promise<HighScoreEntry[] | null> {
  const session = await ensureSession();
  if (!session) return null;

  try {
    const response = await fetch(
      `${getApiBase()}/leaderboards/${getLeaderboardKey()}/list?count=${count}`,
      {
        headers: {
          'x-session-token': session.sessionToken,
        },
      },
    );

    if (response.status === 401 || response.status === 403) {
      clearStoredSession();
      const fresh = await ensureSession(true);
      if (!fresh) return null;
      const retry = await fetch(
        `${getApiBase()}/leaderboards/${getLeaderboardKey()}/list?count=${count}`,
        { headers: { 'x-session-token': fresh.sessionToken } },
      );
      if (!retry.ok) return null;
      const retryData = await retry.json() as { items?: LootLockerLeaderboardItem[] };
      if (!Array.isArray(retryData.items)) return [];
      return sortEntries(
        retryData.items
          .map((item) => parseEntry(item))
          .filter((entry): entry is HighScoreEntry => entry !== null),
      ).slice(0, count);
    }
    if (!response.ok) return null;

    const data = await response.json() as { items?: LootLockerLeaderboardItem[] };
    if (!Array.isArray(data.items)) return [];

    return sortEntries(
      data.items
        .map((item) => parseEntry(item))
        .filter((entry): entry is HighScoreEntry => entry !== null),
    ).slice(0, count);
  } catch {
    return null;
  }
}

export async function saveRemoteHighScore(entry: HighScoreEntry): Promise<boolean> {
  const session = await ensureSession();
  if (!session) return false;

  const memberId = `${session.playerId}-${Date.now()}`;

  const doSubmit = async (s: { sessionToken: string }, id: string): Promise<Response> =>
    fetch(`${getApiBase()}/leaderboards/${getLeaderboardKey()}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': s.sessionToken,
      },
      body: JSON.stringify({
        member_id: id,
        metadata: JSON.stringify({ ...entry, name: normalizeName(entry.name) }),
        score: toLeaderboardScore(entry.time),
      }),
    });

  try {
    const response = await doSubmit(session, memberId);
    if (response.status === 401 || response.status === 403) {
      clearStoredSession();
      const fresh = await ensureSession(true);
      if (!fresh) return false;
      const retry = await doSubmit(fresh, `${fresh.playerId}-${Date.now()}`);
      return retry.ok;
    }
    return response.ok;
  } catch {
    return false;
  }
}
