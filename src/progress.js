// 戦績と実績の保存(設計書 §11)
//
// 端末のローカルに閉じる。オフラインでも遊べるアプリなので、サーバーは使わない。
// localStorage を触るのは load/save だけで、集計と判定は全て純粋関数にしてある
// (test/progress.test.js が localStorage なしで検証できるように)。

import { lsGet, lsSet, lsRemove } from './storage.js';
import { MODE_IDS } from './state.js';
import { computePoints } from './rules/victory.js';
import {
  ACHIEVEMENTS, fishCounts, marksOf, titleOf, unlockedBy, unlockedByFish, unlockedByMeet,
  unlockedByRaid, unlockedBySeen,
} from './achievements.js';
import {
  coinsForCatch, coinsForContest, coinsForFound, coinsForPastCatches, coinsForRaidRun,
} from './rewards.js';
import { dayIndex, questGain, questsFor } from './quests.js';

const KEY = 'progress';
export const PROGRESS_VERSION = 2;

// 遊べるルールの一覧は state.js の MODES が唯一の出どころ。ここは戦績を
// 並べるのに使うだけなので、持ち直さずに借りる。名前は MODES のままにして
// おく ── 読んでいる側(戦績の画面とテスト)がこの名前で参照している。
export const MODES = MODE_IDS;
export const DIFFICULTIES = ['easy', 'normal', 'hard'];

export function emptyProgress() {
  return {
    v: PROGRESS_VERSION,
    games: [],
    achievements: {},
    title: null,
    fish: {},
    meets: {},
    seen: {},
    raid: emptyRaid(),
    // 島の銀貨。coins は手持ち、earned は通算獲得(使っても減らない)。
    // 使い道を作ったとき「これまでいくら稼いだか」を実績側から見たいので
    // 2つに分けてある。
    coins: 0,
    coinsEarned: 0,
    // 買ったもの。{ id: true }。使い道は shop.js が持つ
    owned: {},
    // 今日の依頼の進み具合。日が変わったら作り直す(quests.js)
    quests: emptyQuests(),
  };
}

export const emptyQuests = () => ({ day: 0, n: {}, got: {} });

// 銀貨を足す。手持ちと通算の両方が動く。**減らすのはここを通さない** ──
// 使う側(まだ無い)は別の口を作る。ここを負の数で呼べるようにすると、
// 通算獲得が目減りして「これまでいくら稼いだか」が意味を失う。
export function addCoins(progress, n) {
  const add = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (!add) return progress;
  return {
    ...progress,
    coins: (progress.coins ?? 0) + add,
    coinsEarned: (progress.coinsEarned ?? 0) + add,
  };
}

// 集まり1つぶんの通算。best の単位は遊びによる(釣りは cm、竜は秒)。
// last は「最後に数えた回」の目印(addContestResult 参照)。
export const emptyMeet = () => ({ played: 0, won: 0, best: 0, last: null });

// 蛮族を射る(ひとりの記録)の通算。best/wave/acc は自己最高。
export const emptyRaid = () => ({ played: 0, best: 0, wave: 0, acc: 0, shots: 0, hits: 0 });

// 対戦1回ぶんの記録。state をそのまま持つと重いので、要点だけ取り出す。
// (盤面を再現したいときのために seed は残す)
export function resultOf(state, me, now = Date.now()) {
  return {
    at: now,
    mode: state.mode,
    difficulty: state.difficulty ?? 'normal',
    players: state.players.length,
    seed: state.seed ?? null,
    won: state.winner === me,
    points: computePoints(state, me, { includeHidden: true }),
    turns: state.turn,
    // 実績の進捗(「騎士 3/4」)には過去の最高到達値が要るので、
    // その対戦での到達値をここで焼き付けておく。
    marks: marksOf(state, me),
  };
}

// ---- 集計 ----

// モード×難易度の集計。空でも全ての枠を作るので、表がそのまま描ける。
export function summarize(progress) {
  const byMode = {};
  for (const mode of MODES) {
    byMode[mode] = { played: 0, won: 0, bestPoints: 0, bestTurns: null };
    for (const d of DIFFICULTIES) {
      byMode[mode][d] = { played: 0, won: 0 };
    }
  }
  const total = { played: 0, won: 0, bestPoints: 0, bestTurns: null };
  // 到達値の自己最高。実績の進捗表示に使う
  const bests = {};
  for (const g of progress.games) {
    for (const [k, v] of Object.entries(g.marks ?? {})) {
      if (typeof v === 'number' && v > (bests[k] ?? 0)) bests[k] = v;
    }
    const m = byMode[g.mode];
    if (!m) continue; // 知らないモードの記録(将来の版で遊んだ)は数えない
    const d = m[g.difficulty] ?? m.normal;
    m.played++; d.played++; total.played++;
    if (g.won) {
      m.won++; d.won++; total.won++;
      // 最短勝利と最高得点は「勝った対戦」だけで見る
      if (m.bestTurns == null || g.turns < m.bestTurns) m.bestTurns = g.turns;
      if (total.bestTurns == null || g.turns < total.bestTurns) total.bestTurns = g.turns;
    }
    if (g.points > m.bestPoints) m.bestPoints = g.points;
    if (g.points > total.bestPoints) total.bestPoints = g.points;
  }
  // 蛮族を射るの自己最高も同じ棚に置く。戦績画面の進捗(progressOf)は
  // bests しか見ないので、ここに入れておけば「3/6波」が出せる。
  const raid = progress.raid ?? {};
  bests.raidScore = raid.best ?? 0;
  bests.raidWave = raid.wave ?? 0;
  bests.raidAcc = raid.acc ?? 0;
  // 大会の通算も同じ棚へ。大富豪は「何回遊んだか」と「いちばん大きい卓で
  // 大富豪になったときの人数」に進捗が出せる(ほかの大会は取るか取らないか
  // だけなので、進捗を出しても 0/1 にしかならない)。
  const daifugo = progress.meets?.daifugo ?? {};
  bests.daifugoPlayed = daifugo.played ?? 0;
  bests.daifugoBest = daifugo.best ?? 0;
  // 丸太乗りは「何秒乗っていられたか」に進捗が出せる
  bests.rollBest = progress.meets?.logroll?.best ?? 0;
  bests.fishingBest = progress.meets?.fishing?.best ?? 0;
  bests.raidMeetBest = progress.meets?.raid?.best ?? 0;
  bests.huntWon = progress.meets?.dragonhunt?.won ?? 0;
  // 港での釣り(図鑑)。種類数といちばん大きかった1匹
  const fish = fishCounts(progress.fish);
  bests.fishSpecies = fish.species;
  bests.fishBiggest = fish.biggest;
  return { byMode, total, bests };
}

export function winRate(n) {
  return n.played === 0 ? null : Math.round((n.won / n.played) * 100);
}

// ---- 記録 ----

// 対戦結果を足して、新しく解除された実績の一覧を返す。
// progress は書き換えずに新しいオブジェクトを返す(state と同じ流儀)。
export function addResult(progress, result, ctx) {
  const next = {
    ...progress,
    games: [...progress.games, result],
    achievements: { ...progress.achievements },
  };
  const stats = summarize(next);
  const unlocked = [];
  for (const id of unlockedBy({ ...ctx, result, stats })) {
    if (next.achievements[id]) continue; // すでに持っている
    next.achievements[id] = { at: result.at, mode: result.mode };
    unlocked.push(id);
  }
  // 初めて実績を取ったら、その称号を自動で名乗らせる
  // (設定画面まで行かないと何も起きない、という体験を避ける)
  if (next.title == null && unlocked.length) next.title = unlocked[0];
  return { progress: next, unlocked };
}

// ---- 釣り図鑑 ----
//
// ミニゲームの記録。対戦の戦績とは別枠だが、保存先は同じ(端末のローカル1か所)。
// 魚そのものの定義は minigame/fish.js にあり、ここは「何を何匹・自己最大」だけを持つ。

// 1匹ぶんを足す。progress は書き換えず、新しいものと「初めて/自己記録」を返す。
// 1匹釣った。**実績もここで見る** ── 図鑑は港でひとり釣っただけでも
// 伸びるので、大会の締め(addContestResult)とは別の入口を通す。
export function addCatch(progress, fishId, cm, now = Date.now()) {
  const prev = progress.fish?.[fishId] ?? null;
  const isNew = !prev;
  const isRecord = !prev || cm > prev.best;
  const fish = {
    ...(progress.fish ?? {}),
    [fishId]: {
      n: (prev?.n ?? 0) + 1,
      best: isRecord ? cm : prev.best,
      at: isRecord ? now : prev.at,
    },
  };
  const coins = coinsForCatch(fishId, cm);
  // 掲示板の依頼にも通す(quests.js)。達成ぶんの銀貨は quest 側で払う
  const qr = noteQuest(progress, { type: 'catch', fishId, cm }, now);
  const next = {
    ...addCoins(qr.progress, coins), fish, achievements: { ...progress.achievements },
  };
  const unlocked = [];
  for (const id of unlockedByFish({ fish })) {
    if (next.achievements[id]) continue;   // すでに持っている
    next.achievements[id] = { at: now, mode: null };
    unlocked.push(id);
  }
  // ほかの入口と同じで、初めて取ったらその称号を自動で名乗らせる
  if (next.title == null && unlocked.length) next.title = unlocked[0];
  return { progress: next, isNew, isRecord, unlocked, coins, quests: qr.done, questCoins: qr.coins };
}

// ---- 釣り大会 ----
//
// 散策部屋のミニゲーム。進行はサーバーが持っていて(src/minigame/meet/fishing-contest.js)、
// ここに残すのは「この端末の人が何回出て何回勝ったか」だけ。
//
// key は「部屋のコード + 何回目の大会か」。結果は25秒のあいだ毎秒配られるし、
// その最中に再読み込みすると同じ回がもう一度届く。同じ key は数えない。
export function addContestResult(
  progress,
  { kind = 'fishing', won, score = 0, place = 0, players = 0, key = null, at = Date.now() },
) {
  const prev = progress.meets?.[kind] ?? emptyMeet();
  // 同じ回を二重に数えない。銀貨も同じ ── ここで払うと再読み込みで増える
  if (key != null && prev.last === key) return { progress, unlocked: [], coins: 0 };
  const meet = {
    played: prev.played + 1,
    won: prev.won + (won ? 1 : 0),
    best: Math.max(prev.best ?? 0, score),
    last: key,
  };
  const meets = { ...(progress.meets ?? {}), [kind]: meet };
  const coins = coinsForContest({ kind, entered: true, won, score, place, players });
  // 掲示板へ。**二重に数えない仕掛け(上の key)の内側で呼ぶ** ──
  // 外から呼ぶ形にすると、配り直された結果でもう一度払ってしまう
  const qr = noteQuest(progress, { type: 'meet', kind, won: !!won }, at);
  const next = {
    ...addCoins(qr.progress, coins), meets, achievements: { ...progress.achievements },
  };
  const unlocked = [];
  for (const id of unlockedByMeet({ kind, meet, meets })) {
    if (next.achievements[id]) continue; // すでに持っている
    next.achievements[id] = { at, mode: null };
    unlocked.push(id);
  }
  // 対戦のほうと同じで、初めて取ったらその称号を自動で名乗らせる
  if (next.title == null && unlocked.length) next.title = unlocked[0];
  return { progress: next, unlocked, coins, quests: qr.done, questCoins: qr.coins };
}

// ---- 蛮族を射る(ひとりの記録)----
//
// 大会(meets)と違って、ひとりで櫓に立った回も数える。大会に出た回も
// ここに足す ── 同じ弓の腕前の記録なので、別々に持つと「自己最高」が
// 2つできてどちらを出すか決められなくなる。
//
// 命中率だけは回ごとに見る。合計の射数で割ると、下手な回を数多く重ねた
// 人ほど分母が育って、7割に届かなくなる(腕が上がっても記録が伸びない)。

// 命中率を記録に残す最低の射数。3射して2本当たった回が自己最高として
// 残ると、狙いの精度の記録として意味をなさない。
export const ACC_MIN_SHOTS = 20;

export function addRaidRun(progress, { score = 0, wave = 1, shots = 0, hits = 0 } = {}, at = Date.now()) {
  const prev = progress.raid ?? emptyRaid();
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const s = n(shots);
  const h = Math.min(s, n(hits));
  const acc = s >= ACC_MIN_SHOTS ? Math.round((h / s) * 100) : 0;
  const raid = {
    played: prev.played + 1,
    best: Math.max(prev.best, n(score)),
    wave: Math.max(prev.wave, n(wave)),
    acc: Math.max(prev.acc, acc),
    shots: prev.shots + s,
    hits: prev.hits + h,
  };
  const coins = coinsForRaidRun({ score: n(score), shots: s });
  const qr = noteQuest(progress, { type: 'raid', score: n(score) }, at);
  const next = {
    ...addCoins(qr.progress, coins), raid, achievements: { ...progress.achievements },
  };
  const unlocked = [];
  for (const id of unlockedByRaid({ raid })) {
    if (next.achievements[id]) continue; // すでに持っている
    next.achievements[id] = { at, mode: null };
    unlocked.push(id);
  }
  // 対戦・大会と同じで、初めて取ったらその称号を自動で名乗らせる
  if (next.title == null && unlocked.length) next.title = unlocked[0];
  return { progress: next, unlocked, coins, quests: qr.done, questCoins: qr.coins };
}

// ---- 島で見つけたもの ----
//
// 勝ち負けではなく「そこへ行った」で付くもの(いまは竜の巣だけ)。
// 大会の通算とは別枠 ── あちらは回ごとに数えるが、こちらは一度きり。
export function noteSeen(progress, id, at = Date.now()) {
  if (progress.seen?.[id]) return { progress, unlocked: [], coins: 0 };  // もう行っている
  const seen = { ...(progress.seen ?? {}), [id]: at };
  const coins = coinsForFound(id);
  const next = { ...addCoins(progress, coins), seen, achievements: { ...progress.achievements } };
  const unlocked = [];
  for (const a of unlockedBySeen({ seen })) {
    if (next.achievements[a]) continue;
    next.achievements[a] = { at, mode: null };
    unlocked.push(a);
  }
  // 対戦・大会と同じで、初めて取ったらその称号を自動で名乗らせる
  if (next.title == null && unlocked.length) next.title = unlocked[0];
  return { progress: next, unlocked, coins };
}

// ---- 島の掲示板(日替わりの依頼)----
//
// 何が出ているかは quests.js(日付だけで決まる純粋な計算)。ここが持つのは
// 「今日どこまで進んだか」だけ。
//
// **日が変わったら白紙に戻す。** 昨日の進みを持ち越すと、日をまたいで
// 積んだ数で今日の依頼がいきなり終わる。

function questsToday(progress, now) {
  const day = dayIndex(now);
  const q = progress?.quests;
  if (!q || q.day !== day) return { day, n: {}, got: {} };
  return { day, n: { ...q.n }, got: { ...q.got } };
}

// 掲示板に出す形。依頼そのもの + いまの進み + 済んだか。
export function questBoard(progress, now = Date.now()) {
  const st = questsToday(progress, now);
  return questsFor(now).map((q) => ({
    ...q,
    at: Math.min(q.goal, st.n[q.id] ?? 0),
    done: !!st.got[q.id],
  }));
}

// 遊びの結果1つを掲示板に通す。達成した依頼があれば銀貨を払う。
//
// **呼ぶのは addCatch / addContestResult / addRaidRun の中から。** 画面側から
// 別に呼ぶ形にすると、二重に数えない仕掛け(大会の key)をすり抜ける。
export function noteQuest(progress, ev, now = Date.now()) {
  const st = questsToday(progress, now);
  const done = [];
  let coins = 0;
  let moved = st.day !== progress?.quests?.day;
  for (const q of questsFor(now)) {
    if (st.got[q.id]) continue;
    const gain = questGain(q, ev);
    if (!gain) continue;
    const at = Math.min(q.goal, (st.n[q.id] ?? 0) + gain);
    if (at === (st.n[q.id] ?? 0)) continue;
    st.n[q.id] = at;
    moved = true;
    if (at >= q.goal) {
      st.got[q.id] = true;
      coins += q.reward;
      done.push(q);
    }
  }
  if (!moved) return { progress, done: [], coins: 0 };
  return { progress: { ...addCoins(progress, coins), quests: st }, done, coins };
}

// 図鑑の埋まり具合。total は魚の総数(呼ぶ側が fish.js から渡す)。
export function fishbookCount(progress, total) {
  const book = progress.fish ?? {};
  const got = Object.keys(book).length;
  return { got, total, caught: Object.values(book).reduce((s, e) => s + (e.n ?? 0), 0) };
}

// 名乗る称号を選ぶ。持っていない実績の称号は名乗れない(null で「称号なし」)。
export function setTitle(progress, id) {
  if (id != null && !progress.achievements[id]) return progress;
  return { ...progress, title: id };
}

// いま名乗っている称号の文字列。持っていない実績を指していたら null。
export function currentTitle(progress) {
  const id = progress.title;
  if (!id || !progress.achievements[id]) return null;
  return titleOf(id);
}

export function achievementCount(progress) {
  return {
    got: ACHIEVEMENTS.filter((a) => progress.achievements[a.id]).length,
    total: ACHIEVEMENTS.length,
  };
}

// ---- 保存 ----

// 壊れた値が入っていても遊べなくならないように、読めなければ空から始める。
export function parseProgress(raw) {
  if (!raw) return emptyProgress();
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return emptyProgress();
    return {
      v: PROGRESS_VERSION,
      games: Array.isArray(p.games) ? p.games.filter((g) => g && typeof g === 'object') : [],
      achievements: p.achievements && typeof p.achievements === 'object' ? p.achievements : {},
      title: typeof p.title === 'string' ? p.title : null,
      // 釣り図鑑は後から足した。古い保存には無いので、無ければ空で始める
      fish: p.fish && typeof p.fish === 'object' ? p.fish : {},
      meets: sanitizeMeets(p),
      // 島で見つけたもの。あとから足したので、無ければ空で始める
      seen: sanitizeSeen(p?.seen),
      // 蛮族を射るの記録。これもあとから足した
      raid: sanitizeRaid(p?.raid),
      ...coinsOf(p),
      owned: sanitizeOwned(p?.owned),
      quests: sanitizeQuests(p?.quests),
    };
  } catch {
    return emptyProgress();
  }
}

// 島の銀貨。**v2 で足したので、それ以前の保存には入っていない。**
//
// 「これまでの釣果はさかのぼって換算する」と決めたので、初回の読み込みで
// 一度だけ払う。二度払わないように、v2 以降は保存された値をそのまま使う
// (v を見ずに「coins が無ければ払う」にすると、使い切って 0 になった人に
// もう一度払ってしまう)。
//
// 大会の成績は換算しない。保存にあるのは played / won / best の合計だけで、
// 1回ずつの成績が残っていないため、払うべき額を作れない
// (best から逆算すると、上手い1回を何十回ぶんにも数えることになる)。
function coinsOf(p) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const v = n(p?.v);
  if (v >= 2) return { coins: n(p.coins), coinsEarned: n(p.coinsEarned) };
  const back = coinsForPastCatches(p?.fish);
  return { coins: back, coinsEarned: back };
}

// 今日の依頼の進み。**壊れていたら白紙**にしてよい ── その日のぶんしか
// 意味がなく、実績や図鑑のように失うと痛いものではない。
function sanitizeQuests(src) {
  if (!src || typeof src !== 'object') return emptyQuests();
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const day = num(src.day);
  if (!day) return emptyQuests();
  const n = {};
  for (const [id, v] of Object.entries(src.n ?? {})) {
    const k = num(v);
    if (k) n[id] = k;
  }
  const got = {};
  for (const [id, v] of Object.entries(src.got ?? {})) if (v) got[id] = true;
  return { day, n, got };
}

// 行った場所。値は「いつ行ったか」なので、数でないものは落とす
// (壊れた値でも「行ったこと」は残す ── 実績を取り消すほうが害が大きい)。
function sanitizeSeen(src) {
  if (!src || typeof src !== 'object') return {};
  const out = {};
  for (const [id, at] of Object.entries(src)) {
    if (!at) continue;
    out[id] = typeof at === 'number' && Number.isFinite(at) && at > 0 ? at : 1;
  }
  return out;
}

// 蛮族を射るの通算。数でないものは 0 に倒す(sanitizeMeet と同じ理由 ──
// NaN のまま足すと、以後ずっと NaN が保存に焼き付く)。
function sanitizeRaid(m) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  if (!m || typeof m !== 'object') return emptyRaid();
  return {
    played: n(m.played), best: n(m.best), wave: n(m.wave),
    // 命中率は割合なので 100 で頭を打つ
    acc: Math.min(100, n(m.acc)),
    shots: n(m.shots), hits: n(m.hits),
  };
}

// 集まりの通算。もとは釣り大会1つぶんだけを meet に持っていたので、
// 古い保存があれば釣りの欄へ移す(遊びが増えたので遊びごとに分けた)。
function sanitizeMeets(p) {
  const out = {};
  const src = (p?.meets && typeof p.meets === 'object') ? p.meets : {};
  for (const [kind, m] of Object.entries(src)) out[kind] = sanitizeMeet(m);
  if (!out.fishing && p?.meet) {
    const old = sanitizeMeet(p.meet);
    // 旧い版は cm でしか持っていない
    old.best = sanitizeMeet({ best: p.meet.bestCm }).best;
    if (old.played) out.fishing = old;
  }
  return out;
}

// 数でないものが入っていたら 0 に倒す
// (壊れた値のまま足すと NaN が保存に焼き付いて、以後ずっと NaN になる)。
function sanitizeMeet(m) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  if (!m || typeof m !== 'object') return emptyMeet();
  return {
    played: n(m.played),
    won: n(m.won),
    best: n(m.best),
    last: typeof m.last === 'string' ? m.last : null,
  };
}

// **すでに達成しているぶんを、後から足した実績にも行き渡らせる。**
//
// 集まり・釣り・蛮族・島で見つけたもの の判定は、どれも「保存してある記録
// だけ」で決まる純粋な式で、走るのは**その遊びを次に終えたとき**だけ。
// つまり実績を後から足すと、すでに条件を満たしている人には付かないまま
// 残る ── 実際、竜から3回逃げきっている人の画面に「5/3回」と出たまま
// 鍵がかかっていた。読み込むたびに保存してある記録と突き合わせて埋める。
//
// 対戦の締め(unlockedBy)も埋める。あちらは「その1戦で何をしたか」が要るが、
// **1戦ぶんの記録(games)に marks ごと残してある**ので、そこを順に通せば
// 同じ判定ができる ── 実績を足したときだけでなく、**しきい値を緩めたとき**も
// 遡って付く(「50ターン以内」を 60 に緩めたら、55ターンで勝った過去の回にも
// 付いてほしい)。
export function reconcileAchievements(progress, at = Date.now()) {
  const stats = summarize(progress);
  const fromGames = [];
  for (const g of progress.games ?? []) {
    if (!g || typeof g !== 'object') continue;
    fromGames.push(...unlockedBy({ marks: g.marks ?? {}, result: g, stats }));
  }
  const ids = [
    ...fromGames,
    ...unlockedByMeet({ meets: progress.meets ?? {} }),
    ...unlockedByFish({ fish: progress.fish ?? {} }),
    ...unlockedByRaid({ raid: progress.raid ?? emptyRaid() }),
    ...unlockedBySeen({ seen: progress.seen ?? {} }),
  ];
  const unlocked = ids.filter((id) => !progress.achievements?.[id]);
  if (!unlocked.length) return { progress, unlocked };
  const next = { ...progress, achievements: { ...progress.achievements } };
  for (const id of unlocked) next.achievements[id] = { at, mode: null };
  // 称号は名乗っていなければ入れる。**名乗っているものは触らない** ──
  // 後から足した実績で勝手に名前が変わると気味が悪い。
  if (next.title == null) next.title = unlocked[0];
  return { progress: next, unlocked };
}

export function loadProgress() {
  try {
    const raw = lsGet(KEY);
    const parsed = parseProgress(raw);
    // 後から足した実績のぶんを埋める。埋めたら保存しておく
    // (毎回埋め直すと、取った日付が読み込むたびに変わってしまう)。
    const { progress, unlocked } = reconcileAchievements(parsed);
    // **版が上がったら、埋めるものが無くてもその場で保存する。**
    // 保存しないと古い版のまま残り、「さかのぼりの換算は一度だけ」が
    // 次の保存が起きるまで宙に浮く(読むたびに計算し直すことになる)。
    if (unlocked.length || versionOf(raw) < PROGRESS_VERSION) saveProgress(progress);
    return progress;
  } catch {
    return emptyProgress(); // localStorage が使えない環境(プライベートモード等)
  }
}

// 買ったもの。true 以外は落とす(壊れた値で「持っている」ことにしない)
function sanitizeOwned(src) {
  if (!src || typeof src !== 'object') return {};
  const out = {};
  for (const [id, has] of Object.entries(src)) if (has === true) out[id] = true;
  return out;
}

// 保存されている版。読めなければ 0(=いちばん古い扱い)
function versionOf(raw) {
  if (!raw) return PROGRESS_VERSION;   // まっさら。移行するものが無い
  try {
    const v = JSON.parse(raw)?.v;
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  } catch {
    return PROGRESS_VERSION;           // 壊れている。空から始まるので移行不要
  }
}

export function saveProgress(progress) {
  try {
    lsSet(KEY, JSON.stringify(progress));
  } catch {
    // 容量超過などで保存できなくても対戦は続けられる
  }
}

export function clearProgress() {
  try {
    lsRemove(KEY);
  } catch {
    // 消せなくても致命的ではない
  }
}
