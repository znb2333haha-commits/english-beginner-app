import './style.css';
import wordsData from '../data/words.json';
import examplesData from '../data/examples.json';
import phonemesData from '../data/phonetics.json';
import phrasesData from '../data/phrases.json';
import kidsData from '../data/kids.json';
import { State } from 'ts-fsrs';
import type { Grade } from 'ts-fsrs';
import { playKid, playPhrase, playSentence, playSequence, playWord, stopSequence } from './audio';
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
const scenes = (phrasesData as unknown as { scenes: Scene[] }).scenes;
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

type View = 'home' | 'study' | 'done' | 'settings' | 'phonetics' | 'phoneme' | 'scenes' | 'scene' | 'preview' | 'kids' | 'kidgroup';

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
  session.showFull = false;
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

function renderProgress(): string {
  const p = levelProgress(cards.keys());
  const pct = Math.round((p.learned / p.size) * 100);
  return `<div class="progress">
      <div class="progress-label">第一级 ${p.learned}/${p.size}${p.done ? ' · 学完啦,太棒了!' : ''}</div>
      <div class="progress-bar"><div style="width:${pct}%"></div></div>
    </div>`;
}

function renderHome(): string {
  const due = dueCards(cards, new Date()).length;
  const canStudy = due > 0 || newAllowed() > 0;
  return `
    <section class="home">
      <h1>拾语</h1>
      <p class="tagline">一点一点,拾起英语</p>
      <p class="streak">连续学习 <b>${streak}</b> 天</p>
      <div class="stats">
        <div><b>${todayStats.newCount}/${settings.newPerDay}</b><span>今日新词</span></div>
        <div><b>${todayStats.reviewCount}</b><span>今日复习</span></div>
        <div><b>${due}</b><span>待复习</span></div>
      </div>
      ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
      ${dueCount() > 0 ? `<button class="secondary" data-action="scenes">有 ${dueCount()} 句会话该复习了</button>` : ''}
      ${
        canStudy
          ? `<button class="primary big" data-action="start">来一组</button>
             <p class="hint">每组 ${settings.sessionSize} 张,约 2 到 3 分钟,随时可以退出</p>`
          : `<p class="notice">今天的任务完成了,明天再来。</p>
             <button class="secondary big" data-action="bonus">再多学一组</button>`
      }
      ${renderProgress()}
      <footer>
        <span>已学 ${cards.size} 词 / 词库 ${words.length} 词</span>
        <button class="link" data-action="kids">儿童乐园 ⭐${kidStars()}</button>
        <button class="link" data-action="scenes">日常会话 ${scenesDone()}/${scenes.length}</button>
        <button class="link" data-action="phonetics">音标入门 ${doneCount()}/${phonemes.length}</button>
        <button class="link" data-action="settings">设置与备份</button>
      </footer>
    </section>`;
}

function renderRelated(w: Word): string {
  const lines = (phraseIndex.get(w.id) ?? []).slice(0, 2);
  if (lines.length === 0) return '';
  return `<div class="related"><div class="related-title">会话里怎么说</div>${lines
    .map(
      (l) => `<div class="related-line" data-action="phrase-play" data-id="${esc(l.id)}"><b>${esc(l.en)}</b><span>${esc(l.zh)}</span></div>`,
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

function renderStudy(): string {
  const s = session;
  const w = currentWord();
  if (!s || !w) return '';
  const now = new Date();
  const card = cards.get(w.id) ?? newStoredCard(w.id, now);
  const labels = s.revealed ? previewLabels(card, now) : {};
  const short = shortMeaning(w.meaning);
  const meaning = esc(s.showFull ? w.meaning : short.text).replace(/\n/g, '<br>');
  return `
    <section class="study">
      <header>
        <button class="link" data-action="home">退出</button>
        <span>还剩 ${s.queue.length} 张</span>
      </header>
      <div class="card">
        <div class="word">${esc(w.word)}</div>
        <div class="phonetic">/${esc(w.phonetic)}/</div>
        <div class="speak-row">
          <button class="secondary" data-action="speak">播放发音</button>
          <button class="secondary" data-action="speak-slow">慢速</button>
        </div>
        ${
          s.revealed
            ? `<div class="meaning">${meaning}</div>${
                short.truncated ? `<button class="link" data-action="toggle-full">${s.showFull ? '收起释义' : '显示全部释义'}</button>` : ''
              }${renderExample(w)}${renderRelated(w)}`
            : ''
        }
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
      <div><button class="secondary" data-action="lookup-play">播放</button> <button class="link" data-action="lookup-close">关闭</button></div>
    </div>`;
}

function renderDialog(sc: Scene): string {
  if (!sc.dialog?.length) return '';
  return `<h2>小对话</h2>
    <div class="dialog">${sc.dialog
      .map(
        (l, i) => `<div class="bubble ${l.who === 'A' ? 'a' : 'b'} ${playingLine === i ? 'playing' : ''}" data-action="phrase-play" data-id="${esc(l.id)}">
          <b>${tokHtml(l.en)}</b><span>${esc(l.zh)}</span></div>`,
      )
      .join('')}</div>
    <button class="secondary big" data-action="dialog-play">整段播放</button>`;
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
        <button class="primary big" data-action="scene-back">回到场景</button>
        <button class="secondary big" data-action="pquiz-start">再做一次</button>
      </section>`;
  }
  return `
    <section class="settings">
      <header><button class="link" data-action="scenes">返回</button><span>${esc(sc.title)} ${sceneLearned(sc)}/${sc.phrases.length}</span></header>
      <p class="hint">${esc(sc.intro)} 点句子听发音,跟着读几遍。</p>
      <div class="phrase-list">${sc.phrases
        .map((p) => {
          const learned = phraseProgress.get(p.id)?.learned;
          return `<div class="phrase ${learned ? 'learned' : ''}">
            <div class="phrase-text" data-action="phrase-play" data-id="${esc(p.id)}"><b>${tokHtml(p.en)}</b><span>${esc(p.zh)}</span></div>
            <div class="phrase-btns">
              <button class="link" data-action="phrase-slow" data-id="${esc(p.id)}">慢速</button>
              <button class="link" data-action="phrase-learn" data-id="${esc(p.id)}">${learned ? '✓ 会了' : '我会了'}</button>
            </div></div>`;
        })
        .join('')}</div>
      ${renderDialog(sc)}
      <button class="primary big" data-action="pquiz-start">听句选意思</button>
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
        <button class="primary big" data-action="scenes">回到日常会话</button>
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
                 <div class="speak-row"><button class="secondary" data-action="preview-play">播放</button><button class="secondary" data-action="preview-slow">慢速</button></div></div>`
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
  if (pv.queue.length === 0) pv.finished = true;
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
          : view === 'phonetics'
            ? renderPhonetics()
            : view === 'phoneme'
              ? renderPhoneme()
              : view === 'scenes'
                ? renderScenes()
                : view === 'scene'
                  ? renderScene()
                  : view === 'preview'
                    ? renderPreview()
                    : view === 'kids'
                      ? renderKids()
                      : view === 'kidgroup'
                        ? renderKidGroup()
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
      phraseQuiz = null;
      view = 'scene';
      render();
      break;
    case 'phrase-play':
    case 'phrase-slow': {
      const ph = el.dataset.id ? lineById.get(el.dataset.id) : undefined;
      if (ph) playPhrase(ph.id, ph.en, el.dataset.action === 'phrase-slow');
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
