import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { migrateWordRow } from './word-migration';
import {
  DEFAULT_SETTINGS,
  type BackupFile,
  type DayStats,
  type ReviewLogRow,
  type Settings,
  type StoredCard,
} from './types';

interface Schema extends DBSchema {
  cards: { key: number; value: StoredCard };
  logs: { key: number; value: ReviewLogRow };
  stats: { key: string; value: DayStats };
  settings: { key: string; value: Settings };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>('english-beginner-app', 2, {
      async upgrade(d, oldVersion, _newVersion, tx) {
        if (oldVersion === 0) {
          d.createObjectStore('cards', { keyPath: 'wordId' });
          d.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
          d.createObjectStore('stats', { keyPath: 'date' });
          d.createObjectStore('settings');
        } else if (oldVersion === 1) {
          try {
            const cards = (await tx.objectStore('cards').getAll()).map(migrateWordRow);
            const logs = (await tx.objectStore('logs').getAll()).map(migrateWordRow);
            // 先读取再清空，避免新旧主键交换时相互覆盖；同一事务原子提交。
            await tx.objectStore('cards').clear();
            await tx.objectStore('logs').clear();
            for (const card of cards) await tx.objectStore('cards').put(card);
            for (const log of logs) await tx.objectStore('logs').put(log);
          } catch {
            tx.abort();
          }
        }
      },
    });
  }
  return dbPromise;
}

/** 本地日期,格式 YYYY-MM-DD(按手机当前时区算"今天") */
export function localDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function loadCards(): Promise<Map<number, StoredCard>> {
  const all = await (await db()).getAll('cards');
  return new Map(all.map((c) => [c.wordId, c]));
}

export async function saveCard(card: StoredCard): Promise<void> {
  await (await db()).put('cards', card);
}

export async function addLog(row: ReviewLogRow): Promise<void> {
  await (await db()).add('logs', row);
}

export async function getStats(date: string): Promise<DayStats> {
  return (await (await db()).get('stats', date)) ?? { date, newCount: 0, reviewCount: 0 };
}

export async function bumpStats(date: string, isNew: boolean): Promise<void> {
  const s = await getStats(date);
  if (isNew) s.newCount += 1;
  s.reviewCount += 1;
  await (await db()).put('stats', s);
}

export async function allStats(): Promise<DayStats[]> {
  return (await db()).getAll('stats');
}

export async function loadSettings(): Promise<Settings> {
  const s = await (await db()).get('settings', 'main');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await (await db()).put('settings', s, 'main');
}

export async function exportBackup(): Promise<BackupFile> {
  const d = await db();
  return {
    app: 'english-beginner-app',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: await loadSettings(),
    cards: await d.getAll('cards'),
    stats: await d.getAll('stats'),
    logs: await d.getAll('logs'),
  };
}

/** 导入备份:会用备份内容替换当前全部进度 */
export async function importBackup(file: BackupFile): Promise<void> {
  if (file.app !== 'english-beginner-app' || ![1, 2].includes(file.version)) {
    throw new Error('这不是本 App 的备份文件');
  }
  const cards = file.version === 1 ? file.cards.map(migrateWordRow) : file.cards;
  const logs = file.version === 1 ? file.logs.map(migrateWordRow) : file.logs;
  const d = await db();
  const tx = d.transaction(['cards', 'logs', 'stats', 'settings'], 'readwrite');
  await Promise.all([
    tx.objectStore('cards').clear(),
    tx.objectStore('logs').clear(),
    tx.objectStore('stats').clear(),
  ]);
  for (const c of cards) await tx.objectStore('cards').put(c);
  for (const l of logs) await tx.objectStore('logs').put(l);
  for (const s of file.stats) await tx.objectStore('stats').put(s);
  await tx.objectStore('settings').put({ ...DEFAULT_SETTINGS, ...file.settings }, 'main');
  await tx.done;
}
