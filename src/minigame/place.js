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
// 下見のあいだに動かせるのは3つ:
//   - **遠さ**(自分の正面にどれだけ離すか)…… ちかく/とおく を押して刻む
//   - **横**(正面と直角に、左右どれだけずらすか)… ひだり/みぎ を押して刻む
//   - **向き**(飾りそのものの回転)………………… ↺/↻ を押して刻む
// 歩けば見本もついてくるので、**大まかには足で、細かくはボタンで**決まる。
//
// **横は後から足した。** はじめは遠さと向きだけで、横へずらすには
// 自分が体ごと横に踏み直すしかなかった ── 前後は正面を向いたまま刻めるのに、
// 横だけ足で踏み直すので、同じ細かさで合わせられない
// (「前後ろはとてもやりやすいが、横の微調整がやりにくい」)。

import { s as sc } from './scale.js';
import { PLACE_AHEAD, cleanLook, lookCount } from './decor.js';

// 遠さの帯。近すぎると置いた瞬間に自分が中にいて押し出され、
// 遠すぎると手の届かないところに物を生やすことになる。
export const NEAR_MIN = sc(0.36);
export const NEAR_MAX = sc(1.1);
// 1回ぶんの刻み。**細かさはここ。**
// **いちばん細い飾り(島の旗 r = 0.06)より細かくすること** ── 刻みが
// 飾りの太さと同じだと、並べたときに隣との間隔を合わせられない。
// はじめ sc(0.12) にしていたら旗の太さとちょうど同じで、テストが落ちた。
export const NEAR_STEP = sc(0.06);

// 横の帯。正面と直角に、左右へどれだけずらせるか(0 が正面)。
// 前後の帯(0.36〜1.1)と同じくらいの幅を左右に取る ── 隣に1つ並べる、
// くらいまで届けばよく、それ以上は足で歩いたほうが速い。
export const SIDE_MAX = sc(0.8);
// **刻みは前後とまったく同じ。** 片方だけ粗いと、そちらの軸だけ
// 合わせられない ── 細かく置けるようにした意味が半分になる。
export const SIDE_STEP = NEAR_STEP;

// 向きの刻み。15度(ひとまわり24通り)。これより細かくすると、
// 押した回数と見た目が結びつかなくなる
export const TURN_STEP = Math.PI / 12;
export const TURN_STEPS = Math.round((Math.PI * 2) / TURN_STEP);

// 下見のはじまり。**遠さも横も向きも柄も、今までと同じところから始める** ──
// 何も触らずに「置く」を押した人には、今までとまったく同じ場所に、
// はじめの柄で置かれる。
export function newAim(id) {
  return { id, away: PLACE_AHEAD, side: 0, turn: 0, look: 0 };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 動かせる軸。[いちばん近い/小さい, いちばん遠い/大きい, 1回ぶんの刻み]
//
// **帯の決まりを軸ごとに書き分けない。** 前後と横で同じ刻みかたをするので、
// 別々に書くと、片方だけ直して食い違う(刻みを変えたときに必ず起きる)。
const AXES = {
  away: [NEAR_MIN, NEAR_MAX, NEAR_STEP],
  side: [-SIDE_MAX, SIDE_MAX, SIDE_STEP],
};

function shift(aim, key, d) {
  if (!aim) return aim;
  const [lo, hi, step] = AXES[key];
  const now = aim[key] ?? 0;
  return { ...aim, [key]: clamp(now + step * Math.sign(d), lo, hi) };
}

// 遠さを刻む。d は +1(遠く)か -1(近く)。帯の外へは出さない
export function aimNudge(aim, d) {
  return shift(aim, 'away', d);
}

// 横へ刻む。d は +1(右)か -1(左)。**正面と直角に動かす** ──
// 世界の東西ではなく、いま自分が向いている向きから見た左右
// (振り向いてから押しても、画面の中では同じ側へ動く)。
export function aimSide(aim, d) {
  return shift(aim, 'side', d);
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

// 柄を送る。ひとまわりしたら戻る(向きと同じ扱い)。
//
// **柄の無い品では何も起きない。** 貝がらや錨のように1つしか柄が無いものは、
// 押しても変わらない ── ボタン自体も canLook で押せなくしてある。
export function aimLook(aim, d) {
  if (!aim) return aim;
  const n = lookCount(aim.id);
  if (n <= 1) return aim;
  const i = (((aim.look ?? 0) + Math.sign(d)) % n + n) % n;
  return { ...aim, look: i };
}

export function canLook(aim) {
  return !!aim && lookCount(aim.id) > 1;
}

// いま見本が出ている場所。at は自分の位置と向き。
//
// **turn = 0 は「自分のほうを向く」**(decor.js の placeSpot と同じ)。
// ベンチの座面がこちらを向くので、置いてすぐ座れる形が既定になる。
//
// 正面は (sin, cos)。横はそれを直角に倒した向きだが、**倒す側は計算では
// 決まらない**(カメラの構えしだい)。実機の画面座標で測って決めた:
// はじめ (cos, -sin) にしたら、「みぎ」で見本が**画面の左**へ動いた
// (正面を向いて 中 195px → みぎ 103px。どの向きでも同じだった)。
// 符号を逆にしたのがこれ ── side が + で画面の右。
export function aimSpot(aim, at) {
  if (!aim || !at) return null;
  const side = aim.side ?? 0;
  return {
    x: at.x + Math.sin(at.facing) * aim.away - Math.cos(at.facing) * side,
    z: at.z + Math.cos(at.facing) * aim.away + Math.sin(at.facing) * side,
    facing: at.facing + Math.PI + aim.turn,
    // 柄も一緒に返す ── ここが「いま見えている見本そのもの」なので、
    // 置く側は場所と柄を別々に組み立てなくてよい
    look: cleanLook(aim.id, aim.look),
  };
}

// 押せるか(帯の端まで来ていたら、そのボタンは押せない)。
// **端の判定を2度書かない** ── 「押したら何か変わるか」を動かす関数自身に
// 聞く。別に書くと、帯を動かしたときに片方だけ直して食い違う
// (端ぴったりの誤差を吸う 1e-9 も要らなくなる)。
export function canNudge(aim, d) {
  if (!aim) return false;
  return aimNudge(aim, d).away !== aim.away;
}

export function canSide(aim, d) {
  if (!aim) return false;
  return aimSide(aim, d).side !== (aim.side ?? 0);
}
