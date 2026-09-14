// UI 状態と GameState の同期(src/ui-sync.js)。
//
// main.js の中にあったあいだ、ここは1行もテストが触っていなかった。
// 壊れると「操作不能」に直結する場所で、コードのコメント自身が
// 「閉じ忘れると捨て札のダイアログのまま盗賊移動になり、描画が落ちる」と
// 書いている ── つまり過去に実際に踏んでいる。
//
// 見るのは3つ:
//   1. 今の割り込みに合わないダイアログは必ず閉じる
//   2. 自分の番の割り込みには、対応するダイアログ・入力モードに入る
//   3. 割り込みが消えたら、強いられて入ったモードから必ず抜ける

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncUi, INTERRUPT_DIALOGS, DIALOG_FOR_AWAITING, MODE_FOR_AWAITING, FORCED_MODES,
} from '../src/ui-sync.js';

const HUMAN = 0;

// main.js の freshUi() と同じ形(同期が触る欄だけ)
const freshUi = () => ({
  mode: 'idle',
  pending: null,
  pendingVertex: null,
  setupPiece: 'road',
  dialog: null,
  sentAwaiting: null,
});
// 盤は要らない。同期が読むのは phase / awaiting / winner だけ
const gameState = (awaiting = null, phase = 'main') => ({ phase, awaiting, winner: null });
const awaitingOf = (type, players = [HUMAN], context = {}) => ({ type, players, context });

test('決着したら、勝者のダイアログにして入力モードを畳む', () => {
  const ui = { ...freshUi(), mode: 'build-road', pending: { edgeId: 'x' } };
  let ended = 0;
  syncUi(gameState(null, 'ended'), ui, HUMAN, () => { ended += 1; });
  assert.equal(ui.mode, 'idle');
  assert.equal(ui.pending, null);
  assert.deepEqual(ui.dialog, { type: 'winner' });
  assert.equal(ended, 1, '戦績を残す合図が呼ばれていない');
});

test('決着の合図は開きっぱなしでも毎回呼ぶが、ダイアログは作り直さない', () => {
  const ui = { ...freshUi(), dialog: { type: 'winner' } };
  const before = ui.dialog;
  syncUi(gameState(null, 'ended'), ui, HUMAN, () => {});
  assert.equal(ui.dialog, before, '同じ内容でダイアログを作り直している');
});

test('割り込みが変わったら、合わないダイアログは閉じる', () => {
  // これが効かないと「捨て札のダイアログのまま盗賊移動」になる
  const ui = { ...freshUi(), dialog: { type: 'discard', counts: {} } };
  syncUi(gameState(awaitingOf('moveRobber')), ui, HUMAN, () => {});
  assert.notEqual(ui.dialog?.type, 'discard', '前の割り込みのダイアログが残っている');
});

test('割り込みが消えたら、割り込み用のダイアログは全部閉じる', () => {
  for (const type of INTERRUPT_DIALOGS) {
    const ui = { ...freshUi(), dialog: { type } };
    syncUi(gameState(null), ui, HUMAN, () => {});
    assert.equal(ui.dialog, null, `${type} が閉じられていない`);
  }
});

test('割り込みと関係のないダイアログは、勝手に閉じない', () => {
  // 交易や設定のような、自分で開いたものまで閉じると操作を奪うことになる
  for (const type of ['trade', 'settings', 'rules', 'dev-info']) {
    const ui = { ...freshUi(), dialog: { type } };
    syncUi(gameState(null), ui, HUMAN, () => {});
    assert.equal(ui.dialog?.type, type, `${type} を勝手に閉じた`);
  }
});

test('自分の番の割り込みには、対応するダイアログが開く', () => {
  for (const [awType, dialog] of Object.entries(DIALOG_FOR_AWAITING)) {
    // 略奪相手の選択だけは自分で開くので、ここでは開かない決まり
    if (dialog === 'steal') continue;
    const ui = freshUi();
    syncUi(gameState(awaitingOf(awType)), ui, HUMAN, () => {});
    assert.equal(ui.dialog?.type, dialog, `${awType} で ${dialog} が開かない`);
  }
});

test('盗賊移動では、略奪相手のダイアログを勝手に開かない', () => {
  const ui = freshUi();
  syncUi(gameState(awaitingOf('moveRobber')), ui, HUMAN, () => {});
  assert.notEqual(ui.dialog?.type, 'steal', '自分で開くはずのものが勝手に開いた');
  assert.equal(ui.mode, 'move-robber', '盗賊の入力モードに入っていない');
});

test('枚数を数えるダイアログには、数える器が付いてくる', () => {
  // 器が無いと、数える画面が undefined を読んで落ちる
  for (const awType of ['discard', 'weddingGift', 'merchantPick']) {
    const ui = freshUi();
    syncUi(gameState(awaitingOf(awType)), ui, HUMAN, () => {});
    assert.ok(ui.dialog.counts, `${awType} に器が無い`);
    for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore', 'cloth', 'coin', 'paper']) {
      assert.equal(ui.dialog.counts[r], 0, `${awType}: ${r} の初期値が 0 でない`);
    }
  }
});

test('自分の番の割り込みには、対応する入力モードに入る', () => {
  for (const [awType, mode] of Object.entries(MODE_FOR_AWAITING)) {
    const ui = freshUi();
    syncUi(gameState(awaitingOf(awType)), ui, HUMAN, () => {});
    assert.equal(ui.mode, mode, `${awType} で ${mode} に入らない`);
  }
});

test('初期配置は、道を置く途中で先頭に戻されない', () => {
  // setup-road のときに setup-settlement へ戻すと、選んだ開拓地が消える
  const ui = { ...freshUi(), mode: 'setup-road', pendingVertex: 'v1', setupPiece: 'ship' };
  syncUi(gameState(awaitingOf('setupPlacement', [HUMAN], { round: 1 })), ui, HUMAN, () => {});
  assert.equal(ui.mode, 'setup-road', '道を置く途中で戻された');
  assert.equal(ui.pendingVertex, 'v1', '選んでいた開拓地が消えた');
  assert.equal(ui.setupPiece, 'ship', '選んでいた駒の種類が戻された');
});

test('他人の割り込みでは、こちらの入力モードを開かない', () => {
  const ui = freshUi();
  syncUi(gameState(awaitingOf('moveRobber', [1])), ui, HUMAN, () => {});
  assert.equal(ui.mode, 'idle', '他人の番なのに入力モードに入った');
  assert.equal(ui.dialog, null, '他人の番なのにダイアログが開いた');
});

test('割り込みが消えたら、強いられて入ったモードから抜ける', () => {
  // 抜けそこねると、誰の番でもないのに盤面が光って触れてしまう
  for (const mode of FORCED_MODES) {
    const ui = { ...freshUi(), mode, pending: { vertexId: 'v' }, pendingVertex: 'v', setupPiece: 'ship' };
    syncUi(gameState(null), ui, HUMAN, () => {});
    assert.equal(ui.mode, 'idle', `${mode} から抜けていない`);
    assert.equal(ui.pending, null, `${mode}: 選びかけが残っている`);
    assert.equal(ui.pendingVertex, null, `${mode}: 選びかけの頂点が残っている`);
    assert.equal(ui.setupPiece, 'road', `${mode}: 駒の種類が戻っていない`);
  }
});

test('自分で選んだモードは、割り込みが無くても畳まれない', () => {
  // 建設のモードまで畳むと、毎フレーム勝手に解除されて建てられなくなる
  for (const mode of ['build-road', 'build-settlement', 'build-city', 'trade']) {
    const ui = { ...freshUi(), mode, pending: { edgeId: 'e' } };
    syncUi(gameState(null), ui, HUMAN, () => {});
    assert.equal(ui.mode, mode, `${mode} を勝手に畳んだ`);
  }
});

test('応答を送ったあとは、同じ割り込みで開き直さない', () => {
  // オンラインで二重に手を出せてしまう(捨て札が 0 枚に戻って見える)
  const aw = awaitingOf('discard');
  const ui = { ...freshUi(), sentAwaiting: aw, dialog: null };
  syncUi(gameState(aw), ui, HUMAN, () => {});
  assert.equal(ui.dialog, null, '送ったあとに開き直した');

  // 別の割り込みに変わったら、こんどはちゃんと開く
  const ui2 = { ...freshUi(), sentAwaiting: aw };
  syncUi(gameState(awaitingOf('discard')), ui2, HUMAN, () => {});
  assert.equal(ui2.dialog?.type, 'discard', '新しい割り込みで開かない');
});

test('同じ割り込みを何度同期しても、開いているものを作り直さない', () => {
  // 作り直すと、数えかけの枚数が毎フレーム 0 に戻る
  const aw = awaitingOf('discard');
  const ui = freshUi();
  syncUi(gameState(aw), ui, HUMAN, () => {});
  ui.dialog.counts.wood = 2; // 2枚選んだ
  syncUi(gameState(aw), ui, HUMAN, () => {});
  assert.equal(ui.dialog.counts.wood, 2, '数えかけの枚数が消えた');
});
