import './style.css';
import wordsData from '../data/words.json';
import examplesData from '../data/examples.json';
import phonemesData from '../data/phonetics.json';
import phrasesData from '../data/phrases.json';
import kidsData from '../data/kids.json';
import framesData from '../data/frames.json';
import linkingData from '../data/linking.json';
import { State } from 'ts-fsrs';
import type { Grade } from 'ts-fsrs';
import { playFile, playKid, pickVoice, setMultiVoice, voiceForRole, playPhrase, playPhraseAsync, playSentence, playSequence, playWord, stopSequence } from './audio';
import { buildQuiz, makeCloze, pickKind, spellOk } from './practice';
import type { PracticeKind, PracticeQuiz } from './practice';
import { chunksHtml, countBeats, hintLevel, skeleton } from './spelling';
import { loadMeta, saveMeta } from './meta';
import { remaining, planSteps, STEP_LABEL } from './path';
import type { PathStep } from './path';
import { decide, pickSample } from './placement';
import { search } from './search';
import { coverage, weekSummary } from './stats';
import type { WeekSummary } from './stats';
import { disableReminder, enableReminder, reminderSupported } from './reminder';
import minesData from '../data/mine.json';
import { frameQuiz, linkQuiz, myLineCount, roleAdvance, roleTurn, startRole } from './drills';
import type { ChoiceQ, Frame, LinkItem, RoleState } from './drills';
import { canRecord, comparePlay, playMine, resetShadow, shadowError, shadowState, startRecording, stopRecording } from './shadow';
import { buildFormIndex, buildPhraseIndex } from './lookup';
import { duePhrases, learnPhrase, ratePhrase } from './phrase-cards';
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
  allLogs,
  allStats,
  bumpStats,
  exportBackup,
  getStats,
  importBackup,
  loadCards,
  deletePhraseCard,
  deletePhraseProgress,
  loadPhraseCards,
  savePhraseCard,
  loadPhonemeProgress,
  loadPhraseProgress,
  savePhraseProgress,
  loadSettings,
  savePhonemeProgress,
  localDate,
  saveCard,
  saveSettings,
} from './store';
import { calcStreak } from './streak';
import { levelProgress, shortMeaning } from './format';
import type { BackupFile, DayStats, Phoneme, PhonemeProgress, PhraseCard, PhraseProgress, Scene, Settings, StoredCard, Word } from './types';
import { DEFAULT_SETTINGS } from './types';

const words = wordsData as unknown as Word[];
const examples = examplesData as unknown as Record<string, { en: string; zh: string }[]>;
const byId = new Map(words.map((w) => [w.id, w]));
const phonemes = phonemesData as unknown as Phoneme[];
const mineScenes = (minesData as unknown as { scenes: Scene[] }).scenes.filter((x) => x.phrases.length > 0);
const scenes = [...(phrasesData as unknown as { scenes: Scene[] }).scenes, ...mineScenes];
const wordByText = new Map(words.map((w) => [w.word, w]));
const formIndex = buildFormIndex(words);
const allLines = scenes.flatMap((sc) => [...sc.phrases, ...(sc.dialog ?? [])]);
const phraseIndex = buildPhraseIndex(allLines, formIndex);
const lineById = new Map(allLines.map((l) => [l.id, l]));

/** 句子里能在词库查到的词变成可点的小标签 */
function tokHtml(text: string): string {
  return text
    .split(/([A-Za-z]+(?:'[A-Za-z]+)?)/)
    .map((part, i) => {
      if (i % 2 === 0) return esc(part);
      const w = formIndex.get(part.toLowerCase());
      return w ? `<span class="tok" data-lookup="${w.id}">${esc(part)}</span>` : esc(part);
    })
    .join('');
}
const app = document.getElementById('app') as HTMLElement;

type View = 'home' | 'pathdone' | 'placement' | 'placementresult' | 'study' | 'done' | 'settings' | 'phonetics' | 'phoneme' | 'scenes' | 'scene' | 'preview' | 'kids' | 'kidgroup' | 'frames' | 'frame' | 'linking' | 'drillquiz' | 'role' | 'stats' | 'tutor';

interface Session {
  queue: number[];
  planned: number;
  requeued: number;
  newLearned: number;
  reviewed: number;
  revealed: boolean;
  shownAt: number;
  bonus: boolean;
  showFull: boolean;
  /** 当前这张卡的练习方式;card 就是普通卡片 */
  kind: PracticeKind;
  quiz: PracticeQuiz | null;
  result: 'right' | 'wrong' | null;
  typed: string;
  spellHint: 'copy' | 'first' | 'none';
}

let view: View = 'home';
let settings: Settings = { ...DEFAULT_SETTINGS };
let cards = new Map<number, StoredCard>();
let today = localDate(new Date());
let todayStats: DayStats = { date: today, newCount: 0, reviewCount: 0 };
let streak = 0;
let session: Session | null = null;
let notice = '';
let phonemeProgress = new Map<string, PhonemeProgress>();
let phraseProgress = new Map<string, PhraseProgress>();
let currentScene: Scene | null = null;
let phraseCards = new Map<string, PhraseCard>();
let lookupWord: Word | null = null;
let playingLine = -1;
interface PReview {
  queue: string[];
  revealed: boolean;
  done: number;
  finished: boolean;
}
let preview: PReview | null = null;
const frames = (framesData as unknown as { frames: Frame[] }).frames;
const linkItems = (linkingData as unknown as { items: LinkItem[] }).items;
let statsView: { cov: number; known: number; week: WeekSummary } | null = null;
interface TutorState { queue: { id: string; en: string; zh: string }[]; idx: number; phase: 'zh' | 'en'; paused: boolean; done: boolean }
let tutor: TutorState | null = null;
let tutorToken = 0;
let wakeLock: { release: () => Promise<void> } | null = null;
let reminder = loadMeta<{ on: boolean; time: string }>('reminder', { on: false, time: '20:00' });
let voicesOn = loadMeta<{ multi: boolean }>('voices', { multi: true });
setMultiVoice(voicesOn.multi);
let currentFrame: Frame | null = null;
let drill: { title: string; back: View; qs: ChoiceQ[]; idx: number; picked: string | null; correct: number } | null = null;
let role: RoleState | null = null;
let roleToken = 0;
let searchQuery = '';
let pathRun: { steps: PathStep[]; idx: number; scene: Scene } | null = null;
let pathMeta = loadMeta<{ date: string; done: PathStep[] }>('path', { date: '', done: [] });
let placement: { sample: Word[]; idx: number; results: Map<number, boolean> } | null = null;
let placementPlan: { markIds: number[]; knownTested: number[]; skipBands: number[]; toMark: number[] } | null = null;

interface KidItem { word: string; emoji: string; zh: string; file: string }
interface KidGroup { id: string; title: string; items: KidItem[] }
const kidGroups = (kidsData as unknown as { groups: KidGroup[] }).groups;
interface KidQuiz { questions: { item: KidItem; options: KidItem[] }[]; idx: number; correct: number; picked: string | null; finished: boolean }
let kidGroup: KidGroup | null = null;
let kidQuiz: KidQuiz | null = null;
let kidShown: KidItem | null = null;
interface PhraseQuiz {
  questions: { id: string; en: string; options: string[]; answer: string }[];
  idx: number;
  correct: number;
  picked: string | null;
  finished: boolean;
}
let phraseQuiz: PhraseQuiz | null = null;

interface Quiz {
  symbol: string;
  questions: { word: string; options: string[] }[];
  idx: number;
  correct: number;
  picked: string | null;
  finished: boolean;
}
let currentPhoneme: Phoneme | null = null;
let quiz: Quiz | null = null;

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
    showFull: false,
    kind: 'card',
    quiz: null,
    result: null,
    typed: '',
    spellHint: 'none',
  };
  prepareCard();
  view = 'study';
  render();
  if (session.kind === 'card' || session.kind === 'listen') playCurrent();
}

function currentWord(): Word | undefined {
  return session ? byId.get(session.queue[0]) : undefined;
}

/** 给当前这张卡选练习方式:新词用普通卡片,学过的词混合听音、拼写、填空 */
function prepareCard(): void {
  if (!session) return;
  const w = currentWord();
  session.result = null;
  session.typed = '';
  session.quiz = null;
  session.kind = 'card';
  resetShadow();
  if (!w) return;
  const stored = cards.get(w.id);
  const isNew = !stored || stored.state === State.New;
  const ex = examples[w.word]?.[0];
  const forced = (window as unknown as { __forceKind?: PracticeKind }).__forceKind;
  const kind =
    forced ??
    pickKind({ isNew, hasCloze: !!ex && makeCloze(ex.en, w.word) !== null, enabled: settings.practice, spelling: settings.spelling, rnd: Math.random() });
  if (kind === 'card') return;
  session.spellHint = hintLevel(stored?.reps ?? 0);
  const pool = words.filter((x) => x.level === w.level);
  const quiz = buildQuiz(kind, w, pool, ex);
  if (quiz) {
    session.kind = kind;
    session.quiz = quiz;
  }
}

function resolveQuiz(result: 'right' | 'wrong', typed = ''): void {
  if (!session) return;
  session.result = result;
  session.typed = typed;
  session.revealed = true;
  render();
  playCurrent();
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
  session.showFull = false;
  session.shownAt = Date.now();
  if (session.queue.length === 0) {
    resetShadow();
    await refreshStats();
    if (pathStep() === 'words') markStepDone('words');
    view = 'done';
    render();
  } else {
    prepareCard();
    render();
    if (session.kind === 'card' || session.kind === 'listen') playCurrent();
  }
}

function renderProgress(): string {
  const p = levelProgress(cards.keys());
  const pct = Math.round((p.learned / p.size) * 100);
  return `<div class="progress">
      <div class="progress-label">第一级 ${p.learned}/${p.size}${p.done ? ' · 学完啦,太棒了!' : ''}</div>
      <div class="progress-bar"><div style="width:${pct}%"></div></div>
    </div>`;
}

function pathDoneToday(): PathStep[] {
  return pathMeta.date === today ? pathMeta.done : [];
}

function markStepDone(step: PathStep): void {
  const done = pathDoneToday();
  if (!done.includes(step)) done.push(step);
  pathMeta = { date: today, done };
  saveMeta('path', pathMeta);
}

function wordsAvailable(): boolean {
  return dueCards(cards, new Date()).length > 0 || newAllowed() > 0;
}

function chooseScene(): Scene {
  return scenes.find((sc) => !sceneDone(sc)) ?? scenes[Math.floor(Math.random() * scenes.length)];
}

function startPath(): void {
  const steps = remaining(planSteps({ wordsAvailable: wordsAvailable() }), pathDoneToday());
  if (steps.length === 0) {
    view = 'pathdone';
    render();
    return;
  }
  pathRun = { steps, idx: 0, scene: chooseScene() };
  runStep();
}

function runStep(): void {
  if (!pathRun) return;
  const step = pathRun.steps[pathRun.idx];
  if (step === 'words') {
    if (buildSession(sessionInput(false)).length === 0) return void pathNext();
    startSession(false);
  } else if (step === 'phrases') {
    if (dueCount() > 0) {
      startPhraseReview();
    } else {
      currentScene = pathRun.scene;
      phraseQuiz = null;
      view = 'scene';
      render();
    }
  } else {
    currentScene = pathRun.scene;
    view = 'scene';
    startPhraseQuiz(pathRun.scene);
  }
}

function pathNext(): void {
  if (!pathRun) return;
  markStepDone(pathRun.steps[pathRun.idx]);
  pathRun.idx += 1;
  if (pathRun.idx >= pathRun.steps.length) {
    pathRun = null;
    void refreshStats().then(() => {
      view = 'pathdone';
      render();
    });
  } else {
    runStep();
  }
}

function pathStep(): PathStep | null {
  return pathRun ? pathRun.steps[pathRun.idx] : null;
}

function nextLabel(): string {
  if (!pathRun) return '';
  const nxt = pathRun.steps[pathRun.idx + 1];
  return nxt ? `下一步:${STEP_LABEL[nxt]} →` : '完成今天的 10 分钟 ✓';
}

function renderSearchResults(): string {
  const q = searchQuery.trim();
  if (q === '') return '';
  const r = search(q, words, allLines);
  if (r.phrases.length === 0 && r.words.length === 0) {
    return `<p class="hint">没找到"${esc(q)}"。换个说法试试,比如更短的词。</p>`;
  }
  const ph = r.phrases
    .map(
      (l) => `<div class="hit"><button class="play-btn sm" data-action="phrase-play" data-id="${esc(l.id)}" aria-label="播放这句">▶</button>
        <div class="hit-text"><b>${tokHtml(l.en)}</b><span>${esc(l.zh)}</span></div></div>`,
    )
    .join('');
  const wd = r.words
    .map(
      (h) => `<div class="hit"><button class="play-btn sm" data-action="word-play" data-word="${esc(h.word.word)}" aria-label="播放单词">▶</button>
        <div class="hit-text"><b>${esc(h.word.word)} <small>/${esc(h.word.phonetic)}/</small></b><span>${esc(h.gloss)}</span></div></div>`,
    )
    .join('');
  return `${ph ? `<h2 class="hit-title">${r.fuzzy ? '没有一模一样的,这些意思接近' : '能这样说'}</h2>${ph}` : ''}${wd ? `<h2 class="hit-title">相关单词</h2>${wd}` : ''}`;
}

function renderPathBox(): string {
  const done = pathDoneToday();
  const all = planSteps({ wordsAvailable: wordsAvailable() });
  const left = remaining(all, done);
  const chips = (['words', 'phrases', 'listen'] as PathStep[])
    .map((st) => `<span class="chip-step ${done.includes(st) ? 'on' : ''}">${done.includes(st) ? '✓ ' : ''}${STEP_LABEL[st]}</span>`)
    .join('');
  const started = done.length > 0;
  return `<div class="path">
      ${
        left.length === 0
          ? `<p class="notice path-done">✓ 今天的 10 分钟完成了,明天见</p>`
          : `<button class="primary big" data-action="path-start">${started ? '继续今天的 10 分钟' : '开始今天的 10 分钟'}</button>
             <p class="hint">单词 → 句子 → 听力,按顺序走,不用选</p>`
      }
      <div class="path-steps">${chips}</div>
    </div>`;
}

function renderHome(): string {
  const due = dueCards(cards, new Date()).length;
  const canStudy = due > 0 || newAllowed() > 0;
  const showPlacementHint = cards.size === 0 && !loadMeta<{ done: boolean }>('placement', { done: false }).done;
  return `
    <section class="home">
      <h1>拾语</h1>
      <p class="tagline">一点一点,拾起英语</p>
      <div class="searchbox"><input id="search-input" type="search" inputmode="search" autocomplete="off" placeholder="想说什么?输入中文或英文" value="${esc(searchQuery)}" /></div>
      <div id="search-results">${renderSearchResults()}</div>
      <div id="home-main" ${searchQuery.trim() ? 'hidden' : ''}>
      <p class="streak">连续学习 <b>${streak}</b> 天</p>
      <div class="stats">
        <div><b>${todayStats.newCount}/${settings.newPerDay}</b><span>今日新词</span></div>
        <div><b>${todayStats.reviewCount}</b><span>今日复习</span></div>
        <div><b>${due}</b><span>待复习</span></div>
      </div>
      ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
      ${showPlacementHint ? `<button class="secondary" data-action="placement-start">学过一点英语?2 分钟摸底,跳过已经会的词</button>` : ''}
      ${renderPathBox()}
      ${dueCount() > 0 ? `<button class="secondary" data-action="scenes">有 ${dueCount()} 句会话该复习了</button>` : ''}
      ${
        canStudy
          ? `<button class="secondary" data-action="start">只学单词(来一组)</button>`
          : `<button class="secondary" data-action="bonus">再多学一组单词</button>`
      }
      ${renderProgress()}
      <footer>
        <span>已学 ${cards.size} 词 / 词库 ${words.length} 词</span>
        <button class="link" data-action="kids">儿童乐园 ⭐${kidStars()}</button>
        <button class="link" data-action="scenes">日常会话 ${scenesDone()}/${scenes.length}</button>
        <button class="link" data-action="stats">学习概况</button>
        <button class="link" data-action="tutor-start">免手操</button>
        <button class="link" data-action="frames">句型练习</button>
        <button class="link" data-action="linking">连读弱读</button>
        <button class="link" data-action="phonetics">音标入门 ${doneCount()}/${phonemes.length}</button>
        <button class="link" data-action="placement-start">摸底测试</button>
        <button class="link" data-action="settings">设置与备份</button>
      </footer>
      </div>
      ${renderLookup()}
    </section>`;
}

function renderRelated(w: Word): string {
  const seenEn = new Set<string>();
  const lines = (phraseIndex.get(w.id) ?? [])
    .filter((l) => (seenEn.has(l.en) ? false : (seenEn.add(l.en), true)))
    .slice(0, 2);
  if (lines.length === 0) return '';
  return `<div class="related"><div class="related-title">会话里怎么说</div>${lines
    .map(
      (l) => `<div class="related-line" data-action="phrase-play" data-id="${esc(l.id)}"><i class="rl-play">▶</i><div><b>${esc(l.en)}</b><span>${esc(l.zh)}</span></div></div>`,
    )
    .join('')}</div>`;
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

function renderShadow(nativeSrc: string): string {
  if (!canRecord()) return '';
  const st = shadowState();
  const src = esc(nativeSrc);
  const rec =
    st === 'rec'
      ? `<button class="secondary recording" data-action="shadow-stop">⏹ 停止</button>`
      : `<button class="secondary" data-action="shadow-rec">🎤 ${st === 'ready' ? '重录' : '跟读'}</button>`;
  const cmp =
    st === 'ready'
      ? `<button class="secondary" data-action="shadow-cmp" data-src="${src}">▶ 对比</button><button class="secondary" data-action="shadow-mine">我的</button>`
      : '';
  const hint =
    st === 'error'
      ? `<p class="hint">${esc(shadowError())}</p>`
      : st === 'rec'
        ? `<p class="hint">正在录音,读完点停止</p>`
        : '';
  return `<div class="shadow"><div class="shadow-row" data-src="${src}">${rec}${cmp}</div>${hint}</div>`;
}

function renderQuiz(q: PracticeQuiz): string {
  const s = session as Session;
  const opts = q.options
    .map((o, i) => `<button class="quiz-option" data-action="practice-pick" data-i="${i}"><i>${i + 1}</i>${esc(o.label)}</button>`)
    .join('');
  let body = '';
  if (q.kind === 'listen') {
    body = `<p class="hint">听一听,这个词是什么意思?</p>
      <div class="speak-row"><button class="secondary" data-action="speak">🔊 再听一次</button><button class="secondary" data-action="speak-slow">慢速</button></div>
      <div class="quiz-options">${opts}</div>`;
  } else if (q.kind === 'cloze') {
    body = `<p class="hint">选一个词,填进空格</p>
      <div class="cloze">${esc(q.prompt)}</div><div class="example-zh cloze-zh">${esc(q.zh)}</div>
      <div class="quiz-options">${opts}</div>`;
  } else {
    const hint =
      s.spellHint === 'copy'
        ? `<div class="spelling big"><span class="spell-chunks">${chunksHtml(q.answer)}</span><small>照着拼一遍</small></div>`
        : s.spellHint === 'first'
          ? `<div class="spelling big"><span class="spell-skel">${esc(skeleton(q.answer))}</span><small>${q.answer.length} 个字母,先给你第一个</small></div>`
          : '';
    body = `<p class="hint">这个词用英文怎么写?</p>
      <div class="cloze">${esc(q.zh)}</div>${hint}
      <div class="spell"><input id="spell-input" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="输入英文单词" />
      <button class="primary" data-action="spell-submit">检查</button></div>`;
  }
  return `
    <section class="study">
      <header>
        <button class="link" data-action="home">退出</button>
        <span>还剩 ${s.queue.length} 张</span>
      </header>
      <div class="card quiz">${body}</div>
      <button class="link" data-action="practice-skip">不知道,看答案</button>
    </section>`;
}

function renderStudy(): string {
  const s = session;
  const w = currentWord();
  if (!s || !w) return '';
  const now = new Date();
  const card = cards.get(w.id) ?? newStoredCard(w.id, now);
  const labels = s.revealed ? previewLabels(card, now) : {};
  const short = shortMeaning(w.meaning);
  const meaning = esc(s.showFull ? w.meaning : short.text).replace(/\n/g, '<br>');
  if (s.quiz && !s.revealed) return renderQuiz(s.quiz);
  const suggest = s.result === 'right' ? 3 : s.result === 'wrong' ? 1 : 0;
  const banner =
    s.result === 'right'
      ? `<div class="result right">答对了 ✓</div>`
      : s.result === 'wrong'
        ? `<div class="result wrong">${s.typed ? `你写的是 ${esc(s.typed)},` : ''}正确答案是 <b>${esc(w.word)}</b></div>`
        : '';
  return `
    <section class="study">
      <header>
        <button class="link" data-action="home">退出</button>
        <span>还剩 ${s.queue.length} 张</span>
      </header>
      <div class="card">
        ${banner}
        <div class="word">${esc(w.word)}</div>
        <div class="phonetic">/${esc(w.phonetic)}/</div>
        <div class="spelling" title="拼写样本"><span class="spell-chunks">${chunksHtml(w.word)}</span><small>${w.word.length} 个字母 · ${countBeats(w.phonetic)} 拍</small></div>
        <div class="speak-row">
          <button class="secondary" data-action="speak">播放发音</button>
          <button class="secondary" data-action="speak-slow">慢速</button>
        </div>
        ${
          s.revealed
            ? `<div class="meaning">${meaning}</div>${
                short.truncated ? `<button class="link" data-action="toggle-full">${s.showFull ? '收起释义' : '显示全部释义'}</button>` : ''
              }${renderExample(w)}${renderShadow(examples[w.word]?.[0] ? `audio/examples/${w.word}.mp3` : `audio/${w.word}.mp3`)}${renderRelated(w)}`
            : ''
        }
      </div>
      ${
        s.revealed
          ? `<div class="grades">${GRADES.map(
              (g, i) =>
                `<button class="grade g${g.grade}${g.grade === suggest ? ' suggest' : ''}" data-action="grade" data-grade="${g.grade}">
                   ${g.label}<small>${labels[g.grade] ?? ''}</small><i>${i + 1}</i>
                 </button>`,
            ).join('')}</div>`
          : `<button class="primary big" data-action="reveal">显示答案</button>`
      }
    </section>`;
}

function sceneLearned(sc: Scene): number {
  return sc.phrases.filter((p) => phraseProgress.get(p.id)?.learned).length;
}

function sceneDone(sc: Scene): boolean {
  return phraseProgress.get(`scene:${sc.id}`)?.learned === true;
}

function scenesDone(): number {
  return scenes.filter(sceneDone).length;
}

function dueCount(): number {
  return duePhrases(phraseCards, new Date()).length;
}

function renderReviewEntry(): string {
  const n = dueCount();
  return n > 0
    ? `<button class="primary big" data-action="preview-start">复习句子(${n} 句到期)</button>`
    : `<p class="hint">已记住 ${phraseCards.size} 句,暂时没有到期要复习的。</p>`;
}

function renderLookup(): string {
  const w = lookupWord;
  if (!w) return '';
  const sm = shortMeaning(w.meaning, 2, 4);
  return `<div class="lookup">
      <div><b>${esc(w.word)}</b> <span>/${esc(w.phonetic)}/</span></div>
      <div class="lookup-meaning">${esc(sm.text).replace(/\n/g, '<br>')}</div>
      <div><button class="secondary" data-action="lookup-play">▶ 播放</button> <button class="link" data-action="lookup-close">关闭</button></div>
    </div>`;
}

function renderDialog(sc: Scene): string {
  if (!sc.dialog?.length) return '';
  return `<h2>小对话</h2>
    <div class="dialog">${sc.dialog
      .map(
        (l, i) => `<div class="bubble ${l.who === 'A' ? 'a' : 'b'} ${playingLine === i ? 'playing' : ''}">
          <button class="play-btn sm" data-action="phrase-play" data-id="${esc(l.id)}" aria-label="播放这句">▶</button>
          <div class="bubble-text"><b>${tokHtml(l.en)}</b><span>${esc(l.zh)}</span></div></div>`,
      )
      .join('')}</div>
    <button class="secondary big" data-action="dialog-play">整段播放</button>
    <button class="primary big" data-action="role-open">角色扮演:我来演一个人</button>
    <button class="secondary big" data-action="tutor-scene">免手操:整个场景自动播放</button>`;
}

const frameSrc = (id: string) => `audio/frames/${id}.mp3`;
const linkSrc = (id: string, slow = false) => `audio/linking/${id}${slow ? '-slow' : ''}.mp3`;

function renderFrames(): string {
  return `<section class="settings">
    <header><button class="link" data-action="home">返回</button><span>句型练习</span></header>
    <p class="hint">记住一个句型,换几个词就能说很多话。点一个句型,听、读、再考考自己。</p>
    <div class="scene-list">${frames
      .map(
        (f) => `<button class="scene" data-action="frame" data-id="${esc(f.id)}"><b>${esc(f.en.replace('{}', '…'))}</b><span>${esc(f.zh.replace('{}', '…'))}</span></button>`,
      )
      .join('')}</div></section>`;
}

function renderFrame(): string {
  const f = currentFrame;
  if (!f) return '';
  return `<section class="settings">
    <header><button class="link" data-action="frames">返回</button><span>${esc(f.en.replace('{}', '…'))}</span></header>
    <p class="hint">${esc(f.zh.replace('{}', '…'))}　点 ▶ 听整句,🎤 跟着读。</p>
    <div class="phrase-list">${f.fills
      .map(
        (x) => `<div class="phrase" data-id="${esc(x.id)}"><button class="play-btn" data-action="frame-play" data-id="${esc(x.id)}" aria-label="播放">▶</button>
          <div class="phrase-text"><b>${esc(x.en)}</b><span>${esc(x.zhFull)}</span></div></div>`,
      )
      .join('')}</div>
    ${renderShadow(frameSrc(f.fills[lastFrameFill(f)].id))}
    <button class="primary big" data-action="frame-quiz">考考我(5 题)</button>
  </section>`;
}

let frameFillIdx = 0;
function lastFrameFill(f: Frame): number {
  return Math.min(frameFillIdx, f.fills.length - 1);
}

function renderLinking(): string {
  return `<section class="settings">
    <header><button class="link" data-action="home">返回</button><span>连读与弱读</span></header>
    <p class="hint">真实对话里,英语说得很快,词会连在一起、变轻。每条先听"慢速"再听"自然",看"听起来像"。</p>
    <div class="phrase-list">${linkItems
      .map(
        (it) => `<div class="link-item"><div class="link-en"><b>${esc(it.en)}</b><span>${esc(it.zh)}</span></div>
          <div class="link-sounds">听起来像:<b>${esc(it.sounds)}</b></div>
          <div class="link-note">${esc(it.note)}</div>
          <div class="link-btns"><button class="secondary" data-action="link-play" data-id="${esc(it.id)}" data-slow="1">▶ 慢速</button><button class="secondary" data-action="link-play" data-id="${esc(it.id)}">▶ 自然</button></div></div>`,
      )
      .join('')}</div>
    <button class="primary big" data-action="link-quiz">听写小测(5 题)</button>
  </section>`;
}

function renderDrillQuiz(): string {
  const d = drill;
  if (!d) return '';
  if (d.idx >= d.qs.length) {
    return `<section class="settings"><header><button class="link" data-action="drill-back">返回</button><span>${esc(d.title)}</span></header>
      <div class="quiz-result"><h2>答对 ${d.correct} / ${d.qs.length}</h2><p class="hint">${d.correct === d.qs.length ? '全对!' : '再听几遍就更稳了。'}</p></div>
      <button class="primary big" data-action="drill-back">完成</button></section>`;
  }
  const q = d.qs[d.idx];
  const opts = q.options
    .map((o) => {
      const cls = d.picked === null ? '' : o === q.answer ? 'right' : o === d.picked ? 'wrong' : '';
      return `<button class="quiz-option ${cls}" data-action="drill-pick" data-o="${esc(o)}" ${d.picked !== null ? 'disabled' : ''}>${esc(o)}</button>`;
    })
    .join('');
  return `<section class="settings"><header><button class="link" data-action="drill-back">退出</button><span>${esc(d.title)} ${d.idx + 1}/${d.qs.length}</span></header>
    <div class="quiz-prompt">${q.audioId ? `<button class="play-btn" data-action="drill-hear" aria-label="播放">▶</button>` : ''}<b>${esc(q.prompt)}</b></div>
    <div class="quiz-options">${opts}</div>
    ${d.picked !== null ? `<button class="primary big" data-action="drill-next">下一题</button>` : ''}
  </section>`;
}

function roleLinesHtml(r: RoleState): string {
  return r.lines
    .slice(0, r.idx + 1)
    .map((l, i) => {
      const mine = l.who === r.me;
      const hidden = mine && i === r.idx && !r.revealed;
      return `<div class="bubble ${l.who === 'A' ? 'a' : 'b'} ${i === r.idx ? 'playing' : ''}">
        <div class="bubble-text"><b>${hidden ? '……' : tokHtml(l.en)}</b><span>${esc(l.zh)}</span></div></div>`;
    })
    .join('');
}

function renderRole(): string {
  const sc = currentScene;
  if (!sc) return '';
  if (!role) {
    return `<section class="settings"><header><button class="link" data-action="scene-back">返回</button><span>角色扮演 · ${esc(sc.title)}</span></header>
      <p class="hint">你来演其中一个人。对方说话会自动播放;轮到你时先看中文提示,试着用英语说出来(可以录音),再点"看答案"对照。</p>
      <button class="primary big" data-action="role-start" data-me="A">我演第一个人(先开口)</button>
      <button class="secondary big" data-action="role-start" data-me="B">我演第二个人(先听)</button></section>`;
  }
  const t = roleTurn(role);
  const total = myLineCount(role);
  const mineDone = role.lines.slice(0, role.idx).filter((l) => l.who === role!.me).length;
  if (t === 'end') {
    return `<section class="settings"><header><button class="link" data-action="role-exit">返回</button><span>角色扮演 · ${esc(sc.title)}</span></header>
      <div class="dialog">${role.lines.map((l) => `<div class="bubble ${l.who === 'A' ? 'a' : 'b'}"><div class="bubble-text"><b>${tokHtml(l.en)}</b><span>${esc(l.zh)}</span></div></div>`).join('')}</div>
      <p class="notice">演完了!你说了 ${total} 句。</p>
      <button class="primary big" data-action="role-again">再演一次</button><button class="secondary big" data-action="role-exit">回到场景</button></section>`;
  }
  const cur = role.lines[role.idx];
  const controls =
    t === 'me'
      ? role.revealed
        ? `${renderShadow(`audio/phrases/${cur.id}.mp3`)}<button class="primary big" data-action="role-next">下一句</button>`
        : `<p class="hint">轮到你了:用英语说出“${esc(cur.zh)}”这个意思。</p>${renderShadow(`audio/phrases/${cur.id}.mp3`)}<button class="primary big" data-action="role-reveal">看答案并播放</button>`
      : `<p class="hint">对方在说话…</p>`;
  return `<section class="settings"><header><button class="link" data-action="role-exit">退出</button><span>我演 ${role.me === 'A' ? '第一个人' : '第二个人'} · ${mineDone + (t === 'me' ? 1 : 0)}/${total}</span></header>
    <div class="dialog">${roleLinesHtml(role)}</div>${controls}</section>`;
}

/** 对方的话自动播放,播完自动进到下一句 */
async function roleRun(): Promise<void> {
  const my = ++roleToken;
  while (role && my === roleToken && roleTurn(role) === 'other') {
    render();
    const l = role.lines[role.idx];
    await playPhraseAsync(l.id, l.en, voiceForRole(l.who));
    if (my !== roleToken || !role) return;
    role = roleAdvance(role);
  }
  if (my === roleToken) render();
}

function renderStats(): string {
  const st = statsView;
  if (!st) return '';
  const w = st.week;
  return `<section class="settings">
    <header><button class="link" data-action="home">返回</button><span>学习概况</span></header>
    <div class="cov"><b>${st.cov.toFixed(1)}%</b><span>日常英语覆盖率(粗略估计)</span></div>
    <div class="progress-bar"><div style="width:${Math.min(100, st.cov).toFixed(1)}%"></div></div>
    <p class="hint">已学 ${st.known} 个词。覆盖率只按常用程度给词加权估算:越常用的词占比越大,是个参考,不是考试成绩。</p>
    <h2>最近 7 天</h2>
    <div class="stats">
      <div><b>${w.days}</b><span>学习天数</span></div>
      <div><b>${w.newWords}</b><span>新词</span></div>
      <div><b>${w.reviews}</b><span>做题次数</span></div>
      <div><b>${w.accuracy === null ? '-' : w.accuracy + '%'}</b><span>答对比例</span></div>
    </div>
    <p class="hint">大约学了 ${w.minutes} 分钟。${w.days >= 5 ? '这周很稳,继续!' : w.days >= 1 ? '哪怕每天 10 分钟,比一次学很久有效。' : '这一周还没开始,今天来 10 分钟吧。'}</p>
  </section>`;
}

async function openStats(): Promise<void> {
  const [logs, days] = await Promise.all([allLogs(), allStats()]);
  const known = [...cards.values()].filter((c) => c.state !== 0);
  const rank = (id: number) => byId.get(id)?.freq_rank ?? 9999;
  statsView = {
    cov: coverage(known.map((c) => rank(c.wordId)), words.map((x) => x.freq_rank)),
    known: known.length,
    week: weekSummary(logs, days, new Date(), localDate),
  };
  view = 'stats';
  render();
}

async function acquireWake(): Promise<void> {
  try {
    const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }
}
function releaseWake(): void {
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

function renderTutor(): string {
  const t = tutor;
  if (!t) return '';
  if (t.done) {
    return `<section class="settings"><header><button class="link" data-action="tutor-exit">返回</button><span>免手操</span></header>
      <div class="quiz-result"><h2>这一轮播完了</h2><p class="hint">共 ${t.queue.length} 句。</p></div>
      <button class="primary big" data-action="tutor-again">再来一轮</button></section>`;
  }
  const l = t.queue[t.idx];
  return `<section class="settings tutor">
    <header><button class="link" data-action="tutor-exit">退出</button><span>${t.idx + 1}/${t.queue.length}</span></header>
    <div class="tutor-zh">${esc(l.zh)}</div>
    <div class="tutor-en">${t.phase === 'en' ? esc(l.en) : '…'}</div>
    <p class="hint">屏幕会保持常亮。先想想怎么说,再听标准读法,听两遍。</p>
    <button class="secondary big" data-action="tutor-pause">${t.paused ? '继续' : '暂停'}</button>
  </section>`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function tutorRun(): Promise<void> {
  const my = ++tutorToken;
  while (tutor && my === tutorToken && !tutor.paused) {
    const l = tutor.queue[tutor.idx];
    if (!l) {
      tutor.done = true;
      releaseWake();
      render();
      return;
    }
    tutor.phase = 'zh';
    render();
    await sleep(2500);
    if (my !== tutorToken || !tutor) return;
    tutor.phase = 'en';
    render();
    await playPhraseAsync(l.id, l.en, pickVoice());
    if (my !== tutorToken || !tutor) return;
    await sleep(1200);
    if (my !== tutorToken || !tutor) return;
    await playPhraseAsync(l.id, l.en, 'jenny');
    if (my !== tutorToken || !tutor) return;
    await sleep(1500);
    if (my !== tutorToken || !tutor) return;
    tutor.idx++;
  }
}

function startTutor(lines: { id: string; en: string; zh: string }[]): void {
  tutor = { queue: lines, idx: 0, phase: 'zh', paused: false, done: false };
  view = 'tutor';
  void acquireWake();
  void tutorRun();
}

function learnedQueue(): { id: string; en: string; zh: string }[] {
  const ids = [...phraseCards.keys()].filter((id) => lineById.has(id));
  const pool = ids.length >= 3 ? ids.map((id) => lineById.get(id)!) : scenes[0].phrases;
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 20);
}

function renderScenes(): string {
  return `
    <section class="settings">
      <header><button class="link" data-action="home">返回</button><span>日常会话 ${scenesDone()}/${scenes.length}</span></header>
      <p class="hint">每个场景 8 句最常用的话和一段小对话。先听、跟着读,会了就点"我会了",最后做听句选意思。点句子里的单词能查意思。</p>
      ${renderReviewEntry()}
      <div class="scene-list">${scenes
        .map(
          (sc) => `<button class="scene ${sceneDone(sc) ? 'done' : ''}" data-action="scene" data-id="${esc(sc.id)}">
            <b>${esc(sc.title)}</b><span>${esc(sc.intro)}</span>
            <i>${sceneLearned(sc)}/${sc.phrases.length}${sceneDone(sc) ? ' · 已通关' : ''}</i></button>`,
        )
        .join('')}</div>
    </section>`;
}

function renderScene(): string {
  const sc = currentScene;
  if (!sc) return '';
  if (phraseQuiz && !phraseQuiz.finished) {
    const q = phraseQuiz.questions[phraseQuiz.idx];
    const answered = phraseQuiz.picked !== null;
    return `
      <section class="settings">
        <header><button class="link" data-action="scene-back">返回</button><span>听句选意思 ${phraseQuiz.idx + 1}/${phraseQuiz.questions.length}</span></header>
        <p class="hint">听这句话,选出正确的意思。</p>
        <button class="secondary" data-action="pquiz-play">再听一遍</button>
        <div class="quiz-options">${q.options
          .map((o) => {
            const cls = answered ? (o === q.answer ? 'right' : o === phraseQuiz!.picked ? 'wrong' : '') : '';
            return `<button class="option ${cls}" data-action="pquiz-pick" data-zh="${esc(o)}" ${answered ? 'disabled' : ''}>${esc(o)}</button>`;
          })
          .join('')}</div>
        ${answered ? `<p class="hint"><b>${esc(q.en)}</b></p><button class="primary big" data-action="pquiz-next">${phraseQuiz.idx + 1 === phraseQuiz.questions.length ? '看结果' : '下一题'}</button>` : ''}
      </section>`;
  }
  if (phraseQuiz && phraseQuiz.finished) {
    const ok = phraseQuiz.correct >= Math.ceil(phraseQuiz.questions.length * 0.75);
    return `
      <section class="home">
        <h1>${ok ? '这个场景通关了!' : '再听听看'}</h1>
        <p class="streak">答对 <b>${phraseQuiz.correct}</b> / ${phraseQuiz.questions.length} 题</p>
        <p class="hint">${ok ? '这些话已经能用上了。' : '多听几遍句子,再做一次。'}</p>
        ${
          pathStep() === 'listen'
            ? `<button class="primary big" data-action="path-next">${nextLabel()}</button>
               <button class="secondary big" data-action="pquiz-start">再做一次</button>`
            : `<button class="primary big" data-action="scene-back">回到场景</button>
               <button class="secondary big" data-action="pquiz-start">再做一次</button>`
        }
      </section>`;
  }
  return `
    <section class="settings">
      <header><button class="link" data-action="scenes">返回</button><span>${esc(sc.title)} ${sceneLearned(sc)}/${sc.phrases.length}</span></header>
      <p class="hint">${esc(sc.intro)}</p>
      <div class="howto"><span><b class="play-btn xs">▶</b> 听整句</span><span><u>虚线词</u> 点一下查意思</span><span>听几遍、跟着读,再点"我会了"</span></div>
      <div class="phrase-list">${sc.phrases
        .map((p) => {
          const learned = phraseProgress.get(p.id)?.learned;
          return `<div class="phrase ${learned ? 'learned' : ''}">
            <div class="phrase-main">
              <button class="play-btn" data-action="phrase-play" data-id="${esc(p.id)}" aria-label="播放这句">▶</button>
              <div class="phrase-text"><b>${tokHtml(p.en)}</b><span>${esc(p.zh)}</span></div>
            </div>
            <div class="phrase-actions">
              <button class="chip" data-action="phrase-slow" data-id="${esc(p.id)}">🐢 慢速</button>
              <button class="chip ${learned ? 'on' : ''}" data-action="phrase-learn" data-id="${esc(p.id)}">${learned ? '✓ 已会' : '○ 我会了'}</button>
            </div></div>`;
        })
        .join('')}</div>
      ${renderDialog(sc)}
      ${
        pathStep() === 'phrases'
          ? `<button class="primary big" data-action="path-next">学完了,${nextLabel()}</button>`
          : `<button class="primary big" data-action="pquiz-start">听句选意思</button>`
      }
      ${renderLookup()}
    </section>`;
}

function startPhraseQuiz(sc: Scene): void {
  const pool = scenes.flatMap((x) => x.phrases);
  const picks = shuffle(sc.phrases).slice(0, 4);
  phraseQuiz = {
    questions: picks.map((p) => {
      const wrong = shuffle(pool.filter((x) => x.id !== p.id && x.zh !== p.zh)).slice(0, 2).map((x) => x.zh);
      return { id: p.id, en: p.en, answer: p.zh, options: shuffle([p.zh, ...wrong]) };
    }),
    idx: 0,
    correct: 0,
    picked: null,
    finished: false,
  };
  render();
  playPhrase(picks[0].id, picks[0].en);
}

async function finishPhraseQuiz(sc: Scene): Promise<void> {
  if (!phraseQuiz) return;
  phraseQuiz.finished = true;
  if (phraseQuiz.correct >= Math.ceil(phraseQuiz.questions.length * 0.75)) {
    const rec: PhraseProgress = { id: `scene:${sc.id}`, learned: true, ts: new Date().toISOString() };
    phraseProgress.set(rec.id, rec);
    await savePhraseProgress(rec);
  }
  render();
}

async function togglePhrase(id: string): Promise<void> {
  const cur = phraseProgress.get(id);
  if (cur?.learned) {
    phraseProgress.delete(id);
    await deletePhraseProgress(id);
    phraseCards.delete(id);
    await deletePhraseCard(id);
  } else {
    const now = new Date();
    const rec: PhraseProgress = { id, learned: true, ts: now.toISOString() };
    phraseProgress.set(id, rec);
    await savePhraseProgress(rec);
    const card = learnPhrase(id, now);
    phraseCards.set(id, card);
    await savePhraseCard(card);
  }
  render();
}

function doneCount(): number {
  return [...phonemeProgress.values()].filter((p) => p.done).length;
}

function renderPhonetics(): string {
  const group = (type: Phoneme['type'], title: string) => `
    <h2>${title}</h2>
    <div class="phoneme-grid">${phonemes
      .filter((p) => p.type === type)
      .map((p) => {
        const st = phonemeProgress.get(p.symbol);
        return `<button class="phoneme ${st?.done ? 'done' : ''}" data-action="phoneme" data-symbol="${esc(p.symbol)}">${esc(p.symbol)}</button>`;
      })
      .join('')}</div>`;
  return `
    <section class="settings">
      <header><button class="link" data-action="home">返回</button><span>音标入门 ${doneCount()}/${phonemes.length}</span></header>
      <p class="hint">音标是单词的"读音说明书"。点一个音标,先听例词、看发音提示,再做听音选词。答对 2 题以上就算学会,变成绿色。</p>
      ${group('vowel', '元音(嘴巴张开发的音)')}
      ${group('consonant', '辅音(靠嘴唇、舌头挡一下发的音)')}
    </section>`;
}

function renderPhoneme(): string {
  const p = currentPhoneme;
  if (!p) return '';
  if (quiz && !quiz.finished) {
    const q = quiz.questions[quiz.idx];
    const answered = quiz.picked !== null;
    return `
      <section class="settings">
        <header><button class="link" data-action="phoneme-back">返回</button><span>听音选词 ${quiz.idx + 1}/${quiz.questions.length}</span></header>
        <p class="hint">听发音,选出读音里有 <b>${esc(p.symbol)}</b> 的那个词。</p>
        <button class="secondary" data-action="quiz-play">再听一遍</button>
        <div class="quiz-options">${q.options
          .map((o) => {
            const w = wordByText.get(o);
            const cls = answered ? (o === q.word ? 'right' : o === quiz!.picked ? 'wrong' : '') : '';
            return `<button class="option ${cls}" data-action="quiz-pick" data-word="${esc(o)}" ${answered ? 'disabled' : ''}>
              ${esc(o)}${answered && w ? `<small>/${esc(w.phonetic)}/</small>` : ''}</button>`;
          })
          .join('')}</div>
        ${answered ? `<button class="primary big" data-action="quiz-next">${quiz.idx + 1 === quiz.questions.length ? '看结果' : '下一题'}</button>` : ''}
      </section>`;
  }
  if (quiz && quiz.finished) {
    const ok = quiz.correct >= 2;
    return `
      <section class="home">
        <h1>${ok ? '学会了!' : '再听听看'}</h1>
        <p class="streak">答对 <b>${quiz.correct}</b> / ${quiz.questions.length} 题</p>
        <p class="hint">${ok ? '这个音标变成绿色了。' : '多听几遍例词,再做一次。'}</p>
        <button class="primary big" data-action="phoneme-back">回到音标列表</button>
        <button class="secondary big" data-action="quiz-start">再做一次</button>
      </section>`;
  }
  const exs = p.examples
    .map((e) => {
      const w = wordByText.get(e);
      return `<button class="example-word" data-action="play-example-word" data-word="${esc(e)}">
        <b>${esc(e)}</b><span>/${esc(w?.phonetic ?? '')}/</span><i>播放</i></button>`;
    })
    .join('');
  return `
    <section class="settings">
      <header><button class="link" data-action="phoneme-back">返回</button><span>音标</span></header>
      <div class="card"><div class="word">/${esc(p.symbol)}/</div>
        <div class="meaning">${esc(p.hint)}</div></div>
      <h2>例词(点一下听发音)</h2>
      <div class="example-words">${exs}</div>
      <button class="primary big" data-action="quiz-start">听音选词</button>
    </section>`;
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function startQuiz(p: Phoneme): void {
  const pool = shuffle(p.examples);
  const questions = [0, 1, 2].map((i) => {
    const word = pool[i % pool.length];
    return { word, options: shuffle([word, p.contrast]) };
  });
  quiz = { symbol: p.symbol, questions, idx: 0, correct: 0, picked: null, finished: false };
  render();
  playWord(questions[0].word);
}

async function pickQuiz(word: string): Promise<void> {
  if (!quiz || quiz.picked !== null) return;
  quiz.picked = word;
  if (word === quiz.questions[quiz.idx].word) quiz.correct += 1;
  render();
}

async function nextQuiz(): Promise<void> {
  if (!quiz) return;
  if (quiz.idx + 1 < quiz.questions.length) {
    quiz.idx += 1;
    quiz.picked = null;
    render();
    playWord(quiz.questions[quiz.idx].word);
    return;
  }
  quiz.finished = true;
  const old = phonemeProgress.get(quiz.symbol);
  const p: PhonemeProgress = {
    symbol: quiz.symbol,
    done: (old?.done ?? false) || quiz.correct >= 2,
    best: Math.max(old?.best ?? 0, quiz.correct),
    ts: new Date().toISOString(),
  };
  phonemeProgress.set(p.symbol, p);
  await savePhonemeProgress(p);
  render();
}

function startPhraseReview(): void {
  const ids = duePhrases(phraseCards, new Date())
    .slice(0, settings.sessionSize)
    .map((c) => c.pid);
  if (ids.length === 0) return;
  preview = { queue: ids, revealed: false, done: 0, finished: false };
  view = 'preview';
  render();
}

function renderPreview(): string {
  const pv = preview;
  if (!pv) return '';
  if (pv.finished) {
    return `
      <section class="home">
        <h1>句子复习完成</h1>
        <p class="streak">这次复习了 <b>${pv.done}</b> 次</p>
        ${
          pathStep() === 'phrases'
            ? `<button class="primary big" data-action="path-next">${nextLabel()}</button>`
            : `<button class="primary big" data-action="scenes">回到日常会话</button>`
        }
      </section>`;
  }
  const line = lineById.get(pv.queue[0]);
  const card = phraseCards.get(pv.queue[0]);
  if (!line || !card) return '';
  const now = new Date();
  const labels = pv.revealed ? previewLabels(card, now) : {};
  return `
    <section class="study">
      <header><button class="link" data-action="scenes">退出</button><span>还剩 ${pv.queue.length} 句</span></header>
      <div class="card">
        <p class="hint">这句话用英语怎么说?</p>
        <div class="meaning">${esc(line.zh)}</div>
        ${
          pv.revealed
            ? `<div class="example"><div class="example-en">${tokHtml(line.en)}</div>
                 <div class="speak-row"><button class="secondary" data-action="preview-play">播放</button><button class="secondary" data-action="preview-slow">慢速</button></div>${renderShadow(`audio/phrases/${line.id}.mp3`)}</div>`
            : ''
        }
      </div>
      ${
        pv.revealed
          ? `<div class="grades">${GRADES.map(
              (g, i) =>
                `<button class="grade g${g.grade}" data-action="preview-grade" data-grade="${g.grade}">
                   ${g.label}<small>${labels[g.grade] ?? ''}</small><i>${i + 1}</i></button>`,
            ).join('')}</div>`
          : `<button class="primary big" data-action="preview-reveal">显示英文</button>`
      }
      ${renderLookup()}
    </section>`;
}

async function gradePreview(grade: Grade): Promise<void> {
  resetShadow();
  const pv = preview;
  if (!pv || pv.finished) return;
  const pid = pv.queue[0];
  const card = phraseCards.get(pid);
  if (!card) return;
  const now = new Date();
  const after = ratePhrase(card, grade, now);
  phraseCards.set(pid, after);
  await savePhraseCard(after);
  pv.done += 1;
  pv.queue.shift();
  if (shouldRequeue(after, now)) pv.queue.push(pid);
  pv.revealed = false;
  if (pv.queue.length === 0) {
    pv.finished = true;
    if (pathStep() === 'phrases') markStepDone('phrases');
  }
  render();
}

// ---------- 儿童乐园:图片(表情符号)+ 发音,不依赖中文阅读 ----------
function kidStars(): number {
  return kidGroups.filter((g) => phraseProgress.get(`kid:${g.id}`)?.learned).length;
}

function renderKids(): string {
  return `
    <section class="settings kids">
      <header><button class="link" data-action="home">返回</button><span>儿童乐园 ⭐ ${kidStars()}/${kidGroups.length}</span></header>
      <div class="kid-groups">${kidGroups
        .map((g) => {
          const star = phraseProgress.get(`kid:${g.id}`)?.learned ? '⭐' : '';
          return `<button class="kid-group" data-action="kidgroup" data-id="${esc(g.id)}">
            <span class="kid-emoji">${g.items[0].emoji}</span><b>${esc(g.title)}</b><i>${star}</i></button>`;
        })
        .join('')}</div>
    </section>`;
}

function renderKidGroup(): string {
  const g = kidGroup;
  if (!g) return '';
  if (kidQuiz && !kidQuiz.finished) {
    const q = kidQuiz.questions[kidQuiz.idx];
    const answered = kidQuiz.picked !== null;
    return `
      <section class="settings kids">
        <header><button class="link" data-action="kid-back">返回</button><span>🔊 ${kidQuiz.idx + 1}/${kidQuiz.questions.length}</span></header>
        <button class="kid-replay" data-action="kidquiz-play">🔊</button>
        <div class="kid-options">${q.options
          .map((o) => {
            const cls = answered ? (o.word === q.item.word ? 'right' : o.word === kidQuiz!.picked ? 'wrong' : '') : '';
            return `<button class="kid-option ${cls}" data-action="kidquiz-pick" data-word="${esc(o.word)}" ${answered ? 'disabled' : ''}>${o.emoji}</button>`;
          })
          .join('')}</div>
        ${answered ? `<p class="kid-word">${esc(q.item.word)}</p><button class="primary big" data-action="kidquiz-next">▶</button>` : ''}
      </section>`;
  }
  if (kidQuiz && kidQuiz.finished) {
    const ok = kidQuiz.correct >= 4;
    return `
      <section class="home kids">
        <h1>${ok ? '⭐⭐⭐' : '👍'}</h1>
        <p class="streak">${kidQuiz.correct} / ${kidQuiz.questions.length}</p>
        <button class="primary big" data-action="kid-back">▶</button>
        <button class="secondary big" data-action="kidquiz-start">🔁</button>
      </section>`;
  }
  return `
    <section class="settings kids">
      <header><button class="link" data-action="kids">返回</button><span>${esc(g.title)}</span></header>
      <div class="kid-grid">${g.items
        .map(
          (it) => `<button class="kid-card ${kidShown?.word === it.word && kidShown?.file === it.file ? 'shown' : ''}" data-action="kid-play" data-file="${esc(it.file)}" data-word="${esc(it.word)}">
            <span class="kid-emoji">${it.emoji}</span><b>${esc(it.word === 'orange' && it.emoji === '🟧' ? 'orange' : it.word)}</b><small>${esc(it.zh)}</small></button>`,
        )
        .join('')}</div>
      <button class="primary big" data-action="kidquiz-start">🔊 找一找</button>
    </section>`;
}

function startKidQuiz(g: KidGroup): void {
  const picks = shuffle(g.items).slice(0, 5);
  kidQuiz = {
    questions: picks.map((item) => ({
      item,
      options: shuffle([item, ...shuffle(g.items.filter((x) => x.emoji !== item.emoji)).slice(0, 2)]),
    })),
    idx: 0,
    correct: 0,
    picked: null,
    finished: false,
  };
  render();
  playKid(picks[0].file, picks[0].word);
}

async function finishKidQuiz(g: KidGroup): Promise<void> {
  if (!kidQuiz) return;
  kidQuiz.finished = true;
  if (kidQuiz.correct >= 4) {
    const rec: PhraseProgress = { id: `kid:${g.id}`, learned: true, ts: new Date().toISOString() };
    phraseProgress.set(rec.id, rec);
    await savePhraseProgress(rec);
  }
  render();
}

function renderDone(): string {
  const s = session;
  return `
    <section class="home">
      <h1>这一组完成了</h1>
      <p class="streak">学了 <b>${s?.newLearned ?? 0}</b> 个新词,共答了 <b>${s?.reviewed ?? 0}</b> 次</p>
      <p class="streak">连续学习 <b>${streak}</b> 天</p>
      ${
        pathStep() === 'words'
          ? `<button class="primary big" data-action="path-next">${nextLabel()}</button>
             <button class="secondary big" data-action="home">先到这里</button>`
          : `<button class="primary big" data-action="again">再来一组</button>
             <button class="secondary big" data-action="home">回首页</button>`
      }
    </section>`;
}

function renderPathDone(): string {
  return `
    <section class="home">
      <h1>今天的 10 分钟完成了</h1>
      <p class="streak">今天学了 <b>${todayStats.newCount}</b> 个新词,复习 <b>${todayStats.reviewCount}</b> 次</p>
      <p class="streak">连续学习 <b>${streak}</b> 天</p>
      <p class="hint">够了。想到再来,不用贪多。</p>
      <button class="primary big" data-action="home">回首页</button>
      <button class="secondary big" data-action="bonus">再多学一组单词</button>
    </section>`;
}

function renderPlacement(): string {
  const pl = placement;
  if (!pl) return '';
  const w = pl.sample[pl.idx];
  return `
    <section class="study">
      <header><button class="link" data-action="home">退出</button><span>摸底 ${pl.idx + 1}/${pl.sample.length}</span></header>
      <div class="card quiz">
        <div class="word">${esc(w.word)}</div>
        <div class="phonetic">/${esc(w.phonetic)}/</div>
        <div class="speak-row"><button class="secondary" data-action="placement-play">▶ 听一下</button></div>
        <p class="hint">看到或听到就知道意思吗?拿不准就选"不认识"。</p>
      </div>
      <div class="grades two">
        <button class="grade g1" data-action="placement-answer" data-known="0">不认识</button>
        <button class="grade g3" data-action="placement-answer" data-known="1">认识</button>
      </div>
    </section>`;
}

function renderPlacementResult(): string {
  const pl = placement;
  const plan = placementPlan;
  if (!pl || !plan) return '';
  const known = [...pl.results.values()].filter(Boolean).length;
  const bands = plan.skipBands.map((b) => `第 ${b * 100 + 1}–${b * 100 + 100} 个高频词`);
  return `
    <section class="home">
      <h1>摸底结果</h1>
      <p class="streak">20 个词里你认识 <b>${known}</b> 个</p>
      ${
        plan.toMark.length > 0
          ? `<p class="hint">${bands.length ? `这几段大多认识:${esc(bands.join('、'))}。` : ''}可以先把 <b>${plan.toMark.length}</b> 个词标为"已会",不用再从头学。它们几天后会以练习题的形式复习一次,答错了会自动回到学习里。</p>
             <button class="primary big" data-action="placement-apply">标记这 ${plan.toMark.length} 个词为已会</button>
             <button class="secondary big" data-action="placement-skip">不用了,从头学</button>`
          : `<p class="hint">看来这些词对你都还是新的,从头学最合适。</p>
             <button class="primary big" data-action="placement-skip">好的,开始学</button>`
      }
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
      <label>拼写练习
        <select data-setting="spelling">
          <option value="0" ${settings.spelling ? '' : 'selected'}>不考(先学会听和认)</option>
          <option value="1" ${settings.spelling ? 'selected' : ''}>加入拼写题</option>
        </select>
      </label>
      <label>复习方式
        <select data-setting="practice">
          <option value="1" ${settings.practice ? 'selected' : ''}>混合练习(推荐)</option>
          <option value="0" ${settings.practice ? '' : 'selected'}>只看卡片</option>
        </select>
      </label>
      <label>多种声音
        <select data-setting="voices">
          <option value="1" ${voicesOn.multi ? 'selected' : ''}>开(女声、男声随机,更像真实环境)</option>
          <option value="0" ${voicesOn.multi ? '' : 'selected'}>关(只用 Jenny)</option>
        </select>
      </label>
      ${
        reminderSupported()
          ? `<label>每日提醒
        <select data-setting="reminder"><option value="0" ${reminder.on ? '' : 'selected'}>关</option><option value="1" ${reminder.on ? 'selected' : ''}>开</option></select>
      </label>
      <label>提醒时间
        <input type="time" data-setting="reminderTime" value="${esc(reminder.time)}" />
      </label>`
          : `<p class="hint">每日提醒只在安装的手机 App 里可用。</p>`
      }
      <p class="hint">混合练习:学过的词会用"听音选意思""看中文拼单词""句子填空"来复习,比只看答案记得牢。新词仍用普通卡片。</p>
      <h2>备份</h2>
      <p class="hint">进度只保存在这台设备上。换手机或在电脑上继续学,先导出备份,再到另一边导入。导入会替换那边现有的全部进度。</p>
      <button class="secondary" data-action="export">导出备份</button>
      <button class="secondary" data-action="import">导入备份</button>
      <input id="import-file" type="file" accept="application/json,.json" hidden />
      ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
    </section>`;
}

function render(): void {
  if (['home', 'scenes', 'settings', 'phonetics', 'phoneme', 'kids', 'kidgroup', 'frames', 'frame', 'linking'].includes(view)) pathRun = null;
  const views: Record<View, () => string> = {
    home: renderHome,
    pathdone: renderPathDone,
    placement: renderPlacement,
    placementresult: renderPlacementResult,
    study: renderStudy,
    done: renderDone,
    phonetics: renderPhonetics,
    phoneme: renderPhoneme,
    scenes: renderScenes,
    scene: renderScene,
    preview: renderPreview,
    kids: renderKids,
    kidgroup: renderKidGroup,
    frames: renderFrames,
    frame: renderFrame,
    linking: renderLinking,
    drillquiz: renderDrillQuiz,
    role: renderRole,
    stats: renderStats,
    tutor: renderTutor,
    settings: renderSettings,
  };
  app.innerHTML = views[view]();
}

async function applyPlacement(): Promise<void> {
  const plan = placementPlan;
  if (!plan) return;
  const now = new Date();
  for (const id of plan.toMark) {
    const card = rate(newStoredCard(id, now), 4 as Grade, now);
    cards.set(id, card);
    await saveCard(card);
  }
  saveMeta('placement', { done: true });
  const n = plan.toMark.length;
  placement = null;
  placementPlan = null;
  await goHome();
  notice = `已标记 ${n} 个词为已会。几天后会复习一次确认。`;
  render();
}

async function goHome(): Promise<void> {
  resetShadow();
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
    phonemeProgress = await loadPhonemeProgress();
    phraseProgress = await loadPhraseProgress();
    phraseCards = await loadPhraseCards();
    await refreshStats();
    notice = `导入完成:${cards.size} 张卡片。`;
  } catch (e) {
    notice = `导入失败:${e instanceof Error ? e.message : '文件无法读取'}`;
  }
  render();
}

app.addEventListener('click', (ev) => {
  const tok = (ev.target as HTMLElement).closest<HTMLElement>('[data-lookup]');
  if (tok) {
    lookupWord = byId.get(Number(tok.dataset.lookup)) ?? null;
    render();
    if (lookupWord) playWord(lookupWord.word);
    return;
  }
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  if (playingLine !== -1 && el.dataset.action !== 'dialog-play') {
    stopSequence();
    playingLine = -1;
  }
  switch (el.dataset.action) {
    case 'stats':
      void openStats();
      break;
    case 'tutor-start':
      startTutor(learnedQueue());
      break;
    case 'tutor-scene':
      if (currentScene) startTutor(currentScene.phrases);
      break;
    case 'tutor-again':
      startTutor(learnedQueue());
      break;
    case 'tutor-pause':
      if (tutor) {
        tutor.paused = !tutor.paused;
        if (tutor.paused) {
          tutorToken++;
          stopSequence();
          render();
        } else void tutorRun();
      }
      break;
    case 'tutor-exit':
      tutorToken++;
      stopSequence();
      tutor = null;
      releaseWake();
      view = 'home';
      void goHome();
      break;
    case 'frames':
      view = 'frames';
      render();
      break;
    case 'frame':
      currentFrame = frames.find((x) => x.id === el.dataset.id) ?? null;
      frameFillIdx = 0;
      resetShadow();
      view = 'frame';
      render();
      break;
    case 'frame-play': {
      const f = currentFrame?.fills.find((x) => x.id === el.dataset.id);
      if (f && currentFrame) {
        frameFillIdx = currentFrame.fills.indexOf(f);
        resetShadow();
        playFile(frameSrc(f.id), f.en);
        render();
      }
      break;
    }
    case 'frame-quiz':
      if (currentFrame) {
        drill = { title: '句型小测', back: 'frame', qs: frameQuiz(currentFrame, 5), idx: 0, picked: null, correct: 0 };
        view = 'drillquiz';
        render();
      }
      break;
    case 'linking':
      view = 'linking';
      render();
      break;
    case 'link-play': {
      const it = linkItems.find((x) => x.id === el.dataset.id);
      if (it) playFile(linkSrc(it.id, el.dataset.slow === '1'), el.dataset.slow === '1' ? it.en : it.fast, el.dataset.slow === '1');
      break;
    }
    case 'link-quiz':
      drill = { title: '听写小测', back: 'linking', qs: linkQuiz(linkItems, 5), idx: 0, picked: null, correct: 0 };
      view = 'drillquiz';
      render();
      break;
    case 'drill-hear': {
      const q = drill?.qs[drill.idx];
      const it = linkItems.find((x) => x.id === q?.audioId);
      if (it) playFile(linkSrc(it.id), it.fast);
      break;
    }
    case 'drill-pick':
      if (drill && drill.picked === null) {
        drill.picked = el.dataset.o ?? '';
        if (drill.picked === drill.qs[drill.idx].answer) drill.correct++;
        render();
      }
      break;
    case 'drill-next':
      if (drill) {
        drill.idx++;
        drill.picked = null;
        render();
        const q = drill.qs[drill.idx];
        const it = q?.audioId ? linkItems.find((x) => x.id === q.audioId) : undefined;
        if (it) playFile(linkSrc(it.id), it.fast);
      }
      break;
    case 'drill-back':
      view = drill?.back ?? 'home';
      drill = null;
      render();
      break;
    case 'role-open':
      role = null;
      roleToken++;
      view = 'role';
      render();
      break;
    case 'role-start':
    case 'role-again':
      if (currentScene?.dialog) {
        resetShadow();
        role = startRole(currentScene.dialog, el.dataset.action === 'role-again' ? (role?.me ?? 'A') : (el.dataset.me ?? 'A'));
        void roleRun();
      }
      break;
    case 'role-reveal':
      if (role) {
        role.revealed = true;
        render();
        const l = role.lines[role.idx];
        playFile(`audio/phrases/${l.id}.mp3`, l.en);
      }
      break;
    case 'role-next':
      if (role) {
        resetShadow();
        role = roleAdvance(role);
        void roleRun();
      }
      break;
    case 'role-exit':
      roleToken++;
      stopSequence();
      role = null;
      resetShadow();
      view = 'scene';
      render();
      break;
    case 'path-start':
      startPath();
      break;
    case 'path-next':
      pathNext();
      break;
    case 'word-play':
      if (el.dataset.word) playWord(el.dataset.word);
      break;
    case 'placement-start':
      placement = { sample: pickSample(words), idx: 0, results: new Map() };
      placementPlan = null;
      view = 'placement';
      render();
      playWord(placement.sample[0].word);
      break;
    case 'placement-play': {
      const w = placement?.sample[placement.idx];
      if (w) playWord(w.word);
      break;
    }
    case 'placement-answer': {
      if (!placement) break;
      const w = placement.sample[placement.idx];
      placement.results.set(w.id, el.dataset.known === '1');
      placement.idx += 1;
      if (placement.idx >= placement.sample.length) {
        const plan = decide(placement.results, words);
        placementPlan = { ...plan, toMark: plan.markIds.filter((id) => !cards.has(id)) };
        view = 'placementresult';
        render();
      } else {
        render();
        playWord(placement.sample[placement.idx].word);
      }
      break;
    }
    case 'placement-apply':
      void applyPlacement();
      break;
    case 'placement-skip':
      saveMeta('placement', { done: true });
      placement = null;
      placementPlan = null;
      void goHome();
      break;
    case 'lookup-close':
      lookupWord = null;
      render();
      break;
    case 'lookup-play':
      if (lookupWord) playWord(lookupWord.word);
      break;
    case 'dialog-play':
      if (currentScene) {
        void playSequence(currentScene.dialog, (i) => {
          playingLine = i;
          if (view === 'scene') render();
        });
      }
      break;
    case 'preview-start':
      startPhraseReview();
      break;
    case 'preview-reveal':
      if (preview) {
        preview.revealed = true;
        render();
        const l = lineById.get(preview.queue[0]);
        if (l) playPhrase(l.id, l.en);
      }
      break;
    case 'preview-grade':
      void gradePreview(Number(el.dataset.grade) as Grade);
      break;
    case 'preview-play':
    case 'preview-slow': {
      const l = preview && lineById.get(preview.queue[0]);
      if (l) playPhrase(l.id, l.en, el.dataset.action === 'preview-slow');
      break;
    }
    case 'kids':
      kidQuiz = null;
      view = 'kids';
      render();
      break;
    case 'kidgroup':
      kidGroup = kidGroups.find((g) => g.id === el.dataset.id) ?? null;
      kidQuiz = null;
      kidShown = null;
      view = 'kidgroup';
      render();
      break;
    case 'kid-back':
      kidQuiz = null;
      view = 'kidgroup';
      render();
      break;
    case 'kid-play': {
      const it = kidGroup?.items.find((x) => x.file === el.dataset.file && x.word === el.dataset.word);
      if (it) {
        kidShown = it;
        playKid(it.file, it.word);
        render();
      }
      break;
    }
    case 'kidquiz-start':
      if (kidGroup) startKidQuiz(kidGroup);
      break;
    case 'kidquiz-play': {
      const q = kidQuiz?.questions[kidQuiz.idx];
      if (q) playKid(q.item.file, q.item.word);
      break;
    }
    case 'kidquiz-pick':
      if (kidQuiz && kidQuiz.picked === null && el.dataset.word) {
        kidQuiz.picked = el.dataset.word;
        if (el.dataset.word === kidQuiz.questions[kidQuiz.idx].item.word) kidQuiz.correct += 1;
        render();
      }
      break;
    case 'kidquiz-next':
      if (kidQuiz && kidGroup) {
        if (kidQuiz.idx + 1 < kidQuiz.questions.length) {
          kidQuiz.idx += 1;
          kidQuiz.picked = null;
          render();
          const q = kidQuiz.questions[kidQuiz.idx];
          playKid(q.item.file, q.item.word);
        } else {
          void finishKidQuiz(kidGroup);
        }
      }
      break;
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
    case 'practice-pick': {
      const q = session?.quiz;
      if (!session || !q || session.revealed) break;
      const o = q.options[Number(el.dataset.i)];
      if (o) resolveQuiz(o.ok ? 'right' : 'wrong');
      break;
    }
    case 'spell-submit': {
      const q = session?.quiz;
      const input = document.getElementById('spell-input') as HTMLInputElement | null;
      if (!session || !q || session.revealed || !input) break;
      const typed = input.value.trim();
      if (typed === '') break;
      resolveQuiz(spellOk(typed, q.answer) ? 'right' : 'wrong', typed);
      break;
    }
    case 'practice-skip':
      if (session && session.quiz && !session.revealed) resolveQuiz('wrong');
      break;
    case 'shadow-rec':
      void startRecording().then(() => render());
      break;
    case 'shadow-stop':
      stopRecording();
      break;
    case 'shadow-cmp': {
      const src = el.dataset.src;
      if (src) void comparePlay(src);
      break;
    }
    case 'shadow-mine':
      void playMine();
      break;
    case 'speak-slow': {
      const w = currentWord();
      if (w) playWord(w.word, true);
      break;
    }
    case 'toggle-full':
      if (session) {
        session.showFull = !session.showFull;
        render();
      }
      break;
    case 'speak-example': {
      const w = currentWord();
      const ex = w && examples[w.word]?.[0];
      if (ex && w) playSentence(w.word, ex.en);
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
    case 'phonetics':
      view = 'phonetics';
      render();
      break;
    case 'phoneme':
      currentPhoneme = phonemes.find((p) => p.symbol === el.dataset.symbol) ?? null;
      quiz = null;
      view = 'phoneme';
      render();
      break;
    case 'scenes':
      phraseQuiz = null;
      view = 'scenes';
      render();
      break;
    case 'scene':
      currentScene = scenes.find((x) => x.id === el.dataset.id) ?? null;
      phraseQuiz = null;
      view = 'scene';
      render();
      break;
    case 'scene-back':
      roleToken++;
      role = null;
      phraseQuiz = null;
      view = 'scene';
      render();
      break;
    case 'phrase-play':
    case 'phrase-slow': {
      const ph = el.dataset.id ? lineById.get(el.dataset.id) : undefined;
      if (!ph) break;
      const slow = el.dataset.action === 'phrase-slow';
      const row = el.closest('.phrase, .bubble, .related-line, .hit');
      document.querySelectorAll('.playing-now').forEach((n) => n.classList.remove('playing-now'));
      row?.classList.add('playing-now');
      if (slow) {
        playPhrase(ph.id, ph.en, true);
        setTimeout(() => row?.classList.remove('playing-now'), 3500);
      } else {
        void playPhraseAsync(ph.id, ph.en).then(() => row?.classList.remove('playing-now'));
      }
      break;
    }
    case 'phrase-learn':
      if (el.dataset.id) void togglePhrase(el.dataset.id);
      break;
    case 'pquiz-start':
      if (currentScene) startPhraseQuiz(currentScene);
      break;
    case 'pquiz-play': {
      const q = phraseQuiz?.questions[phraseQuiz.idx];
      if (q) playPhrase(q.id, q.en);
      break;
    }
    case 'pquiz-pick':
      if (phraseQuiz && phraseQuiz.picked === null && el.dataset.zh) {
        phraseQuiz.picked = el.dataset.zh;
        if (el.dataset.zh === phraseQuiz.questions[phraseQuiz.idx].answer) phraseQuiz.correct += 1;
        render();
      }
      break;
    case 'pquiz-next':
      if (phraseQuiz && currentScene) {
        if (phraseQuiz.idx + 1 < phraseQuiz.questions.length) {
          phraseQuiz.idx += 1;
          phraseQuiz.picked = null;
          render();
          const q = phraseQuiz.questions[phraseQuiz.idx];
          playPhrase(q.id, q.en);
        } else {
          void finishPhraseQuiz(currentScene);
        }
      }
      break;
    case 'phoneme-back':
      quiz = null;
      view = 'phonetics';
      render();
      break;
    case 'play-example-word':
      if (el.dataset.word) playWord(el.dataset.word);
      break;
    case 'quiz-start':
      if (currentPhoneme) startQuiz(currentPhoneme);
      break;
    case 'quiz-play':
      if (quiz) playWord(quiz.questions[quiz.idx].word);
      break;
    case 'quiz-pick':
      if (el.dataset.word) void pickQuiz(el.dataset.word);
      break;
    case 'quiz-next':
      void nextQuiz();
      break;
    case 'export':
      void downloadBackup();
      break;
    case 'import':
      document.getElementById('import-file')?.click();
      break;
  }
});

app.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t instanceof HTMLInputElement && t.id === 'search-input') {
    searchQuery = t.value;
    const box = document.getElementById('search-results');
    const main = document.getElementById('home-main');
    if (box) box.innerHTML = renderSearchResults();
    if (main) main.hidden = searchQuery.trim() !== '';
  }
});

async function applyExtraSetting(key: string, value: string): Promise<void> {
  if (key === 'voices') {
    voicesOn = { multi: value === '1' };
    saveMeta('voices', voicesOn);
    setMultiVoice(voicesOn.multi);
    return;
  }
  if (key === 'reminderTime') {
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    reminder = { ...reminder, time: value };
    saveMeta('reminder', reminder);
    if (reminder.on) await enableReminder(Number(value.slice(0, 2)), Number(value.slice(3)));
    return;
  }
  if (value === '1') {
    const r = await enableReminder(Number(reminder.time.slice(0, 2)), Number(reminder.time.slice(3)));
    reminder = { ...reminder, on: r === 'ok' };
    notice = r === 'ok' ? `已设置每天 ${reminder.time} 提醒` : r === 'denied' ? '没有通知权限,请在系统设置里允许"拾语"发通知' : '';
  } else {
    reminder = { ...reminder, on: false };
    await disableReminder();
    notice = '';
  }
  saveMeta('reminder', reminder);
  render();
}

app.addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement | HTMLSelectElement;
  if (t.dataset.setting === 'voices' || t.dataset.setting === 'reminder' || t.dataset.setting === 'reminderTime') {
    void applyExtraSetting(t.dataset.setting, t.value);
    return;
  }
  if (t instanceof HTMLSelectElement && t.dataset.setting) {
    if (t.dataset.setting === 'practice') {
      settings = { ...settings, practice: t.value === '1' };
    } else if (t.dataset.setting === 'spelling') {
      settings = { ...settings, spelling: t.value === '1' };
    } else {
      const key = t.dataset.setting as 'newPerDay' | 'sessionSize';
      settings = { ...settings, [key]: Number(t.value) };
    }
    void saveSettings(settings);
  } else if (t instanceof HTMLInputElement && t.id === 'import-file' && t.files?.[0]) {
    void restoreBackup(t.files[0]);
  }
});

// 电脑键盘:空格显示答案,1 到 4 评分
window.addEventListener('shadow-change', () => {
  if (view === 'study' || view === 'preview' || view === 'frame' || view === 'role') render();
});

document.addEventListener('keydown', (ev) => {
  if (view === 'study' && session?.quiz && !session.revealed) {
    if (ev.target instanceof HTMLInputElement) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        (document.querySelector('[data-action="spell-submit"]') as HTMLElement | null)?.click();
      }
      return;
    }
    if (['1', '2', '3', '4'].includes(ev.key)) {
      (document.querySelector(`[data-action="practice-pick"][data-i="${Number(ev.key) - 1}"]`) as HTMLElement | null)?.click();
    }
    return;
  }
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
  phonemeProgress = await loadPhonemeProgress();
  phraseProgress = await loadPhraseProgress();
  phraseCards = await loadPhraseCards();
  await refreshStats();
  render();
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

void init();
