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
    looks: [
      { name: 'きの色', wood: 0x8a5a32, leg: 0x4a3a24 },
      { name: '白木', wood: 0xdccdb4, leg: 0x9c8e77 },
      { name: '石', wood: 0x9aa0a6, leg: 0x6f757b },
    ],
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
    looks: [
      { name: '石', stone: 0x9aa0a6, fire: 0xffe9b0 },
      { name: '苔むし', stone: 0x7d8a72, fire: 0xffe9b0 },
      { name: '青い火', stone: 0x9aa0a6, fire: 0xc6e6ff },
    ],
  },
  {
    id: 'flag',
    name: '島の旗',
    icon: '🚩',
    price: 160,
    desc: '高い旗。遠くからでも自分の置いた場所が分かります。',
    r: sc(0.12),
    h: sc(1.0),
    looks: [
      { name: 'あか', cloth: 0xe2604a },
      { name: 'あお', cloth: 0x4a7fe2 },
      { name: 'みどり', cloth: 0x4fa36a },
      { name: 'きいろ', cloth: 0xecc23f },
      { name: 'しろ', cloth: 0xf2f0ea },
    ],
  },
  {
    id: 'planter',
    name: '花壇',
    icon: '🌻',
    price: 140,
    desc: '花を植えた木の箱。植える花を選べます。',
    r: sc(0.22),
    h: sc(0.22),
    looks: [
      { name: 'よせ植え', flowers: [0xff9ec4, 0xffd97d, 0xb08ee8] },
      { name: 'チューリップ', flowers: [0xe2503f, 0xf2a03d, 0xe2503f] },
      { name: 'ひまわり', flowers: [0xffc83d, 0xffc83d, 0xffc83d], stem: 0x5c9447 },
      { name: 'ラベンダー', flowers: [0x9b7fd4, 0xb79ae0, 0x8a6fc4] },
      { name: 'しろつめくさ', flowers: [0xf7f4ec, 0xf7f4ec, 0xf7f4ec], stem: 0x6fae5a },
    ],
  },
  // ---- ここから、あとで足したもの ----
  //
  // **高さと役どころをばらけさせる。** はじめの4つは 0.22〜1.0 の
  // 「置物」ばかりで、並べても同じ景色にしかならなかった。
  // 低くて丸いもの・見上げる目印・火のもの・動くものを混ぜる。
  {
    id: 'shroom',
    name: '大きなキノコ',
    icon: '🍄',
    price: 130,
    desc: '見上げるほどではない、大きなキノコ。低いので景色を塞ぎません。',
    r: sc(0.2),
    h: sc(0.36),
    looks: [
      { name: 'あか', cap: 0xd6503f, dot: 0xfdf4e6 },
      { name: 'きつね色', cap: 0xc98b45, dot: 0xf0e0c4 },
      { name: 'あお', cap: 0x4f8fb5, dot: 0xeaf6ff },
      { name: 'むらさき', cap: 0x8a6bb0, dot: 0xf2e9ff },
    ],
  },
  {
    id: 'fire',
    name: 'たき火',
    icon: '🔥',
    price: 220,
    desc: '石で囲んだたき火。夜になると燃えて、島を明るくします。',
    r: sc(0.24),
    h: sc(0.32),
    night: true,        // 夜に光る。**島の明るさにも数える**(lampGlow)
  },
  {
    id: 'well',
    name: '井戸',
    icon: '⛲',
    price: 240,
    desc: '石積みの井戸。屋根とつるべが付いています。',
    r: sc(0.26),
    h: sc(0.66),
  },
  {
    id: 'statue',
    name: '石像',
    icon: '🗿',
    price: 260,
    desc: '島に古くからある形の石像。並べると参道のようになります。',
    r: sc(0.18),
    h: sc(0.72),
  },
  {
    id: 'koi',
    name: 'こいのぼり',
    icon: '🎏',
    price: 190,
    desc: '竿に吊るした吹き流し。風になびいて揺れます。',
    r: sc(0.12),
    h: sc(1.05),
  },
  {
    id: 'torii',
    name: '鳥居',
    icon: '⛩️',
    price: 300,
    desc: 'いちばん高い目印。島のどこからでも見つけられます。',
    r: sc(0.3),
    h: sc(1.2),
    looks: [
      { name: '朱', paint: 0xc4432f, beam: 0x2c211c },
      { name: '石', paint: 0x9aa0a6, beam: 0x6b7278 },
      { name: '木', paint: 0x8a5a32, beam: 0x4a3a24 },
    ],
  },
  // ---- さらに足したもの ----
  //
  // ここでも**まだ無かった役どころ**を埋める。10種類そろえたあとに
  // 足りなかったのは「幅があって低いもの(並べて囲める)」「ごく小さいもの」
  // 「大きく動くもの」「木」── どれも1つも無かった。
  {
    id: 'shell',
    name: '貝がら',
    icon: '🐚',
    price: 100,
    desc: 'ごく小さな飾り。浜や道ばたに散らすと、島に人の気配が出ます。',
    r: sc(0.13),
    h: sc(0.14),
  },
  {
    id: 'fence',
    name: '丸太の柵',
    icon: '🪵',
    price: 110,
    desc: '低くて幅のある柵。並べて道を作ったり、庭を囲ったりできます。',
    r: sc(0.42),        // **幅のある飾りは、ここも広く取る**(見た目と揃える)
    h: sc(0.34),
    looks: [
      { name: '丸太', wood: 0x8a5a32, post: 0x4a3a24 },
      { name: '白い柵', wood: 0xf2efe6, post: 0xd8d0c0 },
      { name: '黒い柵', wood: 0x3c4149, post: 0x23272c },
    ],
  },
  {
    id: 'anchor',
    name: '錨',
    icon: '⚓',
    price: 210,
    desc: '浜に立てかけた古い錨。港のそばに置くと似合います。',
    r: sc(0.2),
    h: sc(0.5),
  },
  {
    id: 'sakura',
    name: '桜の木',
    icon: '🌸',
    price: 280,
    desc: '花をつけた木。島の緑のなかで、ここだけ色が変わります。',
    r: sc(0.26),
    h: sc(1.1),
    looks: [
      { name: 'さくら', bloom: 0xf3a9c4 },
      { name: 'しらゆき', bloom: 0xf7f2ea },
      { name: 'もみじ', bloom: 0xd4643a },
      { name: 'わかば', bloom: 0x7ec06a },
    ],
  },
  {
    id: 'mill',
    name: '風車',
    icon: '🌬',
    price: 320,
    desc: '羽根の回る風車。遠くからでも動いているのが分かります。',
    r: sc(0.3),
    h: sc(1.35),
  },
  {
    id: 'beacon',
    name: '灯台',
    icon: '🗼',
    price: 400,
    desc: '島でいちばん高い建物。夜は明かりが回ります。',
    r: sc(0.28),
    h: sc(1.7),
    night: true,        // 夜に光る。島の明るさにも数える
    looks: [
      { name: '紅白', band: 0xc4432f },
      { name: '青白', band: 0x3f6fae },
      { name: '黒白', band: 0x394048 },
    ],
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

// ---- 柄(同じ品の、色ちがい)----
//
// **品を増やさずに種類を増やす。** 花壇を5色ぶん店に並べると、棚がそれだけ
// 5行に伸びる(16品で画面2.6枚あるところへ、さらに)。買うのは「花壇」1つで、
// **置くときに柄を選ぶ** ── 下見の帯に「柄」を足してあるので、遠さ・横・
// 向きと同じ手つきで変えられるし、1つ買えば全部の柄を置ける。
//
// 柄そのもの(色)は**この表が持つ**。decor-fx.js は THREE を使っていて
// テストから読めないので、色まであちらに置くと、柄を足したのに
// 出ない/名前だけ増えた、が検査できない。
//
// 保存と通信には `v`(柄の番号)で乗る。**0 のときは書かない** ──
// 古い保存と同じ形のままで、名簿も太らない。

export function looksOf(id) {
  const l = DECOR_BY_ID[id]?.looks;
  return Array.isArray(l) && l.length ? l : null;
}

export function lookCount(id) {
  return looksOf(id)?.length ?? 1;
}

// 番号を正す。知らない品・範囲の外・数でないものは 0(はじめの柄)
export function cleanLook(id, v) {
  const n = lookCount(id);
  const i = Math.trunc(Number(v));
  return Number.isFinite(i) && i > 0 && i < n ? i : 0;
}

export function lookOf(id, v) {
  return looksOf(id)?.[cleanLook(id, v)] ?? null;
}

export function lookName(id, v) {
  return lookOf(id, v)?.name ?? '';
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
  // 掲示板は広場のとなりのヘックスの中心に立っている(店と同じ置きかた。
  // ground.js の boardPoint)。**広場の判定だけでは届かない** ──
  // 広場から 1.73 離れているので、広場を避けるだけでは板の前に置けてしまう。
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

// ---- 石灯籠と夜の明るさ ----
//
// **島を育てると夜が明ける。** はじめの夜は暗く、石灯籠を置いていくほど
// 島ぜんぶが明るくなる。灯籠1つ1つが自分のまわりを照らす代わりに、
// **島全体の底上げ**という形にしてある ── 携帯で点光源を十数個ともすと
// そのぶん重いし、「島が明るくなっていく」という手ざわりはこちらのほうが近い。
//
// この数で満ちる。8つ = 1600枚で、ひと晩の島がすっかり明るくなる勘定。
// 1つめから目に見えて効くように、上限までは**まっすぐ**上げる
// (先細りにすると、1つめが効いて8つめが効かない ── 集める気が失せる)。
export const LAMP_FULL = 8;

// 置いてある飾りから、夜の明るさ(0〜1)を出す。
//
// **数えるのは火のともる飾りだけ**(表の `night`)。ベンチや石像を
// いくつ並べても夜は明るくならない。
//
// **id で名指ししない。** はじめ `id === 'lamp'` と書いていたら、
// たき火を足したときに「燃えているのに島が暗いまま」になった ──
// 光るかどうかは表が持っている。
export function lampGlow(placed) {
  let n = 0;
  for (const d of placed ?? []) if (DECOR_BY_ID[d?.id]?.night) n += 1;
  return Math.min(1, n / LAMP_FULL);
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
