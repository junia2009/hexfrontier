// 島の掲示板(src/quests.js)と、その進み具合(progress.js)。
//
// 日替わりなので、壊れても「今日はたまたま変だな」で流されやすい。
// **何年ぶんもまとめて回して**、出てはいけない依頼が1日でも出ないことを見る。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ISLAND_TZ_MIN, MEET_MODE, QUESTS_PER_DAY,
  dayIndex, dayLabel, dayTotal, questGain, questWhere, questsFor,
} from '../src/quests.js';
import { FISH_BY_ID, isGated } from '../src/minigame/fish.js';
import { MEETS } from '../src/minigame/meets.js';
import {
  addCatch, addContestResult, addRaidRun, emptyProgress, parseProgress, questBoard,
} from '../src/progress.js';

const DAY = 86400000;
// 2026-09-20 12:00 の島の時刻あたり。ここを起点に日をずらして回す
const T0 = Date.UTC(2026, 8, 20, 3);
const day = (n) => T0 + n * DAY;
// 依頼を何年ぶん見るか。1日3本なので 1200 日で 3600 本
const DAYS = 1200;

// ---- 何が出るか ----

test('掲示板: 同じ日なら同じ3本。別の日なら変わる', () => {
  const a = questsFor(T0);
  const b = questsFor(T0 + 1000 * 60 * 60);   // 同じ日の別の時刻(+1時間)
  assert.equal(a.length, QUESTS_PER_DAY);
  assert.deepEqual(a.map((q) => q.id), b.map((q) => q.id), '同じ日で並びが違う');
  // 続く10日のうち、少なくとも8日は前の日と違う(たまたま同じ日はありうる)
  let changed = 0;
  for (let i = 1; i <= 10; i += 1) {
    const prev = questsFor(day(i - 1)).map((q) => q.id).join('|');
    const now = questsFor(day(i)).map((q) => q.id).join('|');
    if (prev !== now) changed += 1;
  }
  assert.ok(changed >= 8, `日が変わっても代わり映えしない(${changed}/10)`);
});

test('掲示板: 3本とも型が違う', () => {
  for (let i = 0; i < DAYS; i += 1) {
    const q = questsFor(day(i));
    assert.equal(q.length, QUESTS_PER_DAY, `${i}日目: 本数が足りない`);
    const types = new Set(q.map((x) => x.type));
    assert.equal(types.size, QUESTS_PER_DAY, `${i}日目: 同じ型が並んだ(${[...types]})`);
    assert.equal(new Set(q.map((x) => x.id)).size, QUESTS_PER_DAY, `${i}日目: 同じ依頼が並んだ`);
  }
});

// **いまいる島で何も進まない日を作らない。** 釣りはどの島でもできるので、
// 1本は必ず島の決まっていない依頼にしてある。
test('掲示板: 1本は必ず、どの島でも進む依頼', () => {
  for (let i = 0; i < DAYS; i += 1) {
    const q = questsFor(day(i));
    assert.ok(q.some((x) => x.mode == null), `${i}日目: 全部よその島の依頼になっている`);
  }
});

// **買わないと達成できない依頼を作らない**(shop.js の決めごとと同じ筋)。
// 沖と夜の魚は店の品が要るし、桁も違う(800cm の魚が1匹で「合計500cm」を終わらせる)。
test('掲示板: 狙う魚は港の魚だけ。ぬしもガラクタも出さない', () => {
  for (let i = 0; i < DAYS; i += 1) {
    for (const q of questsFor(day(i))) {
      if (q.type !== 'catch') continue;
      const f = FISH_BY_ID[q.fishId];
      assert.ok(f, `${i}日目: 知らない魚 ${q.fishId}`);
      assert.equal(isGated(f), false, `${i}日目: 店の品が要る魚(${f.name})`);
      assert.ok(['common', 'rare'].includes(f.tier), `${i}日目: ${f.name} は狙わせない等級`);
    }
  }
});

test('掲示板: 優勝の依頼は1日に1本まで', () => {
  for (let i = 0; i < DAYS; i += 1) {
    const wins = questsFor(day(i)).filter((q) => q.type === 'win');
    assert.ok(wins.length <= 1, `${i}日目: 優勝の依頼が ${wins.length} 本`);
  }
});

test('掲示板: 集まりの依頼は、その受付が立つ島を指す', () => {
  const byMode = Object.fromEntries(Object.entries(MEETS).map(([m, v]) => [v.id, m]));
  for (let i = 0; i < DAYS; i += 1) {
    for (const q of questsFor(day(i))) {
      if (q.type !== 'join' && q.type !== 'win') continue;
      assert.equal(q.mode, byMode[q.kind], `${i}日目: ${q.kind} の島が違う`);
      assert.equal(q.mode, MEET_MODE[q.kind]);
      assert.ok(questWhere(q), `${i}日目: 行き先の名前が出ない`);
    }
  }
  assert.equal(questWhere({ mode: null }), null);
  assert.equal(questWhere(null), null);
});

// 報酬の帯。**掲示板だけを回すのがいちばん儲かる形にしない** ──
// 上出来な大会1回が 50〜60 枚なので、1日ぜんぶ達成してその2〜3倍まで。
test('掲示板: 1日ぜんぶ達成しても 70〜160 枚に収まる', () => {
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < DAYS; i += 1) {
    const t = dayTotal(day(i));
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  assert.ok(lo >= 70, `安い日がありすぎる(${lo})`);
  assert.ok(hi <= 160, `高い日がありすぎる(${hi})`);
});

// ---- 日付の境目 ----

// **端末の時間帯を見ない。** 見ると、同じ日でも人によって違う3本が出るうえ、
// テストを回す機械の設定(CI は UTC)で落ちるようになる。
test('掲示板: 日の変わり目は島の時刻(UTC+9)で、端末の設定を見ない', () => {
  assert.equal(ISLAND_TZ_MIN, 9 * 60);
  const midnight = Date.UTC(2026, 8, 20) - ISLAND_TZ_MIN * 60000;  // 島の 9/20 00:00
  assert.equal(dayIndex(midnight - 1), dayIndex(midnight) - 1, '境目の手前が同じ日になっている');
  assert.equal(dayIndex(midnight), dayIndex(midnight + DAY - 1), '同じ日の端どうしがずれている');
  assert.equal(dayLabel(midnight), '9/20');
  assert.equal(dayLabel(midnight + DAY), '9/21');
  // 壊れた時刻でも落ちない
  assert.equal(Number.isFinite(dayIndex(NaN)), true);
});

// ---- 進みかた ----

test('掲示板: 合計cm と ◯cm以上 は、店の品で開く魚を数えない', () => {
  const cm = { type: 'cm', goal: 500 };
  const big = { type: 'big', goal: 100 };
  assert.equal(questGain(cm, { type: 'catch', fishId: 'aji', cm: 30 }), 30);
  assert.equal(questGain(big, { type: 'catch', fishId: 'maguro', cm: 150 }), 100);
  // リュウグウノツカイ(沖)は 800cm。数えたら1匹で終わる
  assert.equal(questGain(cm, { type: 'catch', fishId: 'ryuuguu', cm: 800 }), 0);
  assert.equal(questGain(big, { type: 'catch', fishId: 'ryuuguu', cm: 800 }), 0);
  // 夜の魚も同じ
  assert.equal(questGain(cm, { type: 'catch', fishId: 'tachiuo', cm: 120 }), 0);
  // 届かない1匹では、◯cm以上 は1ミリも進まない(部分点を付けない)
  assert.equal(questGain(big, { type: 'catch', fishId: 'aji', cm: 99 }), 0);
});

test('掲示板: 優勝の依頼は、出ただけでは進まない', () => {
  const join = { type: 'join', kind: 'fishing' };
  const win = { type: 'win', kind: 'fishing' };
  assert.equal(questGain(join, { type: 'meet', kind: 'fishing', won: false }), 1);
  assert.equal(questGain(win, { type: 'meet', kind: 'fishing', won: false }), 0);
  assert.equal(questGain(win, { type: 'meet', kind: 'fishing', won: true }), 1);
  // よその集まりでは進まない
  assert.equal(questGain(join, { type: 'meet', kind: 'daifugo', won: true }), 0);
  assert.equal(questGain(join, null), 0);
  assert.equal(questGain(null, { type: 'meet', kind: 'fishing' }), 0);
  assert.equal(questGain({ type: 'なにか' }, { type: 'catch', fishId: 'aji', cm: 20 }), 0);
});

// ---- 掲示板と保存 ----

// その日に「カサゴを N 匹」が出る日を探す。依頼は日替わりなので、
// 試したい型が出る日を選ばないとテストが書けない。
function dayWith(type) {
  for (let i = 0; i < DAYS; i += 1) {
    const q = questsFor(day(i)).find((x) => x.type === type);
    if (q) return { at: day(i), quest: q };
  }
  throw new Error(`${type} の出る日が見つからない`);
}

test('掲示板: 達成すると銀貨が付き、二度は付かない', () => {
  const { at, quest } = dayWith('catch');
  let p = emptyProgress();
  for (let i = 0; i < quest.goal; i += 1) {
    const r = addCatch(p, quest.fishId, 20, at);
    p = r.progress;
    const last = i === quest.goal - 1;
    assert.equal(r.questCoins, last ? quest.reward : 0, `${i + 1}匹目の払いが違う`);
    assert.deepEqual(r.quests.map((q) => q.id), last ? [quest.id] : []);
  }
  const board = questBoard(p, at).find((q) => q.id === quest.id);
  assert.equal(board.done, true, '達成になっていない');
  assert.equal(board.at, quest.goal);
  // もう1匹釣っても、依頼のぶんは増えない(釣りそのものの銀貨は増える)
  const before = p.coins;
  const more = addCatch(p, quest.fishId, 20, at);
  assert.equal(more.questCoins, 0, '二度払っている');
  assert.equal(more.progress.coins, before + more.coins);
});

test('掲示板: 日が変わると進みは白紙に戻る', () => {
  const { at, quest } = dayWith('catch');
  let p = emptyProgress();
  p = addCatch(p, quest.fishId, 20, at).progress;
  assert.equal(questBoard(p, at).find((q) => q.id === quest.id).at, 1);
  // 翌日。**昨日の進みを持ち越さない** ── 持ち越すと、今日の依頼が
  // 開いた瞬間に終わっていることがある
  const board = questBoard(p, at + DAY);
  assert.equal(board.some((q) => q.at > 0), false, `翌日に進みが残っている(${JSON.stringify(board)})`);
});

test('掲示板: 大会の結果が配り直されても、依頼は二度進まない', () => {
  const { at, quest } = dayWith('join');
  let p = emptyProgress();
  const arg = { kind: quest.kind, won: false, score: 10, place: 2, players: 3, key: 'room#1', at };
  const first = addContestResult(p, arg);
  p = first.progress;
  assert.equal(first.questCoins, quest.reward, '出たのに払われない');
  // 同じ回がもう一度届く(結果は25秒のあいだ毎秒配られる)
  const again = addContestResult(p, arg);
  assert.equal(again.questCoins ?? 0, 0, '配り直しで二度払っている');
  assert.equal(again.progress, p, '配り直しで保存が動いている');
});

test('掲示板: 射場の点は、届いた回だけ依頼を進める', () => {
  const { at, quest } = dayWith('raid');
  let p = emptyProgress();
  const half = Math.floor(quest.goal / 2);
  const r1 = addRaidRun(p, { score: half, wave: 2, shots: 30, hits: 20 }, at);
  p = r1.progress;
  assert.equal(r1.questCoins, 0);
  assert.equal(questBoard(p, at).find((q) => q.id === quest.id).at, half);
  const r2 = addRaidRun(p, { score: quest.goal, wave: 3, shots: 40, hits: 30 }, at);
  assert.equal(r2.questCoins, quest.reward, '届いたのに払われない');
  // 進みは目標で止まる(掲示板の「120/120」が「240/120」にならない)
  assert.equal(questBoard(r2.progress, at).find((q) => q.id === quest.id).at, quest.goal);
});

test('掲示板: 壊れた保存でも落ちない。古い保存には白紙で足す', () => {
  const old = JSON.stringify({ v: 2, games: [], coins: 5 });
  const p = parseProgress(old);
  assert.deepEqual(p.quests, { day: 0, n: {}, got: {} });
  assert.equal(questBoard(p, T0).every((q) => q.at === 0 && !q.done), true);
  const broken = parseProgress(JSON.stringify({ v: 2, quests: { day: 'x', n: 3, got: 7 } }));
  assert.deepEqual(broken.quests, { day: 0, n: {}, got: {} });
  const partial = parseProgress(JSON.stringify({
    v: 2, quests: { day: 100, n: { a: 2, b: -1, c: 'x' }, got: { a: true, b: 0 } },
  }));
  assert.deepEqual(partial.quests, { day: 100, n: { a: 2 }, got: { a: true } });
});

test('掲示板: 行き先の名前が「◯◯の島の島」にならない', () => {
  // MODE_JP の dragon はもともと「ドラゴンの島」。呼ぶ側で「の島」を
  // 足す作りにしていたら、ここが「ドラゴンの島の島」になっていた。
  assert.equal(questWhere({ mode: 'dragon' }), 'ドラゴンの島');
  assert.equal(questWhere({ mode: 'base' }), '基本の島');
  assert.equal(questWhere({ mode: 'cak' }), '都市と騎士の島');
  assert.equal(questWhere({ mode: 'fish' }), '漁師たちの島');
  assert.equal(questWhere({ mode: 'sea' }), '航海者たちの島');
  assert.equal(questWhere({ mode: 'しらない島' }), null);
  for (const w of Object.values(MEET_MODE).map((m) => questWhere({ mode: m }))) {
    assert.equal(/の島の島/.test(w), false, `名前が重なっている(${w})`);
  }
});
