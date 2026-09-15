// 盤面をタップしたときの選びかけ(src/board-click.js)。
//
// main.js の中にあったあいだ、ここは1行もテストが触っていなかった。
//
// いちばん怖いのは**種類と候補の食い違い**。たとえば頂点を拾いにいくのに
// 候補として辺の一覧を渡すと、光っているのに永久にタップが効かない。
// 見た目は正常なので、遊んでみるまで気づけない。
// 拾いかたは外から渡す作りなので、何を訊かれたかを覗いて確かめられる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/state.js';
import { dispatch } from '../src/actions.js';
import { chooseAction } from '../src/ai/cpu-player.js';
import { roadBuildingCount } from '../src/rules/road-building.js';
import { LAYOUT } from '../src/rules/board.js';
import { applyBoardClick } from '../src/board-click.js';
import { actionForPending, CANCELLABLE_MODES } from '../src/ui-confirm.js';
import { MODE_FOR_AWAITING } from '../src/ui-sync.js';

const HUMAN = 0;

const freshUi = (over = {}) => ({
  mode: 'idle',
  pending: null,
  pendingVertex: null,
  pendingEdges: [],
  pendingPieces: [],
  pendingHexes: [],
  pendingVertices: [],
  setupPiece: 'road',
  roadPiece: 'road',
  knightFrom: null,
  shipFrom: null,
  progIndex: null,
  dialog: null,
  toast: null,
  highlights: { vertices: [], edges: [], hexes: [] },
  ...over,
});

function midGame(mode = 'base', seed = 3) {
  let state = createGame({ seed, playerCount: 4, humanIndex: HUMAN, mode });
  for (let i = 0; i < 4000 && state.phase === 'setup'; i += 1) {
    const pid = state.awaiting ? state.awaiting.players[0] : state.currentPlayer;
    state = dispatch(state, chooseAction(state, pid));
  }
  return state;
}

// 何を訊かれたかを記録しつつ、候補の先頭を返す拾い手
function spy(answer = true) {
  const asked = [];
  const pick = (kind, cands) => {
    asked.push({ kind, cands });
    return answer && cands.length ? cands[0] : null;
  };
  return { asked, pick };
}

// 3種類ぶんの光っている場所(どれを渡しても中身が違うので取り違えが分かる)
// ヘックスは3つ要る。2つしか無いと「3つ目を弾く」上限を試しようがなく、
// 上限を壊しても重複チェックのほうが先に効いてテストが通ってしまう(実際そうなっていた)。
const HL = { vertices: ['V1', 'V2', 'V3'], edges: ['E1', 'E2', 'E3'], hexes: ['H1', 'H2', 'H3'] };
const LIST_FOR = { vertex: 'vertices', edge: 'edges', hex: 'hexes' };

// 盤面をタップして何かを選ぶモード(タップで何もしないものは除く)
const CLICK_MODES = [
  ...new Set([...CANCELLABLE_MODES, ...Object.values(MODE_FOR_AWAITING), 'setup-road']),
].filter((m) => m !== 'move-ship'); // 船の1歩目は別に見る

test('訊く種類と渡す候補が食い違っていない(食い違うと永久にタップが効かない)', () => {
  const state = midGame('cak');
  const wrong = [];
  for (const mode of CLICK_MODES) {
    const ui = freshUi({ mode, progIndex: 0, highlights: { ...HL } });
    const s = spy();
    applyBoardClick(state, ui, HUMAN, s.pick);
    assert.ok(s.asked.length > 0, `${mode}: 何も拾いにいっていない(タップが死んでいる)`);
    for (const { kind, cands } of s.asked) {
      const want = HL[LIST_FOR[kind]];
      if (cands !== want) wrong.push(`${mode}: ${kind} を拾うのに ${JSON.stringify(cands)} を渡している`);
    }
  }
  assert.deepEqual(wrong, [], '光っている場所と拾う種類が食い違っている');
});

test('タップして何も当たらなければ、選びかけは増えない', () => {
  const state = midGame('cak');
  for (const mode of CLICK_MODES) {
    const ui = freshUi({ mode, progIndex: 0, highlights: { ...HL } });
    const before = JSON.stringify(ui);
    applyBoardClick(state, ui, HUMAN, spy(false).pick);
    const after = JSON.parse(before);
    after.toast = null; // 触ると必ず消える欄
    assert.deepEqual(
      JSON.parse(JSON.stringify(ui)), after,
      `${mode}: 何も当たっていないのに ui が変わった`,
    );
  }
});

test('選ぶと、そのまま確定できる形になる(タップ→確定が繋がっている)', () => {
  // 選びかけの置き場所が違うと、タップは効くのに確定が効かない。
  // 切り出した2つ(board-click と ui-confirm)を繋いで見る。
  const state = midGame('cak');
  const need = roadBuildingCount(state, HUMAN);
  const stuck = [];
  for (const mode of CLICK_MODES) {
    // 「行き先を選ぶ」段は、動かす元を前の段で選んでから入る。
    // そこを用意しないと、実装が正しくても確定できない形になる
    const from = mode === 'move-ship-to' ? { shipFrom: 'E9' }
      : mode === 'move-knight' ? { knightFrom: 'V9' }
      : mode === 'setup-road' ? { pendingVertex: 'V9' } : {};
    const ui = freshUi({ mode, progIndex: 0, highlights: { ...HL }, ...from });
    // 溜める形のモードは必要な数だけ押す
    for (let i = 0; i < Math.max(need, 2); i += 1) {
      const pick = (kind, cands) => cands[Math.min(i, cands.length - 1)] ?? null;
      applyBoardClick(state, ui, HUMAN, pick);
    }
    // 初期配置は「開拓地 → 道」の2段。1段目で mode が進む
    if (ui.mode === 'setup-road') {
      applyBoardClick(state, ui, HUMAN, (kind, cands) => cands[0] ?? null);
    }
    if (!actionForPending(state, ui, HUMAN)) stuck.push(mode);
  }
  // 盗賊移動は「奪う相手を選ぶダイアログ」へ逸れることがあるので別扱い
  assert.deepEqual(stuck.filter((m) => m !== 'move-robber'), [],
    'タップして選んだのに確定できないモードがある');
});

test('初期配置: 開拓地を選ぶと道を選ぶ段へ進む', () => {
  const state = midGame('base');
  const ui = freshUi({ mode: 'setup-settlement', highlights: { ...HL } });
  applyBoardClick(state, ui, HUMAN, spy().pick);
  assert.equal(ui.pendingVertex, 'V1', '選んだ開拓地が入っていない');
  assert.equal(ui.mode, 'setup-road', '道を選ぶ段へ進んでいない');
});

test('船を動かす: 1歩目は動かす船、2歩目が行き先', () => {
  const state = midGame('sea');
  const ui = freshUi({ mode: 'move-ship', highlights: { ...HL } });
  applyBoardClick(state, ui, HUMAN, spy().pick);
  assert.equal(ui.shipFrom, 'E1', '動かす船が入っていない');
  assert.equal(ui.mode, 'move-ship-to', '行き先を選ぶ段へ進んでいない');
  assert.equal(ui.pending, null, '1歩目で行き先が入ってしまっている');

  applyBoardClick(state, ui, HUMAN, (kind, cands) => cands[1] ?? null);
  assert.equal(ui.pending?.edgeId, 'E2', '行き先が入っていない');
  assert.equal(ui.shipFrom, 'E1', '動かす船が上書きされた');
});

test('2つ溜めるもの: 上限を超えない・同じところを二度数えない', () => {
  const state = midGame('cak');
  // 数字の交換は2つまで、同じヘックスは1度だけ
  const ui = freshUi({ mode: 'prog-hex2', progIndex: 0, highlights: { ...HL } });
  const same = () => applyBoardClick(state, ui, HUMAN, (k, c) => c[0] ?? null);
  same(); same(); same();
  assert.deepEqual(ui.pendingHexes, ['H1'], '同じところを二度数えた');
  applyBoardClick(state, ui, HUMAN, (k, c) => c[1] ?? null);
  assert.deepEqual(ui.pendingHexes, ['H1', 'H2']);
  // **3つ目は別のヘックスでなければ上限を試したことにならない。**
  // ここで H2 をもう一度押すと、上限ではなく重複チェックで弾かれる。
  applyBoardClick(state, ui, HUMAN, (k, c) => c[2] ?? null);
  assert.deepEqual(ui.pendingHexes, ['H1', 'H2'], '3つ目が入った');

  // 騎士の昇格は2体まで
  const k = freshUi({ mode: 'prog-knights', progIndex: 0, highlights: { ...HL } });
  for (let i = 0; i < 5; i += 1) {
    applyBoardClick(state, k, HUMAN, (kind, c) => c[i % c.length] ?? null);
  }
  assert.deepEqual(k.pendingVertices, ['V1', 'V2'], '騎士が2体を超えた');

  // 道の移設も2本まで(ここだけ溜め先が pendingEdges)
  const r = freshUi({ mode: 'prog-moveroad', progIndex: 0, highlights: { ...HL } });
  for (let i = 0; i < 4; i += 1) {
    applyBoardClick(state, r, HUMAN, (kind, c) => c[i % c.length] ?? null);
  }
  assert.deepEqual(r.pendingEdges, ['E1', 'E2'], '道が2本を超えた');
});

test('街道建設: 置ける本数を超えて溜めない', () => {
  const state = midGame('base');
  const need = roadBuildingCount(state, HUMAN);
  assert.ok(need > 0, '前提: 街道建設の置き場所がある盤で試す');
  const ui = freshUi({ mode: 'play-road-building', highlights: { ...HL } });
  for (let i = 0; i < 6; i += 1) {
    applyBoardClick(state, ui, HUMAN, (kind, c) => c[i % c.length] ?? null);
  }
  assert.equal(ui.pendingEdges.length, need, `本数が ${need} を超えた(${ui.pendingEdges.length})`);
  assert.equal(ui.pendingPieces.length, ui.pendingEdges.length, '辺と駒の数が揃っていない');
});

test('街道建設: 航海者たちでは選んだ駒の種類で溜まる', () => {
  const state = midGame('sea');
  if (roadBuildingCount(state, HUMAN) === 0) return;
  const ui = freshUi({ mode: 'play-road-building', roadPiece: 'ship', highlights: { ...HL } });
  applyBoardClick(state, ui, HUMAN, spy().pick);
  assert.equal(ui.pendingPieces[0], 'ship', '選んだ駒の種類が使われていない');

  // 航海者たち以外では、何を選んでいても道になる
  const land = midGame('base');
  const ui2 = freshUi({ mode: 'play-road-building', roadPiece: 'ship', highlights: { ...HL } });
  applyBoardClick(land, ui2, HUMAN, spy().pick);
  assert.equal(ui2.pendingPieces[0], 'road', '陸の盤で船が溜まった');
});

test('盗賊: 奪える相手がいたら、相手を選ぶダイアログへ', () => {
  const state = midGame('base');
  // 誰かの建物があるヘックスを探す
  const hid = state.board.hexIds.find((h) =>
    LAYOUT.hexVertices[h].some((v) => state.buildings[v] && state.buildings[v].player !== HUMAN));
  assert.ok(hid, '前提: 他人の建物があるヘックスがある盤');
  // 奪うには相手が札を持っている必要がある
  const owner = LAYOUT.hexVertices[hid]
    .map((v) => state.buildings[v]?.player).find((p) => p != null && p !== HUMAN);
  state.players[owner].resources.wood += 1;
  state.bank.resources.wood -= 1;

  const ui = freshUi({ mode: 'move-robber', highlights: { ...HL, hexes: [hid] } });
  applyBoardClick(state, ui, HUMAN, (kind, c) => c[0] ?? null);
  assert.equal(ui.dialog?.type, 'steal', '奪う相手を選ばせていない');
  assert.equal(ui.dialog.hexId, hid);
  assert.ok(ui.dialog.targets.includes(owner), '奪える相手が入っていない');
  assert.equal(ui.pending, null, '相手を選ぶ前に確定できる形になっている');
});

test('盗賊: 奪える相手がいなければ、そのまま確定できる形になる', () => {
  const state = midGame('base');
  // 誰の建物も無いヘックス
  const empty = state.board.hexIds.find((h) =>
    LAYOUT.hexVertices[h].every((v) => !state.buildings[v]));
  assert.ok(empty, '前提: 誰の建物も無いヘックスがある盤');
  const ui = freshUi({ mode: 'move-robber', highlights: { ...HL, hexes: [empty] } });
  applyBoardClick(state, ui, HUMAN, (kind, c) => c[0] ?? null);
  assert.equal(ui.dialog, null, '相手がいないのに選ばせている');
  assert.equal(ui.pending?.hexId, empty);
});

test('タップすると、出ていた知らせは消える', () => {
  const state = midGame('base');
  const ui = freshUi({ mode: 'idle', toast: '前の知らせ' });
  applyBoardClick(state, ui, HUMAN, spy(false).pick);
  assert.equal(ui.toast, null, '古い知らせが残っている');
});
