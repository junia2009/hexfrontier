// 円卓の演出の計算(src/minigame/table-cue.js)。
//
// いちばん大事なのは newLogEntries ── 卓の記録は「直近12件の窓」しか
// 届かないので、重なりの読み違えは「出来事を二重に演出する」か
// 「見落とす」に直結する。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newLogEntries, arcSegments, lookYaw, fanLayout, actsFrom, FAN_MAX,
} from '../src/minigame/table-cue.js';

const P = (by) => ({ t: 'pass', by });
const PLAY = (by, cards) => ({ t: 'play', by, cards });

test('記録: はじめて届いたときは全部が新しい', () => {
  const log = [P(1), P(2)];
  assert.deepEqual(newLogEntries(null, log), log);
  assert.deepEqual(newLogEntries([], log), log);
});

test('記録: 変わっていなければ新しい出来事は無い', () => {
  const log = [P(1), PLAY(2, [10]), P(3)];
  assert.deepEqual(newLogEntries(log, log), []);
});

test('記録: 増えたぶんだけを返す', () => {
  const before = [P(1), PLAY(2, [10])];
  const after = [P(1), PLAY(2, [10]), P(3), PLAY(0, [20, 21])];
  assert.deepEqual(newLogEntries(before, after), [P(3), PLAY(0, [20, 21])]);
});

test('記録: 窓から押し出されていても、重なりを見つけて続きだけ返す', () => {
  // 窓は3件ぶん。前回 [a,b,c] → 今回 [b,c,d]
  const before = [P(1), P(2), P(3)];
  const after = [P(2), P(3), P(0)];
  assert.deepEqual(newLogEntries(before, after), [P(0)]);
});

test('記録: 窓を丸ごと飛び越えたら、届いたぶんを全部出す', () => {
  const before = [P(1), P(2)];
  const after = [PLAY(5, [3]), PLAY(6, [4])];
  assert.deepEqual(newLogEntries(before, after), after);
});

test('記録: いちばん長い重なりを採る(短いほうから探すと二重に演出する)', () => {
  // 短いほうから探すと壊れる形は「**同じ内容が隣り合う**」とき。
  // 記録全体が … A B B C で、窓が3件なら
  //   前回 [A, B, B] → 今回 [B, B, C] で、正しい重なりは2件、新しいのは C だけ。
  // 短いほうから探すと、前回の末尾 B と今回の頭 B が1件で合ってしまい、
  // すでに見た B をもう一度演出することになる。
  const A = PLAY(1, [10]);
  const B = P(2);
  const C = PLAY(3, [20]);
  assert.deepEqual(newLogEntries([A, B, B], [B, B, C]), [C]);

  // 押し出されただけの素直な形も、同じ式で通ること
  assert.deepEqual(newLogEntries([P(1), P(2), P(1)], [P(2), P(1), P(3)]), [P(3)]);
});

test('記録: 出した札の中身が違えば別の出来事', () => {
  const before = [PLAY(1, [10])];
  const after = [PLAY(1, [11])];
  // 重なりが無いので、届いたぶんが全部新しい
  assert.deepEqual(newLogEntries(before, after), after);
});

test('残り時間の弧: 0 のときだけ消える', () => {
  assert.equal(arcSegments(0, 24), 0);
  assert.equal(arcSegments(-1, 24), 0);
  // ほんの少しでも残っていれば1本は光る
  assert.equal(arcSegments(0.001, 24), 1);
  assert.equal(arcSegments(1, 24), 24);
  assert.equal(arcSegments(2, 24), 24);
  assert.equal(arcSegments(0.5, 24), 12);
  // 切り上げ(0.51*24 = 12.24 → 13)
  assert.equal(arcSegments(0.51, 24), 13);
});

test('見る向き: 相手の席の方角を返す', () => {
  const me = { x: 0, z: 0 };
  assert.equal(lookYaw(me, { x: 0, z: 1 }), 0);                 // 正面(+Z)
  assert.equal(lookYaw(me, { x: 1, z: 0 }), Math.PI / 2);       // 右(+X)
  assert.ok(Math.abs(lookYaw(me, { x: 0, z: -1 })) - Math.PI < 1e-9);
});

test('手札の扇: 枚数で広がりが決まり、上限で頭打ちになる', () => {
  assert.deepEqual(fanLayout(0), []);
  assert.equal(fanLayout(1).length, 1);
  assert.equal(fanLayout(1)[0].a, 0);
  assert.equal(fanLayout(5).length, 5);
  // 上限を超えても増えない(顔より大きい扇にしない)
  assert.equal(fanLayout(30).length, FAN_MAX);
  // 端から端まで。真ん中が 0 で左右対称
  const f = fanLayout(5);
  assert.ok(Math.abs(f[0].a + f[4].a) < 1e-9);
  assert.ok(Math.abs(f[2].a) < 1e-9);
  // 枚数が増えると広がる(ただし上限まで)
  assert.ok(Math.abs(fanLayout(8)[0].a) > Math.abs(fanLayout(3)[0].a));
  assert.ok(Math.abs(fanLayout(FAN_MAX)[0].a) <= 0.43);
});

test('手札の扇: 少ない枚数は横にずらして離す', () => {
  // 2枚のとき、回転だけだと中心がほとんど動かず1枚に見える。
  // **札の幅ぶん近く**離れていること(単位は札の幅)
  const two = fanLayout(2);
  assert.ok(Math.abs(two[1].x - two[0].x) > 0.35, `2枚の間隔 ${two[1].x - two[0].x}`);
  // 多い枚数は端から端までを決めた幅に収める(顔より大きい扇にしない)
  const ten = fanLayout(FAN_MAX);
  assert.ok(Math.abs(ten[FAN_MAX - 1].x - ten[0].x) <= 1.16);
  // 真ん中が 0 で左右対称
  assert.ok(Math.abs(ten[0].x + ten[FAN_MAX - 1].x) < 1e-9);
  assert.equal(fanLayout(1)[0].x, 0);
});

test('しぐさ: 記録をそのまま見た目の言葉に均す', () => {
  const acts = actsFrom([
    PLAY(1, [10, 11]), P(2), { t: 'kakumei', by: 1, on: true },
    { t: 'out', by: 1, place: 1 }, { t: 'swap', from: 1, to: 2, n: 2 },
  ]);
  assert.deepEqual(acts, [
    { kind: 'play', seat: 1, cards: [10, 11] },
    { kind: 'pass', seat: 2 },
    { kind: 'kakumei', seat: 1, on: true },
    { kind: 'win', seat: 1, place: 1 },
  ]);
  // 知らない記録(swap)は落とす。落とさないと、見た目の担当が
  // 知らない kind を渡されて何も出ないまま時間だけ食う
  assert.equal(actsFrom([{ t: 'swap' }]).length, 0);
});
