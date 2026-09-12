// 大域のエラー表示(src/crash.js)の計算部分。
//
// ここが壊れると「落ちたのに何も出ない」か「トーストが溢れて遊べない」に
// 直結する。DOM は無しで、文面の組み立てと重複の抑えかたを検証する。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clip, crashText, frameOf, messageOf, reportCrash, resetCrashReports,
} from '../src/crash.js';

test('文面: Error は名前つきの1行になる', () => {
  assert.equal(messageOf(new TypeError('x は関数ではありません')), 'TypeError: x は関数ではありません');
  // 素の Error は名前を足さない(「Error: 」は情報がない)
  assert.equal(messageOf(new Error('こわれた')), 'こわれた');
});

test('文面: Error でないものも1行に均す', () => {
  assert.equal(messageOf('ただの文字列'), 'ただの文字列');
  assert.equal(messageOf({ message: 'message だけ持つ何か' }), 'message だけ持つ何か');
  // Promise は何でも reject できるので、null も数値も来る
  assert.equal(messageOf(null), '原因不明のエラー');
  assert.equal(messageOf(undefined), '原因不明のエラー');
  assert.equal(messageOf(''), '原因不明のエラー');
  assert.equal(messageOf(42), '42');
  // 中身の分からないオブジェクトで '[object Object]' と出しても意味がない
  assert.equal(messageOf({}), '原因不明のエラー');
});

test('文面: 読むと投げる相手でも落ちない(ここで投げたら catch の中で二重に落ちる)', () => {
  assert.equal(messageOf({ get message() { throw new Error('読めない'); } }), '原因不明のエラー');
  // 文字列に変換できない相手。String() がここで投げる
  assert.equal(messageOf(Object.create(null)), '原因不明のエラー');
  // Symbol は String() では投げない(投げるのは暗黙の変換だけ)ので、そのまま出る
  assert.equal(messageOf(Symbol('s')), 'Symbol(s)');
});

test('場所: stack を読むと投げる相手でも落ちない', () => {
  assert.equal(frameOf({ get stack() { throw new Error('読めない'); } }), '');
});

test('場所: スタックの最初のファイル:行だけを採る', () => {
  const err = new Error('x');
  err.stack = [
    'Error: x',
    '    at loop (http://localhost:8000/src/render3d/board3d.js:1875:9)',
    '    at update (http://localhost:8000/src/main.js:42:3)',
  ].join('\n');
  assert.equal(frameOf(err), 'board3d.js:1875');
  // スタックが無い相手(文字列など)では空
  assert.equal(frameOf('文字列'), '');
  assert.equal(frameOf(null), '');
});

test('文面: 再現に必要な情報(シード・モード・版)が2行目に出る', () => {
  const t = crashText({
    where: '描画', message: 'こわれた', frame: 'board3d.js:1875',
    seed: 12345, mode: 'cak', version: 'ver. abc1234',
  });
  assert.equal(t, '⚠ 描画でエラー: こわれた\nシード 12345 / cak / ver. abc1234 / board3d.js:1875');
});

test('文面: 情報が無いときは2行目を出さない', () => {
  assert.equal(crashText({ where: '描画', message: 'こわれた' }), '⚠ 描画でエラー: こわれた');
  assert.equal(crashText({ message: 'こわれた' }), '⚠ エラー: こわれた');
  // シード 0 は「情報が無い」ではない(空文字や null と区別する)
  assert.equal(crashText({ message: 'x', seed: 0 }), '⚠ エラー: x\nシード 0');
});

test('文面: 長すぎる文面は切る(画面を覆わせない)', () => {
  assert.equal(clip('みじかい'), 'みじかい');
  const long = 'あ'.repeat(400);
  assert.equal(clip(long).length, 140);
  assert.ok(clip(long).endsWith('…'));
  // ちょうど上限は切らない(境界で1字落とさない)
  assert.equal(clip('い'.repeat(140)).length, 140);
  assert.ok(!clip('い'.repeat(140)).includes('…'));
});

test('抑え: 先頭が同じで中身が違う不具合を、同じものにしない', () => {
  // 切ってから重複を見ると、長い URL のように先頭が揃う相手を取り違える
  resetCrashReports();
  const head = 'モジュールを読み込めません: '.padEnd(200, 'x');
  assert.equal(reportCrash(new Error(`${head}/a.js`), '読み込み'), true);
  assert.equal(reportCrash(new Error(`${head}/b.js`), '読み込み'), true);
});

test('抑え: 同じ場所・同じ文面は1回だけ(毎フレーム呼ばれても溢れない)', () => {
  resetCrashReports();
  const err = new Error('毎フレーム落ちる');
  assert.equal(reportCrash(err, '描画'), true);
  for (let i = 0; i < 1000; i += 1) assert.equal(reportCrash(err, '描画'), false);
  // 場所が違えば別の不具合なので出す
  assert.equal(reportCrash(err, 'ミニゲームの描画'), true);
  // 文面が違えば別の不具合
  assert.equal(reportCrash(new Error('別のこわれかた'), '描画'), true);
});

test('抑え: 毎フレーム違う文面でも、記録は打ち切られる', () => {
  resetCrashReports();
  // 「frame 123 が不正」のように数字が混ざると、文面が毎回違って
  // 重複判定が効かない。件数の上限が無いと Set が無限に膨らむ。
  let ok = 0;
  for (let i = 0; i < 500; i += 1) {
    if (reportCrash(new Error(`フレーム ${i} が不正`), '描画')) ok += 1;
  }
  assert.ok(ok > 0, '1件も出ないのはやりすぎ');
  assert.ok(ok <= 32, `打ち切られていない(${ok}件)`);
});
