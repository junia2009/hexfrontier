// あそびかたデモ(自動再生)の盤面づくりと小道具。
// ここはブラウザに依存しない ── node のテストからも同じ関数で台本を空回しできる。
//
// 注意: この中の関数は state を直接書き換える。ゲーム本編の不変条件
// (state を書くのは actions.js の apply だけ)の例外だが、
//  - 呼び出すのはデモの「下ごしらえ」だけ
//  - 資源のやりとりは必ず銀行と行い保存則を壊さない
// という条件を守っている(test/demo.test.js で検証)。

import { createGame, RESOURCES } from '../state.js';
import { dispatch } from '../actions.js';
import { chooseAction } from '../ai/cpu-player.js';
import { legalShipEdges } from '../ai/legal-moves.js';
import { boardEdgeIds } from '../rules/board.js';
import { isShipEdge } from '../rules/sea.js';
import { LAKE_NUMBERS, LAYOUT, TERRAIN_RESOURCE, vertexHexesOf } from '../rules/board.js';
import { rngInt } from '../rng.js';
import { COMMODITIES } from '../rules/cak/progress-cards.js';
import { fishCount, fishGainForRoll } from '../rules/fish.js';

// 盤面を固定して、字幕と手順が毎回同じ流れになるようにする
export const DEMO_SEED = 20260806;
export const DEMO_PLAYER = 0; // デモで操作して見せる席(=「あなた」)

// 商品を産む地形(distributeForRoll と同じ対応)
const TERRAIN_COMMODITY = { forest: 'paper', mountain: 'coin', pasture: 'cloth' };

// ---- 盤面の下ごしらえ ----

// デモ用の盤面。既定では初期配置を CPU ロジックで済ませ、
// 「あなた」の1手番目から始まる状態にする。
// finishSetup: false なら初期配置の1手目(あなたの番)から始める(「はじめの配置」の章用)。
export function buildDemoState(mode, { finishSetup = true, midTurn = false } = {}) {
  let state = createGame({
    seed: DEMO_SEED,
    playerCount: 3,
    humanIndex: DEMO_PLAYER,
    mode,
    difficulty: 'hard',
  });
  if (!finishSetup) return state;
  let guard = 0;
  while (state.phase === 'setup' && guard++ < 64) {
    const pid = state.awaiting.players[0];
    const action = chooseAction(state, pid);
    if (!action) break;
    state = dispatch(state, action);
  }
  state.currentPlayer = DEMO_PLAYER;
  return midTurn ? rollForDemo(state) : state;
}

// 手番の途中から始まる章の下ごしらえ。**ダイスを振ってある状態にする。**
//
// 短編に切り分けたら、2本目以降は「手番の頭」ではなく途中から始まる ──
// 振っていないと、建設も交易も発展カードも**全部**「先にダイスを振って
// ください」で弾かれた(切り分けた直後、14本中8本がこれで落ちた)。
//
// 出目は「あなたがいちばんもらえる目」に寄せる。資源が入った状態から
// 話が始まるので、建てる話にそのままつながる。
export function rollForDemo(state, pid = DEMO_PLAYER) {
  forceRoll(state, bestRollFor(state, pid));
  return dispatch(state, { type: 'ROLL_DICE', player: pid });
}

// 次の「あなたの手番」へジャンプする(動画のカット割りに相当)
export function cutToTurn(state, pid = DEMO_PLAYER) {
  state.currentPlayer = pid;
  state.turn += 1;
  state.awaiting = null;
  state.turnFlags = { rolled: false, playedDev: false };
  state.dice = null;
  state.eventDie = null;
}

// ---- 手札の調整(必ず銀行と出し入れする)----

// 不足分だけ銀行から配る。すでに足りていれば何もしない。
export function ensure(state, pid, amounts) {
  const p = state.players[pid];
  for (const [key, n] of Object.entries(amounts)) {
    const isRes = RESOURCES.includes(key);
    const held = isRes ? p.resources[key] : p.commodities[key];
    const stock = isRes ? state.bank.resources[key] : state.bank.commodities[key];
    const give = Math.min(Math.max(0, n - held), stock);
    if (give <= 0) continue;
    if (isRes) {
      state.bank.resources[key] -= give;
      p.resources[key] += give;
    } else {
      state.bank.commodities[key] -= give;
      p.commodities[key] += give;
    }
  }
}

// 手札を max 枚以下に戻す(7の演出で捨て札ダイアログに入らないようにする)
export function trimHand(state, pid, max) {
  const p = state.players[pid];
  const keys = [...COMMODITIES, ...RESOURCES];
  let total = keys.reduce((s, k) => s + cardsOf(p, k), 0);
  for (const key of keys) {
    while (total > max && cardsOf(p, key) > 0) {
      if (RESOURCES.includes(key)) {
        p.resources[key] -= 1;
        state.bank.resources[key] += 1;
      } else {
        p.commodities[key] -= 1;
        state.bank.commodities[key] += 1;
      }
      total -= 1;
    }
  }
}

function cardsOf(player, key) {
  return RESOURCES.includes(key) ? player.resources[key] : player.commodities[key];
}

// ---- 山札の仕込み ----

// 発展カードの山札の一番上に、見せたい種類を持ってくる。
// 山札の中身は入れ替えず並べ替えるだけなので、枚数の構成は本物のまま。
export function stackDevDeck(state, type) {
  const deck = state.bank.devDeck;
  const i = deck.lastIndexOf(type);
  if (i < 0) return false;
  deck.push(...deck.splice(i, 1));
  return true;
}

// ---- 出目の仕込み ----

// 「出目の記録」を見せるための、それらしい履歴。
// 実際に振った回数ではないが、棒グラフの見え方を説明できる山なりの分布にする。
const DICE_LOG_SAMPLE = [0, 0, 1, 2, 4, 5, 7, 8, 6, 5, 3, 2, 1];

export function seedDiceLog(state) {
  const counts = state.diceCounts ?? Array(13).fill(0);
  state.diceCounts = counts.map((n, i) => Math.max(n, DICE_LOG_SAMPLE[i] ?? 0));
}

// 赤黄の目を固定し、必要ならイベントダイスの目も出るまで乱数状態を進める。
// 錬金術師と同じ turnFlags.alchemist を使うので、ルールエンジンには手を入れない。
const EVENT_FACES = ['ship', 'ship', 'ship', 'trade', 'politics', 'science'];

export function forceRoll(state, dice, eventDie = null) {
  state.turnFlags.alchemist = [dice[0], dice[1]];
  if (!eventDie) return true;
  // alchemist 指定時は rollEventDie が最初の乱数を使う。
  // 目的の面が出る乱数状態が見つかるまで空回しする。
  let s = state.rng;
  for (let i = 0; i < 4096; i++) {
    const [next, f] = rngInt(s, 6);
    if (EVENT_FACES[f] === eventDie) {
      state.rng = s;
      return true;
    }
    s = next;
  }
  return false;
}

// pid が最も多く受け取れる出目を探す(7は避ける)。商品は少し重めに数える。
export function bestRollFor(state, pid, { redDie = null } = {}) {
  let bestPair = redDie ? [redDie, 1] : [1, 2];
  let bestScore = -1;
  for (let a = 1; a <= 6; a++) {
    if (redDie && a !== redDie) continue;
    for (let b = 1; b <= 6; b++) {
      const total = a + b;
      if (total === 7) continue;
      const score = yieldOf(state, pid, total);
      if (score > bestScore) {
        bestScore = score;
        bestPair = [a, b];
      }
    }
  }
  return bestPair;
}

function yieldOf(state, pid, total) {
  let score = 0;
  for (const hid of state.board.hexIds) {
    const hex = state.board.hexes[hid];
    if (hex.token !== total || state.board.robber === hid) continue;
    if (!TERRAIN_RESOURCE[hex.terrain]) continue;
    const commodity = state.mode === 'cak' ? TERRAIN_COMMODITY[hex.terrain] : null;
    for (const vid of LAYOUT.hexVertices[hid]) {
      const b = state.buildings[vid];
      if (!b || b.player !== pid) continue;
      score += b.type === 'city' ? (commodity ? 3 : 2) : 1;
    }
  }
  return score;
}

// ---- 盤面の「見栄えのする場所」選び ----

// 数字の出やすさ(6・8が最大)
export function pipsOf(state, hid) {
  const t = state.board.hexes[hid].token;
  return t ? 6 - Math.abs(7 - t) : 0;
}

// その頂点に建てたときのおいしさ
export function vertexValue(state, vid) {
  return vertexHexesOf(state.board, vid).reduce(
    (s, hid) => s + (TERRAIN_RESOURCE[state.board.hexes[hid].terrain] ? pipsOf(state, hid) : 0),
    0,
  );
}

// score が最大の候補を返す(同点は id 順で決定的に)
export function pickBest(items, score) {
  let best = null;
  let bestScore = -Infinity;
  for (const id of [...items].sort()) {
    const v = score(id);
    if (v > bestScore) {
      bestScore = v;
      best = id;
    }
  }
  return best;
}

// ---- 尺(字幕を読む時間)----
//
// **再生する側と数える側で、同じ式を使う。** 一覧に「約30秒」と出すのに
// 別の式で見積もると、表示と実物がずれていく。driver.js もここを読む。
export const TAP_MS = 670;            // 指を出してタップするまでの演出
export const SAY_MIN = 1200;
export const SAY_MAX = 5400;
export const SAY_PER_CHAR = 78;

export function readTime(text) {
  if (!text) return 450;
  return Math.min(SAY_MAX, Math.max(SAY_MIN, text.length * SAY_PER_CHAR));
}

// 章のおおよその尺(秒)。**字幕が関数のビートは実物を作らないと文が
// 決まらない**ので、平均的な長さで見積もる ── 一覧の「約◯秒」に使う
export const SAY_GUESS_MS = 2600;

export function chapterSeconds(chapter) {
  let ms = 0;
  for (const b of chapter.beats) {
    ms += typeof b.say === 'function' ? SAY_GUESS_MS : readTime(b.say);
    ms += b.hold ?? 0;
    if (b.tap) ms += TAP_MS;
  }
  return Math.round(ms / 1000);
}

// ---- 漁師たち ----

// その出目でいちばん魚がもらえる目。**資源の目とは別に探す**
// ── bestRollFor は資源だけを見るので、魚は 2/3/11/12 と漁場の目に偏る
export function bestFishRoll(state, pid) {
  let best = [1, 2];
  let score = -1;
  for (let a = 1; a <= 6; a += 1) {
    for (let b = 1; b <= 6; b += 1) {
      if (a + b === 7) continue;
      const n = fishGainForRoll(state, a + b)[pid] ?? 0;
      if (n > score) { score = n; best = [a, b]; }
    }
  }
  return best;
}

// 魚を n 匹以上にする。**山から引く**(手で作らない) ── 魚トークンには
// 1〜3匹が描かれていて枚数と匹数が違うので、山の中身をそのまま使う
export function ensureFish(state, pid, n) {
  const p = state.players[pid];
  let guard = 0;
  while (fishCount(p) < n && guard < 40) {
    guard += 1;
    const pool = state.bank.fishPool;
    if (!pool?.length) { p.fish.push(3); continue; }   // 山が尽きたら最大の札で補う
    const i = pool.findIndex((t) => t !== 'shoe');
    p.fish.push(i >= 0 ? pool.splice(i, 1)[0] : 3);
  }
}

// 古い靴を持たせる(山にあれば山から取る)
export function giveOldShoe(state, pid) {
  const pool = state.bank.fishPool ?? [];
  const i = pool.indexOf('shoe');
  if (i >= 0) pool.splice(i, 1);
  if (!state.players[pid].fish.includes('shoe')) state.players[pid].fish.push('shoe');
}

// 魚のもらえる場所に、あなたの開拓地を用意する。
//
// **デモの盤では、誰も漁場にも湖にも接していなかった**(全部の目で獲得 0)。
// 魚が入るところを見せる章なので、接した頂点へ席を1つ移す ── 増やすのでは
// なく移すのは、コマの数(開拓地5軒)を壊さないため。
// 戻り値はその頂点と、そこに魚を出す出目。
export function seatByFish(state, pid = DEMO_PLAYER) {
  // **漁場を先に見る。** 湖は開始時に盗賊が乗っている(元の砂漠なので)ため
  // 魚が止まっていて、そこに席を作っても1匹も入らない ── 実際そうなった
  const spots = [];
  for (const f of state.board.fisheries ?? []) {
    for (const vid of LAYOUT.edges[f.edgeId].v) spots.push({ vid, total: f.number });
  }
  const lake = state.board.lake;
  if (lake && state.board.robber !== lake) {
    for (const vid of LAYOUT.hexVertices[lake] ?? []) spots.push({ vid, total: LAKE_NUMBERS[0] });
  }
  // すでに接しているならそのまま
  const mine = Object.keys(state.buildings).filter((v) => state.buildings[v].player === pid);
  const already = spots.find((x) => mine.includes(x.vid));
  if (already) return already;
  // 空いている頂点へ、自分の開拓地を1つ移す
  const free = spots.find((x) => !state.buildings[x.vid]);
  if (!free || !mine.length) return null;
  delete state.buildings[mine[0]];
  state.buildings[free.vid] = { player: pid, type: 'settlement' };
  return free;
}

// ---- 航海者たち ----

// 海沿いに、あなたの開拓地を用意する。
//
// **CPU の初期配置は内陸を好む。** そのままだと海に面した辺が自分の建物に
// 1つも接していなくて、**船を置ける辺が0だった**(実測)── 船の章が
// 成立しない。席を1つ海沿いへ移す(増やさないのは seatByFish と同じ理由)。
export function seatByCoast(state, pid = DEMO_PLAYER) {
  const mine = Object.keys(state.buildings).filter((v) => state.buildings[v].player === pid);
  if (legalShipEdges(state, pid).length) return null;   // すでに出港できる
  for (const eid of boardEdgeIds(state.board)) {
    if (!isShipEdge(state.board, eid)) continue;
    const free = LAYOUT.edges[eid].v.find((v) => !state.buildings[v]);
    if (!free || !mine.length) continue;
    delete state.buildings[mine[0]];
    state.buildings[free] = { player: pid, type: 'settlement' };
    if (legalShipEdges(state, pid).length) return free;
    // 置いてみて駄目なら戻す(隣の建物との距離などで弾かれることがある)
    delete state.buildings[free];
    state.buildings[mine[0]] = { player: pid, type: 'settlement' };
  }
  return null;
}

// 船を1隻、置いた状態にする。**前の手番に建てたことにする**
// ── 建てたその手番の船は動かせない規則があるので、「動かす」の章を
// 単独で見せるには、すでに航路がある状態から始める必要がある。
export function giveShip(state, pid = DEMO_PLAYER) {
  const eid = legalShipEdges(state, pid)[0];
  if (!eid) return null;
  state.ships = state.ships ?? {};
  state.ships[eid] = { player: pid, builtTurn: state.turn - 1 };
  return eid;
}
