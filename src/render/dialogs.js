// ダイアログの中身(HTML を組み立てるだけ。state は読むのみ)。
//
// もとは hud-render.js の dialogHtml が 606 行・31 分岐の 1 関数だった。
// 1 種類を読むのに 500 行スクロールし、1 種類を試すのに手前の 30 個の if を
// 素通りさせる必要があった。種類ごとの関数に分け、**表**から引く形にした。
//
// **表にした一番の狙いは、取りこぼしを機械的に見張れること。**
// ダイアログの型は 2 か所から立つ ── 直接の `ui.dialog = { type: ... }` と、
// ui-sync.js の DIALOG_FOR_AWAITING。型を足して分岐を書き忘れると、
// 以前は空文字が返って**空のダイアログが黙って出る**だけだった。
// いまは test/dialogs.test.js が、立つ型と表の鍵の一致を見張っている。

import { achievementById } from '../achievements.js';
import { MAX_OFFERS_PER_TURN, validateAction } from '../actions.js';
import { piecesLeft, totalCards } from '../rules/build.js';
import { MAX_IMPROVEMENT, TRACKS, TRACK_COMMODITY, TRACK_JP, canBuyImprovement, improvementCost } from '../rules/cak/improvements.js';
import { COMMODITIES, COM_JP, PROGRESS_CARDS, diplomatMovable, weddingGiftSize } from '../rules/cak/progress-cards.js';
import { FISH_USES, fishCount, hasOldShoe, shoeTargets } from '../rules/fish.js';
import { tradeRate } from '../rules/trade.js';
import { computePoints } from '../rules/victory.js';
import { DEV_JP, RESOURCES, RES_JP, modeOptions } from '../state.js';
import { avatarSvg } from './avatars.js';
import { PLAYER_COLORS } from './board-render.js';
import { rulesHtml } from './rules-content.js';
import {
  COM_ICON, DEV_DESC, DEV_ICON, DICE_TOTALS, HUMAN, RES_ICON, TRACK_ICON,
  devPlayableWhy, diceCountOf, playerTitle, progressPlayable, rollTotal,
} from './hud-common.js';

// 出目の記録。2〜12 が何回出たかを棒グラフで出す。
function diceLogHtml(state) {
  const rolls = rollTotal(state);
  if (rolls === 0) {
    return `<h3>📊 出目の記録</h3>
      <p>まだダイスを振っていません。振るとここに回数がたまります。</p>
      <div class="row end"><button data-act="dialog-cancel">閉じる</button></div>`;
  }
  const top = Math.max(...DICE_TOTALS.map((n) => diceCountOf(state, n)), 1);
  const bars = DICE_TOTALS.map((n) => {
    const c = diceCountOf(state, n);
    return `<div class="dbar ${n === 7 ? 'seven' : ''}" title="${n}: ${c}回">
      <span class="dbnum">${c}</span>
      <span class="dbcol"><i style="height:${(c / top) * 100}%"></i></span>
      <span class="dblabel">${n}</span>
    </div>`;
  }).join('');
  const seven = diceCountOf(state, 7);
  return `<h3>📊 出目の記録</h3>
    <p>これまで<b>${rolls}回</b>ふりました(7は<b>${seven}回</b>)。</p>
    <div class="dchart">${bars}</div>
    <p><small>${state.diceMode === 'balanced'
      ? '⚖️ バランスダイス: 36通りの山札から引いています'
      : '🎰 純ランダム: 毎回ゼロから2個振っています'}</small></p>
    <div class="row end"><button data-act="dialog-cancel">閉じる</button></div>`;
}

function dlgTrade(state, ui, d, p) {
  const cak = state.mode === 'cak';
  const keys = cak ? [...RESOURCES, ...COMMODITIES] : RESOURCES;
  const icon = (k) => RES_ICON[k] ?? COM_ICON[k];
  const jp = (k) => RES_JP[k] ?? COM_JP[k];
  const have = (k) => (RES_ICON[k] ? p.resources[k] : p.commodities[k]);

  const tabs = `<div class="seg">
    <button class="${d.tab === 'bank' ? 'sel' : ''}" data-act="trade-tab:bank">🏦 銀行/港</button>
    <button class="${d.tab === 'players' ? 'sel' : ''}" data-act="trade-tab:players">🤝 プレイヤー</button>
  </div>`;

  if (d.tab === 'players') {
    const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
    // showMax: 自分の手札のときだけ上限を出す。もらう側に数字を出すと
    // 「相手が何枚持っているか」に見えてしまうので出さない。
    const chipRow = (selected, addAct, subAct, maxOf, showMax) => keys.map((r) => {
      const n = selected[r] ?? 0;
      const ok = maxOf(r) > n;
      return `<button class="pick tchip ${n ? 'sel' : ''}" data-act="${addAct}:${r}" ${ok || n ? '' : 'disabled'}>
        <span class="picon">${icon(r)}</span>${jp(r)}
        ${n ? `<span class="tbadge" data-act="${subAct}:${r}">− ${n}</span>` : showMax ? `<small>${maxOf(r)}</small>` : ''}
      </button>`;
    }).join('');
    // 提案は全員へ一斉に送る。誰が応じたかを見てから相手を決める。
    const ready = sum(d.pgive) > 0 && sum(d.precv) > 0;
    const err = ready
      ? validateAction(state, {
          type: 'OFFER_TRADE', player: HUMAN,
          give: { ...d.pgive }, receive: { ...d.precv },
        })
      : '渡すものともらうものを選んでください';
    const left = MAX_OFFERS_PER_TURN - (state.turnFlags.offers ?? 0);
    return `<h3>⚖️ 交易</h3>${tabs}
      <p>渡すもの(タップで追加、バッジで減らす)</p>
      <div class="row">${chipRow(d.pgive, 'ptg-add', 'ptg-sub', (r) => have(r), true)}</div>
      <p>もらうもの</p>
      <div class="row">${chipRow(d.precv, 'ptr-add', 'ptr-sub', () => 6, false)}</div>
      <p><small>全員に同じ内容で持ちかけます。応じた人が複数なら、そのあと相手を選べます。
        相手が持っているかは分かりません。</small></p>
      <div class="row end">
        <button class="primary" data-act="pt-offer" ${err ? 'disabled' : ''} title="${err ?? ''}">
          🤝 全員に提案<span class="stock ${left === 0 ? 'out' : ''}">${left}</span></button>
        <button data-act="dialog-cancel">閉じる</button>
      </div>`;
  }

  const stock = (k) =>
    RES_ICON[k] ? state.bank.resources[k] : state.bank.commodities[k];
  const giveBtns = keys.map((r) => {
    const rate = tradeRate(state, HUMAN, r);
    const ok = have(r) >= rate;
    return `<button class="pick ${d.give === r ? 'sel' : ''}" data-act="trade-give:${r}" ${ok ? '' : 'disabled'}>
      <span class="picon">${icon(r)}</span>${jp(r)}<small>${rate}:1</small></button>`;
  }).join('');
  const recvBtns = keys.map((r) => {
    const ok = stock(r) > 0 && r !== d.give;
    return `<button class="pick ${d.receive === r ? 'sel' : ''}" data-act="trade-receive:${r}" ${ok ? '' : 'disabled'}>
      <span class="picon">${icon(r)}</span>${jp(r)}</button>`;
  }).join('');
  return `<h3>⚖️ 交易</h3>${tabs}
    <p>渡すもの</p><div class="row">${giveBtns}</div>
    <p>もらうもの</p><div class="row">${recvBtns}</div>
    <div class="row end">
      <button class="primary" data-act="trade-confirm" ${d.give && d.receive ? '' : 'disabled'}>交易する</button>
      <button data-act="dialog-cancel">閉じる</button>
    </div>`;
  return '';
}

  // 漁師たち: 魚トークンの使い道を選ぶ
function dlgFish(state, ui, d, p) {
  const n = fishCount(p);
  const tokens = (p.fish ?? [])
    .map((t) => (t === 'shoe'
      ? '<span class="pick tchip">👞 古い靴</span>'
      : `<span class="pick tchip sel"><span class="picon">🐟</span>${t}匹</span>`))
    .join('');
  const head = `<h3>🐟 魚トークン(${n}匹)</h3><div class="row">${tokens || '<small>まだ持っていません</small>'}</div>`;
  const back = '<div class="row end"><button data-act="fish-back">← 戻る</button></div>';

  if (d.pick === 'steal') {
    const btns = state.players
      .filter((o) => o.id !== HUMAN && totalCards(o) > 0)
      .map((o) => `<button class="pick" data-act="fish-steal:${o.id}" style="--pc:${PLAYER_COLORS[o.id]}">
        <span class="chip">${avatarSvg(o.id)}</span>${o.name}<small>${totalCards(o)}枚</small></button>`)
      .join('');
    return `${head}<p>誰から1枚奪いますか?(魚3匹)</p>
      <div class="row">${btns || '<small>手札を持っている相手がいません</small>'}</div>${back}`;
  }
  if (d.pick === 'resource') {
    const btns = RESOURCES.map(
      (r) => `<button class="pick" data-act="fish-res:${r}" ${state.bank.resources[r] > 0 ? '' : 'disabled'}>
        <span class="picon">${RES_ICON[r]}</span>${RES_JP[r]}</button>`,
    ).join('');
    return `${head}<p>もらう資源を選んでください(魚4匹)</p><div class="row">${btns}</div>${back}`;
  }

  const rolled = state.turnFlags.rolled;
  const others = state.players.some((o) => o.id !== HUMAN && totalCards(o) > 0);
  const bankHasAny = RESOURCES.some((r) => state.bank.resources[r] > 0);
  const reason = (use) => {
    const { cost } = FISH_USES[use];
    if (n < cost) return `魚が${cost}匹必要です`;
    if (use !== 'robber' && !rolled) return '先にダイスを振ってください';
    if (use === 'robber' && state.board.robber === state.board.lake) return '盗賊はすでに湖にいます';
    if (use === 'steal' && !others) return '手札を持っている相手がいません';
    if (use === 'resource' && !bankHasAny) return '銀行に在庫がありません';
    if (use === 'road' && piecesLeft(state, HUMAN, 'road') === 0) return '道のコマがありません';
    if (use === 'dev' && state.bank.devDeck.length === 0) return '発展カードの山札がありません';
    return null;
  };
  const rows = Object.entries(FISH_USES)
    .map(([key, u]) => {
      const err = reason(key);
      return `<div class="drow fishuse">
        <span>🐟×${u.cost} <b>${u.jp}</b><small>${err ?? u.desc}</small></span>
        <button data-act="fish-use:${key}" ${err ? 'disabled' : ''} title="${err ?? ''}">使う</button>
      </div>`;
    })
    .join('');
  // 古い靴: 自分と同点以上の相手にだけ押しつけられる
  let shoe = '';
  if (hasOldShoe(p)) {
    const targets = shoeTargets(state, HUMAN, (id) => computePoints(state, id));
    const btns = targets
      .map((id) => `<button class="pick" data-act="pass-shoe:${id}" style="--pc:${PLAYER_COLORS[id]}">
        <span class="chip">${avatarSvg(id)}</span>${state.players[id].name}
        <small>${computePoints(state, id)}点</small></button>`)
      .join('');
    shoe = `<p>👞 古い靴(勝利に必要な点数+1)</p>
      <div class="row">${btns || '<small>自分と同点以上の相手がいないので、いまは渡せません</small>'}</div>`;
  }
  return `${head}
    <p><small>お釣りは出ません(ちょうど払えないときは超過した分が捨てになります)。</small></p>
    ${rows}${shoe}
    <div class="row end"><button data-act="dialog-cancel">閉じる</button></div>`;
  return '';
}

  // 航海者たち: 金鉱でもらう資源を選ぶ
function dlgGold(state, ui, d, p) {
  const left = state.awaiting?.context?.left?.[HUMAN] ?? 1;
  const btns = RESOURCES.map(
    (r) => `<button class="pick" data-act="gold:${r}" ${state.bank.resources[r] > 0 ? '' : 'disabled'}>
      <span class="picon">${RES_ICON[r]}</span>${RES_JP[r]}</button>`,
  ).join('');
  return `<h3>💰 金鉱</h3>
    <p>好きな資源をもらえます(あと${left}枚)</p>
    <div class="row">${btns}</div>`;
  return '';
}

function dlgAqueduct(state, ui, d, p) {
  const btns = RESOURCES.map(
    (r) => `<button class="pick" data-act="aq:${r}" ${state.bank.resources[r] > 0 ? '' : 'disabled'}>
      <span class="picon">${RES_ICON[r]}</span>${RES_JP[r]}</button>`,
  ).join('');
  return `<h3>💧 水道橋(科学Lv3)</h3>
    <p>出目で資源がもらえなかったので、好きな資源を1枚もらえます</p>
    <div class="row">${btns}</div>`;
  return '';
}

function dlgDiplomat(state, ui, d, p) {
  const canMove = diplomatMovable(state, HUMAN).length > 0;
  return `<h3>🎖️ 外交官</h3>
    <p><b>端が繋がっていない道</b>が対象です。相手の道を取り除くか、
    自分の道を別の場所へ無料で移し替えられます。</p>
    <div class="row">
      <button class="pick" data-act="diplo:remove">
        <span class="picon">🚧</span>道を撤去</button>
      <button class="pick" data-act="diplo:move" ${canMove ? '' : 'disabled'}>
        <span class="picon">🎒</span>自分の道を移設</button>
    </div>
    <div class="row end"><button data-act="dialog-cancel">やめる</button></div>`;
  return '';
}

function dlgProgresslimit(state, ui, d, p) {
  const p0 = state.players[HUMAN];
  const mine = state.currentPlayer === HUMAN;
  const btns = p0.progressCards.map((c, i) => {
    const def = PROGRESS_CARDS[c.id];
    return `<button class="pick" data-act="pdisc:${i}">
      <span class="picon">${def.icon}</span>${def.name}</button>`;
  }).join('');
  return `<h3>📜 進歩カードの手札上限</h3>
    <p>進歩カードは<b>4枚まで</b>です${mine ? '(自分の手番のあいだだけ5枚持てますが、ターンを終える前に1枚捨てます)' : ''}。
    捨てるカードを選んでください。</p>
    <div class="row">${btns}</div>`;
  return '';
}

function dlgDefenderdeck(state, ui, d, p) {
  const btns = TRACKS.map((t) => {
    const left = state.bank.progressDecks[t].length;
    return `<button class="pick" data-act="ddeck:${t}" ${left ? '' : 'disabled'}>
      <span class="picon">${TRACK_ICON[t]}</span>${TRACK_JP[t]}<small>残り${left}</small></button>`;
  }).join('');
  return `<h3>🛡 防衛の報酬</h3>
    <p>蛮族を防いだ功が並びました。守護者は出ませんが、
    <b>好きな系統の山から進歩カードを1枚</b>引けます。</p>
    <div class="row">${btns}</div>`;
  return '';
}

function dlgTradeoffer(state, ui, d, p) {
  const aw = state.awaiting;
  if (aw?.type !== 'tradeOffer') return '';
  const from = state.players[aw.context.from];
  const chips = (obj) =>
    Object.entries(obj)
      .map(
        ([r, n]) => `<span class="pick tchip sel">
          <span class="picon">${RES_ICON[r] ?? COM_ICON[r]}</span>${RES_JP[r] ?? COM_JP[r]}<small>×${n}</small></span>`,
      )
      .join('');
  const short = Object.entries(aw.context.receive).some(
    ([r, n]) => (RES_ICON[r] ? p.resources[r] : p.commodities[r]) < n,
  );
  return `<h3>💬 <span class="chip">${avatarSvg(from.id)}</span> ${from.name}からの交易提案</h3>
    <p>もらえるもの</p><div class="row">${chips(aw.context.give)}</div>
    <p>渡すもの${short ? '(手札が足りません)' : ''}</p><div class="row">${chips(aw.context.receive)}</div>
    <p><small>同じ提案が全員に届いています。応じた人が複数なら、${from.name}が相手を選びます。</small></p>
    <div class="row end">
      <button class="primary" data-act="offer-accept" ${short ? 'disabled' : ''}>🤝 交換する</button>
      <button data-act="offer-decline">断る</button>
    </div>`;
  return '';
}

  // 一斉提案に複数が応じたとき、提案者がどの相手と成立させるかを選ぶ
function dlgTradechoose(state, ui, d, p) {
  const aw = state.awaiting;
  if (aw?.type !== 'tradeChoose') return '';
  const chips = (obj) =>
    Object.entries(obj)
      .map(
        ([r, n]) => `<span class="pick tchip sel">
          <span class="picon">${RES_ICON[r] ?? COM_ICON[r]}</span>${RES_JP[r] ?? COM_JP[r]}<small>×${n}</small></span>`,
      )
      .join('');
  const picks = aw.context.accepted
    .map(
      (id) => `<button class="pick" data-act="trade-pick:${id}" style="--pc:${PLAYER_COLORS[id]}">
        <span class="chip">${avatarSvg(id)}</span>${state.players[id].name}
        <small>${totalCards(state.players[id])}枚</small></button>`,
    )
    .join('');
  return `<h3>🤝 誰と交換する?</h3>
    <p>渡すもの</p><div class="row">${chips(aw.context.give)}</div>
    <p>もらうもの</p><div class="row">${chips(aw.context.receive)}</div>
    <p>応じた相手</p><div class="row">${picks}</div>
    <div class="row end"><button data-act="trade-pick:none">やめる</button></div>`;
  return '';
}

function dlgImprove(state, ui, d, p) {
  // 公式ルール: Lv3ごとの特殊能力は系統で異なる
  const TRACK_ABILITY = {
    trade: '商館: 商品すべてを2:1交易',
    politics: '要塞: 騎士をLv3に昇格可',
    science: '水道橋: 収入0のとき資源1枚',
  };
  const rows = TRACKS.map((t) => {
    const lv = p.improvements[t];
    const next = lv + 1;
    const com = TRACK_COMMODITY[t];
    const cost = lv >= MAX_IMPROVEMENT ? null : improvementCost(next, state);
    const err = canBuyImprovement(state, HUMAN, t);
    const cells = Array.from({ length: MAX_IMPROVEMENT }, (_, i) =>
      `<span class="lvcell ${i < lv ? 'on' : ''}"></span>`,
    ).join('');
    const metroVid = state.metropolis[t];
    const metroMark =
      metroVid != null
        ? `<small>🏙 ${state.players[state.buildings[metroVid]?.player]?.name ?? ''}</small>`
        : '';
    return `<div class="drow improve">
      <span>${TRACK_ICON[t]} ${TRACK_JP[t]} <b>Lv${lv}</b> ${cells} ${metroMark}
        <small class="ability ${lv >= 3 ? 'on' : ''}">Lv3 ${TRACK_ABILITY[t]}</small></span>
      ${cost != null
        ? `<button data-act="improve-buy:${t}" ${err ? 'disabled' : ''}
            title="${err ?? ''}">${COM_ICON[com]}×${cost}で改良</button>`
        : '<small>MAX</small>'}
    </div>`;
  }).join('');
  return `<h3>🏙 都市改良</h3>
    <p>各系統で最初にLv4到達でメトロポリス(+2点)。Lv3で系統ごとの特殊能力が解禁</p>
    ${rows}
    <div class="row end"><button data-act="dialog-cancel">閉じる</button></div>`;
  return '';
}

function dlgKnight(state, ui, d, p) {
  const k = state.knights[d.vertexId];
  if (!k) return '';
  const btn = (act, label, title = '') =>
    `<button data-act="${act}:${d.vertexId}" title="${title}">${label}</button>`;
  return `<h3>⚔️ 騎士 Lv${k.level}(${k.active ? '活性' : '不活性'})</h3>
    <div class="row">
      ${!k.active ? btn('knight-activate', '🌾 活性化', '小麦1') : ''}
      ${k.level < 3 ? btn('knight-promote', '⬆ 昇格', '羊毛1・鉱石1。Lv3は政治Lv3が必要') : ''}
      ${k.active ? btn('knight-move', '👣 移動', '道づたいに移動(移動後は不活性)') : ''}
      ${k.active ? btn('knight-chase', '🥷 盗賊を追い払う', '隣接ヘックスの盗賊を移動させる') : ''}
    </div>
    <div class="row end"><button data-act="dialog-cancel">閉じる</button></div>`;
  return '';
}

function dlgDiscard(state, ui, d, p) {
  // 割り込みが切り替わった直後に呼ばれても落ちないように、深い参照は全て安全側で読む
  const need = state.awaiting?.context?.required?.[HUMAN] ?? 0;
  // 都市と騎士では商品も手札上限に数えるため、捨て札の対象にする
  const keys = state.mode === 'cak' ? [...RESOURCES, ...COMMODITIES] : RESOURCES;
  const have = (k) => (RESOURCES.includes(k) ? p.resources[k] : p.commodities[k]);
  const icon = (k) => RES_ICON[k] ?? COM_ICON[k];
  const label = (k) => RES_JP[k] ?? COM_JP[k];
  const sum = keys.reduce((s, k) => s + (d.counts[k] ?? 0), 0);
  const rows = keys.map(
    (r) => `<div class="drow">
      <span>${icon(r)} ${label(r)}(${have(r)})</span>
      <button data-act="discard-minus:${r}" ${(d.counts[r] ?? 0) > 0 ? '' : 'disabled'}>−</button>
      <b>${d.counts[r] ?? 0}</b>
      <button data-act="discard-plus:${r}" ${(d.counts[r] ?? 0) < have(r) && sum < need ? '' : 'disabled'}>+</button>
    </div>`,
  ).join('');
  return `<h3>🂠 捨て札(${sum}/${need}枚)</h3>${rows}
    <div class="row end">
      <button class="primary" data-act="discard-confirm" ${sum === need ? '' : 'disabled'}>捨てる</button>
    </div>`;
  return '';
}

function dlgHarborgive(state, ui, d, p) {
  const ctx = state.awaiting?.context ?? {};
  const to = state.players[ctx.to ?? 0];
  const btns = COMMODITIES.map(
    (c) => `<button class="pick" data-act="harbor:${c}" ${p.commodities[c] > 0 ? '' : 'disabled'}>
      <span class="picon">${COM_ICON[c]}</span>${COM_JP[c]}<small>${p.commodities[c]}枚</small></button>`,
  ).join('');
  return `<h3>⚓ 商業港</h3>
    <p><b>${to.name}</b>の商業港です。商品を1枚渡し、代わりに
    ${RES_ICON[ctx.resource]} <b>${RES_JP[ctx.resource]}</b>を1枚受け取ります。
    渡す商品は自分で選べます。</p>
    <div class="row">${btns}</div>`;
  return '';
}

function dlgWeddinggift(state, ui, d, p) {
  const to = state.players[state.awaiting?.context?.to ?? 0];
  const need = weddingGiftSize(state, HUMAN);
  const keys = [...RESOURCES, ...COMMODITIES];
  const have = (k) => (RESOURCES.includes(k) ? p.resources[k] : p.commodities[k]);
  const icon = (k) => RES_ICON[k] ?? COM_ICON[k];
  const label = (k) => RES_JP[k] ?? COM_JP[k];
  const sum = keys.reduce((x, k) => x + (d.counts[k] ?? 0), 0);
  const rows = keys.map(
    (r) => `<div class="drow">
      <span>${icon(r)} ${label(r)}(${have(r)})</span>
      <button data-act="wed-minus:${r}" ${(d.counts[r] ?? 0) > 0 ? '' : 'disabled'}>−</button>
      <b>${d.counts[r] ?? 0}</b>
      <button data-act="wed-plus:${r}" ${(d.counts[r] ?? 0) < have(r) && sum < need ? '' : 'disabled'}>+</button>
    </div>`,
  ).join('');
  return `<h3>💒 王家の婚礼(${sum}/${need}枚)</h3>
    <p><b>${to.name}</b>に贈る札を選んでください。渡すものは自分で決められます。</p>
    ${rows}
    <div class="row end">
      <button class="primary" data-act="wed-confirm" ${sum === need ? '' : 'disabled'}>贈る</button>
    </div>`;
  return '';
}

  // 豪商: 覗いた手札から奪う札を選ぶ(オンラインでは自分にだけ内訳が届いている)
function dlgMerchantpick(state, ui, d, p) {
  const ctx = state.awaiting?.context ?? {};
  const from = state.players[ctx.target ?? 0];
  const need = ctx.count ?? 0;
  const keys = [...RESOURCES, ...COMMODITIES];
  const have = (k) => (RESOURCES.includes(k) ? from.resources[k] : from.commodities[k]);
  const icon = (k) => RES_ICON[k] ?? COM_ICON[k];
  const label = (k) => RES_JP[k] ?? COM_JP[k];
  const sum = keys.reduce((x, k) => x + (d.counts[k] ?? 0), 0);
  const rows = keys.filter((k) => have(k) > 0).map(
    (r) => `<div class="drow">
      <span>${icon(r)} ${label(r)}(${have(r)})</span>
      <button data-act="mer-minus:${r}" ${(d.counts[r] ?? 0) > 0 ? '' : 'disabled'}>−</button>
      <b>${d.counts[r] ?? 0}</b>
      <button data-act="mer-plus:${r}" ${(d.counts[r] ?? 0) < have(r) && sum < need ? '' : 'disabled'}>+</button>
    </div>`,
  ).join('');
  return `<h3>👑 豪商(${sum}/${need}枚)</h3>
    <p><b>${from.name}</b>の手札です。ここから<b>${need}枚</b>選んで奪います。</p>
    ${rows}
    <div class="row end">
      <button class="primary" data-act="mer-confirm" ${sum === need ? '' : 'disabled'}>奪う</button>
    </div>`;
  return '';
}

  // スパイ: 覗いた進歩カードから奪う1枚を選ぶ
function dlgSpypick(state, ui, d, p) {
  const from = state.players[state.awaiting?.context?.target ?? 0];
  const btns = from.progressCards.map((c, i) => {
    const def = PROGRESS_CARDS[c.id];
    return `<button class="pick" data-act="spy-take:${i}" title="${def.desc}">
      <span class="picon">${def.icon}</span>${def.name}</button>`;
  }).join('');
  return `<h3>🕵️ スパイ</h3>
    <p><b>${from.name}</b>の進歩カードです。1枚選んで奪います
    (奪ったカードはこのターンには使えません)。</p>
    <div class="row">${btns}</div>`;
  return '';
}

function dlgSteal(state, ui, d, p) {
  const btns = d.targets.map((t) => {
    const tp = state.players[t];
    return `<button class="pick" data-act="steal:${t}" style="--pc:${PLAYER_COLORS[t]}">
      <span class="chip">${avatarSvg(t)}</span>${tp.name}<small>手札${totalCards(tp)}枚</small></button>`;
  }).join('');
  const head = d.pirate ? '🏴‍☠️ 海賊で誰から奪いますか?' : '🥷 誰から奪いますか?';
  return `<h3>${head}</h3><div class="row">${btns}</div>`;
  return '';
}

function dlgMonopoly(state, ui, d, p) {
  const btns = RESOURCES.map(
    (r) => `<button class="pick" data-act="mono:${r}"><span class="picon">${RES_ICON[r]}</span>${RES_JP[r]}</button>`,
  ).join('');
  return `<h3>🎩 独占する資源を選んでください</h3><div class="row">${btns}</div>
    <div class="row end"><button data-act="dialog-cancel">やめる</button></div>`;
  return '';
}

function dlgYop(state, ui, d, p) {
  const btns = RESOURCES.map((r) => {
    const n = d.picks.filter((x) => x === r).length;
    const ok = d.picks.length < 2 && state.bank.resources[r] > n;
    return `<button class="pick ${n ? 'sel' : ''}" data-act="yop:${r}" ${ok ? '' : 'disabled'}>
      <span class="picon">${RES_ICON[r]}</span>${RES_JP[r]}${n ? `<small>×${n}</small>` : ''}</button>`;
  }).join('');
  return `<h3>🧺 収穫: 資源を2つ選んでください(${d.picks.length}/2)</h3>
    <div class="row">${btns}</div>
    <div class="row end">
      <button class="primary" data-act="yop-confirm" ${d.picks.length === 2 ? '' : 'disabled'}>獲得</button>
      <button data-act="dialog-cancel">やめる</button>
    </div>`;
  return '';
}

function dlgSettings(state, ui, d, p) {
  const s = d.settings;
  const seg = (act, options, current) =>
    `<div class="seg ${options.length >= 4 ? 'seg-grid' : ''}">${options
      .map(([v, label]) => `<button class="${current === v ? 'sel' : ''}" data-act="${act}:${v}">${label}</button>`)
      .join('')}</div>`;
  return `<h3>⚙️ 設定</h3>
    <div class="srow"><span>表示</span>${seg('set-view', [['3d', '3D'], ['2d', '2D']], s.view)}</div>
    <div class="srow"><span>モード</span>${seg('set-mode', modeOptions(), s.mode)}</div>
    <div class="srow"><span>CPU</span>${seg('set-cpu', [['2', '2体'], ['3', '3体']], String(s.cpuCount))}</div>
    <div class="srow"><span>BGM</span>${seg('set-bgm', [['on', '🔊 オン'], ['off', '🔇 オフ']], s.bgm ? 'on' : 'off')}</div>
    <div class="srow"><span>効果音</span>${seg('set-sfx', [['on', '🔔 オン'], ['off', '🔕 オフ']], s.sfx ? 'on' : 'off')}</div>
    <div class="srow"><span>シード</span><input id="seed-input" inputmode="numeric" placeholder="空欄でランダム" value="${s.seed}"></div>
    <p>モード・CPU・シードは「新しいゲーム」開始時に反映されます</p>
    <div class="row end">
      <button data-act="rules-open">📖 あそびかた</button>
      <button data-act="goto-title">🏝 ゲームをやめてタイトルへ</button>
      <button class="primary" data-act="new-game">🔄 新しいゲーム</button>
      <button data-act="dialog-cancel">閉じる</button>
    </div>`;
  return '';
}

function dlgRules(state, ui, d, p) {
  return `<h3>📖 あそびかた</h3>
    ${rulesHtml(d.tab, { demo: false })}
    <div class="row end"><button class="primary" data-act="dialog-cancel">閉じる</button></div>`;
  return '';
}

  // 発展カード(基本モード)の説明。使えないときは理由を出す。
function dlgDevInfo(state, ui, d, p) {
  const card = p.devCards[d.index];
  if (!card) return '';
  const why = devPlayableWhy(state, card);
  return `<h3>${DEV_ICON[card.type]} ${DEV_JP[card.type]}</h3>
    <p>${DEV_DESC[card.type]}</p>
    ${why ? `<p><small>⏳ ${why}</small></p>` : ''}
    <div class="row end">
      <button class="primary" data-act="dev-use:${d.index}" ${why ? 'disabled' : ''}>✨ 使う</button>
      <button data-act="dialog-cancel">閉じる</button>
    </div>`;
  return '';
}

function dlgProgInfo(state, ui, d, p) {
  const card = p.progressCards[d.index];
  if (!card) return '';
  const def = PROGRESS_CARDS[card.id];
  const deckJp = { trade: '🧵 交易', politics: '🪙 政治', science: '📜 科学' };
  const playable = progressPlayable(state, card);
  const why = playable
    ? ''
    : card.boughtTurn >= state.turn
      ? '獲得したターンには使えません'
      : def.preRoll
        ? 'ロールの前にだけ使えます'
        : '自分の手番のロール後に使えます';
  return `<h3>${def.icon} ${def.name}</h3>
    <p><span class="badge">${deckJp[def.deck]}</span>${def.preRoll ? ' <span class="badge">ロール前</span>' : ''}</p>
    <p>${def.desc}</p>
    ${why ? `<p><small>⏳ ${why}</small></p>` : ''}
    <div class="row end">
      <button class="primary" data-act="prog-use:${d.index}" ${playable ? '' : 'disabled'}>✨ 使う</button>
      <button data-act="dialog-cancel">閉じる</button>
    </div>`;
  return '';
}

function dlgLog(state, ui, d, p) {
  return `<h3>📜 ログ</h3>
    <div class="logsheet">${state.log.slice(-80).map((l) => `<div>${l}</div>`).join('')}</div>
    <div class="row end"><button data-act="dialog-cancel">閉じる</button></div>`;
  return '';
}

function dlgWinner(state, ui, d, p) {
  const rows = state.players
    .map((pl) => ({ pl, pts: computePoints(state, pl.id, { includeHidden: true }) }))
    .sort((a, b) => b.pts - a.pts)
    .map(({ pl, pts }, i) => `<div class="wrow" style="--pc:${PLAYER_COLORS[pl.id]}">
      <span>${i === 0 ? '🏆' : `${i + 1}位`}</span><span class="chip">${avatarSvg(pl.id)}</span>
      <span class="pname">${pl.name}${
        pl.id === HUMAN && playerTitle ? `<span class="ptitle">〈${playerTitle}〉</span>` : ''
      }</span><b>${pts}点</b></div>`)
    .join('');
  // この対戦で新しく解除した実績があれば、順位表の下に出す。
  // 一度に何個も解除されることがあるので、並べるのは3つまで
  // (全部並べると「もう一度」ボタンが画面の外へ押し出される)。
  const all = (ui.unlocked ?? []).map(achievementById).filter(Boolean);
  const shown = all.slice(0, 3);
  const rest = all.length - shown.length;
  const got = shown
    .map((a) => `<div class="ach new"><span class="aicon">${a.icon}</span>
      <span><b>${a.name}</b><small>${a.desc}</small></span></div>`)
    .join('') + (rest > 0 ? `<div class="ach new"><span class="aicon">🎖</span>
      <span><b>ほか${rest}件</b><small>「🎖 実績」で確認できます</small></span></div>` : '');
  return `<h3 class="win-title">🏆 ${state.players[state.winner].name}の勝利!</h3>
    ${rows}
    ${got ? `<p class="ach-head">🎉 実績を解除しました</p>${got}` : ''}
    <div class="row end">
      <button data-act="goto-records:${all.length ? 'ach' : 'stats'}">
        ${all.length ? '🎖 実績' : '📊 戦績'}</button>
      <button data-act="new-game">もう一度</button>
      <button class="primary" data-act="goto-title">タイトルへ</button>
    </div>`;
  return '';
}

// 進歩カードのパラメータ選択に共通の前置き(カード名は index から引く)
function progCtx(state, d, p) {
  const card = p.progressCards[d.index];
  const def = card ? PROGRESS_CARDS[card.id] : null;
  if (!def) return null;
  const head = `<h3>${def.icon} ${def.name}</h3><p>${def.desc}</p>`;
  const cancel = '<button data-act="dialog-cancel">やめる</button>';
  const progValid = (params) =>
    validateAction(state, { type: 'PLAY_PROGRESS_CARD', player: HUMAN, index: d.index, params });

  return { card, def, head, cancel, progValid };
}

function dlgProgCommodity(state, ui, d, p) {
  const ctx = progCtx(state, d, p);
  if (!ctx) return '';
  const { card, head, cancel, progValid } = ctx;
  const btns = COMMODITIES.map(
    (c) => `<button class="pick" data-act="pc:${c}" ${progValid({ commodity: c }) ? 'disabled' : ''}>
      <span class="picon">${COM_ICON[c]}</span>${COM_JP[c]}</button>`,
  ).join('');
  return `${head}<div class="row">${btns}</div><div class="row end">${cancel}</div>`;
  return '';
}

function dlgProgResource(state, ui, d, p) {
  const ctx = progCtx(state, d, p);
  if (!ctx) return '';
  const { card, head, cancel, progValid } = ctx;
  const btns = RESOURCES.map(
    (r) => `<button class="pick" data-act="pres:${r}" ${progValid({ resource: r }) ? 'disabled' : ''}>
      <span class="picon">${RES_ICON[r]}</span>${RES_JP[r]}</button>`,
  ).join('');
  return `${head}<div class="row">${btns}</div><div class="row end">${cancel}</div>`;
  return '';
}

function dlgProgCardkey(state, ui, d, p) {
  const ctx = progCtx(state, d, p);
  if (!ctx) return '';
  const { card, head, cancel, progValid } = ctx;
  const keys = [...RESOURCES, ...COMMODITIES];
  const btns = keys.map(
    (k) => `<button class="pick" data-act="pkey:${k}" ${progValid({ key: k }) ? 'disabled' : ''}>
      <span class="picon">${RES_ICON[k] ?? COM_ICON[k]}</span>${RES_JP[k] ?? COM_JP[k]}</button>`,
  ).join('');
  return `${head}<div class="row">${btns}</div><div class="row end">${cancel}</div>`;
  return '';
}

function dlgProgPlayer(state, ui, d, p) {
  const ctx = progCtx(state, d, p);
  if (!ctx) return '';
  const { card, head, cancel, progValid } = ctx;
  // スパイが見るのは進歩カードの枚数、それ以外は手札の枚数
  const count = (o) =>
    card?.id === 'spy' ? `進歩${o.progressCards.length}枚` : `${totalCards(o)}枚`;
  const btns = state.players
    .filter((o) => o.id !== HUMAN)
    .map((o) => {
      const err = progValid({ target: o.id });
      return `<button class="pick" data-act="pplayer:${o.id}" style="--pc:${PLAYER_COLORS[o.id]}"
        ${err ? 'disabled' : ''} title="${err ?? ''}">
        <span class="chip">${avatarSvg(o.id)}</span>${o.name}<small>${count(o)}</small></button>`;
    })
    .join('');
  return `${head}<div class="row">${btns}</div><div class="row end">${cancel}</div>`;
  return '';
}

function dlgProgDice(state, ui, d, p) {
  const ctx = progCtx(state, d, p);
  if (!ctx) return '';
  const { card, head, cancel, progValid } = ctx;
  const dieRow = (act, sel, cls) => [1, 2, 3, 4, 5, 6]
    .map((n) => `<button class="pick ${cls} ${sel === n ? 'sel' : ''}" data-act="${act}:${n}">${n}</button>`)
    .join('');
  return `${head}
    <p>🔴 赤ダイス(小さいほど進歩カードが出やすい)</p><div class="row">${dieRow('pdice-r', d.red, 'die-red')}</div>
    <p>🟡 黄ダイス</p><div class="row">${dieRow('pdice-y', d.yellow, 'die-yellow')}</div>
    <div class="row end">
      <button class="primary" data-act="pdice-confirm" ${d.red && d.yellow ? '' : 'disabled'}>この出目にする</button>
      ${cancel}
    </div>`;
  return '';
}

// 型 → 中身を作る関数。**ここが唯一の出どころ。**
export const DIALOGS = {
  'dev-info': dlgDevInfo,
  'prog-cardkey': dlgProgCardkey,
  'prog-commodity': dlgProgCommodity,
  'prog-dice': dlgProgDice,
  'prog-info': dlgProgInfo,
  'prog-player': dlgProgPlayer,
  'prog-resource': dlgProgResource,
  aqueduct: dlgAqueduct,
  defenderDeck: dlgDefenderdeck,
  dicelog: (state) => diceLogHtml(state),
  diplomat: dlgDiplomat,
  discard: dlgDiscard,
  fish: dlgFish,
  gold: dlgGold,
  harborGive: dlgHarborgive,
  improve: dlgImprove,
  knight: dlgKnight,
  log: dlgLog,
  merchantPick: dlgMerchantpick,
  monopoly: dlgMonopoly,
  progressLimit: dlgProgresslimit,
  rules: dlgRules,
  settings: dlgSettings,
  spyPick: dlgSpypick,
  steal: dlgSteal,
  trade: dlgTrade,
  tradeChoose: dlgTradechoose,
  tradeOffer: dlgTradeoffer,
  weddingGift: dlgWeddinggift,
  winner: dlgWinner,
  yop: dlgYop,
};

export function dialogHtml(state, ui) {
  const d = ui.dialog;
  if (!d) return '';
  const make = DIALOGS[d.type];
  if (!make) return '';
  return make(state, ui, d, state.players[HUMAN]);
}
