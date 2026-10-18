import './style.css';
import wordsData from '../data/words.json';
import examplesData from '../data/examples.json';
import { State } from 'ts-fsrs';
import type { Grade } from 'ts-fsrs';
import { playSentence, playWord } from './audio';
import {
  buildSession,
  dueCards,
  GRADES,
  newStoredCard,
  previewLabels,
  rate,
  shouldRequeue,
} from './scheduler';
import {
  addLog,
  allStats,
  bumpStats,
  exportBackup,
  getStats,
  importBackup,
  loadCards,
  loadSettings,
  localDate,
  saveCard,
  saveSettings,
} from './store';
import { calcStreak } from './streak';
import type { BackupFile, DayStats, Settings, StoredCard, Word } from './types';
import { DEFAULT_SETTINGS } from './types';

const words = wordsData as unknown as Word[];
const examples = examplesData as unknown as Record<string, { en: string; zh: string }[]>;
const byId = new Map(words.map((w) => [w.id, w]));
const app = document.getElementById('app') as HTMLElement;

type View = 'home' | 'study' | 'done' | 'settings';

interface Session {
  queue: number[];
  planned: number;
  requeued: number;
  newLearned: number;
  reviewed: number;
  revealed: boolean;
  shownAt: number;
  bonus: boolean;
}

let view: View = 'home';
let settings: Settings = { ...DEFAULT_SETTINGS };
let cards = new Map<number, StoredCard>();
let today = localDate(new Date());
let todayStats: DayStats = { date: today, newCount: 0, reviewCount: 0 };
let streak = 0;
let session: Session | null = null;
let notice = '';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function refreshStats(): Promise<void> {
  today = localDate(new Date());
  todayStats = await getStats(today);
  const all = await allStats();
  const studied = new Set(all.filter((s) => s.reviewCount > 0).map((s) => s.date));
  streak = calcStreak(studied, today);
}

function sessionInput(bonus: boolean) {
  return {
    words,
    cards,
    now: new Date(),
    newToday: todayStats.newCount,
    reviewsToday: todayStats.reviewCount,
    settings,
    bonus,
  };
}

function newAllowed(): number {
  return Math.max(0, settings.newPerDay - todayStats.newCount);
}

function startSession(bonus: boolean): void {
  const ids = buildSession(sessionInput(bonus));
  if (ids.length === 0) {
    notice = '现在没有可学的卡片了,休息一下吧。';
    view = 'home';
    render();
    return;
  }
  notice = '';
  session = {
    queue: ids,
    planned: ids.length,
    requeued: 0,
    newLearned: 0,
    reviewed: 0,
    revealed: false,
    shownAt: Date.now(),
    bonus,
  };
  view = 'study';
  render();
  playCurrent();
}

function currentWord(): Word | undefined {
  return session ? byId.get(session.queue[0]) : undefined;
}

function playCurrent(): void {
  const w = currentWord();
  if (w) playWord(w.word);
}

async function answer(grade: Grade): Promise<void> {
  if (!session) return;
  const id = session.queue[0];
  const now = new Date();
  const before = cards.get(id) ?? newStoredCard(id, now);
  const isNew = before.state === State.New;
  const after = rate(before, grade, now);
  cards.set(id, after);
  await saveCard(after);
  await addLog({ wordId: id, ts: now.toISOString(), rating: grade, ms: Date.now() - session.shownAt });
  await bumpStats(today, isNew);
  todayStats.reviewCount += 1;
  if (isNew) {
    todayStats.newCount += 1;
    session.newLearned += 1;
  }
  session.reviewed += 1;
  session.queue.shift();
  if (shouldRequeue(after, now)) {
    session.queue.push(id);
    session.requeued += 1;
  }
  session.revealed = false;
  session.shownAt = Date.now();
  if (session.queue.length === 0) {
    await refreshStats();
    view = 'done';
    render();
  } else {
    render();
    playCurrent();
  }
}

function renderHome(): string {
  const due = dueCards(cards, new Date()).length;
  const canStudy = due > 0 || newAllowed() > 0;
  return `
    <section class="home">
      <h1>英语小白</h1>
      <p class="streak">连续学习 <b>${streak}</b> 天</p>
      <div class="stats">
        <div><b>${todayStats.newCount}/${settings.newPerDay}</b><span>今日新词</span></div>
        <div><b>${todayStats.reviewCount}</b><span>今日复习</span></div>
        <div><b>${due}</b><span>待复习</span></div>
      </div>
      ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
      ${
        canStudy
          ? `<button class="primary big" data-action="start">来一组</button>
             <p class="hint">每组 ${settings.sessionSize} 张,约 2 到 3 分钟,随时可以退出</p>`
          : `<p class="notice">今天的任务完成了,明天再来。</p>
             <button class="secondary big" data-action="bonus">再多学一组</button>`
      }
      <footer>
        <span>已学 ${cards.size} 词 / 词库 ${words.length} 词</span>
        <button class="link" data-action="settings">设置与备份</button>
      </footer>
    </section>`;
}

function renderExample(w: Word): string {
  const ex = examples[w.word]?.[0];
  if (!ex) return '';
  return `<div class="example">
      <div class="example-en">${esc(ex.en)}</div>
      <div class="example-zh">${esc(ex.zh)}</div>
      <button class="link" data-action="speak-example">朗读例句</button>
    </div>`;
}

function renderStudy(): string {
  const s = session;
  const w = currentWord();
  if (!s || !w) return '';
  const now = new Date();
  const card = cards.get(w.id) ?? newStoredCard(w.id, now);
  const labels = s.revealed ? previewLabels(card, now) : {};
  const meaning = esc(w.meaning).replace(/\n/g, '<br>');
  return `
    <section class="study">
      <header>
        <button class="link" data-action="home">退出</button>
        <span>还剩 ${s.queue.length} 张</span>
      </header>
      <div class="card">
        <div class="word">${esc(w.word)}</div>
        <div class="phonetic">/${esc(w.phonetic)}/</div>
        <button class="secondary" data-action="speak">播放发音</button>
        ${s.revealed ? `<div class="meaning">${meaning}</div>${renderExample(w)}` : ''}
      </div>
      ${
        s.revealed
          ? `<div class="grades">${GRADES.map(
              (g, i) =>
                `<button class="grade g${g.grade}" data-action="grade" data-grade="${g.grade}">
                   ${g.label}<small>${labels[g.grade] ?? ''}</small><i>${i + 1}</i>
                 </button>`,
            ).join('')}</div>`
          : `<button class="primary big" data-action="reveal">显示答案</button>`
      }
    </section>`;
}

function renderDone(): string {
  const s = session;
  return `
    <section class="home">
      <h1>这一组完成了</h1>
      <p class="streak">学了 <b>${s?.newLearned ?? 0}</b> 个新词,共答了 <b>${s?.reviewed ?? 0}</b> 次</p>
      <p class="streak">连续学习 <b>${streak}</b> 天</p>
      <button class="primary big" data-action="again">再来一组</button>
      <button class="secondary big" data-action="home">回首页</button>
    </section>`;
}

function renderSettings(): string {
  const opt = (values: number[], current: number) =>
    values.map((v) => `<option value="${v}" ${v === current ? 'selected' : ''}>${v}</option>`).join('');
  return `
    <section class="settings">
      <header><button class="link" data-action="home">返回</button><span>设置与备份</span></header>
      <label>每天新词数
        <select data-setting="newPerDay">${opt([5, 10, 15, 20], settings.newPerDay)}</select>
      </label>
      <label>每组卡片数
        <select data-setting="sessionSize">${opt([5, 10], settings.sessionSize)}</select>
      </label>
      <h2>备份</h2>
      <p class="hint">进度只保存在这台设备上。换手机或在电脑上继续学,先导出备份,再到另一边导入。导入会替换那边现有的全部进度。</p>
      <button class="secondary" data-action="export">导出备份</button>
      <button class="secondary" data-action="import">导入备份</button>
      <input id="import-file" type="file" accept="application/json,.json" hidden />
      ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
    </section>`;
}

function render(): void {
  app.innerHTML =
    view === 'home'
      ? renderHome()
      : view === 'study'
        ? renderStudy()
        : view === 'done'
          ? renderDone()
          : renderSettings();
}

async function goHome(): Promise<void> {
  await refreshStats();
  notice = '';
  view = 'home';
  render();
}

async function downloadBackup(): Promise<void> {
  const data = await exportBackup();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `english-backup-${localDate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  notice = '备份文件已生成,请在下载里找到它。';
  render();
}

async function restoreBackup(file: File): Promise<void> {
  try {
    const data = JSON.parse(await file.text()) as BackupFile;
    await importBackup(data);
    settings = await loadSettings();
    cards = await loadCards();
    await refreshStats();
    notice = `导入完成:${cards.size} 张卡片。`;
  } catch (e) {
    notice = `导入失败:${e instanceof Error ? e.message : '文件无法读取'}`;
  }
  render();
}

app.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'start':
      startSession(false);
      break;
    case 'bonus':
      startSession(true);
      break;
    case 'again':
      startSession(session?.bonus ?? false);
      break;
    case 'reveal':
      if (session) {
        session.revealed = true;
        render();
      }
      break;
    case 'speak':
      playCurrent();
      break;
    case 'speak-example': {
      const w = currentWord();
      const ex = w && examples[w.word]?.[0];
      if (ex) playSentence(ex.en);
      break;
    }
    case 'grade':
      void answer(Number(el.dataset.grade) as Grade);
      break;
    case 'home':
      void goHome();
      break;
    case 'settings':
      notice = '';
      view = 'settings';
      render();
      break;
    case 'export':
      void downloadBackup();
      break;
    case 'import':
      document.getElementById('import-file')?.click();
      break;
  }
});

app.addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement | HTMLSelectElement;
  if (t instanceof HTMLSelectElement && t.dataset.setting) {
    const key = t.dataset.setting as 'newPerDay' | 'sessionSize';
    settings = { ...settings, [key]: Number(t.value) };
    void saveSettings(settings);
  } else if (t instanceof HTMLInputElement && t.id === 'import-file' && t.files?.[0]) {
    void restoreBackup(t.files[0]);
  }
});

// 电脑键盘:空格显示答案,1 到 4 评分
document.addEventListener('keydown', (ev) => {
  if (view !== 'study' || !session) return;
  if (ev.key === ' ' && !session.revealed) {
    ev.preventDefault();
    session.revealed = true;
    render();
  } else if (session.revealed && ['1', '2', '3', '4'].includes(ev.key)) {
    void answer(Number(ev.key) as Grade);
  } else if (ev.key.toLowerCase() === 'p') {
    playCurrent();
  }
});

async function init(): Promise<void> {
  settings = await loadSettings();
  cards = await loadCards();
  await refreshStats();
  render();
}

void init();
