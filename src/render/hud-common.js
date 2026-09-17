// HUD とダイアログが共有する小物。
//
// **なぜ別ファイルか。** ダイアログ(dialogs.js)と HUD 本体(hud-render.js)の
// 両方が同じ表と判定を使う。どちらかに置くと互いを import し合って循環するので、
// 共有するものだけをここに置く。
//
// HUMAN と playerTitle は可変。ES モジュールのライブバインディングで配るので、
// setHumanSeat を呼べば import している側の値も一緒に変わる。

import { PROGRESS_CARDS } from '../rules/cak/progress-cards.js';

// 人間プレイヤーの席。オンラインでは自分の席が 0 とは限らない
export let HUMAN = 0;
export function setHumanSeat(seat) {
  HUMAN = seat;
}

// 自分が名乗っている称号。progress は render の管轄外なので main.js から渡す
export let playerTitle = null;
export function setPlayerTitle(t) {
  playerTitle = t || null;
}

export const RES_ICON = { wood: '🪵', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '🪨' };
export const COM_ICON = { cloth: '🧵', coin: '🪙', paper: '📜' };
export const DEV_ICON = { knight: '⚔️', roadBuilding: '🛤️', yearOfPlenty: '🧺', monopoly: '🎩', vp: '⭐' };
export const TRACK_ICON = { trade: '🧵', politics: '🪙', science: '📜' };

// 出目まわり。棒グラフ(ダイアログ)とダイス行(HUD)の両方が数える
export const DICE_TOTALS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export function diceCountOf(state, n) {
  return state.diceCounts?.[n] ?? 0;
}

export function rollTotal(state) {
  return DICE_TOTALS.reduce((s, n) => s + diceCountOf(state, n), 0);
}

export const DEV_DESC = {
  knight: '盗賊を好きなヘックスへ動かし、隣接する相手から資源を1枚奪います。3枚使うと最大騎士力(+2点)。',
  roadBuilding: '道を2本まで無料で建設します。使うと盤面が光るので、建てたい辺をタップして選びます。',
  yearOfPlenty: '銀行から好きな資源を2枚もらいます。',
  monopoly: '資源を1種類選び、全員の手札からその資源を全て奪います。',
  vp: '持っているだけで+1点。使うカードではありません(得点は自動で入ります)。',
};

// 発展カードが「今」使えない理由(使えるなら null)
export function devPlayableWhy(state, card) {
  if (card.type === 'vp') return '勝利点カードは使いません(持っているだけで+1点)';
  if (state.phase !== 'main' || state.currentPlayer !== HUMAN || state.awaiting) {
    return '自分の手番に使えます';
  }
  if (card.boughtTurn >= state.turn) return '購入したターンには使えません';
  if (state.turnFlags.playedDev) return 'このターンはすでに発展カードを使いました';
  if (card.type !== 'knight' && !state.turnFlags.rolled) return 'ダイスを振ったあとに使えます';
  return null;
}

// 進歩カードが「今」使えるか(手番・タイミング・獲得ターン)
export function progressPlayable(state, card) {
  const def = PROGRESS_CARDS[card.id];
  const isMyTurn =
    state.phase === 'main' && state.currentPlayer === HUMAN && !state.awaiting;
  const timing = def.preRoll ? !state.turnFlags.rolled : state.turnFlags.rolled;
  return isMyTurn && timing && card.boughtTurn < state.turn;
}
