// 島の見取り図 ── 動かないものが「どちらに・どれだけ離れているか」。
//
// 店の「島の見取り図」で開く(src/shop.js)。THREE を読まない純粋な計算で、
// 場所は ground.js が持っているものをそのまま借りる ── 地図のために座標を
// 建て直すと、地図と実物がずれる(いちばん気づきにくい壊れかた)。
//
// **人と竜は出さない。** 動くものを出すと、大会(ドラゴンから逃げろ)で
// 払った人が有利になる。動かないものの場所だけを配る。

import { fishingSpots, nestPoint, shopPoint, spawnPoint, watchPost } from './ground.js';
import { WALK_SPEED } from './motion.js';
import { meetFor } from './meets.js';
import { ARCHERY_MODES } from './archery.js';
import { portLabel } from './fish.js';

// 向いているほうを 0 として、8方向。
//
// **画面の右は -x 側。** 棒人間の向き facing は atan2(x, z) で、前は
// (sin f, cos f)。カメラは背中から見ているので、画面の右は前を上から
// 見て時計回りに 90° 回した向き ── 前 × 上 = (-cos f, 0, sin f) で、
// f=0 なら -x 側になる。だから目標までの角度は**引く向き**で測る。
// (実機のカメラの右ベクトルと突き合わせて確かめた。逆に書いていて、
//  地図が「左」と言う先に物が右に見えていた)
export const DIRS = ['まっすぐ前', '右前', '右', '右うしろ', '真うしろ', '左うしろ', '左', '左前'];

const TAU = Math.PI * 2;

// -π〜π に畳む
function norm(a) {
  let v = a % TAU;
  if (v > Math.PI) v -= TAU;
  if (v < -Math.PI) v += TAU;
  return v;
}

export function dirIndex(facing, dx, dz) {
  const f = typeof facing === 'number' && Number.isFinite(facing) ? facing : 0;
  const rel = norm(f - Math.atan2(dx, dz));
  const k = Math.round(rel / (Math.PI / 4));
  return ((k % 8) + 8) % 8;
}

// 歩いて何秒か。駆け足なら半分ほどで着くが、目安は歩きで出す
// (「思ったより遠い」より「思ったより近い」のほうが親切)。
export function walkSeconds(dist) {
  const d = typeof dist === 'number' && Number.isFinite(dist) && dist > 0 ? dist : 0;
  return Math.max(1, Math.round(d / WALK_SPEED));
}

// 見取り図の行。近い順に並ぶ。
//
// from は棒人間のいる場所と向き { x, z, facing }。
export function islandGuide(state, from = {}) {
  if (!state?.board) return [];
  const x = from.x ?? 0;
  const z = from.z ?? 0;
  const facing = from.facing ?? 0;
  const rows = [];
  const add = (id, icon, label, sub, p) => {
    if (!p) return;
    const dx = p.x - x;
    const dz = (p.z ?? p.y) - z;
    const dist = Math.hypot(dx, dz);
    rows.push({
      id, icon, label, sub, dist, sec: walkSeconds(dist), dir: DIRS[dirIndex(facing, dx, dz)],
    });
  };

  // 受付(円卓の島は卓)。立つ場所は walk-mode と同じ spawnPoint
  const meet = meetFor(state.mode);
  if (meet) add('meet', '📋', meet.name, '受付', spawnPoint(state));
  // 島の店(屋台)。受付の隣に建っている
  add('shop', '🏪', '島の店', 'なんでも屋', shopPoint(state));
  // 物見の櫓。島にひとつだけ建つ
  if (ARCHERY_MODES.includes(state.mode)) add('post', '🏹', '物見の櫓', '蛮族を射る', watchPost(state));
  // 竜の棲む山。**巣の場所だけ** ── 竜そのものの居場所は出さない
  add('nest', '🐉', '竜の棲む山', '近づくと目を覚ます', nestPoint(state));
  // 港。桟橋ごとに1行
  for (const s of fishingSpots(state)) {
    add(`port:${s.edgeId}`, '⚓', '桟橋', portLabel(s.type), s);
  }

  rows.sort((a, b) => a.dist - b.dist || (a.id < b.id ? -1 : 1));
  return rows;
}
