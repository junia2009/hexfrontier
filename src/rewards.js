// 島の銀貨 🪙 ── ミニゲームの報酬(設計書 §12)
//
// 実績が「一度きりの勲章」なのに対して、銀貨は**遊ぶたびに貯まる**。
// 使い道は別に作り込むので、ここは「いくら手に入るか」だけを決める。
//
// **ここが唯一の出どころ。** 遊びごとに呼び出し側で計算すると、
// あとで economy を調整するときに全部の呼び出し元を探すことになる。
//
// 全て純粋関数。progress も state も触らない ── 数を返すだけ。

import { FISH_BY_ID, sizeRatio } from './minigame/fish.js';
import { marketRate } from './market.js';

export const COIN_ICON = '🪙';
export const COIN_JP = '島の銀貨';

// ---- 配分の根拠 ----
//
// 遊びの長さと score の天井が揃っていないので、そのまま係数を掛けると
// 「短い遊びを回し続けるのがいちばん儲かる」になる。1回の上出来な回が
// **どれも 50〜60 枚前後**に収まるように、天井から逆算した:
//
//   つり大会   180秒  score=cm      天井 700   良い回 150cm → 22
//   ドラゴン    90秒  score=生存秒  天井  90   逃げきり   → 27
//   丸太乗り    90秒  score=秒      天井  90   完走       → 27
//   蛮族を射る 120秒  score=点      天井 732   良い回 200 → 20
//   大富豪     可変   score=卓の人数 天井 5    5人卓      → 30
//
// ここに参加賞と優勝賞を足すと、どれも上出来で 50〜60 枚。
// 生存ゲーム(ドラゴン・丸太)は1分あたりが高く見えるが、勝てるのは
// 1人だけなので期待値では釣りと並ぶ。
//
// **これは使い道が無い状態での初期値。** 何が買えるかを決めたら、
// そのときの物価に合わせて調整する前提の数字。

export const ENTRY_COIN = 8;   // 出れば必ずもらえる(見ていただけの回は付かない)
export const WIN_COIN = 20;    // 優勝の上乗せ

// 出来高の係数。score の単位が遊びごとに違うので、遊びごとに持つ
export const RATE = {
  fishing: 0.15,     // cm あたり
  dragonhunt: 0.30,  // 生存1秒あたり
  logroll: 0.30,     // 1秒あたり
  raid: 0.10,        // 1点あたり
  daifugo: 8,        // 「抜いた人数」ひとりあたり(下の RANK_KINDS を参照)
};

// **順位で払う遊び。**
//
// ほかの遊びは score が連続値(cm・秒・点)なので、上手いほど自然に増える。
// 大富豪だけは score が「1位のときだけ卓の人数、それ以外は 0」で、
// 5人卓の2位が最下位と同じ額になってしまう ── 大富豪で2位は健闘なのに。
//
// score は実績の記録(いちばん大きい卓で大富豪)に使うので触らない。
// **報酬だけ**を順位から作る: 抜いた人数 = 卓の人数 − 順位。
// 5人卓なら 1位=4・2位=3 … 最下位=0。
export const RANK_KINDS = new Set(['daifugo']);

// 魚の等級ごとの値。**大きさで倍まで伸びる**(その種の最大なら2倍)ので、
// 同じ等級でも「大物を狙う」動機が残る。
export const TIER_COIN = {
  junk: 1, common: 4, rare: 15, legend: 45, myth: 120,
};

const clean = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

// ---- 港で1匹釣った ----
//
// 長ぐつでも1枚は出る。0 にすると「釣れたのに何も起きない」になって、
// ガラクタを引いたときの手応えが完全に消える。
export function coinsForCatch(fishId, cm) {
  const fish = FISH_BY_ID[fishId];
  if (!fish) return 0;
  const base = TIER_COIN[fish.tier] ?? 0;
  if (!base) return 0;
  return Math.max(1, Math.round(base * (1 + sizeRatio(fish, clean(cm)))));
}

// ---- その日の値で売る ----
//
// 素の値(coinsForCatch)に、その日のその魚の倍率を掛けたもの。
// **釣った瞬間の額はこちらを使う**(progress.js の addCatch)。
//
// 素の値のほうも残してある。さかのぼりの換算(下の coinsForPastCatches)は
// 「いつアプリを開いたか」で変わってはいけないので、相場を掛けない。
//
// ガラクタが相場に乗らないのは market.js 側の決めごと(倍率が必ず 1.0)。
// **1枚は必ず出す** ── 安値の日に「釣れたのに 0 枚」にはしない。
export function coinsForSale(fishId, cm, now = Date.now()) {
  const base = coinsForCatch(fishId, cm);
  if (!base) return 0;
  return Math.max(1, Math.round(base * marketRate(fishId, now)));
}

// ---- 大会に出た ----
//
// entered が false(見ていただけ)なら 0。参加賞は「出た」ことに対して
// 払うので、点が取れなくても付く ── 0 にすると、勝てない遊びを
// 誰も触らなくなる。
export function coinsForContest(
  { kind, entered = true, won = false, score = 0, place = 0, players = 0 } = {},
) {
  if (!entered) return 0;
  const rate = RATE[kind];
  if (rate == null) return 0;   // 知らない遊びには払わない
  const basis = RANK_KINDS.has(kind) ? beaten(place, players) : clean(score);
  return ENTRY_COIN + Math.round(rate * basis) + (won ? WIN_COIN : 0);
}

// 抜いた人数。順位が分からなければ 0(参加賞だけになる)。
// 卓の人数が分からない場合は n=0 なので n - pl が負になり、下の max が 0 に倒す
// ── ここを `!n` でも弾いていたが、到達しない行だったので置かない。
function beaten(place, players) {
  const pl = Math.floor(clean(place));
  if (!pl) return 0;
  return Math.max(0, Math.floor(clean(players)) - pl);
}

// ---- ひとりで櫓に立った(蛮族を射る)----
//
// 大会と違って相手がいないぶん、1点あたりを少し下げ、参加賞も付けない。
// 同じ的を延々と射て稼ぐのがいちばん楽、という形にはしたくない。
export const SOLO_RAID_RATE = 0.08;

export function coinsForRaidRun({ score = 0, shots = 0 } = {}) {
  if (!clean(shots)) return 0;   // 1本も射たずにおろした回は払わない
  return Math.round(SOLO_RAID_RATE * clean(score));
}

// ---- 島で見つけたもの ----
//
// 一度きりの発見。noteSeen が二度目を弾くので、ここでは額だけ持つ。
export const FOUND_COIN = { nest: 60 };

export function coinsForFound(id) {
  return FOUND_COIN[id] ?? 0;
}

// ---- 過去の釣果の換算(移行のとき一度だけ)----
//
// **1匹ずつの大きさは残っていない。** 保存にあるのは種ごとの
// { n: 釣った数, best: 自己最高 } だけなので、完全な再現はできない。
//
// 近似: 自己最高の1匹はその大きさで数え、残りの (n-1) 匹は
// **その種のまん中の大きさ**で数える。釣った数だけ分かっていて
// 大きさが分からないとき、まん中を置くのがいちばん偏りが小さい。
// 実際より多くも少なくもなりうるが、どちらかに倒れ続けることはない。
export function coinsForPastCatches(fishBook) {
  if (!fishBook || typeof fishBook !== 'object') return 0;
  let total = 0;
  for (const [id, rec] of Object.entries(fishBook)) {
    const fish = FISH_BY_ID[id];
    if (!fish || !rec) continue;
    const n = Math.floor(clean(rec.n));
    if (!n) continue;
    const mid = (fish.cm[0] + fish.cm[1]) / 2;
    total += coinsForCatch(id, rec.best ?? mid);          // 自己最高の1匹
    total += (n - 1) * coinsForCatch(id, mid);            // 残りはまん中で
  }
  return total;
}
