// 飾りを置く前の「下見」。**どこへ・どちら向きに置くかを、置く前に決める。**
//
// THREE も DOM も知らない(位置と向きの計算だけ)ので、テストから直接読める。
// 実物の半透明の見本は walk-mode.js が出す。
//
// **前は一点しか選べなかった。** placeSpot が「足もとの 0.62 前、自分のほうを
// 向けて」を返すだけで、遠さも向きも動かせない ── 並べようとすると、
// 自分が立ち位置を細かく踏み直すしかなかった(「物設置をもっと接点細かく
// 選べるようにしたい」)。
//
// 下見のあいだに動かせるのは2つ:
//   - **遠さ**(自分の正面にどれだけ離すか)…… 近い/遠い を押して刻む
//   - **向き**(飾りそのものの回転)………………… ◀/▶ を押して刻む
// 歩けば見本もついてくるので、**大まかには足で、細かくはボタンで**決まる。

import { s as sc } from './scale.js';
import { PLACE_AHEAD } from './decor.js';

// 遠さの帯。近すぎると置いた瞬間に自分が中にいて押し出され、
// 遠すぎると手の届かないところに物を生やすことになる。
export const NEAR_MIN = sc(0.36);
export const NEAR_MAX = sc(1.1);
// 1回ぶんの刻み。**細かさはここ。**
// **いちばん細い飾り(島の旗 r = 0.06)より細かくすること** ── 刻みが
// 飾りの太さと同じだと、並べたときに隣との間隔を合わせられない。
// はじめ sc(0.12) にしていたら旗の太さとちょうど同じで、テストが落ちた。
export const NEAR_STEP = sc(0.06);

// 向きの刻み。15度(ひとまわり24通り)。これより細かくすると、
// 押した回数と見た目が結びつかなくなる
export const TURN_STEP = Math.PI / 12;
export const TURN_STEPS = Math.round((Math.PI * 2) / TURN_STEP);

// 下見のはじまり。**遠さも向きも、今までと同じ置き場所から始める** ──
// 何も触らずに「置く」を押した人には、今までとまったく同じ場所に置かれる。
export function newAim(id) {
  return { id, away: PLACE_AHEAD, turn: 0 };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 遠さを刻む。d は +1(遠く)か -1(近く)。帯の外へは出さない
export function aimNudge(aim, d) {
  if (!aim) return aim;
  return { ...aim, away: clamp(aim.away + NEAR_STEP * Math.sign(d), NEAR_MIN, NEAR_MAX) };
}

// 向きを刻む。ひとまわりしたら戻る。
//
// **角度を足し引きしない。刻みの番号で数える。** 足していくと誤差が残って、
// 24回まわしても 0 に戻らない(6.2831853071795845 で止まった。実測)。
// 番号なら、ひとまわりでぴたりと元の向きに帰る。
export function aimTurn(aim, d) {
  if (!aim) return aim;
  const i = Math.round(aim.turn / TURN_STEP) + Math.sign(d);
  return { ...aim, turn: (((i % TURN_STEPS) + TURN_STEPS) % TURN_STEPS) * TURN_STEP };
}

// いま見本が出ている場所。at は自分の位置と向き。
//
// **turn = 0 は「自分のほうを向く」**(decor.js の placeSpot と同じ)。
// ベンチの座面がこちらを向くので、置いてすぐ座れる形が既定になる。
export function aimSpot(aim, at) {
  if (!aim || !at) return null;
  return {
    x: at.x + Math.sin(at.facing) * aim.away,
    z: at.z + Math.cos(at.facing) * aim.away,
    facing: at.facing + Math.PI + aim.turn,
  };
}

// 押せるか(帯の端まで来ていたら、そのボタンは押せない)。
// **端の判定を2度書かない** ── 「押したら何か変わるか」を aimNudge 自身に
// 聞く。別に書くと、帯を動かしたときに片方だけ直して食い違う
// (端ぴったりの誤差を吸う 1e-9 も要らなくなる)。
export function canNudge(aim, d) {
  if (!aim) return false;
  return aimNudge(aim, d).away !== aim.away;
}
