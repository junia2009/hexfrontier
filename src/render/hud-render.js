// HUD 描画(設計書 §8.2)
// 手札・ボタン・ダイアログは DOM で作る。クリックは data-act 属性で main.js に委譲。

import { RESOURCES, RES_JP, DEV_JP, modeOptions } from '../state.js';
import { COSTS, WALL_COST, canAfford, piecesLeft, totalCards, wallsLeft } from '../rules/build.js';
import { computePoints, pointsToWin } from '../rules/victory.js';
import { tradeRate } from '../rules/trade.js';
import { diceDeckLeft } from '../rules/dice.js';
import { KNIGHT_COSTS } from '../rules/cak/knights.js';
import { TOWER_COST } from '../rules/dragon.js';
import { FISH_USES, fishCount, hasOldShoe, shoeTargets } from '../rules/fish.js';
import { SHIP_COST, SHIP_LIMIT, movableShips } from '../rules/sea.js';
import { roadBuildingCount, roadBuildingSpots } from '../rules/road-building.js';
import { achievementById } from '../achievements.js';
import { legalSetupEdges } from '../ai/legal-moves.js';
import { diplomatMovable, weddingGiftSize } from '../rules/cak/progress-cards.js';
import { BARBARIAN_TRACK_LENGTH, knightContribution, barbarianStrength } from '../rules/cak/barbarians.js';
import {
  TRACKS, TRACK_JP, TRACK_COMMODITY, MAX_IMPROVEMENT,
  improvementCost, canBuyImprovement,
} from '../rules/cak/improvements.js';
import { COMMODITIES, COM_JP, PROGRESS_CARDS } from '../rules/cak/progress-cards.js';
import { validateAction, MAX_OFFERS_PER_TURN } from '../actions.js';
import { rulesHtml } from './rules-content.js';
import { PLAYER_COLORS } from './board-render.js';
import { avatarSvg } from './avatars.js';
import {
  COM_ICON, DEV_DESC, DEV_ICON, DICE_TOTALS, HUMAN, RES_ICON, TRACK_ICON,
  devPlayableWhy, diceCountOf, playerTitle, progressPlayable, rollTotal,
  setHumanSeat, setPlayerTitle,
} from './hud-common.js';
import { DIALOGS, dialogHtml } from './dialogs.js';

// 外に出していた口は、移したあとも同じ名前で引けるようにしておく
// (main.js と test が hud-render.js から読んでいる)
export {
  COM_ICON, DEV_ICON, DIALOGS, RES_ICON, devPlayableWhy, dialogHtml,
  progressPlayable, setHumanSeat, setPlayerTitle,
};


// 自分の席番号。ローカル戦は常に 0、オンライン対戦ではサーバーが割り当てた席になる。

const EV_ICON = { ship: '⛵', trade: '🧵', politics: '🪙', science: '📜' };
const PIECE_JP = { road: '道', settlement: '開拓地', city: '都市' };
const PIECE_ICON = { road: '🛤️', settlement: '🏠', city: '🏰' };

function el(id) {
  return document.getElementById(id);
}

function renderPlayers(state, ui) {
  const cak = state.mode === 'cak';
  el('players').innerHTML = state.players
    .map((p) => {
      // 古い靴を持っている人だけ必要点数が1点重い(公開情報)
      const goal = pointsToWin(state, p.id);
      const expanded = ui.expandedPlayer === p.id;
      const pts = computePoints(state, p.id, { includeHidden: p.id === HUMAN });
      const active =
        state.awaiting ? state.awaiting.players.includes(p.id) : state.currentPlayer === p.id;
      const metro = cak
        ? Object.values(state.metropolis).filter(
            (v) => v != null && state.buildings[v]?.player === p.id,
          ).length
        : 0;
      const badges = [
        state.longestRoad.player === p.id ? '<span class="badge">🛤 最長交易路</span>' : '',
        !cak && state.largestArmy.player === p.id ? '<span class="badge">⚔ 最大騎士力</span>' : '',
        metro > 0 ? `<span class="badge">🏙 メトロポリス×${metro}</span>` : '',
        cak && p.defenderPoints > 0 ? `<span class="badge">🛡×${p.defenderPoints}</span>` : '',
        p.treasures > 0 ? `<span class="badge">💎×${p.treasures}</span>` : '',
        // 魚トークンは場に公開して置くもの。全員ぶん見えてよい
        fishCount(p) > 0 ? `<span class="badge">🐟×${fishCount(p)}</span>` : '',
        hasOldShoe(p) ? '<span class="badge">👞 古い靴</span>' : '',
        // 航海者たち: 本島以外に入植した島の数(1つ+2点)
        (p.islands ?? []).filter((i) => i !== 0).length > 0
          ? `<span class="badge">🏝×${(p.islands ?? []).filter((i) => i !== 0).length}</span>`
          : '',
      ].join('');
      // 残りコマは全員ぶん公開情報(盤上を数えれば分かる)。
      // 「相手はもう開拓地を建てられない」が読めると駆け引きになる。
      const stock = `<span class="stockrow" title="手元に残っているコマ(道/開拓地/都市)">${
        ['road', 'settlement', 'city']
          .map((t) => {
            const n = piecesLeft(state, p.id, t);
            return `<i class="${n === 0 ? 'out' : ''}">${PIECE_ICON[t]}${n}</i>`;
          })
          .join('')
      }</span>`;
      const info = cak
        ? `<span title="手札">🂠 ${totalCards(p)}</span>
           <span title="進歩カード">📜 ${p.progressCards.length}</span>
           <span title="防衛力">⚔️ ${knightContribution(state, p.id)}</span>
           <span title="都市改良(交易/政治/科学)" class="imp">${TRACKS.map(
             (t) => `${TRACK_ICON[t]}${p.improvements[t]}`,
           ).join(' ')}</span>`
        : `<span title="手札">🂠 ${totalCards(p)}</span>
           <span title="発展カード">📜 ${p.devCards.length}</span>
           <span title="使用済み騎士">⚔️ ${p.knightsPlayed}</span>`;
      return `
      <div class="player ${active ? 'active' : ''} ${expanded ? 'expanded' : ''}"
        style="--pc:${PLAYER_COLORS[p.id]}" data-act="pexpand:${p.id}">
        <div class="prow">
          <span class="chip">${avatarSvg(p.id)}</span>
          <span class="pname">${p.name}${
            // 自分だけ、名乗っている称号を出す(実績を取る意味をここで返す)
            p.id === HUMAN && playerTitle ? `<span class="ptitle">〈${playerTitle}〉</span>` : ''
          }</span>
          <span class="ppts">${pts}<small>/${goal}</small></span>
        </div>
        <div class="prow pinfo">${info}${stock}${badges}</div>
      </div>`;
    })
    .join('');
}

// 蛮族トラック(cak)
function renderBarbarians(state) {
  const elB = el('barb');
  if (state.mode !== 'cak') {
    elB.innerHTML = '';
    return;
  }
  const pos = state.barbarians.position;
  const cells = Array.from({ length: BARBARIAN_TRACK_LENGTH }, (_, i) =>
    `<span class="bcell ${i < pos ? 'past' : ''} ${i === pos ? 'here' : ''}">${i === pos ? '⛵' : ''}</span>`,
  ).join('');
  elB.innerHTML = `
    <span class="blabel">蛮族</span>${cells}<span class="bgoal">🏝</span>
    <span class="bdef" title="蛮族の強さ(都市数) vs 防衛力(活性騎士Lv合計)">
      ⚔${barbarianStrength(state)} vs 🛡${state.players.reduce((s, p) => s + knightContribution(state, p.id), 0)}
    </span>`;
}



const PIP_LAYOUT = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function dieHtml(n) {
  const cells = Array.from({ length: 9 }, (_, i) =>
    `<i class="${PIP_LAYOUT[n].includes(i) ? 'on' : ''}"></i>`,
  ).join('');
  return `<span class="die">${cells}</span>`;
}

function renderDice(state) {
  const d = state.dice;
  const left = diceDeckLeft(state);
  const deck = left == null
    ? ''
    : `<span class="ddeck" title="バランスダイス: 36通りの山札から引いています(残り${left}通り)">🂠${left}</span>`;
  // 右端に「山札の残り」と「出目の記録」をまとめる
  const right = `<span class="dright">${deck}<button class="dstats" data-act="dicelog-open"
    title="出目の記録を見る(${rollTotal(state)}回ぶん)">📊</button></span>`;
  const ev = state.mode === 'cak' && state.eventDie && d
    ? `<span class="evdie" title="イベントダイス">${EV_ICON[state.eventDie]}</span>`
    : state.mode === 'cak'
      ? '<span class="evdie empty"></span>'
      : '';
  el('dice').innerHTML = (d
    ? `${dieHtml(d[0])}${dieHtml(d[1])}${ev}<span class="dsum">${d[0] + d[1]}</span>`
    : `<span class="die empty"></span><span class="die empty"></span>${ev}<span class="dsum">–</span>`)
    + right;
}

// 発展カード(基本モード)の説明文

function renderHand(state, ui) {
  const p = state.players[HUMAN];
  const cak = state.mode === 'cak';
  const res = RESOURCES.map(
    (r) => `<div class="card card-${r} ${p.resources[r] === 0 ? 'zero' : ''}">
      <div class="icon">${RES_ICON[r]}</div>
      <div class="label">${RES_JP[r]}</div>
      <div class="cnt">${p.resources[r]}</div>
    </div>`,
  ).join('');

  const coms = cak
    ? COMMODITIES.map(
        (c) => `<div class="card card-com ${p.commodities[c] === 0 ? 'zero' : ''}">
        <div class="icon">${COM_ICON[c]}</div>
        <div class="label">${COM_JP[c]}</div>
        <div class="cnt">${p.commodities[c]}</div>
      </div>`,
      ).join('')
    : '';

  let extra = '';
  if (cak) {
    extra = p.progressCards
      .map((c, i) => {
        const def = PROGRESS_CARDS[c.id];
        // 説明を見られるよう常にタップ可(使えないカードは薄く表示)
        const playable = progressPlayable(state, c);
        return `<button class="card dev ${playable ? '' : 'dim'}" data-act="play-prog:${i}"
          title="${def.desc ?? '進歩カード'}">
          <div class="icon">${def.icon}</div>
          <div class="label">${def.name}</div></button>`;
      })
      .join('');
  } else {
    extra = p.devCards
      .map((c, i) => {
        // 進歩カードと同じく、使えないカードもタップできる(理由を説明ダイアログで出す)
        const playable = !devPlayableWhy(state, c);
        return `<button class="card dev ${playable ? '' : 'dim'}" data-act="dev-info:${i}"
          title="${DEV_DESC[c.type]}">
          <div class="icon">${DEV_ICON[c.type]}</div>
          <div class="label">${DEV_JP[c.type]}</div></button>`;
      })
      .join('');
  }
  const handEl = el('hand');
  // main行(資源+商品)は枚数固定なのでモバイルでは均等幅1行に収める。
  // extra行(進歩/発展カード)は枚数可変なので別行。
  handEl.innerHTML =
    `<div class="hrow main">${res}${coms ? `<div class="sep"></div>${coms}` : ''}</div>` +
    (extra ? `<div class="hrow extra">${extra}</div>` : '');
}

// 手番のボタン一式を組み立てる。**DOM には触らない**ので、node から
// そのまま検証できる(押せる/押せないの判断がルールエンジンと食い違って
// いないか、test/hud-render.test.js が突き合わせている)。
// 画面の広さだけは外から渡す ── ここで document を見ると試験できなくなる。
export function controlsHtml(state, mobile) {
  const p = state.players[HUMAN];
  const myTurn = state.phase === 'main' && state.currentPlayer === HUMAN && !state.awaiting;
  const rolled = state.turnFlags.rolled;
  const cak = state.mode === 'cak';
  const btn = (act, label, enabled, title = '', stock = null) => {
    const badge = stock == null
      ? ''
      : `<span class="stock ${stock === 0 ? 'out' : ''}">${stock}</span>`;
    return `<button data-act="${act}" ${enabled ? '' : 'disabled'} title="${title}">${label}${badge}</button>`;
  };

  // 資源が足りていても、手元のコマが尽きていれば建てられない(公式ルール)。
  // 残数をボタンに出して、コマ切れを事前に読めるようにする。
  const pieceBtn = (act, label, type, cost, costHint) => {
    const n = piecesLeft(state, HUMAN, type);
    const title = n > 0
      ? `${costHint}(残り${n}個)`
      : type === 'settlement'
        ? '開拓地のコマがありません(都市にすると1つ手元に戻ります)'
        : `${PIECE_JP[type]}のコマがありません`;
    return btn(act, label, myTurn && rolled && canAfford(p, cost) && n > 0, title, n);
  };

  const buildBtns = (road, settlement, city) => [
    pieceBtn('mode:road', road, 'road', COSTS.road, '🪵1 🧱1'),
    pieceBtn('mode:settlement', settlement, 'settlement', COSTS.settlement, '🪵1 🧱1 🐑1 🌾1'),
    pieceBtn('mode:city', city, 'city', COSTS.city, '🌾2 🪨3'),
  ];
  const cakBtns = (knight, wall, improve) => [
    btn('mode:knight', knight, myTurn && rolled && canAfford(p, KNIGHT_COSTS.build), '🐑1 🪨1(不活性で配置。各レベル2体まで)'),
    btn('mode:wall', wall, myTurn && rolled && canAfford(p, WALL_COST) && wallsLeft(state, HUMAN) > 0,
      `🧱2(手札上限+2。残り${wallsLeft(state, HUMAN)}枚)`, wallsLeft(state, HUMAN)),
    btn('improve-open', improve, myTurn && rolled, '商品で都市を改良'),
  ];
  const devLeft = state.bank.devDeck.length;
  const devBtn = (label) =>
    btn('buy-dev', label, myTurn && rolled && canAfford(p, COSTS.devCard) && devLeft > 0,
      devLeft > 0 ? `🐑1 🌾1 🪨1(山札の残り${devLeft}枚)` : '発展カードの山札がなくなりました', devLeft);
  const dragonMode = state.mode === 'dragon';
  const towerBtn = (label) =>
    btn('mode:tower', label, myTurn && rolled && canAfford(p, TOWER_COST), '🪵1 🧱1 🪨1(隣接ヘックスの襲撃を撃退して財宝)');
  const seaMode = state.mode === 'sea';
  const shipsLeft = SHIP_LIMIT - Object.values(state.ships ?? {}).filter((x) => x.player === HUMAN).length;
  const shipBtn = (label) =>
    btn('mode:ship', label, myTurn && rolled && canAfford(p, SHIP_COST) && shipsLeft > 0,
      `🪵1 🐑1(海に面した辺。残り${shipsLeft}隻)`, shipsLeft);
  const moveShipBtn = (label) =>
    btn('mode:moveship', label,
      myTurn && rolled && !state.turnFlags.movedShip && movableShips(state, HUMAN).length > 0,
      state.turnFlags.movedShip
        ? 'この手番はもう船を動かしました'
        : '航路の先端にある船を1隻だけ動かせます');
  const fishMode = state.mode === 'fish';
  // 魚は2匹から使える(盗賊を戻すのだけはロール前でも押せる)。
  // 古い靴を持っているときは、渡すために魚0匹でも開ける。
  const canFish = fishCount(p) >= 2 || hasOldShoe(p);
  const fishBtn = (label) =>
    btn('fish-open', label + (hasOldShoe(p) ? '👞' : ''), myTurn && canFish,
      canFish ? '魚トークンを使う(お釣りは出ません)' : '魚が2匹たまると使えます',
      fishCount(p));

  let list;
  if (mobile) {
    // モバイル: 4列×2段のグリッド。ロール/終了は同時に使わないので1ボタンに統合
    const flow = myTurn && rolled
      ? btn('end-turn', '⏭終了', true)
      : btn('roll', '🎲ロール', myTurn && !rolled);
    list = [
      flow,
      ...buildBtns('🛤道', '🏠開拓', '🏰都市'),
      ...(cak ? cakBtns('⚔️騎士', '🧱城壁', '🏙改良')
        : dragonMode ? [devBtn('📜カード'), towerBtn('🗼塔')]
        : fishMode ? [devBtn('📜カード'), fishBtn('🐟魚')]
        : seaMode ? [devBtn('📜カード'), shipBtn('⛵船'), moveShipBtn('🧭移動')]
        : [devBtn('📜カード')]),
      btn('trade-open', '⚖️交易', myTurn && rolled),
    ];
  } else {
    list = [
      btn('roll', '🎲 ロール', myTurn && !rolled),
      ...buildBtns('🛤️ 道', '🏠 開拓地', '🏰 都市'),
      ...(cak ? cakBtns('⚔️ 騎士', '🧱 城壁', '🏙 改良')
        : dragonMode ? [devBtn('📜 カード'), towerBtn('🗼 見張り塔')]
        : fishMode ? [devBtn('📜 カード'), fishBtn('🐟 魚')]
        : seaMode ? [devBtn('📜 カード'), shipBtn('⛵ 船'), moveShipBtn('🧭 船を動かす')]
        : [devBtn('📜 カード')]),
      btn('trade-open', '⚖️ 交易', myTurn && rolled),
      btn('end-turn', '⏭ ターン終了', myTurn && rolled),
    ];
  }

  return list.join('');
}

function renderControls(state) {
  el('controls').innerHTML = controlsHtml(state, document.body.classList.contains('mobile'));
}

export function statusText(state, ui) {
  if (state.phase === 'ended') {
    return `🏆 ${state.players[state.winner].name}の勝利!`;
  }
  if (ui.toast) return `⚠ ${ui.toast}`;
  const aw = state.awaiting;
  if (aw?.players.includes(HUMAN)) {
    if (aw.type === 'setupPlacement') {
      if (ui.mode !== 'setup-road') {
        return `🏠 初期配置(${aw.context.round}巡目): 開拓地の位置を選んでください`;
      }
      return ui.setupPiece === 'ship'
        ? '⛵ 開拓地に隣接する船の位置を選んでください'
        : '🛤️ 開拓地に隣接する道の位置を選んでください';
    }
    if (aw.type === 'discard') return `🂠 手札を${aw.context.required[HUMAN]}枚捨ててください`;
    if (aw.type === 'aqueduct') return '💧 水道橋: もらう資源を選んでください';
    if (aw.type === 'moveRobber') {
      if (state.mode === 'dragon') return '🐉 ドラゴンの移動先ヘックスを選んでください';
      if (state.mode === 'sea') return '🥷 盗賊(陸)か 🏴‍☠️ 海賊(海)の移動先を選んでください';
      return '🥷 盗賊の移動先ヘックスを選んでください';
    }
    if (aw.type === 'goldChoice') return '💰 金鉱: もらう資源を選んでください';
    if (aw.type === 'barbarianDefense') return '⚔️ 降格させる都市を選んでください';
    if (aw.type === 'defenderDeck') return '🛡 防衛の報酬: 進歩カードを引く系統を選んでください';
    if (aw.type === 'progressLimit') return '📜 進歩カードが多すぎます。1枚捨ててください';
    if (aw.type === 'merchantPick') return '👑 豪商: 奪う札を選んでください';
    if (aw.type === 'spyPick') return '🕵️ スパイ: 奪う進歩カードを選んでください';
    if (aw.type === 'weddingGift') return '💒 王家の婚礼: 贈る札を選んでください';
    if (aw.type === 'harborGive') return '⚓ 商業港: 渡す商品を選んでください';
    if (aw.type === 'deserterPick') return '🏳️ 脱走兵: 差し出す騎士を選んでください';
    if (aw.type === 'deserterPlace') return '🏳️ 脱走してきた騎士を置く頂点を選んでください';
    if (aw.type === 'knightDisplace') return '⚔️ 追い出された騎士の移動先を選んでください';
    if (aw.type === 'tradeChoose') return '🤝 交換する相手を選んでください';
  } else if (aw) {
    const waiting = aw.players.map((i) => state.players[i].name).join('・');
    if (aw.type === 'defenderDeck') return `⏳ 防衛の報酬を選んでいます: ${waiting}`;
    if (aw.type === 'progressLimit') return `⏳ 進歩カードの捨て札待ち: ${waiting}`;
    if (aw.type === 'weddingGift') return `⏳ 王家の婚礼の贈り物待ち: ${waiting}`;
    if (aw.type === 'harborGive') return `⏳ 商業港の交換待ち: ${waiting}`;
    if (aw.type === 'deserterPick') return `⏳ 脱走させる騎士の選択待ち: ${waiting}`;
    if (aw.type === 'deserterPlace') return `⏳ 騎士の配置待ち: ${waiting}`;
    if (aw.type === 'knightDisplace') return `⏳ 追い出された騎士の移動先待ち: ${waiting}`;
    if (aw.type === 'merchantPick') {
      return `⏳ 👑 ${waiting}が${state.players[aw.context.target].name}の手札を覗いています`;
    }
    if (aw.type === 'spyPick') {
      return `⏳ 🕵️ ${waiting}が${state.players[aw.context.target].name}の進歩カードを覗いています`;
    }
    if (aw.type === 'tradeOffer') {
      // 何人が応じたかはこの時点で全員に見えている情報(成立すれば公開される)
      const yes = Object.values(aw.context.replies ?? {}).filter(Boolean).length;
      return `⏳ 交易の返事待ち: ${waiting}(応じた ${yes}人)`;
    }
    return `⏳ ${waiting}の応答待ち...`;
  }
  switch (ui.mode) {
    case 'build-road': return '🛤️ 道を建てる辺を選んでください';
    case 'build-settlement': return '🏠 開拓地を建てる頂点を選んでください';
    case 'build-city': return '🏰 都市に昇格する開拓地を選んでください';
    case 'build-knight': return '⚔️ 騎士を配置する頂点を選んでください(自分の道に接続)';
    case 'build-wall': return '🧱 城壁を建てる都市を選んでください';
    case 'build-tower': return '🗼 見張り塔を建てる自分の建物を選んでください';
    case 'fish-road': return '🐟 魚5匹で建てる道の位置を選んでください';
    case 'build-ship': return '⛵ 船を建てる辺を選んでください(海に面した辺)';
    case 'move-ship': return '🧭 動かす船を選んでください';
    case 'move-ship-to': return '🧭 その船をどこへ動かしますか?';
    case 'move-knight': return '⚔️ 騎士の移動先を選んでください';
    case 'desert-pick': return '🏳️ 脱走兵: 差し出す自分の騎士を選んでください';
    case 'desert-place': return '🏳️ 脱走してきた騎士を置く頂点を選んでください';
    case 'knight-displace': return '⚔️ 追い出された騎士の移動先を選んでください';
    case 'play-road-building':
      return `🛤️ 街道建設: ${roadBuildingPrompt(state, ui)}`;
    case 'prog-hex': case 'prog-vertex': case 'prog-edge': case 'prog-hex2': case 'prog-roads':
    case 'prog-knights': case 'prog-moveroad': {
      const card = state.players[HUMAN].progressCards[ui.progIndex];
      const def = card ? PROGRESS_CARDS[card.id] : null;
      const label = def ? `${def.icon} ${def.name}` : '進歩カード';
      if (ui.mode === 'prog-hex') return `${label}: 対象のヘックスを選んでください`;
      if (ui.mode === 'prog-vertex') return `${label}: 対象の頂点を選んでください`;
      if (ui.mode === 'prog-edge') return `${label}: 取り除く道を選んでください`;
      if (ui.mode === 'prog-moveroad') {
        return ui.pendingEdges.length === 0
          ? `${label}: 移設する自分の道を選んでください`
          : `${label}: 移設先の辺を選んでください`;
      }
      if (ui.mode === 'prog-hex2') return `${label}: 交換する数字を選択(${ui.pendingHexes.length}/2)`;
      if (ui.mode === 'prog-knights') {
        return `${label}: 昇格させる騎士を選択(${ui.pendingVertices.length}/2)。1体でも確定できます`;
      }
      return `${label}: ${roadBuildingPrompt(state, ui)}`;
    }
    default:
      if (state.phase === 'main') {
        return state.currentPlayer === HUMAN
          ? state.turnFlags.rolled ? '✨ あなたの手番です(建設・交易・カード)' : '🎲 ダイスを振ってください'
          : `⏳ ${state.players[state.currentPlayer].name}の手番...`;
      }
      return '';
  }
}

// 街道建設の案内。公式では置ける数はきっちり置くので、残り本数を必ず出す。
function roadBuildingPrompt(state, ui) {
  const need = roadBuildingCount(state, HUMAN);
  const left = need - ui.pendingEdges.length;
  const what = state.mode === 'sea' ? '道か船' : '道';
  if (left <= 0) return `${what}を${need}つ選びました。確定してください`;
  if (need === 1) {
    return `2つ目を置ける場所がないので、${what}を1つだけ置きます`;
  }
  return `光っている辺をタップして${what}を選びます(あと${left}つ)`;
}

// 航海者たちの初期配置は「開拓地 + 道 or 船」(公式ルール)。どちらを置くか選ばせる。
function setupPieceToggle(state, ui) {
  if (state.mode !== 'sea' || ui.mode !== 'setup-road' || !ui.pendingVertex) return '';
  const btn = (piece, label) => {
    const on = ui.setupPiece === piece ? ' class="on"' : '';
    // 内陸の開拓地には船を出せないので、置ける辺がなければ押せなくする
    const off = legalSetupEdges(state, ui.pendingVertex, piece).length === 0 ? ' disabled' : '';
    return `<button data-act="setup-piece:${piece}"${on}${off}>${label}</button>`;
  };
  return `<span class="setup-piece">${btn('road', '🛤️ 道')}${btn('ship', '⛵ 船')}</span>`;
}

// 航海者たちの街道建設は「道または船を2つ」。次に置く駒を選ばせる。
function roadPieceToggle(state, ui) {
  if (state.mode !== 'sea') return '';
  if (!['play-road-building', 'prog-roads'].includes(ui.mode)) return '';
  const placed = ui.pendingEdges.map((edgeId, i) => ({
    edgeId, piece: ui.pendingPieces[i] ?? 'road',
  }));
  const spots = roadBuildingSpots(state, HUMAN, placed);
  const btn = (piece, label) => {
    const on = ui.roadPiece === piece ? ' class="on"' : '';
    const off = spots.some((s) => s.piece === piece) ? '' : ' disabled';
    return `<button data-act="rb-piece:${piece}"${on}${off}>${label}</button>`;
  };
  return `<span class="setup-piece">${btn('road', '🛤️ 道')}${btn('ship', '⛵ 船')}</span>`;
}

function renderStatus(state, ui) {
  const cancellable = [
    'build-road', 'build-settlement', 'build-city', 'play-road-building',
    'build-knight', 'build-wall', 'move-knight',
    'prog-hex', 'prog-vertex', 'prog-edge', 'prog-hex2', 'prog-roads', 'prog-knights',
    'prog-moveroad',
  ].includes(ui.mode) || (ui.mode === 'setup-road');
  const confirmable =
    (ui.pending != null) ||
    (['play-road-building', 'prog-roads'].includes(ui.mode)
      && ui.pendingEdges.length === roadBuildingCount(state, HUMAN)) ||
    (ui.mode === 'prog-knights' && ui.pendingVertices.length >= 1) ||
    (ui.mode === 'prog-moveroad' && ui.pendingEdges.length === 2) ||
    (ui.mode === 'prog-hex2' && ui.pendingHexes.length === 2);
  el('status').innerHTML = `
    <span class="msg">${statusText(state, ui)}</span>
    ${setupPieceToggle(state, ui)}
    ${roadPieceToggle(state, ui)}
    ${confirmable ? '<button class="primary" data-act="confirm">✓ 確定</button>' : ''}
    ${cancellable ? '<button data-act="cancel">↩ やり直す</button>' : ''}
  `;
}

function renderLog(state) {
  const logEl = el('log');
  logEl.innerHTML = state.log.slice(-60).map((l) => `<div>${l}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

// ---- ダイアログ ----


// 直前に流し込んだダイアログの HTML。中身が同じなら DOM を作り直さない。
// 作り直すと開きっぱなしのダイアログでも表示アニメーションが鳴り直してしまい、
// 「ポップアップが何度も出てくる」ように見える ── 交易の一斉提案や捨て札のように
// 自分が答える前に他の人の応答で再描画が走る場面で起きる。
let lastDialogHtml = null;

function renderDialog(state, ui) {
  const root = el('dialog-root');
  let html;
  try {
    html = dialogHtml(state, ui);
  } catch (e) {
    // ダイアログの中身が state と食い違っても、画面を覆ったまま固まらせない。
    // (オンラインではサーバーの state で割り込みが入れ替わることがある)
    console.error('ダイアログ描画に失敗:', e);
    ui.dialog = null;
    html = '';
  }
  const wrapped = html ? `<div class="overlay"><div class="dialog">${html}</div></div>` : '';
  if (wrapped === lastDialogHtml) return;
  lastDialogHtml = wrapped;
  root.innerHTML = wrapped;
}

export function renderHUD(state, ui) {
  renderPlayers(state, ui);
  renderBarbarians(state);
  renderDice(state);
  renderHand(state, ui);
  renderControls(state);
  renderStatus(state, ui);
  renderLog(state);
  renderDialog(state, ui);
}
