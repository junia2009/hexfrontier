// 「確定」を押したときに、どのアクションになるか(設計書 §8.3)
//
// 盤面をタップして選びかけたものを、確定でルールエンジンへ渡す形にする
// ところ。**DOM には触らない**ので node からそのまま検証できる
// (test/ui-confirm.test.js)。
//
// ここが抜けると「確定を押しても何も起きない」になる ── 選んだのに進めない
// ので、その場で詰む。逆に条件が緩いと、選びかけのまま中途半端なアクションが
// 飛んでエンジンに弾かれる。どちらも main.js の中にあったときは
// 1行もテストが触っていなかった。

import { roadBuildingCount } from './rules/road-building.js';

// 「やめる」で畳めるモード(自分から入ったもの)。
// 割り込みで強いられて入るモード(初期配置・盗賊移動など)はここに入れない
// ── 途中でやめられると、割り込みに応えられないまま止まる。
export const CANCELLABLE_MODES = [
  'build-road', 'fish-road', 'build-ship', 'move-ship', 'move-ship-to',
  'build-settlement', 'build-city', 'play-road-building',
  'build-knight', 'build-wall', 'build-tower', 'move-knight',
  'prog-hex', 'prog-vertex', 'prog-edge', 'prog-hex2', 'prog-roads', 'prog-knights', 'prog-moveroad',
];

// 頂点を1つ選んで確定するだけのモード → アクションの型
const VERTEX_ACTIONS = {
  'build-settlement': 'BUILD_SETTLEMENT',
  'build-city': 'BUILD_CITY',
  'knight-displace': 'PLACE_DISPLACED_KNIGHT',
  'desert-pick': 'PICK_DESERTER',
  'desert-place': 'PLACE_DESERTER',
  'build-knight': 'BUILD_KNIGHT',
  'build-wall': 'BUILD_WALL',
  'build-tower': 'BUILD_TOWER',
  'raze-city': 'RAZE_CITY',
};

// 街道建設で置く本数(置ける場所が1つしかなければ1本)
const needRoads = (state, human) => roadBuildingCount(state, human);
const roadParams = (ui) => ({ edges: [...ui.pendingEdges], pieces: [...ui.pendingPieces] });
// 進歩カードは「どの札か」が要る。index が無いまま送ると別の札が出る
const prog = (ui, human, params) => ({
  type: 'PLAY_PROGRESS_CARD', player: human, index: ui.progIndex, params,
});

// 選びかけが揃っていれば、そのアクションを返す。揃っていなければ null。
// **null のときは何も起きないのが正しい**(中途半端なまま送らない)。
export function actionForPending(state, ui, human) {
  const m = ui.mode;
  const p = ui.pending;

  if (m === 'setup-road' && ui.pendingVertex && p?.edgeId) {
    return {
      type: 'PLACE_INITIAL', player: human,
      vertexId: ui.pendingVertex, edgeId: p.edgeId, piece: ui.setupPiece,
    };
  }
  if (m === 'build-road' && p?.edgeId) return { type: 'BUILD_ROAD', player: human, edgeId: p.edgeId };
  if (m === 'build-ship' && p?.edgeId) return { type: 'BUILD_SHIP', player: human, edgeId: p.edgeId };
  if (m === 'move-ship-to' && ui.shipFrom && p?.edgeId) {
    return { type: 'MOVE_SHIP', player: human, from: ui.shipFrom, to: p.edgeId };
  }
  if (m === 'fish-road' && p?.edgeId) {
    return { type: 'SPEND_FISH', player: human, use: 'road', params: { edgeId: p.edgeId } };
  }
  if (VERTEX_ACTIONS[m] && p?.vertexId) {
    return { type: VERTEX_ACTIONS[m], player: human, vertexId: p.vertexId };
  }
  if (m === 'move-robber' && p?.hexId) {
    return { type: 'MOVE_ROBBER', player: human, hexId: p.hexId, targetPlayer: null };
  }
  if (m === 'move-knight' && ui.knightFrom && p?.vertexId) {
    return {
      type: 'MOVE_KNIGHT', player: human,
      fromVertexId: ui.knightFrom, toVertexId: p.vertexId,
    };
  }
  // 本数は「置ける場所がある数」なので 0 になりうる。0 のまま通すと
  // 1本も置かずに札だけ消える ── いまは呼ぶ側(startDevPlay)が 0 を弾いて
  // いるので実際には起きないが、判断がこちらに移った以上ここでも見る。
  if (m === 'play-road-building' && ui.pendingEdges.length > 0
      && ui.pendingEdges.length === needRoads(state, human)) {
    return {
      type: 'PLAY_DEV_CARD', player: human, card: 'roadBuilding', params: roadParams(ui),
    };
  }

  // ここから先は進歩カード(都市と騎士)。どれも札の index が要る
  if (ui.progIndex == null) return null;
  if (m === 'prog-hex' && p?.hexId) return prog(ui, human, { hexId: p.hexId });
  if (m === 'prog-vertex' && p?.vertexId) return prog(ui, human, { vertexId: p.vertexId });
  if (m === 'prog-edge' && p?.edgeId) return prog(ui, human, { edgeId: p.edgeId });
  if (m === 'prog-hex2' && ui.pendingHexes.length === 2) {
    return prog(ui, human, { a: ui.pendingHexes[0], b: ui.pendingHexes[1] });
  }
  if (m === 'prog-moveroad' && ui.pendingEdges.length === 2) {
    return prog(ui, human, { edgeId: ui.pendingEdges[0], to: ui.pendingEdges[1] });
  }
  if (m === 'prog-knights' && ui.pendingVertices.length >= 1) {
    return prog(ui, human, { vertices: [...ui.pendingVertices] });
  }
  if (m === 'prog-roads' && ui.pendingEdges.length > 0
      && ui.pendingEdges.length === needRoads(state, human)) {
    return prog(ui, human, roadParams(ui));
  }
  return null;
}

// 「やめる」。選びかけを残したまま畳むと、次に別のものを建てるときに
// 古い選択が混ざるので、**溜めるところは全部空にする**。
export function cancelPending(ui) {
  if (ui.mode === 'setup-road') {
    // 初期配置は1つ前(開拓地選び)に戻すだけ。割り込みの途中なので抜けない
    ui.mode = 'setup-settlement';
    ui.pendingVertex = null;
    ui.pending = null;
    ui.setupPiece = 'road';
    return;
  }
  if (!CANCELLABLE_MODES.includes(ui.mode)) return;
  ui.mode = 'idle';
  ui.pending = null;
  ui.pendingEdges = [];
  ui.pendingPieces = [];
  ui.roadPiece = 'road';
  ui.pendingHexes = [];
  ui.pendingVertices = [];
  ui.knightFrom = null;
  ui.shipFrom = null;
  ui.progIndex = null;
}
