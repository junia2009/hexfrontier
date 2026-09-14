// 盤面をタップしたときに、何を選びかけるか(設計書 §8.3)
//
// 拾いかたは外から渡す ── 2D は最近傍探索、3D はレイキャストで実装が違うが、
// 「何を候補にして、選んだら ui のどこへ入れるか」は同じ。おかげで
// **DOM に触らずに**検証できる(test/board-click.test.js)。
//
// ここが狂うと、光っているのにタップが効かない(候補と種類が食い違う)か、
// 光っていないものが選べてしまう。main.js の中にあったときは
// 1行もテストが触っていなかった。

import { totalCards } from './rules/build.js';
import { stealableTargets } from './rules/robber.js';
import { isSeaHex, pirateTargets } from './rules/sea.js';
import { roadBuildingCount } from './rules/road-building.js';

// 頂点を1つ選んで溜めるだけのモード
const VERTEX_MODES = [
  'build-settlement', 'build-city',
  'build-knight', 'build-wall', 'build-tower', 'move-knight', 'raze-city',
  'desert-pick', 'desert-place', 'knight-displace',
  'prog-vertex',
];
// 辺を1つ選んで溜めるだけのモード
const EDGE_MODES = ['setup-road', 'build-road', 'fish-road', 'build-ship', 'move-ship-to', 'prog-edge'];
// ヘックスを1つ選んで溜めるだけのモード
const HEX_MODES = ['prog-hex'];

// 街道建設の辺を1つ選ぶ。必要数まで溜めてから確定する。
function pickRoadBuildingEdge(state, ui, human, pick) {
  const eid = pick('edge', ui.highlights.edges ?? []);
  if (!eid || ui.pendingEdges.length >= roadBuildingCount(state, human)) return;
  ui.pendingEdges.push(eid);
  ui.pendingPieces.push(state.mode === 'sea' ? ui.roadPiece : 'road');
}

// ui をその場で書き換える。pick(kind, candidates) → id | null
export function applyBoardClick(state, ui, human, pick) {
  const m = ui.mode;
  ui.toast = null;

  if (m === 'setup-settlement') {
    const vid = pick('vertex', ui.highlights.vertices ?? []);
    if (vid) {
      ui.pendingVertex = vid;
      ui.mode = 'setup-road';
    }
    return;
  }
  if (m === 'move-ship') {
    // 1歩目は動かす船を選ぶだけ。行き先は次のタップ
    const eid = pick('edge', ui.highlights.edges ?? []);
    if (eid) {
      ui.shipFrom = eid;
      ui.mode = 'move-ship-to';
      ui.pending = null;
    }
    return;
  }
  if (EDGE_MODES.includes(m)) {
    const eid = pick('edge', ui.highlights.edges ?? []);
    if (eid) ui.pending = { edgeId: eid };
    return;
  }
  if (VERTEX_MODES.includes(m)) {
    const vid = pick('vertex', ui.highlights.vertices ?? []);
    if (vid) ui.pending = { vertexId: vid };
    return;
  }
  if (HEX_MODES.includes(m)) {
    const hid = pick('hex', ui.highlights.hexes ?? []);
    if (hid) ui.pending = { hexId: hid };
    return;
  }
  if (m === 'move-robber') {
    const hid = pick('hex', ui.highlights.hexes ?? []);
    if (!hid) return;
    // 航海者たち: 海のヘックスなら海賊。奪える相手は「その海に船を出している人」
    const pirate = isSeaHex(state.board, hid);
    const targets = pirate
      ? pirateTargets(state, hid, human).filter((t) => totalCards(state.players[t]) > 0)
      : stealableTargets(state, hid, human);
    if (targets.length > 0) {
      // 誰から奪うかを選ばせる(選び終わってから動かす)
      ui.pending = null;
      ui.dialog = { type: 'steal', hexId: hid, targets, pirate };
    } else {
      ui.pending = { hexId: hid };
    }
    return;
  }
  if (m === 'play-road-building' || m === 'prog-roads') {
    pickRoadBuildingEdge(state, ui, human, pick);
    return;
  }
  // 2つ溜めるもの。同じところを二度押しても増やさない
  if (m === 'prog-hex2') {
    const hid = pick('hex', ui.highlights.hexes ?? []);
    if (hid && ui.pendingHexes.length < 2 && !ui.pendingHexes.includes(hid)) {
      ui.pendingHexes.push(hid);
    }
    return;
  }
  if (m === 'prog-moveroad') {
    const eid = pick('edge', ui.highlights.edges ?? []);
    if (eid && ui.pendingEdges.length < 2) ui.pendingEdges.push(eid);
    return;
  }
  if (m === 'prog-knights') {
    const vid = pick('vertex', ui.highlights.vertices ?? []);
    if (vid && ui.pendingVertices.length < 2) ui.pendingVertices.push(vid);
    return;
  }
  if (m === 'idle' && state.mode === 'cak') {
    // 自分の騎士をタップ → 行動メニュー
    const myKnights = Object.keys(state.knights).filter((v) => state.knights[v].player === human);
    const vid = pick('vertex', myKnights);
    if (vid && state.currentPlayer === human && !state.awaiting && state.turnFlags.rolled) {
      ui.dialog = { type: 'knight', vertexId: vid };
    }
  }
}
