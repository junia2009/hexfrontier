// あそびかたデモの台本。
//
// 1ビート = 字幕1つ + 任意の操作。実行順は prep → 字幕 → 指でタップ → ui/action。
//   say    : 字幕(文字列 または (state, ui) => 文字列)
//   prep   : 操作の前に盤面を整える(資源を配る・出目を仕込む など)
//   tap    : 指を出す位置 { btn } | { sel } | { vertex } | { edge } | { hex }
//   ui     : タップの結果としての UI 状態(main.js の click ハンドラと同じ形に揃える)
//   action : 実際に dispatch する手
//   hold   : 字幕の表示時間の上乗せ(ms)
//
// 盤面依存の場所(どの辺・どの頂点)は毎回 state から選び直す。
// 座標を台本に焼き込まないので、盤面生成が変わっても壊れない。

import { LAYOUT, TERRAIN_RESOURCE, vertexHexesOf } from '../rules/board.js';
import { validateAction } from '../actions.js';
import { canPlaceSettlement, piecesLeft, totalCards } from '../rules/build.js';
import { tradeRate } from '../rules/trade.js';
import { fishCount, shoeTargets } from '../rules/fish.js';
import { computePoints } from '../rules/victory.js';
import { isSeaHex, movableShips, pirateTargets } from '../rules/sea.js';
import { stealableTargets } from '../rules/robber.js';
import { chooseAction } from '../ai/cpu-player.js';
import {
  legalCityVertices, legalRoadEdges, legalRobberHexes, legalSettlementVertices,
  legalSetupEdges, legalShipEdges,
} from '../ai/legal-moves.js';
import {
  DEMO_PLAYER as P, bestFishRoll, bestRollFor, cutToTurn, ensure, ensureFish, forceRoll,
  giveOldShoe, giveShip, pickBest, pipsOf, seatByCoast, seatByFish, seedDiceLog, stackDevDeck,
  trimHand, vertexValue,
} from './scenario.js';

// ---- 盤面から「見せ場」を選ぶ ----

// 辺の「伸ばし甲斐」: その先に開拓地を建てられる良い土地があるか
function roadScore(state, eid) {
  let best = -1;
  for (const vid of LAYOUT.edges[eid].v) {
    if (canPlaceSettlement(state, P, vid, { needRoad: false }) !== null) continue;
    best = Math.max(best, vertexValue(state, vid));
  }
  return best;
}

// 先に開拓地を建てられる場所へ伸びる道を選ぶ
const pickRoad = (state) => pickBest(legalRoadEdges(state, P), (eid) => roadScore(state, eid));

// 街道建設カードの2本目(1本目を建てたことにして選び直す)
const pickNextRoad = (state, first) =>
  pickBest(
    legalRoadEdges(state, P, { extraRoads: { [first]: true } }),
    (eid) => roadScore(state, eid),
  );

const pickSettlement = (state) =>
  pickBest(legalSettlementVertices(state, P), (vid) => vertexValue(state, vid));

const pickCity = (state) =>
  pickBest(legalCityVertices(state, P), (vid) => vertexValue(state, vid));

const pickKnightSpot = (state) =>
  pickBest(
    Object.keys(LAYOUT.vertices).filter(
      (vid) => validateAction(state, { type: 'BUILD_KNIGHT', player: P, vertexId: vid }) === null,
    ),
    (vid) => vertexValue(state, vid),
  );

const pickWall = (state) =>
  pickBest(
    Object.keys(state.buildings).filter(
      (vid) => validateAction(state, { type: 'BUILD_WALL', player: P, vertexId: vid }) === null,
    ),
    (vid) => vertexValue(state, vid),
  );

const myKnight = (state) =>
  Object.keys(state.knights).find((vid) => state.knights[vid].player === P) ?? null;

// 自分の土地を避けつつ、奪える相手がいる出目の良いヘックス
function pickRobberHex(state) {
  return pickBest(legalRobberHexes(state), (hid) => {
    const corners = LAYOUT.hexVertices[hid] ?? [];
    if (corners.some((vid) => state.buildings[vid]?.player === P)) return -1;
    const targets = stealableTargets(state, hid, P).length;
    return targets ? 100 * targets + pipsOf(state, hid) : 0;
  });
}

// プレイヤー間交易のデモの中身。渡すもの・もらうものを固定して、
// 字幕と画面のチップが必ず一致するようにする(prep で全員の手札を用意する)。
// 複数が応じる状況を作り、「相手を選ぶ」ところまで見せる。
const PT = { give: 'wood', giveN: 2, receive: 'ore', receiveN: 1 };

// 銀行と2:1〜4:1で交換できるだけの資源を持たせ、その資源と交換先を決める
function bankTradePlan(state) {
  const give = pickBest(['wood', 'brick', 'sheep', 'wheat', 'ore'], (r) => -tradeRate(state, P, r));
  const receive = give === 'ore' ? 'wheat' : 'ore';
  return { give, receive, rate: tradeRate(state, P, give) };
}

// ---- 初期配置(setup)用の選び方 ----

// その頂点で新しく手に入る資源の種類(すでに持っている土地との重なりを避けるため)
function newResourcesAt(state, vid) {
  const mine = new Set();
  for (const [v, b] of Object.entries(state.buildings)) {
    if (b.player !== P) continue;
    for (const hid of vertexHexesOf(state.board, v)) {
      const res = TERRAIN_RESOURCE[state.board.hexes[hid].terrain];
      if (res) mine.add(res);
    }
  }
  const gained = new Set();
  for (const hid of vertexHexesOf(state.board, vid)) {
    const res = TERRAIN_RESOURCE[state.board.hexes[hid].terrain];
    if (res && !mine.has(res)) gained.add(res);
  }
  return gained.size;
}

// 初期配置の開拓地: 出目の良さ + まだ持っていない資源が取れることを加点
const pickSetupVertex = (state) =>
  pickBest(
    legalSettlementVertices(state, P, { needRoad: false }),
    (vid) => vertexValue(state, vid) + 2 * newResourcesAt(state, vid),
  );

// 初期配置の道: 伸ばした先に良い土地がある向きへ
const pickSetupEdge = (state, vid) =>
  pickBest(legalSetupEdges(state, vid), (eid) => {
    const far = LAYOUT.edges[eid].v.find((v) => v !== vid);
    return far ? vertexValue(state, far) : 0;
  });

// いま置く番のプレイヤー(初期配置は awaiting が順番を持っている)
const setupTurnOf = (state) => state.awaiting?.players[0] ?? null;

// CPU の初期配置を1手進める
const cpuSetupMove = (state) => {
  const pid = setupTurnOf(state);
  return pid == null || pid === P ? null : chooseAction(state, pid);
};

// 7の演出の前に、全員の手札を捨て札ラインの下へ戻す(捨て札ダイアログで話が止まらないように)
function tidyHandsForSeven(state) {
  for (const p of state.players) {
    trimHand(state, p.id, 7);
    if (p.id !== P && totalCards(p) === 0) ensure(state, p.id, { wood: 1 });
  }
}

// ---- 第1章: はじめの配置 ----

const setupBeats = [
  {
    say: 'ゲームは「初期配置」から始まります。全員が順番に、開拓地1つと道1本ずつを2回に分けて置きます。',
    hold: 900,
  },
  {
    say: '🏠 まずはあなたの番。置ける頂点が光ります ── ほかの建物から2つ以上離す決まりがあるので、光った場所だけが候補です。',
    hold: 2000,
  },
  {
    say: '数字の下の点が多いほど出やすい目(6と8が最大)。土地3つに接していて、資源の種類が散っている角が有利です。',
    tap: (s) => ({ vertex: pickSetupVertex(s) }),
    ui: (s) => ({ pendingVertex: pickSetupVertex(s), mode: 'setup-road' }),
    hold: 1600,
  },
  {
    say: '続けて、その開拓地につながる道を1本。あとで開拓地を増やしたい方向へ伸ばします。',
    tap: (s, ui) => ({ edge: pickSetupEdge(s, ui.pendingVertex) }),
    ui: (s, ui) => ({ pending: { edgeId: pickSetupEdge(s, ui.pendingVertex) } }),
    hold: 1200,
  },
  {
    say: '「✓ 確定」で決定。',
    tap: () => ({ btn: 'confirm' }),
    action: (s, ui) => ({
      type: 'PLACE_INITIAL', player: P,
      vertexId: ui.pendingVertex, edgeId: ui.pending?.edgeId,
    }),
    hold: 900,
  },
  {
    say: '次の人へ。ほかのプレイヤーも同じように置いていきます。',
    action: (s) => cpuSetupMove(s),
    hold: 1000,
  },
  {
    say: '置く順番は 1→2→3 と回り、そこで折り返して 3→2→1。最後の人は2つ続けて置けます。',
    action: (s) => cpuSetupMove(s),
    hold: 1600,
  },
  {
    say: '2巡目に入りました。ここから逆回りです。',
    action: (s) => cpuSetupMove(s),
    hold: 1000,
  },
  {
    say: '空いている良い場所は、どんどん取られていきます。',
    action: (s) => cpuSetupMove(s),
    hold: 1000,
  },
  {
    say: '🏠 最後にもう一度あなたの番。1軒目とは違う資源が取れる場所を選ぶと、序盤が回りやすくなります。',
    hold: 2000,
  },
  {
    say: '同じように、開拓地 → 道 の順に選びます。',
    tap: (s) => ({ vertex: pickSetupVertex(s) }),
    ui: (s) => ({ pendingVertex: pickSetupVertex(s), mode: 'setup-road' }),
    hold: 1000,
  },
  {
    say: '道も、光った辺をタップするだけ。',
    tap: (s, ui) => ({ edge: pickSetupEdge(s, ui.pendingVertex) }),
    ui: (s, ui) => ({ pending: { edgeId: pickSetupEdge(s, ui.pendingVertex) } }),
    hold: 700,
  },
  {
    say: '確定。2巡目に置いた開拓地に接する土地からは、その場で資源がもらえます。',
    tap: () => ({ btn: 'confirm' }),
    action: (s, ui) => ({
      type: 'PLACE_INITIAL', player: P,
      vertexId: ui.pendingVertex, edgeId: ui.pending?.edgeId,
    }),
    hold: 2000,
  },
  {
    say: (s) => {
      const n = totalCards(s.players[P]);
      return `手札に${n}枚入りました。これで準備完了 ── ここからダイスを振る手番が始まります。`;
    },
    hold: 1800,
  },
];

// ---- 第2章: 基本の手番 ----

const basicBeats = [
  {
    cut: { id: 'dice', title: 'ダイスと資源', lead: '振ると、土地に接した建物が資源を生む' },
    say: 'あなたの手番でできることを、実際の画面で一通り見ていきます。',
    hold: 500,
  },
  {
    say: '🎲 手番はダイスから。2個の合計の数字が書かれた土地に接している建物が、資源を生みます。',
    prep: (s) => forceRoll(s, bestRollFor(s, P)),
    tap: () => ({ btn: 'roll' }),
    action: () => ({ type: 'ROLL_DICE', player: P }),
    hold: 1600,
  },
  {
    say: '開拓地は1枚、都市なら2枚。もらった資源は下の手札に増えます。',
    hold: 600,
  },
  {
    cut: { id: 'build', title: '道と開拓地を建てる', lead: '光った場所をタップして確定' },
    say: '🛤 道は 🪵1 🧱1。まず「道」ボタンを押します。',
    prep: (s) => ensure(s, P, { wood: 1, brick: 1 }),
    tap: () => ({ btn: 'mode:road' }),
    ui: () => ({ mode: 'build-road' }),
    hold: 900,
  },
  {
    say: '建てられる場所が光ります。そのひとつをタップ。',
    tap: (s) => ({ edge: pickRoad(s) }),
    ui: (s) => ({ pending: { edgeId: pickRoad(s) } }),
    hold: 700,
  },
  {
    say: '「✓ 確定」で建設。置き直したいときは「↩ やり直す」。',
    tap: () => ({ btn: 'confirm' }),
    action: (s, ui) => ({ type: 'BUILD_ROAD', player: P, edgeId: ui.pending?.edgeId }),
    hold: 900,
  },
  {
    say: '🏠 開拓地は 🪵1 🧱1 🐑1 🌾1。自分の道の先で、ほかの建物から2つ以上離れた頂点に建てられます。',
    prep: (s) => ensure(s, P, { wood: 1, brick: 1, sheep: 1, wheat: 1 }),
    tap: () => ({ btn: 'mode:settlement' }),
    ui: () => ({ mode: 'build-settlement' }),
    hold: 1200,
  },
  {
    say: '条件を満たす頂点だけが光るので、迷いません。',
    tap: (s) => ({ vertex: pickSettlement(s) }),
    ui: (s) => ({ pending: { vertexId: pickSettlement(s) } }),
    hold: 500,
  },
  {
    say: '開拓地は1点。ここも資源を生むようになります。',
    tap: () => ({ btn: 'confirm' }),
    action: (s, ui) => ({ type: 'BUILD_SETTLEMENT', player: P, vertexId: ui.pending?.vertexId }),
    hold: 900,
  },
  {
    cut: { id: 'city', title: '都市に育てる', lead: '産出が2倍。コマのやりくりも' },
    say: '🏰 都市は 🌾2 🪨3 で開拓地を昇格させます。産出が2倍になり、点も1→2点に。',
    prep: (s) => ensure(s, P, { wheat: 2, ore: 3 }),
    tap: () => ({ btn: 'mode:city' }),
    ui: () => ({ mode: 'build-city' }),
    hold: 1200,
  },
  {
    say: '昇格させる自分の開拓地を選んで、確定。',
    tap: (s) => ({ vertex: pickCity(s) }),
    ui: (s) => ({ pending: { vertexId: pickCity(s) } }),
    hold: 500,
  },
  {
    say: '都市になると、この土地から資源が2枚ずつ入るようになります。',
    tap: () => ({ btn: 'confirm' }),
    action: (s, ui) => ({ type: 'BUILD_CITY', player: P, vertexId: ui.pending?.vertexId }),
    hold: 700,
  },
  {
    say: (s) => `📦 コマは1人ぶんしかありません(道15本・開拓地5軒・都市4つ)。ボタンの右上の数字が残りで、いまは 道${
      piecesLeft(s, P, 'road')}・開拓地${piecesLeft(s, P, 'settlement')}・都市${
      piecesLeft(s, P, 'city')} ── 資源があってもコマが尽きたら建てられません。`,
    tap: () => ({ btn: 'mode:settlement' }),
    hold: 2000,
  },
  {
    say: '開拓地を都市に昇格させると、開拓地のコマが1つ手元に戻ります。どこを都市にするかは、コマのやりくりでもあります。',
    hold: 1600,
  },
  {
    cut: { id: 'trade-bank', title: '銀行と交易する', lead: '4:1、港があれば 3:1 や 2:1' },
    say: '⚖️ 資源が偏ったら交易。「交易」から銀行と交換できます。',
    prep: (s) => {
      const { give, rate } = bankTradePlan(s);
      ensure(s, P, { [give]: rate });
    },
    tap: () => ({ btn: 'trade-open' }),
    ui: () => ({ dialog: { type: 'trade', tab: 'bank', give: null, receive: null, pgive: {}, precv: {} } }),
    hold: 900,
  },
  {
    say: (s) => `渡すものを選びます。基本は4:1、港を持っていると3:1や2:1になります(いまは${bankTradePlan(s).rate}:1)。`,
    tap: (s) => ({ sel: `[data-act="trade-give:${bankTradePlan(s).give}"]` }),
    ui: (s, ui) => ({ dialog: { ...ui.dialog, give: bankTradePlan(s).give } }),
    hold: 1000,
  },
  {
    say: 'もらうものを選んで「交易する」。',
    tap: (s) => ({ sel: `[data-act="trade-receive:${bankTradePlan(s).receive}"]` }),
    ui: (s, ui) => ({ dialog: { ...ui.dialog, receive: bankTradePlan(s).receive } }),
    hold: 500,
  },
  {
    say: '銀行との交換はこれで完了です。',
    tap: () => ({ sel: '[data-act="trade-confirm"]' }),
    action: (s, ui) => ({
      type: 'TRADE_BANK', player: P, give: ui.dialog?.give, receive: ui.dialog?.receive,
    }),
    hold: 900,
  },
  {
    cut: { id: 'trade-player', title: '相手と交易する', lead: '枚数を組み立てて全員に提案' },
    say: '🤝 相手と直接やりとりもできます。もう一度「交易」を開いて、「プレイヤー」タブへ。',
    prep: (s) => {
      ensure(s, P, { [PT.give]: PT.giveN });
      // 全員に持たせて、2人とも応じる(=相手を選ぶ)状況を作る
      for (const o of s.players) {
        if (o.id !== P) ensure(s, o.id, { [PT.receive]: PT.receiveN });
      }
    },
    tap: () => ({ btn: 'trade-open' }),
    ui: () => ({ dialog: { type: 'trade', tab: 'bank', give: null, receive: null, pgive: {}, precv: {} } }),
    hold: 900,
  },
  {
    say: 'タブを切り替えると、渡すもの・もらうものを枚数で組み立てられます。',
    tap: () => ({ sel: '[data-act="trade-tab:players"]' }),
    ui: (s, ui) => ({ dialog: { ...ui.dialog, tab: 'players' } }),
    hold: 1200,
  },
  {
    say: `渡すものをタップして追加。ここでは🪵木材を${PT.giveN}枚。`,
    tap: () => ({ sel: `[data-act="ptg-add:${PT.give}"]` }),
    ui: (s, ui) => ({ dialog: { ...ui.dialog, pgive: { [PT.give]: PT.giveN } } }),
    hold: 1100,
  },
  {
    say: `もらうものも同じように。🪨鉱石を${PT.receiveN}枚もらう提案にします。`,
    tap: () => ({ sel: `[data-act="ptr-add:${PT.receive}"]` }),
    ui: (s, ui) => ({ dialog: { ...ui.dialog, precv: { [PT.receive]: PT.receiveN } } }),
    hold: 1100,
  },
  {
    say: '「🤝 全員に提案」で、同じ内容を一度に全員へ持ちかけます(1手番3回まで)。',
    tap: () => ({ sel: '[data-act="pt-offer"]' }),
    action: () => ({
      type: 'OFFER_TRADE', player: P,
      give: { [PT.give]: PT.giveN }, receive: { [PT.receive]: PT.receiveN },
    }),
    hold: 1800,
  },
  {
    say: '相手それぞれの手元に「🤝 交換する / 断る」が出ます。返事が揃うまで待ちます。',
    action: (s) => ({ type: 'RESPOND_TRADE', player: s.awaiting.players[0], accept: true }),
    hold: 1400,
  },
  {
    say: '2人とも応じてくれました。',
    action: (s) => ({ type: 'RESPOND_TRADE', player: s.awaiting.players[0], accept: true }),
    hold: 1200,
  },
  {
    say: '複数が応じたときは、どの相手と成立させるかを自分で選べます。',
    tap: (s) => ({ sel: `[data-act="trade-pick:${s.awaiting.context.accepted[0]}"]` }),
    action: (s) => ({
      type: 'CHOOSE_TRADE', player: P, partner: s.awaiting.context.accepted[0],
    }),
    hold: 1800,
  },
  {
    cut: { id: 'dev', title: '発展カードを買って使う', lead: '買った次の手番から使える' },
    say: '📜 発展カードは 🐑1 🌾1 🪨1。騎士・街道建設・収穫・独占・勝利点が入っています。',
    prep: (s) => {
      ensure(s, P, { sheep: 1, wheat: 1, ore: 1 });
      stackDevDeck(s, 'roadBuilding'); // 次の章で使うカードを引かせる
    },
    tap: () => ({ btn: 'buy-dev' }),
    action: () => ({ type: 'BUY_DEV_CARD', player: P }),
    hold: 1500,
  },
  {
    say: '引いたのは「街道建設」。カードは買ったターンには使えないので、次の手番までお預けです。',
    hold: 1200,
  },
  {
    say: 'やることが済んだら「⏭ 終了」で次の人へ。',
    tap: () => ({ btn: 'end-turn' }),
    action: () => ({ type: 'END_TURN', player: P }),
    hold: 700,
  },
  {
    // **ダイスを振ってからでないとカードは使えない。** 手番送りだけして
    // カードを出そうとして「先にダイスを振ってください」で弾かれた
    say: '── 次のあなたの手番。まずダイスを振ります ──',
    prep: (s) => { cutToTurn(s); forceRoll(s, bestRollFor(s, P)); },
    tap: () => ({ btn: 'roll' }),
    action: () => ({ type: 'ROLL_DICE', player: P }),
    hold: 800,
  },
  {
    say: '📜 発展カードは手札のカードをタップ。効果と「✨ 使う」が出ます。',
    tap: () => ({ sel: '[data-act="dev-info:0"]' }),
    ui: () => ({ dialog: { type: 'dev-info', index: 0 } }),
    hold: 1600,
  },
  {
    say: '「街道建設」は道を2本ぶん無料で建てられるカード。使うと、建てられる辺が光ります。',
    tap: () => ({ sel: '[data-act="dev-use:0"]' }),
    ui: () => ({ dialog: null, mode: 'play-road-building', pendingEdges: [], pending: null }),
    hold: 1400,
  },
  {
    say: 'どこへ伸ばすかは自分で選べます。まず1本目。',
    tap: (s) => ({ edge: pickRoad(s) }),
    ui: (s) => ({ pendingEdges: [pickRoad(s)] }),
    hold: 900,
  },
  {
    say: '続けて2本目。1本目の先へつなげることもできます。',
    tap: (s, ui) => ({ edge: pickNextRoad(s, ui.pendingEdges[0]) }),
    ui: (s, ui) => ({
      pendingEdges: [...ui.pendingEdges, pickNextRoad(s, ui.pendingEdges[0])],
    }),
    hold: 1000,
  },
  {
    say: '「✓ 確定」でまとめて建設。資源は使いません。',
    tap: () => ({ btn: 'confirm' }),
    action: (s, ui) => ({
      type: 'PLAY_DEV_CARD', player: P, card: 'roadBuilding',
      params: { edges: [...ui.pendingEdges] },
    }),
    hold: 1400,
  },
  {
    cut: { id: 'robber', title: '7が出たときと盗賊', lead: '手札を捨てる・盗賊を動かす' },
    say: '── ほかの人の手番を飛ばして、次のあなたの手番へ ──',
    prep: (s) => {
      cutToTurn(s);
      tidyHandsForSeven(s);
      forceRoll(s, [3, 4]);
    },
    hold: 500,
  },
  {
    say: '🎲 合計が「7」のときだけ特別。誰も資源をもらえず、手札が8枚以上の人は半分を捨てます。',
    tap: () => ({ btn: 'roll' }),
    action: () => ({ type: 'ROLL_DICE', player: P }),
    hold: 1800,
  },
  {
    say: '🥷 そして手番の人が盗賊を動かします。移動先のヘックスをタップ。',
    tap: (s) => ({ hex: pickRobberHex(s) }),
    ui: (s) => {
      const hexId = pickRobberHex(s);
      const targets = stealableTargets(s, hexId, P);
      return targets.length
        ? { pending: null, dialog: { type: 'steal', hexId, targets } }
        : { pending: { hexId } };
    },
    hold: 1200,
  },
  {
    say: '置いたヘックスに接している相手から、資源を1枚いただきます。盗賊のいる土地は資源を生みません。',
    tap: (s, ui) => (ui.dialog?.type === 'steal'
      ? { sel: `[data-act="steal:${ui.dialog.targets[0]}"]` }
      : { btn: 'confirm' }),
    action: (s, ui) => (ui.dialog?.type === 'steal'
      ? {
          type: 'MOVE_ROBBER', player: P,
          hexId: ui.dialog.hexId, targetPlayer: ui.dialog.targets[0],
        }
      : { type: 'MOVE_ROBBER', player: P, hexId: ui.pending?.hexId, targetPlayer: null }),
    hold: 1500,
  },
  {
    cut: { id: 'win', title: '記録と勝ち方', lead: '出目の偏り・最長交易路・10点' },
    say: '📊 ダイスの横の記録ボタンで、2〜12がそれぞれ何回出たかを見られます。',
    prep: (s) => seedDiceLog(s),
    tap: () => ({ btn: 'dicelog-open' }),
    ui: () => ({ dialog: { type: 'dicelog' } }),
    hold: 1400,
  },
  {
    say: '6と8が出やすく、2と12は出にくい ── 実際の偏りを見ながら次の一手を考えられます。',
    tap: () => ({ sel: '[data-act="dialog-cancel"]' }),
    ui: () => ({ dialog: null }),
    hold: 1600,
  },
  {
    say: '🛤 つながった自分の道が5本以上で最長なら「最長交易路 +2点」。騎士カード3枚で「最大騎士力 +2点」。',
    hold: 1000,
  },
  {
    say: '🏆 これを繰り返して先に10点(都市と騎士は13点)取れば勝ち。あとは実際に触ってみてください!',
    hold: 1200,
  },
];

// ---- 第3章: 都市と騎士 ----

const cakBeats = [
  {
    cut: { id: 'cak-dice', title: '3つ目のダイスと商品', lead: 'イベントダイスと、都市が産む商品' },
    say: '「都市と騎士」は、基本ルールに “3つ目のダイス・商品・騎士” が加わった上級ルールです。',
    hold: 800,
  },
  {
    say: '🎲 赤・黄に加えて「イベントダイス」を振ります。初期配置も開拓地1・都市1から始まります。',
    prep: (s) => forceRoll(s, bestRollFor(s, P), 'trade'),
    tap: () => ({ btn: 'roll' }),
    action: () => ({ type: 'ROLL_DICE', player: P }),
    hold: 1800,
  },
  {
    say: '🧵🪙📜 の色の面は「その系統の都市改良が進んでいれば進歩カードがもらえる」合図。⛵船なら蛮族船が前進します。',
    hold: 1000,
  },
  {
    say: '都市は資源に加えて「商品」を産みます(森=📜紙・山=🪙コイン・牧草地=🧵布)。',
    prep: (s) => ensure(s, P, { paper: 3 }),
    hold: 800,
  },
  {
    cut: { id: 'cak-city', title: '都市改良と進歩カード', lead: '商品を注ぎ込んで能力を開ける' },
    say: '🏙 商品の使い道が都市改良です。「改良」を開きます。',
    // **この章だけで見ても成立するように、商品を持たせる。**
    // 前は手前の章で都市が産んだ商品を当てにしていたので、単独で再生すると
    // 「科学Lv1には商品が1枚必要です」で止まった(必ず銀行から出す)
    prep: (s) => ensure(s, P, { paper: 3 }),
    tap: () => ({ btn: 'improve-open' }),
    ui: () => ({ dialog: { type: 'improve' } }),
    hold: 900,
  },
  {
    say: 'Lv n に上げるには商品 n 枚。まず 📜科学 をLv1へ。',
    tap: () => ({ sel: '[data-act="improve-buy:science"]' }),
    action: () => ({ type: 'BUY_IMPROVEMENT', player: P, track: 'science' }),
    hold: 900,
  },
  {
    say: '続けてLv2へ。Lv3で系統ごとの特殊能力(科学なら「水道橋」)、最初にLv4へ届いた人がメトロポリス +2点です。',
    tap: () => ({ sel: '[data-act="improve-buy:science"]' }),
    action: () => ({ type: 'BUY_IMPROVEMENT', player: P, track: 'science' }),
    hold: 1800,
  },
  {
    say: '── 次のあなたの手番へ ──',
    tap: () => ({ sel: '[data-act="dialog-cancel"]' }),
    prep: (s) => {
      cutToTurn(s);
      forceRoll(s, bestRollFor(s, P, { redDie: 1 }), 'science');
    },
    ui: () => ({ dialog: null }),
    hold: 500,
  },
  {
    say: '📜科学の面が出て、赤ダイスの目が「科学Lv+1」以下 ── 進歩カードを1枚もらえます。',
    tap: () => ({ btn: 'roll' }),
    action: () => ({ type: 'ROLL_DICE', player: P }),
    hold: 2000,
  },
  {
    say: '手札に増えた進歩カードをタップすると、効果と「使う」ボタンが出ます。',
    tap: () => ({ sel: '[data-act="play-prog:0"]' }),
    ui: () => ({ dialog: { type: 'prog-info', index: 0 } }),
    hold: 1600,
  },
  {
    say: '進歩カードは獲得したターンには使えません。持てるのは4枚まで。',
    tap: () => ({ sel: '[data-act="dialog-cancel"]' }),
    ui: () => ({ dialog: null }),
    hold: 700,
  },
  {
    cut: { id: 'cak-knight', title: '騎士を置いて働かせる', lead: '置く → 活性化 → 動かす' },
    say: '⚔️ 騎士は 🐑1 🪨1。自分の道につながる空き頂点に置きます。',
    prep: (s) => ensure(s, P, { sheep: 1, ore: 1 }),
    tap: () => ({ btn: 'mode:knight' }),
    ui: () => ({ mode: 'build-knight' }),
    hold: 1000,
  },
  {
    say: '置ける頂点が光ります。選んで確定。',
    tap: (s) => ({ vertex: pickKnightSpot(s) }),
    ui: (s) => ({ pending: { vertexId: pickKnightSpot(s) } }),
    hold: 500,
  },
  {
    say: '置いたばかりの騎士は「不活性」── まだ働きません。',
    prep: (s) => ensure(s, P, { wheat: 1 }),
    tap: () => ({ btn: 'confirm' }),
    action: (s, ui) => ({ type: 'BUILD_KNIGHT', player: P, vertexId: ui.pending?.vertexId }),
    hold: 1400,
  },
  {
    say: '盤上の自分の騎士をタップすると、行動メニューが開きます。',
    tap: (s) => ({ vertex: myKnight(s) }),
    ui: (s) => ({ dialog: { type: 'knight', vertexId: myKnight(s) } }),
    hold: 1200,
  },
  {
    say: '🌾1 で活性化。活性騎士のレベル合計が、そのまま蛮族への防衛力になります。',
    tap: (s) => ({ sel: `[data-act="knight-activate:${myKnight(s)}"]` }),
    action: (s) => ({ type: 'ACTIVATE_KNIGHT', player: P, vertexId: myKnight(s) }),
    hold: 1600,
  },
  {
    say: '活性騎士は「移動」「格下の敵騎士の追い出し」「隣の盗賊を追い払う」もできます。',
    hold: 900,
  },
  {
    cut: { id: 'cak-barbarian', title: '蛮族の襲来', lead: '都市の数 対 活性騎士の合計' },
    say: '⛵ 蛮族船は船の目が出るたびに1マス前進。上のトラックがもう7マス目の手前です。',
    prep: (s) => {
      cutToTurn(s);
      s.barbarians.position = 6;
      forceRoll(s, bestRollFor(s, P), 'ship');
    },
    hold: 1600,
  },
  {
    say: '⚔️ 襲来! 蛮族の強さ = 盤上の都市の数、防衛力 = 全員の活性騎士のレベル合計です。',
    tap: () => ({ btn: 'roll' }),
    action: () => ({ type: 'ROLL_DICE', player: P }),
    hold: 2200,
  },
  {
    say: (s) => {
      const line = [...s.log].reverse().find((l) => l.includes('蛮族襲来'));
      const m = line?.match(/蛮族(\d+) vs 防衛(\d+)/);
      if (m && Number(m[2]) >= Number(m[1])) {
        return '🛡 防衛成功! 最も貢献した人が「島の守護者」+1点。同点なら全員に進歩カードです。';
      }
      return '💥 防衛失敗 ── 貢献が最も少なかった人の都市が開拓地に降格します。騎士を出していたあなたは無事でした。';
    },
    hold: 2400,
  },
  {
    say: '襲来のあとは全員の騎士が不活性に戻ります。守りは毎回立て直しです。',
    hold: 1000,
  },
  {
    cut: { id: 'cak-wall', title: '城壁と、13点への道', lead: '手札上限を上げる・点の取り方' },
    say: '🧱 城壁は 🧱2。7が出たときの手札上限が1枚につき +2(7→9)。ボタンの数字のとおり、1人3枚までです。',
    prep: (s) => ensure(s, P, { brick: 2 }),
    tap: () => ({ btn: 'mode:wall' }),
    ui: () => ({ mode: 'build-wall' }),
    hold: 1400,
  },
  {
    say: '守りたい都市を選んで確定。',
    tap: (s) => ({ vertex: pickWall(s) }),
    ui: (s) => ({ pending: { vertexId: pickWall(s) } }),
    hold: 500,
  },
  {
    say: '城壁は都市が降格すると一緒に失われます。',
    tap: () => ({ btn: 'confirm' }),
    action: (s, ui) => ({ type: 'BUILD_WALL', player: P, vertexId: ui.pending?.vertexId }),
    hold: 700,
  },
  {
    say: '🏆 勝利は13点。都市改良・メトロポリス・守護者と、点の取り方はぐっと増えます。遊んでみてください!',
    hold: 1400,
  },
];


// 古い靴を押しつけられる相手(自分と同点以上)。**いなければ null** ──
// 台本が噛み合わないときは、driver が黙って次のビートへ進む
const shoeTarget = (s) => shoeTargets(s, P, (id) => computePoints(s, id))[0] ?? null;

// ---- 漁師たち ----
//
// 湖と漁場から魚が入り、匹数を払って使う。**魚は手札に数えない**ので
// 7でも盗賊でも失われない ── そこが基本の資源といちばん違うところ。
const fishBeats = [
  {
    say: '🐟「漁師たち」は、基本ルールに湖と漁場が加わります。砂漠が湖になり、海岸に漁場が並びます。',
    // 魚の入る頂点に席を用意する(デモの盤は誰も漁場に接していなかった)
    prep: (s) => { const spot = seatByFish(s); if (spot) forceRoll(s, bestFishRoll(s, P)); },
    hold: 1200,
  },
  {
    say: '🎲 漁場の数字が出ると、接している建物に魚が入ります。開拓地は1枚、都市なら2枚。',
    tap: () => ({ btn: 'roll' }),
    action: () => ({ type: 'ROLL_DICE', player: P }),
    hold: 1800,
  },
  {
    say: (s) => `魚は手札の外に置かれます ── いまの手持ちは${fishCount(s.players[P])}匹。`
      + '7を出しても盗賊にも取られません。',
    hold: 1600,
  },
  {
    cut: { id: 'fish-use', title: '魚の使い道', lead: '匹数を払って、盗賊を戻す・奪う・引く' },
    say: '🐟 貯めた魚は「魚」ボタンから使います。お釣りは出ないので、ちょうど払える使い道を選びます。',
    prep: (s) => ensureFish(s, P, 5),
    tap: () => ({ btn: 'fish-open' }),
    ui: () => ({ dialog: { type: 'fish', pick: null } }),
    hold: 1600,
  },
  {
    say: '2匹で盗賊を湖へ戻す(これだけはダイスの前でも使えます)、3匹で資源を1枚奪う、4匹で好きな資源を1枚。',
    hold: 2200,
  },
  {
    say: '5匹で道を1本ただで、7匹で発展カードを1枚。ここでは4匹で 🌾小麦 をもらいます。',
    tap: () => ({ sel: '[data-act="fish-use:resource"]' }),
    ui: (s, ui) => ({ dialog: { ...ui.dialog, pick: 'resource' } }),
    hold: 1600,
  },
  {
    say: '銀行から1枚。魚は4匹ぶん減ります。',
    tap: () => ({ sel: '[data-act="fish-res:wheat"]' }),
    action: () => ({
      type: 'SPEND_FISH', player: P, use: 'resource', params: { resource: 'wheat' },
    }),
    hold: 1500,
  },
  {
    cut: { id: 'fish-shoe', title: '古い靴', lead: '押しつけ合う、1枚だけの厄介もの' },
    say: '👞 魚の山には「古い靴」が1枚だけ混じっています。引いたらすぐ公開されます。',
    prep: (s) => giveOldShoe(s, P),
    hold: 1600,
  },
  {
    say: '持っている間は、勝つのに必要な点が1点増えます(10点なら11点)。',
    hold: 1600,
  },
  {
    say: '渡せるのは自分と同点以上の相手だけ。手番中に押しつけられます。',
    tap: (s) => ({ sel: `[data-act="pass-shoe:${shoeTarget(s)}"]` }),
    action: (s) => ({ type: 'PASS_SHOE', player: P, target: shoeTarget(s) }),
    hold: 1800,
  },
  {
    say: '🏆 勝利は10点。魚は資源とは別の流れなので、目が悪い日の逃げ道になります。',
    hold: 1400,
  },
];


// ---- 航海者たち ----

// 船を建てる辺。**先へ伸びる海路**を選ぶ(行き止まりに置くと話が続かない)
const pickShip = (state) => pickBest(
  legalShipEdges(state, P),
  (eid) => LAYOUT.edges[eid].hexes.filter((h) => state.board.hexes[h]).length,
);

// 海賊の行き先。**いまいる海は選べない**ので除く。奪える相手がいる海は
// 相手を選ばないと弾かれるので、**誰の船も無い海**を選ぶ(演出を単純に保つ)
const pickPirateHex = (state) => pickBest(
  state.board.hexIds.filter(
    (h) => isSeaHex(state.board, h) && state.board.pirate !== h
      && pirateTargets(state, h, P).length === 0,
  ),
  () => 1,
);

// 動かせる船(航路の先端。建てたその手番の船と、海賊のいる海の船は動かせない)
const pickMovableShip = (state) => movableShips(state, P)[0] ?? null;

// その船の移動先。**いったん退けてから探す** ── 置いたままだと
// 「その辺には船があります」で自分自身に塞がれ、先の辺も繋がらなく見える
function pickShipTo(state, from) {
  const keep = state.ships[from];
  delete state.ships[from];
  const to = pickBest(
    legalShipEdges(state, P).filter((eid) => eid !== from),
    (eid) => LAYOUT.edges[eid].hexes.filter((h) => state.board.hexes[h]).length,
  );
  state.ships[from] = keep;
  return to;
}

const seaBeats = [
  {
    say: '⛵「航海者たち」は盤が広がり、本島のまわりに小島が5つ浮かびます。小島へは必ず船で渡ります。',
    // CPU の初期配置は内陸を好むので、そのままだと出港できる辺が0だった
    prep: (s) => seatByCoast(s),
    hold: 1600,
  },
  {
    say: '⛵ 船は 🪵1 🐑1。海に面した辺に置きます(1人15隻まで)。「船」ボタンから。',
    prep: (s) => ensure(s, P, { wood: 1, sheep: 1 }),
    tap: () => ({ btn: 'mode:ship' }),
    ui: () => ({ mode: 'build-road', roadPiece: 'ship' }),
    hold: 1400,
  },
  {
    say: '置ける辺が光ります。海岸の辺は道でも船でもよいのですが、同じ辺に両方は置けません。',
    tap: (s) => ({ edge: pickShip(s) }),
    ui: (s) => ({ pending: { edgeId: pickShip(s) } }),
    hold: 1400,
  },
  {
    say: '「✓ 確定」で進水。道と船はつながりますが、乗り継げるのは自分の開拓地・都市の上でだけです。',
    tap: () => ({ btn: 'confirm' }),
    action: (s, ui) => ({ type: 'BUILD_SHIP', player: P, edgeId: ui.pending?.edgeId }),
    hold: 1800,
  },
  {
    cut: { id: 'sea-move', title: '船を動かす', lead: '航路の先端を、1手番に1隻' },
    say: '── 次のあなたの手番。まずダイスを振ります ──',
    // **建てたその手番の船は動かせない。** 手番を送ってから動かす。
    // この章だけで見たときのために、船が無ければ1隻置いておく
    prep: (s) => {
      seatByCoast(s);
      if (!Object.values(s.ships ?? {}).some((x) => x.player === P)) giveShip(s);
      cutToTurn(s);
      forceRoll(s, bestRollFor(s, P));
    },
    tap: () => ({ btn: 'roll' }),
    action: () => ({ type: 'ROLL_DICE', player: P }),
    hold: 800,
  },
  {
    say: '⛵ 船は動かせます ── 動かせるのは開いた航路の先端にある船で、1手番に1隻だけ。',
    hold: 1800,
  },
  {
    say: '行き先を選ぶと、そこまで航路が伸びます。建てたその手番の船と、海賊がいる海の船は動かせません。',
    tap: (s) => ({ edge: pickMovableShip(s) }),
    action: (s) => {
      const from = pickMovableShip(s);
      const to = from ? pickShipTo(s, from) : null;
      return from && to ? { type: 'MOVE_SHIP', player: P, from, to } : null;
    },
    hold: 2000,
  },
  {
    say: '🏝 本島以外の島に初めて開拓地を建てると +2点。島ごとに1回なので、渡る価値があります。',
    hold: 1800,
  },
  {
    cut: { id: 'sea-pirate', title: '海賊と金鉱', lead: '7で盗賊か海賊・好きな資源を産む土地' },
    say: '🏴 海には海賊がいます。7を出したとき、陸の盗賊と海の海賊のどちらか一方を動かします。',
    // **字幕だけの章にしない。** 実際に7を振って海賊を動かすところまで見せる
    // (テストが「指も手も出ない章」を弾いてくれた)
    prep: (s) => { cutToTurn(s); tidyHandsForSeven(s); forceRoll(s, [3, 4]); },
    tap: () => ({ btn: 'roll' }),
    action: () => ({ type: 'ROLL_DICE', player: P }),
    hold: 2000,
  },
  {
    say: '海の目を選べば海賊が動きます。海賊のいる海には船を置けません。',
    tap: (s) => ({ hex: pickPirateHex(s) }),
    ui: (s) => ({ pending: { hexId: pickPirateHex(s) } }),
    hold: 1600,
  },
  {
    say: 'その海に船を持つ相手からは、資源を1枚いただけます。',
    tap: () => ({ btn: 'confirm' }),
    action: (s, ui) => (ui.pending?.hexId
      ? { type: 'MOVE_ROBBER', player: P, hexId: ui.pending.hexId, targetPlayer: null }
      : null),
    hold: 1800,
  },
  {
    say: '💰 金鉱は好きな資源を産む土地(開拓地1枚・都市2枚)。小島に厚く配ってあります。',
    hold: 1800,
  },
  {
    say: '🏆 勝利は13点。渡って点を伸ばすか、本島を固めるか ── 航路の引き方がそのまま戦略になります。',
    hold: 1600,
  },
];


// ---- 島(散策・釣り・店)----
//
// **ここだけ盤ではない。** 3D の島を歩くので、state を差し替えて見せる
// ことができない ── 操作は `island:` にデータで書き、当てるのは main.js。
// 関数で書くと node から確かめられず、`data-act` の綴り間違いが
// 「押しても何も起きない動画」になって気づけない。
const islandBeats = [
  {
    say: '🏝 対戦とは別に、島を歩いて過ごせます。タイトルの「島を歩く」から入ります。',
    island: { wait: 1200 },
    hold: 1400,
  },
  {
    say: '左半分をなぞると歩き、右半分で見まわします。島は入るたびに作り直されます。',
    island: { wait: 1400 },
    hold: 1600,
  },
  {
    say: '❓ 迷ったら画面の上の「あそびかた」。島でできることが一枚にまとまっています。',
    tap: () => ({ btn: 'walk-guide' }),
    island: { click: 'walk-guide' },
    hold: 2000,
  },
  {
    say: '閉じて、島の見どころを回ってみます。',
    tap: () => ({ sel: '[data-act="walk-guide-close"]' }),
    island: { click: 'walk-guide-close' },
    hold: 900,
  },
  {
    cut: { id: 'island-quests', title: '掲示板の依頼', lead: '日替わりのお題と、魚の相場' },
    say: '📋 広場の掲示板には、その日の依頼が3つ貼ってあります。0時に張り替わります。',
    island: { walk: 'notice' },
    hold: 1800,
  },
  {
    say: '「◯◯を釣る」「◯cm を超える」といったお題で、達成すると銀貨がもらえます。',
    island: { wait: 1600 },
    hold: 1800,
  },
  {
    say: '🐟 同じ板に、その日の魚の買い取り値も出ます ── 高値の魚を狙う日を作れます。',
    island: { wait: 1400 },
    hold: 2000,
  },
  {
    cut: { id: 'island-fish', title: '島で釣りをする', lead: '桟橋で投げて、合わせて、寄せる' },
    say: '🎣 桟橋の先が釣り場です。近づくと「投げる」のボタンが出ます。',
    island: { walk: 'fish' },
    hold: 1600,
  },
  {
    say: 'ウキが沈んだら合わせて、糸が切れないように張りを見ながら寄せます。',
    island: { fish: 'auto' },
    hold: 1200,
  },
  {
    say: '釣れた魚は図鑑に残り、大きさに応じて銀貨がもらえます。その日の相場で買い取り値が変わります。',
    hold: 2200,
  },
  {
    say: '📖 図鑑はいつでも開けます。釣れる場所と大きさの目安が載っています。',
    tap: () => ({ btn: 'walk-book' }),
    island: { click: 'walk-book' },
    hold: 2000,
  },
  {
    say: '閉じます。',
    tap: () => ({ sel: '[data-act="walk-book-close"]' }),
    island: { click: 'walk-book-close' },
    hold: 800,
  },
  {
    cut: { id: 'island-shop', title: '店で買う・持ち物', lead: '銀貨の使い道と、買ったものの使い方' },
    say: '🛖 島には店が建っています。歩いて屋台まで行き、店番に話しかけて買います。',
    island: { walk: 'shop' },
    hold: 1600,
  },
  {
    say: '棚は「道具・かぶりもの・島の飾り・盤まわり」の4つ。遊ぶとたまる銀貨で買います。',
    tap: () => ({ btn: 'walk-shop' }),
    island: { click: 'walk-shop' },
    hold: 2200,
  },
  {
    say: '閉じて、買ったものを使うほうへ。',
    tap: () => ({ sel: '[data-act="walk-shop-close"]' }),
    island: { click: 'walk-shop-close' },
    hold: 900,
  },
  {
    say: '🎒 持ち物は島のどこでも開けます ── 見取り図も砂時計も、店まで戻らずに使えます。',
    tap: () => ({ btn: 'walk-bag' }),
    island: { click: 'walk-bag' },
    hold: 2200,
  },
  {
    say: '「盤まわり」の棚で選んだ見た目は、対戦の盤にそのまま出ます。',
    island: { wait: 1200 },
    hold: 1600,
  },
  {
    cut: { id: 'island-decor', title: '島に飾りを置く', lead: '買った飾りを、好きな場所へ' },
    say: '🪵「島の飾り」は何個でも買えて、島の好きなところに置けます。持ち物の「置く」から。',
    island: { click: 'bag-shelf:decor' },
    hold: 2200,
  },
  {
    say: '半透明の見本が出るので、歩いて場所を決めます。前後だけでなく横にも寄せられます。',
    island: { wait: 1800 },
    hold: 2000,
  },
  {
    say: '置いた飾りは島に残ります ── 灯籠を立てれば夜が明るくなります。',
    tap: () => ({ sel: '[data-act="walk-bag-close"]' }),
    island: { click: 'walk-bag-close' },
    hold: 1800,
  },
];

// ---- 集まり(島ごとに1つ)----
//
// **島によって開かれている集まりが違う。** 基本=大富豪、漁師=つり大会、
// ドラゴン=逃げろ、航海者=丸太乗り、都市と騎士=蛮族を射る。
// だから短編も島ごとに1本ずつ ── デモの章に mode を持たせて島を選ぶ。
//
// **遊んでいるところを映す。** はじめは受付まで歩いて字幕を読むだけに
// していたが、それでは動画にする意味がない ── エントリーして実際に始め、
// その場で遊ばせる(`{ meet } { stick } { bow } { cards } { fish }`)。
function meetIntro(id, name, lead, intro) {
  return [
    {
      cut: { id: `meet-${id}`, title: name, lead },
      say: intro,
      island: { walk: 'desk' },
      hold: 1600,
    },
    {
      say: '受付に近づくとパネルが開きます。エントリーして、足りない人数は CPU で埋めます。',
      island: { meet: { cpu: 3 } },
      hold: 1800,
    },
  ];
}

const meetOutro = {
  say: '順位は記録に残り、称号がもらえます。オンラインの散策部屋なら、居合わせた人と一緒に遊べます。',
  island: { wait: 1000 },
  hold: 2000,
};

const daifugoBeats = [
  ...meetIntro('daifugo', '🃏 大富豪', '円卓で札を出し合う',
    '🃏 基本の島の中央には円卓があります。囲んで札を出し合う大富豪です。'),
  {
    say: '席に着くと手札が配られます。弱い順に 3 4 5 … K A 2、いちばん強いのがジョーカー。',
    island: { wait: 1600 },
    hold: 2200,
  },
  {
    say: '出せる札だけが浮きます。選んで「出す」── 同じ枚数を重ねて出すこともできます。',
    island: { cards: 3 },
    hold: 1200,
  },
  {
    say: '出せないときはパス。手札を先に無くした人が上位で、順位で大富豪から大貧民までの称号がつきます。',
    island: { cards: 2 },
    hold: 1600,
  },
  meetOutro,
];

const fishMeetBeats = [
  ...meetIntro('fishing', '🎣 つり大会', '制限時間で、釣った合計の長さを競う',
    '🎣 漁師の島では、つり大会が開かれています。受付は広場の中央です。'),
  {
    say: '始まったら港へ。制限時間のあいだに釣った魚の、合計の長さを競います ── 何匹釣ってもかまいません。',
    island: { walk: 'fish' },
    hold: 2000,
  },
  {
    say: 'いつもの釣りと同じ操作です。投げて、ウキが沈んだら合わせて、張りを見ながら寄せます。',
    island: { fish: 'auto' },
    hold: 1200,
  },
  {
    say: '小さい魚でも合計に足されるので、大物を粘るか数を釣るかは自由です。続けてもう1匹。',
    island: { fish: 'auto' },
    hold: 1400,
  },
  meetOutro,
];

const dragonHuntBeats = [
  ...meetIntro('dragonhunt', '🐉 ドラゴンから逃げろ', '捕まらずに、どれだけ生き残れるか',
    '🐉 ドラゴンの島では、竜から逃げる集まりが開かれています。'),
  {
    say: '始まると竜が追ってきます。順位は生き残った時間 ── 最後まで残れば1位です。',
    island: { stick: { x: 0, y: -1, ms: 2600 } },
    hold: 1200,
  },
  {
    say: '竜は歩きより少し遅い代わりに、曲がるのが下手です。',
    island: { stick: { x: 0.9, y: -0.6, ms: 2400 } },
    hold: 1200,
  },
  {
    say: '木の陰に回りこんで急に向きを変えると振り切れます ── 竜は飛んでいるので、木は素通りします。',
    island: { stick: { x: -0.9, y: -0.6, ms: 2400 } },
    hold: 1400,
  },
  meetOutro,
];

const logrollBeats = [
  ...meetIntro('logroll', '🪵 丸太乗り', '回る丸太の上で、最後まで残る',
    '🪵 航海者の島では、沖に浮かぶ丸太に乗る集まりが開かれています。'),
  {
    say: '丸太が回るので、横へ転がされます。逆らって歩き続けないと海に落ちます ── 棒立ちは数秒でおしまい。',
    island: { stick: { x: -0.8, y: 0, ms: 2600 } },
    hold: 1200,
  },
  {
    say: 'てっぺんから外れるほど滑り落ちるので、転がされたら何よりまずてっぺんへ戻ります。',
    island: { stick: { x: 0.8, y: 0, ms: 2400 } },
    hold: 1200,
  },
  {
    say: '丸太には切れ目があります。回って上がってくると足場が消えるので、長さ方向へ歩いて逃げます。',
    island: { stick: { x: 0, y: -1, ms: 2200 } },
    hold: 1400,
  },
  {
    say: '回る速さはだんだん上がって、最後は歩きより速くなります ── 粘った人が勝ちです。',
    island: { wait: 1200 },
    hold: 1800,
  },
  meetOutro,
];

const raidMeetBeats = [
  ...meetIntro('raid', '🏹 蛮族を射る', '寄せる船を、櫓から射落とす',
    '🏹 都市と騎士の島では、浜の櫓から蛮族船を射る集まりが開かれています。'),
  {
    say: '櫓に登ると弓を構えます。押している間、弓を引き絞り ── 離すと放ちます。',
    island: { bow: 2 },
    hold: 1200,
  },
  {
    say: '引き絞るほど遠くへ飛びます。船を沈めて3点、蛮族ひとりで1点。',
    island: { bow: 3 },
    hold: 1400,
  },
  {
    say: '船を沈めれば、積んでいる蛮族ごと止められます。取り逃がすと浜に降りて櫓へ歩いてきます。',
    island: { bow: 2 },
    hold: 1600,
  },
  {
    say: '3回着かれたら終わり。撃退した点を競います。',
    island: { wait: 1000 },
    hold: 1600,
  },
  meetOutro,
];


// 見張り塔を建てられる自分の建物(良い土地に接しているところを選ぶ)
const pickTower = (state) => pickBest(
  Object.keys(state.buildings).filter(
    (vid) => validateAction(state, { type: 'BUILD_TOWER', player: P, vertexId: vid }) === null,
  ),
  (vid) => vertexValue(state, vid),
);

// ---- ドラゴンの島 ----
//
// 盗賊がドラゴンに置き換わる。**ゾロ目で暴走する**のがこのモードの芯で、
// 見張り塔はそれに備える建物。ゾロ目は偶数なので、7(捨て札)とは同時に起きない。
const dragonBeats = [
  {
    say: '🐉「ドラゴンの島」は、盗賊のかわりにドラゴンがいます。巣はいちばん出目の良い山です。',
    prep: (s) => forceRoll(s, bestRollFor(s, P)),
    hold: 1800,
  },
  {
    say: '🎲 いる土地の産出を止めるのは盗賊と同じ。7が出たら、行き先を選んで動かします。',
    tap: () => ({ btn: 'roll' }),
    action: () => ({ type: 'ROLL_DICE', player: P }),
    hold: 2000,
  },
  {
    say: 'これがドラゴンのいる土地。ここは資源を産みません ── 巣にしているあいだは、ずっと止まったままです。',
    tap: (s) => ({ hex: s.board.robber }),
    hold: 2200,
  },
  {
    cut: { id: 'dragon-rampage', title: 'ドラゴンの暴走', lead: 'ゾロ目で飛び立ち、8手番のあいだ炎上' },
    say: '🐉 ここからが本番。ゾロ目が出ると暴走します(6回に1回)。',
    // ゾロ目は偶数なので7にならない ── 捨て札と暴走は同時に起きない
    prep: (s) => { cutToTurn(s); tidyHandsForSeven(s); forceRoll(s, [4, 4]); },
    tap: () => ({ btn: 'roll' }),
    action: () => ({ type: 'ROLL_DICE', player: P }),
    hold: 2400,
  },
  {
    say: '資源を配ったあと、ドラゴンがいちばん美味しい土地(出目 × 建物、都市は2倍)へ飛びます。',
    hold: 2200,
  },
  {
    say: '🔥 そこは8手番のあいだ炎上 ── 産出が止まり、隣り合う人は手札から1枚失います。',
    hold: 2200,
  },
  {
    cut: { id: 'dragon-tower', title: '見張り塔と財宝', lead: '襲撃を撃退して、点に変える' },
    say: '🗼 備えが見張り塔。🪵1 🧱1 🪨1 で、自分の開拓地・都市の上に建てます(1人2基まで)。',
    prep: (s) => ensure(s, P, { wood: 1, brick: 1, ore: 1 }),
    tap: () => ({ btn: 'mode:tower' }),
    ui: () => ({ mode: 'build-tower' }),
    hold: 2000,
  },
  {
    say: '建てられる自分の建物が光ります。守りたい土地の隣を選びます。',
    tap: (s) => ({ vertex: pickTower(s) }),
    ui: (s) => ({ pending: { vertexId: pickTower(s) } }),
    hold: 1400,
  },
  {
    say: '「✓ 確定」で完成。',
    tap: () => ({ btn: 'confirm' }),
    action: (s, ui) => ({ type: 'BUILD_TOWER', player: P, vertexId: ui.pending?.vertexId }),
    hold: 1400,
  },
  {
    say: '🏆 塔が炎上した土地の隣にあれば、略奪を防いだうえ財宝がもらえます ── 1個で +1点と資源1枚。',
    hold: 2400,
  },
  {
    say: '財宝は最後まで失われません。勝利は12点 ── 暴走をどう受けるかが、そのまま点差になります。',
    hold: 1800,
  },
];

// ---- 節と章 ----
//
// **1本を短くする。** 前は3本で 61 / 182 / 114 秒あり、「基本の手番」の
// 1本に12の話題(ダイス・道・開拓地・都市・コマ・銀行交易・相手との交易・
// 発展カード・7と盗賊・街道建設・出目記録・最長交易路)が詰まっていた
// ── 交易だけ見たい人が、3分待たないと交易にたどり着けない。
//
// **切れ目はビートに印(cut)を付ける。番号で切らない。** 番号で切ると、
// ビートを1つ足しただけで後ろの章が全部ずれる。印なら、足したビートは
// 前の印の章にそのまま収まる。
//
// 章は節にまとまっていて、節を続けて再生すれば通しでも見られる
// ── **通し用の台本を別に持たない**(2本持つと必ず片方が古くなる)。
function cutInto(section, mode, beats, opts = {}) {
  const out = [];
  for (const beat of beats) {
    if (beat.cut || !out.length) {
      const c = beat.cut ?? opts.first;
      // **2本目からは手番の途中で始まる。** 先頭の章だけが手番の頭
      // (ダイスを振るところ)から始まり、あとは振ってある状態にする
      // ── でないと建設も交易も「先にダイスを振ってください」で弾かれる
      out.push({
        ...c, section, mode, midTurn: out.length > 0, ...opts.chapter, beats: [],
      });
    }
    out[out.length - 1].beats.push(beat);
  }
  return out;
}

export const DEMO_SECTIONS = [
  {
    id: 'base',
    icon: '🎲',
    title: 'はじめて',
    lead: '基本のルールを、話題ごとに短く',
  },
  {
    id: 'cak',
    icon: '⚔️',
    title: '都市と騎士',
    lead: '商品・都市改良・騎士・蛮族の襲来',
  },
  {
    id: 'dragon',
    icon: '🐉',
    title: 'ドラゴンの島',
    lead: '暴走と炎上・見張り塔・財宝',
  },
  {
    id: 'fish',
    icon: '🐟',
    title: '漁師たち',
    lead: '湖と漁場・魚の使い道・古い靴',
  },
  {
    id: 'sea',
    icon: '⛵',
    title: '航海者たち',
    lead: '船・航路・新しい島・海賊',
  },
  {
    id: 'island',
    icon: '🏝',
    title: '島を歩く',
    lead: '散策・依頼・釣り・店と持ち物・飾り',
  },
  {
    id: 'meets',
    icon: '🎪',
    title: '島の集まり',
    lead: '島ごとに開かれている、5つの遊び',
  },
];

export const DEMO_CHAPTERS = [
  // 初期配置そのものを見せる章なので、盤面は setup の1手目から始める
  ...cutInto('base', 'base', setupBeats, {
    first: { id: 'setup', title: 'はじめの配置', lead: '開拓地と道を置いてゲームが始まる' },
    chapter: { fromSetup: true },
  }),
  ...cutInto('base', 'base', basicBeats),
  ...cutInto('cak', 'cak', cakBeats),
  ...cutInto('dragon', 'dragon', dragonBeats, {
    first: { id: 'dragon-nest', title: 'ドラゴンの巣', lead: '盗賊のかわりに、島にドラゴンがいる' },
  }),
  ...cutInto('fish', 'fish', fishBeats, {
    first: { id: 'fish-catch', title: '湖と漁場で魚をとる', lead: '砂漠が湖に、海岸に漁場が並ぶ' },
  }),
  // **航海者たちは1本目から手番の途中。** 冒頭にダイスを振るビートが無く、
  // 船も交易も「先にダイスを振ってください」で弾かれる
  ...cutInto('sea', 'sea', seaBeats, {
    first: { id: 'sea-ship', title: '船を建てる', lead: '🪵1🐑1・海に面した辺へ' },
    chapter: { midTurn: true },
  }),
  // 島の章は盤を作らない(実物の島に入る)
  ...cutInto('island', 'base', islandBeats, {
    first: { id: 'island-walk', title: '島を歩く', lead: '入りかたと、見まわしかた' },
    chapter: { island: true, midTurn: false },
  }),
  // **集まりは島ごとに1つ。** 章の mode がそのまま入る島になる
  ...cutInto('meets', 'base', daifugoBeats, { chapter: { island: true } }),
  ...cutInto('meets', 'fish', fishMeetBeats, { chapter: { island: true } }),
  ...cutInto('meets', 'dragon', dragonHuntBeats, { chapter: { island: true } }),
  ...cutInto('meets', 'sea', logrollBeats, { chapter: { island: true } }),
  ...cutInto('meets', 'cak', raidMeetBeats, { chapter: { island: true } }),
];

export const CHAPTER_BY_ID = Object.fromEntries(DEMO_CHAPTERS.map((c) => [c.id, c]));

export function findChapter(id) {
  return CHAPTER_BY_ID[id] ?? DEMO_CHAPTERS[0];
}

// 節の中の章(一覧に並べる順)
export function chaptersOf(sectionId) {
  return DEMO_CHAPTERS.filter((c) => c.section === sectionId);
}

// 次の章。**節をまたがない** ── 「騎士」を見終えて基本の話に戻されると、
// 見ている人は自分がどこにいるか分からなくなる
export function nextChapter(id) {
  const now = CHAPTER_BY_ID[id];
  if (!now) return null;
  const list = chaptersOf(now.section);
  return list[list.indexOf(now) + 1] ?? null;
}
