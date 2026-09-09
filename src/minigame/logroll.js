// 丸太乗り(航海者たちの島の集まり)。足場の計算だけ。
//
// THREE も DOM も知らない。見た目は logroll-fx.js、操作の受け口は walk-mode.js。
//
// 遊びかた:
//   **でっかい丸太が1本**、海に半分沈んで浮かんでいる。みんなでその上に
//   立ち、丸太は回っているので歩き続けないと横へ転がされて海に落ちる。
//   丸太には**切れ目**があって、回って上がってくると足場が消える ──
//   丸太の長さ方向へ歩いて逃げる。最後まで残った人が勝ち。
//
// **足場を「時間で変わる地面」として出すだけ**にしてある。
// WalkerMotion は groundAt(x, z) を外から受け取る作りなので(motion.js)、
// ここが返す地面を島の地面に被せれば、歩き・跳び・踏み外し・海に落ちる、
// までが今までのコードのまま動く ── 丸太のために動きを作り直さない。
//
// 丸太が**丸い**ことも、そのまま地面の高さで表せる。WalkerMotion の y は
// 「地面からの高さ」なので、地面が返す y を曲面にすれば、乗っている人は
// 勝手に曲面をなぞる ── 坂の計算はどこにも要らない。
//
// 座標は**丸太を基準にした向き**(local)で持つ。
//   local x … 丸太の太さ方向(回転で流される向き)
//   local z … 丸太の長さ方向(切れ目から逃げる向き)
//   角 a  … てっぺんを 0 とし、local +x 側を正とする角。x = R sin a
// 世界の座標との行き来は toLocal / toWorld 1組だけを通す。
//
// 乱数はこの遊び専用の種。対戦の state.rng は絶対に回さない。

import { s as sc } from './scale.js';
import { makeRng, rngNext } from '../rng.js';
import { WATER_Y } from './motion.js';
import { TILE_TOP } from '../terrain.js';

// この遊びが開く島(meets.js と同じ考えかたで、1か所に置く)
export const LOGROLL_MODES = ['sea'];

// ---- 丸太の寸法 ----
//
// **人の寸法で書く(縮尺を掛ける)。** 丸太は盤の飾りではなく、人が乗って
// 歩く床なので、太さも長さも「歩幅・背丈に対してどうか」で決まる。
// 棒人間の背丈がおよそ sc(1.0) なので、直径 sc(4.4) は背丈の4倍強。
//
// **太すぎると誰も落ちない。** 半径 sc(3.2) で試したときは、てっぺんから
// 端まで 1.84 タイルの余裕があって、腕前 7 割・反応 0.3 秒の人でも
// 90 秒逃げ切った(実測)── 転がされても戻る余地がありすぎた。
export const DRUM_R = sc(2.2);        // 半径
export const DRUM_LEN = sc(10);       // 長さ(この方向へ逃げる)

// **軸を海面に置く。** 丸太は半分沈み、水から出ているところが
// そのまま足場になる ── 足場の切れる角と、水に落ちる場所が一致するので、
// 「まだ丸太が見えているのに落ちる」も「水の上を歩く」も起きない。
export const DRUM_AXIS = TILE_TOP + WATER_Y;
// 上から±この角までが足場。ここを越えたら海。
//
// **水面(ほぼ π/2)まで足場にする。** 内側で切ると、切ったところから
// 水面までの丸太が「見えているのに立てない」帯になり、そこが**見えない棚**
// として働く ── 落ちた人が空中を歩いて戻り、丸太に着地し直せてしまった
// (実測: 1.15 で切っていたときは、達人が 90 秒どころか永久に落ちなかった)。
// 水面で切れば、落ちた瞬間に水に入って抵抗で横の動きが死ぬので戻れない。
// 真横近くは滑りが速くて一瞬しか居られないので、壁に立って見えることもない。
export const DRUM_BAND = 1.52;
// てっぺんの高さ(世界の高さ)。見た目もここを使う
export const DRUM_TOP = DRUM_AXIS + DRUM_R;

// 置き場所を探すのに使う、丸太の占める広さ
export const COURSE_W = DRUM_R * 2;
export const COURSE_L = DRUM_LEN;

// ---- 回る速さ ----
//
// **だんだん速くして、最後は歩きより速くする。**
//
// 上面が流れる速さ = 角速度 × 半径。歩き(sc(1.9) = 0.95)に対して
// はじめ 53%、終わりに 111% ── **終盤は歩き通しでも押し負ける。**
// ここが歩きより遅いままだと、スティックを倒しておくだけで誰も落ちない
// (歩きの 71% で止めていたときは、腕前 7 割の人でも逃げ切った)。
// 押し負けはじめるのは 60 秒あたりで、そこからは全員が端へ寄っていく ──
// 早く寄った人から落ちるので、勝負は 90 秒を待たずに決まる。
//
// 速さそのものより「歩きに対して何割か」が効くので、歩きから決める。
const SURFACE_FROM = 0.44;   // 歩きに対する割合
const SURFACE_TO = 1.11;
const SPIN_FROM = (0.95 * SURFACE_FROM) / DRUM_R;   // ラジアン/秒
const SPIN_TO = (0.95 * SURFACE_TO) / DRUM_R;
const SPIN_RAMP = 70;     // 秒。ここまでで SPIN_TO へ上がりきる

// 切れ目。数と、角の広さ・長さ方向の広さ。
// **よけるのに歩くぶんは、流れに逆らうぶんから引かれる**(スティックは
// 合計 1 まで)── この取り合いが手ごたえそのものなので、よけるのに
// 本気で歩かないと間に合わない広さにする。
const HOLES = 6;
export const HOLE_ARC = 0.62;               // ラジアン。上に来ている間だけ抜ける
const HOLE_LEN = [sc(2.0), sc(4.0)];        // 長さ方向の広さ(振れ幅)

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

// ---- 時間と回転 ----

// 丸太が回りはじめてからの秒数。**始まってすぐは回さない**(GRACE_MS)。
// サーバー・クライアント・CPU が同じ式を通すこと ── 別々に数えると、
// 画面の丸太と当たり判定の丸太がずれる。
export function rollTime(elapsedMs) {
  return Math.max(0, elapsedMs - GRACE_MS) / 1000;
}

// t 秒の時点の角速度(大きさ)
export function spinAt(t) {
  return SPIN_FROM + (SPIN_TO - SPIN_FROM) * Math.min(1, Math.max(0, t) / SPIN_RAMP);
}

// t 秒までに回った角の合計(大きさ)。**速さが変わるので積分で持つ** ──
// spin × t で済ませると、速さを変えた瞬間に丸太が飛ぶ。
export function turnAt(t) {
  const v = Math.max(0, t);
  const d = SPIN_TO - SPIN_FROM;
  if (v <= SPIN_RAMP) return SPIN_FROM * v + (d * v * v) / (2 * SPIN_RAMP);
  return SPIN_FROM * v + d * (SPIN_RAMP / 2 + (v - SPIN_RAMP));
}

// ---- 滑り落ちる ----
//
// **てっぺんを外れたら、傾きのぶん滑り落ちる。**
//
// これが無いと、丸太が丸いことがそのまま「端のほうが安全」になってしまう。
// 回転が横へ運ぶ速さは、水平で見ると spin × R × cos(a) ── 端へ行くほど
// cos が小さくなって弱まるのに、歩く速さは水平で測るので変わらない。
// つまり端へ行くほど押し返しやすく、**何をしても落ちない**
// (実測: 上面の流れを歩きの 111% まで上げても、腕前 7 割の人が逃げ切った)。
//
// 傾いた面に立っていれば重力の分力 ∝ sin(a) で滑る。ここでは加速ではなく
// 「その傾きで滑り続ける速さ」として持つ ── 遊びとしては、外れるほど
// 戻りにくくなる手ごたえが要るだけで、加速まで積む必要はない。
//
// 角の速さで返す(丸太の上の位置は角で持っているので、回転と足せる)。
// 水平の速さに直すと SLIP × R × sin(a) になる。
const SLIP = 0.86;   // ラジアン/秒。傾き 1 ラジアンあたり

export function slipRate(a) { return SLIP * Math.tan(a); }

// 向き込みの角速度・回った角。course.dir が回る向き(種で左右が決まる)
export function spinOf(course, t) { return course.dir * spinAt(t); }
export function turnOf(course, t) { return course.dir * turnAt(t); }

// ---- 丸太を作る ----

// 流れる向き。種で決まるので、回によって左右が入れ替わる
function seedSign(seed) {
  const [, v] = rngNext(makeRng((seed ^ 0x5f3759df) >>> 0));
  return v < 0.5 ? -1 : 1;
}

// 種から丸太の中身(回る向きと切れ目)を決める。
// **同じ種なら誰の端末でも同じ丸太**になるので、サーバーは中身を配らずに済む。
export function makeCourse(seed) {
  let s = makeRng(seed);
  const roll = () => { const [n, v] = rngNext(s); s = n; return v; };
  const dir = seedSign(seed);
  const holes = [];
  // 角を HOLES 等分した帯に1つずつ入れる。**帯いっぱいには振らない** ──
  // 2つが近づきすぎると同時に上がってきて、長さ方向の逃げ場が無くなる。
  // 振れ幅を (帯 − 切れ目の角 − 余白) に抑えると、どの2つも必ず
  // 切れ目の角より離れる ＝ ある瞬間に効く切れ目はどこでも高々1つになる。
  const band = (Math.PI * 2) / HOLES;
  const jitter = Math.max(0, band - HOLE_ARC - 0.1);
  for (let i = 0; i < HOLES; i++) {
    const a = wrap(band * (i + 0.5) + (roll() - 0.5) * jitter);
    const len = HOLE_LEN[0] + roll() * (HOLE_LEN[1] - HOLE_LEN[0]);
    const mid = (roll() - 0.5) * (DRUM_LEN - len);
    holes.push({ a, z0: mid - len / 2, z1: mid + len / 2 });
  }
  return { dir, holes };
}

// ---- 世界の座標との行き来 ----
//
// anchor は丸太の置き場所と向き { x, z, angle }。
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
export function upstreamFace(anchor, course) {
  // 上面は局所 +x へ course.dir の向きに流れる。向くのはその逆
  const s = course.dir >= 0 ? -1 : 1;
  const c = Math.cos(anchor.angle);
  const sn = Math.sin(anchor.angle);
  return Math.atan2(s * c, s * sn);
}

// カメラを向ける先。**丸太の長さ方向へ、丸太のまん中を見る向き。**
//
// 人が向くのは流れの逆(upstreamFace)だが、カメラまでそちらを向けると
// 丸太を**横から**見ることになって、筒であることも、長さ方向のどこに
// 切れ目が回ってきているかも映らない ── 太さ方向に 2.2 タイルしかない
// ものを、4 タイル以上離れて真横から見ている絵になる。
// 長さ方向へ向けると、丸太が奥へ伸びて見え、他の人も一緒に入る。
export function alongFace(anchor, lz = 0) {
  const s = lz > 0 ? -1 : 1;             // まん中へ向かって見る
  const c = Math.cos(anchor.angle);
  const sn = Math.sin(anchor.angle);
  // 局所 +z の世界向きは (-sn, c)。facing は +Z を 0 とする角
  return Math.atan2(-s * sn, s * c);
}

// ---- 足場 ----

// 局所 x から、てっぺんを 0 とした角へ。丸太の外なら null
export function angleAt(lx) {
  const sinA = lx / DRUM_R;
  if (Math.abs(sinA) > Math.sin(DRUM_BAND)) return null;
  return Math.asin(sinA);
}

// その場所に切れ目が来ているか。
// rest は「いま角 a に来ている丸太の、丸太自身での角」(= a − 回った角)。
export function holeOpen(course, rest, lz) {
  for (const h of course.holes) {
    if (lz < h.z0 || lz > h.z1) continue;
    if (Math.abs(wrap(h.a - rest)) < HOLE_ARC / 2) return true;
  }
  return false;
}

// 丸太の地面。(x, z) → { y, ok, drift }
//
// drift は**足場そのものが動いている速さ**。回っている丸太の上面は横へ
// 流れているので、乗っている人はそのぶん運ばれる(motion.js が足す)。
export function courseGround(course, anchor, t) {
  const turn = turnOf(course, t);
  const spin = spinOf(course, t);
  return (x, z) => {
    const p = toLocal(anchor, x, z);
    if (Math.abs(p.z) > DRUM_LEN / 2) return null;
    const a = angleAt(p.x);
    if (a == null) return null;
    if (holeOpen(course, a - turn, p.z)) return null;
    // 足場が横へ動かす速さ。局所の +x 向き。
    // 回転で運ばれるぶん(角の速さ spin)と、傾きで滑り落ちるぶんを足して、
    // 水平の速さへ直す(角の速さ × R × cos(a))。
    // **猶予中(t <= 0)は動かさない。** rollTime が猶予のあいだ 0 を返すので、
    // 丸太は止まって見えているのに流れだけ効く、ということにならないように。
    const v = t > 0 ? (spin + slipRate(a)) * DRUM_R * Math.cos(a) : 0;
    const c = Math.cos(anchor.angle);
    const sn = Math.sin(anchor.angle);
    return {
      y: DRUM_AXIS + DRUM_R * Math.cos(a),
      ok: true,
      drift: { x: v * c, z: v * sn },
    };
  };
}

// 島の地面に丸太を被せる。**丸太が優先**(海の上にしか無いので、
// 陸と取り合いになることはない)。
export function withCourse(islandGround, courseAt) {
  return (x, z) => courseAt(x, z) ?? islandGround(x, z);
}

// ---- 浮かべる場所 ----

// 丸太をどこに浮かべるか。**盤の形から探す**(島ごとに海の空きかたが違う)。
//
// groundAt は島の地面(ground.js の makeGround)。ここは盤を知らずに、
// 「その点が陸か海か」だけを頼りに、丸太がまるごと海に収まる場所を探す。
//
// 島の外周を回りながら、丸太の長さ方向が**岸と平行**になるように置く
// ── 岸に向かって直角に置くと、端が陸に乗り上げる。
// 同じ盤なら毎回同じ場所に浮かぶ(角度も半径も決め打ちで走査する)。
//
// 丸太のまわりに要る海の余白。**丸太の下だけでなく、まわりも海であること。**
// 余白が足りないと、端から落ちた人が海ではなく隣の小島に降り立ってしまう。
export const COURSE_CLEAR = DRUM_R * 0.6;

export function findAnchor(groundAt, { from = { x: 0, z: 0 } } = {}) {
  const fits = (x, z, angle) => {
    const a = { x, z, angle };
    // 丸太 + 余白の枠を格子で見る。四隅だけだと、小島が辺の途中へ食い込む
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
  // 島から近い順に見る。近すぎると岸に乗り上げ、遠すぎると見えない
  for (let r = COURSE_W * 0.7; r <= 12; r += COURSE_W / 4) {
    for (let deg = 0; deg < 360; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const x = from.x + Math.cos(a) * r;
      const z = from.z + Math.sin(a) * r;
      // 丸太の長さ方向は岸と平行(半径の向きに直角)
      const angle = a + Math.PI / 2;
      if (!fits(x, z, angle)) continue;
      if (!best) best = { x, z, angle };
    }
    if (best) break;
  }
  return best ? { x: best.x, z: best.z, angle: best.angle } : null;
}

// ---- 乗る場所 ----

// これから ahead 秒のあいだ、角 a で切れ目が来ない長さ方向の位置。
// from に近いものを返す。見つからなければ null。
export function safeZ(course, a, t, ahead = 1.5, from = 0) {
  const step = DRUM_LEN / 28;
  let best = null;
  for (let lz = -DRUM_LEN / 2 + step; lz < DRUM_LEN / 2; lz += step) {
    let okAll = true;
    for (let k = 0; k <= 4; k++) {
      const tk = t + (ahead * k) / 4;
      if (holeOpen(course, a - turnOf(course, tk), lz)) { okAll = false; break; }
    }
    if (!okAll) continue;
    const d = Math.abs(lz - from);
    if (!best || d < best.d) best = { lz, d };
  }
  return best ? best.lz : null;
}

// 始めるときに立たせる場所。**全員てっぺんに、長さ方向へ並べて散らす。**
//
// 切れ目に当たらない場所だけを候補に拾ってから配るので、
// 「立った瞬間に穴の上に居て、何もしていないのに落ちる」も、
// 「2人が同じところに立つ」も起きない。
export function startSpots(course, anchor, n) {
  const total = Math.max(1, n);
  const grace = GRACE_MS / 1000;
  const cand = [];
  const step = DRUM_LEN / 16;
  for (let lz = -DRUM_LEN * 0.42; lz <= DRUM_LEN * 0.42 + 1e-9; lz += step) {
    let okAll = true;
    for (let k = 0; k <= 4; k++) {
      if (holeOpen(course, -turnOf(course, (grace * k) / 4), lz)) { okAll = false; break; }
    }
    if (okAll) cand.push(lz);
  }
  const face = upstreamFace(anchor, course);
  const used = new Set();
  const out = [];
  const spread = DRUM_LEN * 0.8;
  for (let i = 0; i < total; i++) {
    const want = total === 1 ? 0 : -spread / 2 + (spread * i) / (total - 1);
    // 空いている候補のうち、いちばん近いもの
    let pick = null;
    for (let j = 0; j < cand.length; j++) {
      if (used.has(j)) continue;
      const d = Math.abs(cand[j] - want);
      if (!pick || d < pick.d) pick = { j, d, lz: cand[j] };
    }
    const lz = pick ? pick.lz : want;
    if (pick) used.add(pick.j);
    out.push({ ...toWorld(anchor, 0, lz), face, view: alongFace(anchor, lz) });
  }
  return out;
}
