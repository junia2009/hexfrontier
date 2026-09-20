// 島の掲示板 ── 日替わりの依頼(設計書 §12)
//
// 実績が「一度きりの勲章」、銀貨が「遊ぶたびの稼ぎ」なのに対して、
// 依頼は**その日だけの目標**。新しい遊びは増やさず、いまある遊びに
// 「今日やる理由」を足すためのもの。
//
// 決めごと(店 shop.js の禁じ手と同じ筋):
//
//  1. **買わないと達成できない依頼を作らない。** 狙う魚は SHORE_FISH から
//     だけ選び、「合計◯cm」「◯cm 以上を1匹」も港の魚しか数えない ──
//     沖と夜の魚は店の品(深場の竿・ランタン)が要るし、桁が違う
//     (リュウグウノツカイは 800cm。1匹で「合計 500cm」が終わってしまう)。
//  2. **勝ちだけを条件にしない。** 優勝の依頼は型が1つしかないので
//     1日に1本まで。勝てない人の掲示板が永久に埋まらないのを避ける。
//  3. **1本は必ず釣り。** ほかの2本は島が決まっていることがあるので、
//     いまいる島で何も進まない日ができないようにする。
//  4. 報酬は銀貨だけ。遊びを有利にするものは配らない。
//
// **日付だけで決まる。** state.rng も Math.random も使わない ── 同じ日なら
// 誰の画面でも同じ3本が出る(「今日のあれ、やった?」が成り立つ)。
//
// 全て純粋関数。progress も localStorage も触らない。

import { makeRng, rngInt, shuffled } from './rng.js';
import { FISH_BY_ID, SHORE_FISH, isGated } from './minigame/fish.js';
import { MEETS } from './minigame/meets.js';
import { MODE_JP } from './achievements.js';

export const QUESTS_PER_DAY = 3;

// 島の時刻。**端末の時間帯を見ない** ── 見ると、日付の変わり目が人によって
// ずれて「同じ日なら同じ3本」が崩れるうえ、テストが動かす機械の設定で
// 落ちるようになる(CI は UTC)。
export const ISLAND_TZ_MIN = 9 * 60;   // UTC+9
const DAY_MS = 86400000;

export function dayIndex(now = Date.now()) {
  const t = typeof now === 'number' && Number.isFinite(now) ? now : 0;
  return Math.floor((t + ISLAND_TZ_MIN * 60000) / DAY_MS);
}

// 掲示板に出す日付。「9/20」だけ ── 年は掲示板には要らない
export function dayLabel(now = Date.now()) {
  const d = new Date(dayIndex(now) * DAY_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// 集まりの種類(fishing / daifugo / …)から、その受付が立つ島を引く。
// meets.js が「島 → 集まり」で持っているので、ここで裏返す。
export const MEET_MODE = Object.fromEntries(
  Object.entries(MEETS).map(([mode, m]) => [m.id, mode]),
);
export const MEET_BY_KIND = Object.fromEntries(
  Object.values(MEETS).map((m) => [m.id, m]),
);

const MEET_KINDS = Object.keys(MEET_BY_KIND);

// 依頼の難しさは3段。報酬もそれに合わせて上げる。
// **1日3本ぜんぶ達成して 70〜160 枚**(いちばん安い日といちばん高い日)。
// 上出来な大会1回が 50〜60 枚なので、その1〜3倍に収まる ──
// 掲示板だけを回すのがいちばん儲かる形にしない。
// (test/quests.test.js が何年ぶんも回して、この帯から出ないか見ている)
const CATCH_GOAL = { common: [3, 4, 5], rare: [2, 3, 3] };
const CATCH_COIN = { common: [25, 30, 35], rare: [35, 40, 45] };
const CM_GOAL = [300, 500, 800];
const CM_COIN = [25, 35, 50];
const BIG_GOAL = [60, 100, 150];
const BIG_COIN = [30, 40, 55];
const RAID_GOAL = [120, 200, 300];
const RAID_COIN = [25, 35, 50];
const JOIN_COIN = 20;    // 出るだけ。いちばん軽い
// 優勝。いちばん重いが、**いちばん高い3本がそろっても 160 枚**に収まる値に
// してある(50 + 55 + 55)── 上出来な大会1回の3倍が、掲示板の1日の上限。
const WIN_COIN = 55;

// 狙う魚に選べるもの。**ガラクタとぬしと、まぼろしは外す** ──
// ガラクタは狙う意味がなく、ぬしは港が決まっていて出会えないことがある。
const TARGET_FISH = SHORE_FISH.filter((f) => f.tier === 'common' || f.tier === 'rare');

// ---- 依頼の型 ----
//
// それぞれ「種(rng の状態)を受け取って、依頼1本と次の種を返す」。
// 型は1日に1本まで(同じ型が2本並ぶと掲示板が単調になる)。

function catchQuest(s) {
  let i;
  [s, i] = rngInt(s, TARGET_FISH.length);
  const fish = TARGET_FISH[i];
  let lv;
  [s, lv] = rngInt(s, 3);
  const goal = CATCH_GOAL[fish.tier][lv];
  return [s, {
    id: `catch:${fish.id}:${goal}`,
    type: 'catch',
    fishId: fish.id,
    icon: fish.icon,
    text: `${fish.name}を${goal}匹つる`,
    goal,
    unit: '匹',
    reward: CATCH_COIN[fish.tier][lv],
    mode: null,
  }];
}

function cmQuest(s) {
  let lv;
  [s, lv] = rngInt(s, CM_GOAL.length);
  const goal = CM_GOAL[lv];
  return [s, {
    id: `cm:${goal}`,
    type: 'cm',
    icon: '📏',
    text: `合計${goal}cm つりあげる`,
    goal,
    unit: 'cm',
    reward: CM_COIN[lv],
    mode: null,
  }];
}

function bigQuest(s) {
  let lv;
  [s, lv] = rngInt(s, BIG_GOAL.length);
  const goal = BIG_GOAL[lv];
  return [s, {
    id: `big:${goal}`,
    type: 'big',
    icon: '🎣',
    text: `${goal}cm 以上を1匹つる`,
    goal,
    unit: 'cm',
    reward: BIG_COIN[lv],
    mode: null,
  }];
}

function joinQuest(s) {
  let i;
  [s, i] = rngInt(s, MEET_KINDS.length);
  const kind = MEET_KINDS[i];
  const meet = MEET_BY_KIND[kind];
  return [s, {
    id: `join:${kind}`,
    type: 'join',
    kind,
    icon: '📋',
    text: `${meet.name}に出る`,
    goal: 1,
    unit: '回',
    reward: JOIN_COIN,
    mode: MEET_MODE[kind],
  }];
}

function winQuest(s) {
  let i;
  [s, i] = rngInt(s, MEET_KINDS.length);
  const kind = MEET_KINDS[i];
  const meet = MEET_BY_KIND[kind];
  return [s, {
    id: `win:${kind}`,
    type: 'win',
    kind,
    icon: '🥇',
    text: `${meet.name}で優勝する`,
    goal: 1,
    unit: '回',
    reward: WIN_COIN,
    mode: MEET_MODE[kind],
  }];
}

function raidQuest(s) {
  let lv;
  [s, lv] = rngInt(s, RAID_GOAL.length);
  const goal = RAID_GOAL[lv];
  return [s, {
    id: `raid:${goal}`,
    type: 'raid',
    icon: '🏹',
    text: `蛮族を射るで${goal}点とる`,
    goal,
    unit: '点',
    reward: RAID_COIN[lv],
    mode: MEET_MODE.raid ?? 'cak',
  }];
}

// 釣りの型。**掲示板の1本目は必ずここから出す**(決めごと3)。
const FISH_MAKERS = [catchQuest, cmQuest, bigQuest];
const ALL_MAKERS = [...FISH_MAKERS, joinQuest, winQuest, raidQuest];

// その日の依頼3本。同じ日なら何度呼んでも同じものが返る。
export function questsFor(now = Date.now()) {
  const day = dayIndex(now);
  // 日をそのまま種にしない ── 隣り合う日が似た並びになる見た目を避ける。
  // (mulberry32 は隣の種でも十分ばらけるが、ここは1日1回の計算なので
  //  混ぜておいて損がない)
  let s = makeRng(Math.imul(day, 2654435761) >>> 0);
  const out = [];
  let i;
  let q;
  [s, i] = rngInt(s, FISH_MAKERS.length);
  [s, q] = FISH_MAKERS[i](s);
  out.push(q);

  let rest;
  [s, rest] = shuffled(s, ALL_MAKERS);
  for (const make of rest) {
    if (out.length >= QUESTS_PER_DAY) break;
    [s, q] = make(s);
    if (out.some((o) => o.type === q.type)) continue;   // 同じ型は1日1本
    out.push(q);
  }
  return out;
}

// この出来事で、その依頼がどれだけ進むか(進まなければ 0)。
//
// 出来事の形:
//   { type: 'catch', fishId, cm }
//   { type: 'meet', kind, won }
//   { type: 'raid', score }
export function questGain(quest, ev) {
  if (!quest || !ev) return 0;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  // 店の品で開く魚は数えない(決めごと1)。桁も違うので、混ぜると
  // 買った人だけ依頼が一瞬で終わる
  const shore = ev.type === 'catch' && !isGated(FISH_BY_ID[ev.fishId]);
  switch (quest.type) {
    case 'catch':
      return ev.type === 'catch' && ev.fishId === quest.fishId ? 1 : 0;
    case 'cm':
      return shore ? Math.round(num(ev.cm)) : 0;
    case 'big':
      // 1匹で達成か、何も進まないか。**部分点は付けない**
      return shore && num(ev.cm) >= quest.goal ? quest.goal : 0;
    case 'join':
      return ev.type === 'meet' && ev.kind === quest.kind ? 1 : 0;
    case 'win':
      return ev.type === 'meet' && ev.kind === quest.kind && ev.won ? 1 : 0;
    case 'raid':
      return ev.type === 'raid' ? Math.round(num(ev.score)) : 0;
    default:
      return 0;
  }
}

// 掲示板に出す行き先。島が決まっていない依頼は null。
//
// **「◯◯の島」まで作って返す。** 呼ぶ側で「の島」を足す形にしていたら、
// MODE_JP の dragon が「ドラゴンの島」なので「ドラゴンの島の島」になった。
const ISLAND_JP = { ...MODE_JP, dragon: 'ドラゴン' };

export function questWhere(quest) {
  if (!quest?.mode) return null;
  const name = ISLAND_JP[quest.mode];
  return name ? `${name}の島` : null;
}

// その日の依頼をぜんぶ達成したときの合計(掲示板の「今日の実入り」に使う)
export function dayTotal(now = Date.now()) {
  return questsFor(now).reduce((sum, q) => sum + q.reward, 0);
}
