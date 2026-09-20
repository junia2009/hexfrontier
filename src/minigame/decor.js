// 島の飾り ── 買って、島に置くもの(設計書 §12)。
//
// **これだけは1つ買うと1つ置ける**(かぶりものや道具と違って「もう持って
// います」が無い)。ベンチを3つ置きたければ3つ買う ── **終わりのある
// 使い道ではなく、いくらでも続く使い道**にするため。道具もかぶりものも
// 買い切ればそれきりだが、飾りは置きたいだけ買える。
//
// THREE を使わない。メッシュは decor-fx.js がこの表を読んで組み立てる
// (species.js / hats.js と body.js の関係と同じ)。
//
// **置き場所は盤の座標で持つ。** ヘックスの並びは島の種類ごとに同じで、
// 変わるのは地形と数字だけなので、同じ島の種類なら別の種の島へ行っても
// 同じ場所に置ける ── 種は遊ぶたびに変わる(main.js の startWalk)ので、
// 種ごとに覚えていたら二度と見られない。
// 航海者たちの島だけは海の位置が種で変わるので、**陸でなくなった飾りは
// 出さない**(消しはしない。次に陸の島へ行けばまた出る)。

import { s as sc } from './scale.js';
import { hexCenter, tokenRadius } from '../terrain.js';
import {
  BOARD_RADIUS, BOARD_REACH, DESK_CLEAR, SPAWN_RING, SPOT_RADIUS, TABLE_CLEAR,
  POST_RADIUS, boardPoint, fishingSpots, makeGround, nestPoint, shopPoint,
  spawnPoint, watchPost,
} from './ground.js';

export const DECOR = [
  {
    id: 'bench',
    name: 'ベンチ',
    icon: '🪑',
    price: 120,
    desc: '木のベンチ。島のすきな場所に置けます。',
    r: sc(0.26),        // ぶつかる太さ
    h: sc(0.3),         // 高さ(これより高く跳べば越えられる)
  },
  {
    id: 'lamp',
    name: '石灯籠',
    icon: '🏮',
    price: 200,
    desc: '石の灯籠。夜になると明かりがともります。',
    r: sc(0.16),
    h: sc(0.62),
    night: true,        // 夜に光る(decor-fx.js)
  },
  {
    id: 'flag',
    name: '島の旗',
    icon: '🚩',
    price: 160,
    desc: '高い旗。遠くからでも自分の置いた場所が分かります。',
    r: sc(0.12),
    h: sc(1.0),
  },
  {
    id: 'planter',
    name: '花壇',
    icon: '🌻',
    price: 140,
    desc: '花を植えた木の箱。',
    r: sc(0.22),
    h: sc(0.22),
  },
];

export const DECOR_BY_ID = Object.fromEntries(DECOR.map((d) => [d.id, d]));
export const DECOR_IDS = DECOR.map((d) => d.id);

// 1つの島に置ける数と、1種類あたりの持てる数。
// **上限を置くのは通信のため** ── 散策部屋では自分の置いたものを名簿に
// 乗せて配るので、際限なく増えると1人ぶんの名簿が重くなる。
export const DECOR_MAX = 16;      // 1つの島に置ける合計
export const STOCK_MAX = 12;      // 1種類あたり、持てる数(置いたぶんは含まない)

// 飾りどうしの間隔。近すぎると重なって1つに見える
export const DECOR_GAP = sc(0.34);

export function cleanDecorId(id) {
  return typeof id === 'string' && DECOR_BY_ID[id] ? id : null;
}

// 置いてよい場所か。置けるなら null、置けないなら日本語の理由を返す。
//
// **邪魔になる場所を断る。** 受付・店・掲示板・櫓・釣り場・竜の巣は
// 「そこへ行って何かする」場所なので、飾りで塞ぐと遊べなくなる。
// 降り立つ輪も空けておく ── 島に降りた人がベンチに埋まる。
export function whyCannotPlace(state, at, placed = []) {
  if (!state?.board || !at) return '置けません';
  const ground = makeGround(state);
  const g = ground(at.x, at.z);
  if (!g.ok) return '海には置けません';
  if (placed.length >= DECOR_MAX) return `1つの島には${DECOR_MAX}個まで`;

  const home = spawnPoint(state);
  const near = (x, z, r) => Math.hypot(at.x - x, at.z - z) < r;
  // 受付(円卓)の広場と、降り立つ輪
  const plaza = state.mode === 'base' ? TABLE_CLEAR : DESK_CLEAR;
  if (near(home.x, home.y, Math.max(plaza, SPAWN_RING) + DECOR_GAP)) {
    return '受付の広場には置けません';
  }
  const shop = shopPoint(state);
  if (shop && near(shop.x, shop.z, sc(0.9))) return '店の前には置けません';
  // 掲示板は広場のふちに立っている(ground.js の BOARD_AWAY)。
  // **広場の判定だけでは届かない** ── 卓の島でも広場 0.675 + 間隔 0.17 で
  // ちょうど 0.845、掲示板は 0.85 なので、すり抜けて板の前に置けてしまう。
  const board = boardPoint(state);
  if (board && near(board.x, board.z, BOARD_RADIUS + DECOR_GAP + BOARD_REACH)) {
    return '掲示板の前には置けません';
  }
  const post = watchPost(state);
  if (post && near(post.x, post.z, POST_RADIUS + DECOR_GAP)) return '射場には置けません';
  const nest = nestPoint(state);
  if (nest && near(nest.x, nest.y, sc(1.2))) return '竜の巣には置けません';
  for (const s of fishingSpots(state)) {
    if (near(s.x, s.z, SPOT_RADIUS + DECOR_GAP)) return '釣り場には置けません';
  }
  // **数字トークンの円盤の上には置かない。** 置けてしまうと、盤の数字の
  // 真上にベンチが乗って「島」ではなく「ボードゲームの駒」に見える
  // (実機で灯籠が円盤のまん中に載った)。円盤は陸のヘックスの中心にある。
  const tr = tokenRadius(state.board);
  for (const hid of state.board.hexIds) {
    if (!state.board.hexes?.[hid]?.token) continue;
    const c = hexCenter(hid);
    if (near(c.x, c.y, tr + DECOR_GAP * 0.5)) return '数字の円盤の上には置けません';
  }
  for (const d of placed) {
    if (near(d.x, d.z, DECOR_GAP)) return 'すぐそばに別の飾りがあります';
  }
  return null;
}

// その島で実際に出す飾り。**陸でなくなったものは出さない**
// (航海者たちの島は種によって海の位置が変わる)。消しはしない。
export function visibleDecor(state, placed = []) {
  if (!state?.board) return [];
  const ground = makeGround(state);
  return placed.filter((d) => DECOR_BY_ID[d.id] && ground(d.x, d.z).ok);
}

// 拾える距離。飾りの太さ + 手の届く長さ
export const DECOR_REACH = sc(0.5);

// いま立っている場所からいちばん近い飾り(手の届く範囲にあるものだけ)。
export function decorNear(placed, at) {
  let best = null;
  for (const d of placed ?? []) {
    const item = DECOR_BY_ID[d.id];
    if (!item) continue;
    const dist = Math.hypot(d.x - at.x, d.z - at.z);
    if (dist > item.r + DECOR_REACH) continue;
    if (!best || dist < best.dist) best = { ...d, dist };
  }
  return best;
}

// 置く場所。**足もとではなく少し前**に置く ── 足もとだと、置いた瞬間に
// 自分がその中に立っていることになる(押し出されて飛ぶ)。
export const PLACE_AHEAD = sc(0.62);

export function placeSpot(at) {
  return {
    x: at.x + Math.sin(at.facing) * PLACE_AHEAD,
    z: at.z + Math.cos(at.facing) * PLACE_AHEAD,
    // 置いたものは自分のほうを向く(ベンチの座面がこちらを向く)
    facing: at.facing + Math.PI,
  };
}
