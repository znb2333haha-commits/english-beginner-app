import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { migrateWordRow } from './word-migration';
import {
  DEFAULT_SETTINGS,
  type BackupFile,
  type DayStats,
  type PhonemeProgress,
  type PhraseProgress,
  type ReviewLogRow,
  type Settings,
  type StoredCard,
} from './types';

interface Schema extends DBSchema {
  cards: { key: number; value: StoredCard };
  logs: { key: number; value: ReviewLogRow };
  stats: { key: string; value: DayStats };
  settings: { key: string; value: Settings };
  phonetics: { key: string; value: PhonemeProgress };
  phrases: { key: string; value: PhraseProgress };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>('english-beginner-app', 5, {
      async upgrade(d, oldVersion, _newVersion, tx) {
        // v4 新增音标进度表、v5 新增日常会话进度表;先建表,再做可能需要等待的旧数据迁移
        if (oldVersion < 4) d.createObjectStore('phonetics', { keyPath: 'symbol' });
        if (oldVersion < 5) d.createObjectStore('phrases', { keyPath: 'id' });
        if (oldVersion === 0) {
          d.createObjectStore('cards', { keyPath: 'wordId' });
          d.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
          d.createObjectStore('stats', { keyPath: 'date' });
          d.createObjectStore('settings');
        } else if (oldVersion === 1 || oldVersion === 2) {
          try {
            const cards = (await tx.objectStore('cards').getAll()).map(row => migrateWordRow(row, oldVersion));
            const logs = (await tx.objectStore('logs').getAll()).map(row => migrateWordRow(row, oldVersion));
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
    version: 5,
    exportedAt: new Date().toISOString(),
    settings: await loadSettings(),
    cards: await d.getAll('cards'),
    stats: await d.getAll('stats'),
    logs: await d.getAll('logs'),
    phonetics: await d.getAll('phonetics'),
    phrases: await d.getAll('phrases'),
  };
}

/** 导入备份:会用备份内容替换当前全部进度 */
export async function importBackup(file: BackupFile): Promise<void> {
  if (file.app !== 'english-beginner-app' || ![1, 2, 3, 4, 5].includes(file.version)) {
    throw new Error('这不是本 App 的备份文件');
  }
  const version = file.version;
  const cards = version < 3 ? file.cards.map((row) => migrateWordRow(row, version as 1 | 2)) : file.cards;
  const logs = version < 3 ? file.logs.map((row) => migrateWordRow(row, version as 1 | 2)) : file.logs;
  const d = await db();
  const tx = d.transaction(['cards', 'logs', 'stats', 'settings', 'phonetics', 'phrases'], 'readwrite');
  await Promise.all([
    tx.objectStore('cards').clear(),
    tx.objectStore('logs').clear(),
    tx.objectStore('stats').clear(),
    tx.objectStore('phonetics').clear(),
    tx.objectStore('phrases').clear(),
  ]);
  for (const c of cards) await tx.objectStore('cards').put(c);
  for (const l of logs) await tx.objectStore('logs').put(l);
  for (const s of file.stats) await tx.objectStore('stats').put(s);
  for (const p of file.phonetics ?? []) await tx.objectStore('phonetics').put(p);
  for (const p of file.phrases ?? []) await tx.objectStore('phrases').put(p);
  await tx.objectStore('settings').put({ ...DEFAULT_SETTINGS, ...file.settings }, 'main');
  await tx.done;
}

export async function loadPhonemeProgress(): Promise<Map<string, PhonemeProgress>> {
  const all = await (await db()).getAll('phonetics');
  return new Map(all.map((p) => [p.symbol, p]));
}

export async function savePhonemeProgress(p: PhonemeProgress): Promise<void> {
  await (await db()).put('phonetics', p);
}

export async function loadPhraseProgress(): Promise<Map<string, PhraseProgress>> {
  const all = await (await db()).getAll('phrases');
  return new Map(all.map((p) => [p.id, p]));
}

export async function savePhraseProgress(p: PhraseProgress): Promise<void> {
  await (await db()).put('phrases', p);
}

export async function deletePhraseProgress(id: string): Promise<void> {
  await (await db()).delete('phrases', id);
}
