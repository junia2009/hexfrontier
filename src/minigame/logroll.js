// 丸太乗り(航海者たちの島の集まり)。進行の計算だけ。
//
// THREE も DOM も知らない。見た目は logroll-fx.js、操作の受け口は walk-mode.js。
//
// 遊びかた:
//   沖に丸太の筏が浮いている。丸太は横に並んで**回っている**ので、
//   立ったままだと転がされて落ちる。回転に逆らって歩き続ける。
//   丸太には**切れ目**があって、回って上に来ると足場が消える ──
//   丸太の長さ方向へずれてよける。落ちたら海。最後まで残った人が勝ち。
//
// **足場を「時間で変わる地面」として出すだけ**にしてある。
// WalkerMotion は groundAt(x, z) を外から受け取る作りなので(motion.js)、
// ここが返す地面を島の地面に被せれば、歩き・跳び・踏み外し・海に落ちる、
// までが今までのコードのまま動く ── 丸太のために動きを作り直さない。
//
// 座標は**丸太の筏を基準にした向き**(local)で持ち、世界の座標との
// 行き来は toLocal / toWorld 1組だけを通す。筏をどこに浮かべても、
// 中の計算が向きを気にせずに済む。
//
// 乱数はこの遊び専用の種。対戦の state.rng は絶対に回さない。

import { s as sc } from './scale.js';
import { makeRng, rngNext } from '../rng.js';
import { WATER_Y } from './motion.js';
import { TILE_TOP } from '../terrain.js';

// この遊びが開く島(meets.js と同じ考えかたで、1か所に置く)
export const LOGROLL_MODES = ['sea'];

// ---- 筏の寸法 ----
//
// **人の寸法で書く(縮尺を掛ける)。** 丸太は盤の飾りではなく、人が乗って
// 歩く床なので、太さも間隔も「歩幅に対してどうか」で決まる。
export const LOG_R = sc(0.35);          // 丸太の半径
export const LOG_LEN = sc(5.0);         // 長さ(この方向へよける)
// 中心の間隔。**直径よりわずかに広いだけ**にする ── 隙間を空けると
// 丸太のあいだに落ちるのが主な負けかたになって、回転をよける遊びでなくなる。
export const LOG_PITCH = sc(0.78);
export const LOG_COUNT = 7;             // 本数
// 丸太の上面の高さ。**世界の高さで返す。**
//
// motion.js の WATER_Y は「タイル上面を 0 とした高さ」で、地面の関数
// (ground.js の makeGround)が返す y は世界の高さ ── 基準が違う。
// 混ぜたまま返していたころは、判定の足場が海面より 0.26 低いところにあり、
// 画面の丸太に乗っているのに足だけ沈んでいた。
export const LOG_TOP = TILE_TOP + WATER_Y + LOG_R * 0.9;

// 筏の広さ(端から端まで)。置き場所を探すのに使う
export const COURSE_W = LOG_PITCH * (LOG_COUNT - 1) + LOG_R * 2;
export const COURSE_L = LOG_LEN;

// 回る速さ(ラジアン/秒)。**時間は縮尺を掛けない**(scale.js)。
// 上面が動く速さ = 角速度 × 半径。歩き(sc(1.9))の半分ほどになるように選ぶ
// ── 同じだと歩いても進めず、遅すぎると立っているだけで勝ててしまう。
const SPIN_MIN = 1.7;
const SPIN_MAX = 3.0;

// 切れ目。1本あたりの数と、角の広さ・長さ方向の広さ
const HOLES_PER_LOG = 2;
export const HOLE_ARC = 0.85;                  // ラジアン。上に来ている間だけ抜ける
const HOLE_LEN = sc(1.25);
// 切れ目どうしが重ならないように、長さ方向はこの幅の枠に割り付ける
const HOLE_SLOTS = 4;

// 落ちないでいられる時間の上限(集まりの制限時間)。逃げ切りと同じ長さにする
export const ROLL_MS = 90000;
// 始まってからこの間は回さない。乗った瞬間に転がされるのは理不尽なので
export const GRACE_MS = 3000;

// 角を -π..π に畳む
function wrap(a) {
  let v = (a + Math.PI) % (Math.PI * 2);
  if (v < 0) v += Math.PI * 2;
  return v - Math.PI;
}

// ---- 筏を作る ----

// 種から筏の中身(丸太の回りかたと切れ目)を決める。
// **同じ種なら誰の端末でも同じ筏**になるので、サーバーは中身を配らずに済む。
// 流れる向き。種で決まるので、回によって左右が入れ替わる
function seedSign(seed) {
  const [, v] = rngNext(makeRng((seed ^ 0x5f3759df) >>> 0));
  return v < 0.5 ? -1 : 1;
}

export function makeCourse(seed) {
  let s = makeRng(seed);
  const roll = () => { const [n, v] = rngNext(s); s = n; return v; };
  const logs = [];
  // 回る向きは**全部そろえる**。
  //
  // 隣どうしを逆に回すと、2本のあいだに「押し合って動かない谷」ができて、
  // そこに立っているだけで落ちなくなる(実測: 8秒で 0.18 タイルしか動かない
  // ＝遊びが成立しない)。そろえると筏ぜんたいが一方向へ流れる帯になり、
  // **流れに逆らって足踏みし続ける**ことになる ── 丸太乗り(birling)は
  // もともとそういう競技で、行きすぎれば上流の端から、緩めれば下流の端から
  // 落ちる。速さだけを丸太ごとに変えて、渡る先で手加減が変わるようにする。
  const dir = seedSign(seed);
  for (let i = 0; i < LOG_COUNT; i++) {
    const spin = dir * (SPIN_MIN + roll() * (SPIN_MAX - SPIN_MIN));
    const holes = [];
    // 長さ方向を HOLE_SLOTS 個の枠に割って、そのうち HOLES_PER_LOG 個へ入れる
    const slots = [...Array(HOLE_SLOTS).keys()];
    for (let h = 0; h < HOLES_PER_LOG; h++) {
      const pick = Math.floor(roll() * slots.length);
      const slot = slots.splice(pick, 1)[0];
      const w = LOG_LEN / HOLE_SLOTS;
      const mid = -LOG_LEN / 2 + w * (slot + 0.5);
      holes.push({
        // 上に来る位相。ばらけさせて、全部いっぺんに抜けないようにする
        phase: roll() * Math.PI * 2,
        z0: mid - HOLE_LEN / 2,
        z1: mid + HOLE_LEN / 2,
      });
    }
    logs.push({ x: (i - (LOG_COUNT - 1) / 2) * LOG_PITCH, spin, holes });
  }
  return { logs };
}

// 丸太が回りはじめてからの秒数。**始まってすぐは回さない**(GRACE_MS)。
// 乗った瞬間に転がされるのは理不尽なうえ、乗る前に落ちる人が出る。
// サーバー・クライアント・CPU が同じ式を通すこと ── 別々に数えると、
// 画面の丸太と当たり判定の丸太がずれる。
export function rollTime(elapsedMs) {
  return Math.max(0, elapsedMs - GRACE_MS) / 1000;
}

// ---- 世界の座標との行き来 ----
//
// anchor は筏の置き場所と向き { x, z, angle }。
// angle は「丸太の長さ方向」が世界のどちらを向いているか。

export function toLocal(anchor, x, z) {
  const dx = x - anchor.x;
  const dz = z - anchor.z;
  const c = Math.cos(-anchor.angle);
  const sn = Math.sin(-anchor.angle);
  return { x: dx * c - dz * sn, z: dx * sn + dz * c };
}

export function toWorld(anchor, x, z) {
  const c = Math.cos(anchor.angle);
  const sn = Math.sin(anchor.angle);
  return { x: anchor.x + x * c - z * sn, z: anchor.z + x * sn + z * c };
}

// 「流れに向かって立つ」向き。
//
// motion.js の facing は **+Z を 0 とした角**(向き = (sin θ, cos θ))で、
// ここの anchor.angle とは基準も回り方も違う ── anchor.angle をそのまま
// facing に入れると、そこそこ合っているように見えて盤によっては真横を向く。
// 世界の向きベクトルへ落としてから atan2 する 1 か所だけを通す。
export function upstreamFace(anchor, log) {
  // 上面は局所 +x へ log.spin の符号で流れる。向くのはその逆
  const s = log.spin >= 0 ? -1 : 1;
  const c = Math.cos(anchor.angle);
  const sn = Math.sin(anchor.angle);
  return Math.atan2(s * c, s * sn);
}

// ---- 足場 ----

// その丸太の上に、いま足が乗る場所があるか。
// t は始まってからの秒数。切れ目は回ってくるので時間で変わる。
export function logSolid(log, lz, t) {
  if (lz < -LOG_LEN / 2 || lz > LOG_LEN / 2) return false;
  for (const h of log.holes) {
    if (lz < h.z0 || lz > h.z1) continue;
    // 切れ目がてっぺん(角 0)に来ているか
    if (Math.abs(wrap(h.phase + log.spin * t)) < HOLE_ARC / 2) return false;
  }
  return true;
}

// 筏の地面。(x, z) → { y, ok, drift }
//
// drift は**足場そのものが動いている速さ**。回っている丸太の上面は横へ
// 流れているので、乗っている人はそのぶん運ばれる(motion.js が足す)。
export function courseGround(course, anchor, t) {
  return (x, z) => {
    const p = toLocal(anchor, x, z);
    // いちばん近い丸太
    const i = Math.round(p.x / LOG_PITCH + (LOG_COUNT - 1) / 2);
    if (i < 0 || i >= LOG_COUNT) return null;
    const log = course.logs[i];
    // 丸太の幅から外れていたら、そこは海(丸太のあいだ)
    if (Math.abs(p.x - log.x) > LOG_R) return null;
    if (!logSolid(log, p.z, t)) return null;
    // 上面が横へ流れる速さ。局所の +x 向き。
    // **猶予中(t <= 0)は流さない。** rollTime が猶予のあいだ 0 を返すので、
    // 丸太は止まって見えているのに流れだけ効いていて、何もしていない人が
    // 開始 2 秒で筏の外へ運ばれていた(実測 0.49 タイル/秒)。
    const v = t > 0 ? log.spin * LOG_R : 0;
    const c = Math.cos(anchor.angle);
    const sn = Math.sin(anchor.angle);
    return { y: LOG_TOP, ok: true, drift: { x: v * c, z: v * sn } };
  };
}

// 島の地面に筏を被せる。**筏が優先**(丸太は海の上にしか無いので、
// 陸と取り合いになることはない)。
export function withCourse(islandGround, courseAt) {
  return (x, z) => courseAt(x, z) ?? islandGround(x, z);
}

// ---- 浮かべる場所 ----

// 筏をどこに浮かべるか。**盤の形から探す**(島ごとに海の空きかたが違う)。
//
// groundAt は島の地面(ground.js の makeGround)。ここは盤を知らずに、
// 「その点が陸か海か」だけを頼りに、筏がまるごと海に収まる場所を探す。
//
// 島の外周を回りながら、丸太の長さ方向が**岸と平行**になるように置く
// ── 岸に向かって直角に並べると、端の丸太だけ陸に乗り上げる。
// 同じ盤なら毎回同じ場所に浮かぶ(角度も半径も決め打ちで走査する)。
// 筏のまわりに要る海の余白。**筏の下だけでなく、まわりも海であること。**
// 余白が足りないと、端から落ちた人が海ではなく隣の小島に降り立ってしまう
// (実測: 落ちたはずが陸の上を 2 タイル歩き続けていた)。
export const COURSE_CLEAR = LOG_LEN * 0.45;

export function findAnchor(groundAt, { from = { x: 0, z: 0 } } = {}) {
  const fits = (x, z, angle) => {
    const a = { x, z, angle };
    // 筏 + 余白の枠を格子で見る。四隅だけだと、小島が辺の途中へ食い込む
    const hx = COURSE_W / 2 + COURSE_CLEAR;
    const hz = COURSE_L / 2 + COURSE_CLEAR;
    for (let ix = -1; ix <= 1.001; ix += 0.25) {
      for (let iz = -1; iz <= 1.001; iz += 0.25) {
        const w = toWorld(a, hx * ix, hz * iz);
        if (groundAt(w.x, w.z).ok) return false;
      }
    }
    return true;
  };
  let best = null;
  // 島から近い順に見る。近すぎると岸に乗り上げ、遠すぎると泳いで行けない
  for (let r = COURSE_W; r <= 9; r += COURSE_W / 3) {
    for (let deg = 0; deg < 360; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const x = from.x + Math.cos(a) * r;
      const z = from.z + Math.sin(a) * r;
      // 丸太の長さ方向は岸と平行(半径の向きに直角)
      const angle = a + Math.PI / 2;
      if (!fits(x, z, angle)) continue;
      if (!best) best = { x, z, angle, r, deg };
    }
    if (best) break;
  }
  return best ? { x: best.x, z: best.z, angle: best.angle } : null;
}

// ---- 乗る場所 ----

// 始めるときに立たせる場所。人数ぶん、筏の上に散らす。
// **切れ目の無い枠のまん中**に置く ── 立った瞬間に穴の上で落ちるのを防ぐ。
export function startSpots(course, anchor, n) {
  const out = [];
  const total = Math.max(1, n);
  for (let i = 0; i < total; i++) {
    // 丸太は順に、長さ方向は端に寄せて散らす
    const log = course.logs[i % LOG_COUNT];
    const lane = Math.floor(i / LOG_COUNT);
    const want = (lane % 2 === 0 ? 1 : -1) * LOG_LEN * (0.3 + 0.08 * Math.floor(lane / 2));
    // **そこが切れ目なら、いちばん近い安全な場所へ寄せる。** 寄せないと、
    // 立った瞬間に穴の上に居て、何もしていないのに落ちる人が出る。
    const lz = safeZ(log, 0, GRACE_MS / 1000, want) ?? want;
    const w = toWorld(anchor, log.x, lz);
    out.push({ ...w, face: upstreamFace(anchor, log) });
  }
  return out;
}

// いま安全な場所(CPU が逃げ込む先)。その丸太で、これから ahead 秒のあいだ
// 抜けない長さ方向の位置を返す。見つからなければ null。
export function safeZ(log, t, ahead = 1.2, from = 0) {
  const step = LOG_LEN / 24;
  let best = null;
  for (let lz = -LOG_LEN / 2 + step; lz < LOG_LEN / 2; lz += step) {
    let okAll = true;
    for (let k = 0; k <= 4; k++) {
      if (!logSolid(log, lz, t + (ahead * k) / 4)) { okAll = false; break; }
    }
    if (!okAll) continue;
    const d = Math.abs(lz - from);
    if (!best || d < best.d) best = { lz, d };
  }
  return best ? best.lz : null;
}
