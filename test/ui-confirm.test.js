// 「確定」でどのアクションになるか(src/ui-confirm.js)。
//
// main.js の中にあったあいだ、ここは1行もテストが触っていなかった。
// 抜けがあると「確定を押しても何も起きない」── 選んだのに進めないので
// その場で詰む。逆に条件が緩いと、選びかけのまま中途半端なアクションが
// 飛んでエンジンに弾かれる。
//
// いちばん効くのは**配線の抜けを探す**検査。モードの一覧は別のところ
// (畳める一覧・割り込みの対応表)にもあるので、そこに載っているのに
// 確定側だけ書き忘れる、が起こりうる。総当たりで炙り出す。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/state.js';
import { dispatch, validateAction } from '../src/actions.js';
import { chooseAction } from '../src/ai/cpu-player.js';
import { boardEdgeIds, boardVertexIds } from '../src/rules/board.js';
import { roadBuildingCount } from '../src/rules/road-building.js';
import { actionForPending, cancelPending, CANCELLABLE_MODES } from '../src/ui-confirm.js';
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
  ...over,
});

const game = (mode = 'base', seed = 3) =>
  createGame({ seed, playerCount: 4, humanIndex: HUMAN, mode });

// 初期配置が終わって、道も建物もある盤。街道建設の本数が 0 でなくなる
function midGame(mode = 'base', seed = 3) {
  let state = game(mode, seed);
  for (let i = 0; i < 4000 && state.phase === 'setup'; i += 1) {
    const pid = state.awaiting ? state.awaiting.players[0] : state.currentPlayer;
    state = dispatch(state, chooseAction(state, pid));
  }
  return state;
}

// 人間の手番(ロール済み)まで進める
function toRolledTurn(mode = 'base', seed = 3) {
  let state = game(mode, seed);
  for (let i = 0; i < 4000; i += 1) {
    if (state.phase === 'main' && state.currentPlayer === HUMAN && !state.awaiting) {
      state.turnFlags.alchemist = [2, 3];
      const rolled = dispatch(state, { type: 'ROLL_DICE', player: HUMAN });
      return rolled.awaiting ? null : rolled;
    }
    const pid = state.awaiting ? state.awaiting.players[0] : state.currentPlayer;
    state = dispatch(state, chooseAction(state, pid));
  }
  return null;
}

// 選びかけの「揃った形」をひととおり。どれか1つで通ればその配線は生きている
function candidatePendings(state) {
  const eid = boardEdgeIds(state.board)[0];
  const eid2 = boardEdgeIds(state.board)[1];
  const vid = boardVertexIds(state.board)[0];
  const hid = state.board.hexIds[0];
  const hid2 = state.board.hexIds[1];
  return [
    { pending: { edgeId: eid } },
    { pending: { vertexId: vid } },
    { pending: { hexId: hid } },
    { pending: { edgeId: eid }, shipFrom: eid2 },
    { pending: { vertexId: vid }, knightFrom: boardVertexIds(state.board)[1] },
    { pending: { edgeId: eid }, pendingVertex: vid },
    { pendingEdges: [eid, eid2], pendingPieces: ['road', 'road'] },
    { pendingHexes: [hid, hid2] },
    { pendingVertices: [vid] },
  ];
}

test('配線: 畳めるモードは全部、確定でアクションになる', () => {
  // 一覧に足したのに確定側を書き忘れる、を炙り出す。
  // (どの欄を使うかまでは決め打ちしない ── それを書くと実装の写経になる)
  //
  // **作りたての盤ではだめ。** 街道建設の本数は「置ける場所の数」なので、
  // まだ道が1本も無い盤では 0 になり、何を入れても確定できない状態になる。
  const state = midGame('cak');
  assert.ok(roadBuildingCount(state, HUMAN) > 0, '前提: 街道建設の置き場所がある盤で試す');
  const cands = candidatePendings(state);
  const orphans = [];
  for (const mode of CANCELLABLE_MODES) {
    // 「船を動かす」の1歩目は行き先を選ぶ前なので、確定するものが無い
    if (mode === 'move-ship') continue;
    const ok = cands.some((over) => {
      const ui = freshUi({ mode, progIndex: 0, ...over });
      return actionForPending(state, ui, HUMAN) != null;
    });
    if (!ok) orphans.push(mode);
  }
  assert.deepEqual(orphans, [], '確定で何も起きないモードがある(押しても進めない)');
});

test('配線: 割り込みで入るモードも、全部アクションになる', () => {
  const state = midGame('cak');
  const cands = candidatePendings(state);
  const orphans = [];
  for (const mode of Object.values(MODE_FOR_AWAITING)) {
    // 初期配置の1歩目は開拓地を選ぶだけ(確定は setup-road 側)
    if (mode === 'setup-settlement') continue;
    const ok = cands.some((over) => {
      const ui = freshUi({ mode, progIndex: 0, ...over });
      return actionForPending(state, ui, HUMAN) != null;
    });
    if (!ok) orphans.push(mode);
  }
  assert.deepEqual(orphans, [], '割り込みなのに確定できないモードがある(応えられず止まる)');
});

test('配線: 選びかけが揃っていなければ、何も起きない', () => {
  // 中途半端なまま送るとエンジンに弾かれる。押しても無反応が正しい
  const state = midGame('cak');
  for (const mode of [...CANCELLABLE_MODES, ...Object.values(MODE_FOR_AWAITING)]) {
    const ui = freshUi({ mode, progIndex: 0 });
    assert.equal(
      actionForPending(state, ui, HUMAN), null,
      `${mode}: 何も選んでいないのにアクションが出た`,
    );
  }
});

test('配線: 知らないモードでは何も起きない', () => {
  const state = game();
  for (const mode of ['idle', 'trade', 'そんなモードはない', null, undefined]) {
    assert.equal(actionForPending(state, freshUi({ mode }), HUMAN), null, `${mode} で何か出た`);
  }
});

test('進歩カード: どの札か決まっていなければ送らない', () => {
  // index が抜けたまま送ると、別の札が出てしまう
  const state = game('cak');
  const hid = state.board.hexIds[0];
  const withIndex = freshUi({ mode: 'prog-hex', pending: { hexId: hid }, progIndex: 2 });
  assert.equal(actionForPending(state, withIndex, HUMAN)?.index, 2);

  const noIndex = freshUi({ mode: 'prog-hex', pending: { hexId: hid }, progIndex: null });
  assert.equal(actionForPending(state, noIndex, HUMAN), null, 'index 無しで送っている');
});

test('アクションの中身: 出すのは必ず自分の手、型も正しい', () => {
  const state = game('sea');
  const eid = boardEdgeIds(state.board)[0];
  const vid = boardVertexIds(state.board)[0];
  const cases = [
    [{ mode: 'build-road', pending: { edgeId: eid } }, 'BUILD_ROAD'],
    [{ mode: 'build-ship', pending: { edgeId: eid } }, 'BUILD_SHIP'],
    [{ mode: 'build-settlement', pending: { vertexId: vid } }, 'BUILD_SETTLEMENT'],
    [{ mode: 'build-city', pending: { vertexId: vid } }, 'BUILD_CITY'],
    [{ mode: 'move-robber', pending: { hexId: state.board.hexIds[0] } }, 'MOVE_ROBBER'],
    [{ mode: 'fish-road', pending: { edgeId: eid } }, 'SPEND_FISH'],
  ];
  for (const [over, type] of cases) {
    const a = actionForPending(state, freshUi(over), HUMAN);
    assert.equal(a.type, type, `${over.mode} の型が違う`);
    assert.equal(a.player, HUMAN, `${over.mode} が自分の手になっていない`);
  }
});

test('アクションの中身: 初期配置は開拓地・道・駒の種類をまとめて渡す', () => {
  const state = game('sea');
  const ui = freshUi({
    mode: 'setup-road',
    pendingVertex: boardVertexIds(state.board)[0],
    pending: { edgeId: boardEdgeIds(state.board)[0] },
    setupPiece: 'ship',
  });
  const a = actionForPending(state, ui, HUMAN);
  assert.equal(a.type, 'PLACE_INITIAL');
  assert.equal(a.vertexId, ui.pendingVertex);
  assert.equal(a.edgeId, ui.pending.edgeId);
  assert.equal(a.piece, 'ship', '選んだ駒の種類が渡っていない');
});

test('アクションの中身: 溜めたものは写して渡す(あとで消しても壊れない)', () => {
  // **作りたての盤でやると素通りする。** 街道建設の本数が 0 なので
  // アクションが出ず、`if (!a) return` で何も確かめないまま通っていた
  // (参照渡しにする突然変異を捕まえられず気づいた)。
  const state = midGame('cak');
  const need = roadBuildingCount(state, HUMAN);
  assert.equal(need, 2, '前提: 街道建設が2本置ける盤で試す');
  const [e1, e2] = boardEdgeIds(state.board);
  const ui = freshUi({
    mode: 'prog-roads', progIndex: 1, pendingEdges: [e1, e2], pendingPieces: ['road', 'road'],
  });
  const a = actionForPending(state, ui, HUMAN);
  assert.ok(a, '確定してもアクションが出ない');
  ui.pendingEdges.length = 0; // 確定のあと畳まれる
  ui.pendingPieces.length = 0;
  assert.equal(a.params.edges.length, 2, '溜めた辺を参照で渡している(畳むと消える)');
  assert.equal(a.params.pieces.length, 2, '溜めた駒を参照で渡している');
});

test('エンジンと突き合わせ: 揃った選択から出たアクションは、実際に通る', () => {
  // 「確定 → 弾かれる」が起きないこと。合法な場所を選んだ形で試す
  const state = toRolledTurn('base');
  if (!state) return;
  const p = state.players[HUMAN];
  for (const [r, n] of Object.entries({ wood: 2, brick: 2, sheep: 1, wheat: 1 })) {
    p.resources[r] += n;
    state.bank.resources[r] -= n;
  }
  // いま道を置ける辺を1つ選ぶ
  const legal = boardEdgeIds(state.board).find(
    (eid) => validateAction(state, { type: 'BUILD_ROAD', player: HUMAN, edgeId: eid }) === null,
  );
  if (!legal) return;
  const ui = freshUi({ mode: 'build-road', pending: { edgeId: legal } });
  const a = actionForPending(state, ui, HUMAN);
  assert.ok(a, '確定してもアクションが出ない');
  assert.equal(validateAction(state, a), null, `確定から出た手をエンジンが弾いた: ${validateAction(state, a)}`);
});

test('やめる: 溜めたものを全部空にする(古い選択が次に混ざらない)', () => {
  const ui = freshUi({
    mode: 'prog-roads',
    pending: { edgeId: 'e' },
    pendingEdges: ['e1', 'e2'],
    pendingPieces: ['road', 'ship'],
    pendingHexes: ['h1'],
    pendingVertices: ['v1'],
    roadPiece: 'ship',
    knightFrom: 'v9',
    shipFrom: 'e9',
    progIndex: 3,
  });
  cancelPending(ui);
  assert.equal(ui.mode, 'idle');
  for (const k of ['pending', 'knightFrom', 'shipFrom', 'progIndex']) {
    assert.equal(ui[k], null, `${k} が残っている`);
  }
  for (const k of ['pendingEdges', 'pendingPieces', 'pendingHexes', 'pendingVertices']) {
    assert.deepEqual(ui[k], [], `${k} が残っている`);
  }
  assert.equal(ui.roadPiece, 'road', '駒の種類が戻っていない');
});

test('やめる: 初期配置は1つ前に戻るだけ(割り込みから抜けない)', () => {
  // idle にすると、初期配置の割り込みに応えられないまま止まる
  const ui = freshUi({ mode: 'setup-road', pendingVertex: 'v1', pending: { edgeId: 'e1' }, setupPiece: 'ship' });
  cancelPending(ui);
  assert.equal(ui.mode, 'setup-settlement', '初期配置から抜けてしまった');
  assert.equal(ui.pendingVertex, null, '選んだ開拓地が残っている');
  assert.equal(ui.setupPiece, 'road', '駒の種類が戻っていない');
});

test('やめる: 割り込みで強いられたモードは畳まない', () => {
  // 盗賊移動などを途中でやめられると、応えられないまま止まる
  for (const mode of ['move-robber', 'raze-city', 'desert-pick', 'desert-place', 'knight-displace']) {
    const ui = freshUi({ mode, pending: { hexId: 'h' } });
    cancelPending(ui);
    assert.equal(ui.mode, mode, `${mode} を畳んでしまった`);
  }
});
