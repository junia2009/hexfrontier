// 島の地図。**形と目印の座標だけ**を作る(描くのは render/minimap.js)。
//
// 文字で「右前・歩いて約5秒」と並べていたころは、読んでも頭の中で方角に
// 直さないと使えず、しかもパネルを開くと時間が止まっていた ── 要らない、
// と言われたのはもっともだった。**歩きながら見える絵**にする。
//
// THREE は読まない。位置は ground.js のものを借りる(地図のために座標を
// 建て直すと、地図と実物がずれる)。

import { LAYOUT } from '../rules/board.js';
import { isLandHex } from '../rules/sea.js';
import { fishingSpots, nestPoint, shopPoint, spawnPoint, watchPost } from './ground.js';
import { meetFor } from './meets.js';
import { ARCHERY_MODES } from './archery.js';

// 地図に出す目印。**動かないものだけ** ── 人と竜は出さない
// (動くものを出すと「ドラゴンから逃げろ」で払った人が有利になる)。
export function islandMarks(state) {
  if (!state?.board) return [];
  const out = [];
  const add = (id, icon, label, p) => {
    if (!p) return;
    out.push({ id, icon, label, x: p.x, z: p.z ?? p.y });
  };
  const meet = meetFor(state.mode);
  if (meet) add('meet', '📋', meet.name, spawnPoint(state));
  add('shop', '🏪', '島の店', shopPoint(state));
  if (ARCHERY_MODES.includes(state.mode)) add('post', '🏹', '物見の櫓', watchPost(state));
  add('nest', '🐉', '竜の棲む山', nestPoint(state));
  for (const s of fishingSpots(state)) add(`port:${s.edgeId}`, '⚓', '桟橋', s);
  return out;
}

// 陸のヘックスの輪郭(六角形の頂点6つ)。海のヘックスは描かない ──
// 島の形がそのまま地図の形になる。
export function islandHexes(state) {
  if (!state?.board?.hexIds) return [];
  const out = [];
  for (const hid of state.board.hexIds) {
    if (state.mode === 'sea' && !isLandHex(state.board, hid)) continue;
    const vids = LAYOUT.hexVertices[hid];
    if (!vids) continue;
    out.push(vids.map((vid) => ({ x: LAYOUT.vertices[vid].x, y: LAYOUT.vertices[vid].y })));
  }
  return out;
}

// 島全体が入る四角(盤の座標)
export function islandBounds(state) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const poly of islandHexes(state)) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

// 盤の座標 → 地図の中の座標。
//
// **丸い窓に収める。** 地図は円で切り抜いてあるので、四角に合わせて縮めると
// 角のもの ── いちばん外にある桟橋 ── が切り落とされる(実際そうなった)。
// 島の中心からいちばん遠い点までの距離で割って、円の内側に入れる。
//
// 縦横は同じ率(率を分けると島の形が歪んで、実物と見比べられなくなる)。
// size: 地図の一辺(px)。pad: 円の内側に残す余白(px)。
export function mapTransform(bounds, size, pad = 6, points = []) {
  if (!bounds) return { scale: 1, ox: size / 2, oy: size / 2 };
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  let r = 1e-6;
  for (const p of points) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > r) r = d;
  }
  // 点を渡されなければ、四角の角までを半径とみなす(いちばん安全な側)
  if (!points.length) r = Math.hypot(bounds.maxX - cx, bounds.maxY - cy) || 1e-6;
  const scale = Math.max(1, size / 2 - pad) / r;
  return { scale, ox: size / 2 - cx * scale, oy: size / 2 - cy * scale };
}

// 盤の (x, z) を地図の (x, y) へ。**盤の y と世界の z は同じもの**
// (hexCenter は平面を {x, y} で返し、3D では z に入る)。
//
// **鏡にしないこと。** この島では画面の右が世界の -x なので(カメラが
// 背中側から +z のほうを見ている)、x を映さないと左右が逆になる気がする
// ── 実際そう考えて映してみたら、余計に狂った。下の upAngle が 180° 回して
// いるぶんで左右はすでに合っている。実機のカメラの右ベクトルと、7つの向き ×
// 12の目印で突き合わせて確かめた(この式で 84/84 一致。映すと 24/84)。
export function toMap(t, x, z) {
  return { x: x * t.scale + t.ox, y: z * t.scale + t.oy };
}

// 点を中心のまわりに回す(地図の座標。y は下向き)。
// 角は canvas の回転と同じ向き ── 正で時計回りに見える。
export function rotAbout(p, cx, cy, a) {
  const dx = p.x - cx;
  const dy = p.y - cy;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

// **向いているほうを上にする**ための回転角。
//
// 棒人間の向き facing は atan2(x, z) なので、進む先は地図の座標で
// (sin f, cos f) ── f=0 なら「下」。これを上(0, -1)へ持ってくる角が f - π。
//
// **この 180° が左右も合わせている。** 別に鏡にしてはいけない(toMap 参照)。
//
// **中心のまわりに回すので、円に収めた地図は何も はみ出さない**
// (中心からの距離が変わらない)。四角に収めていたら角が切れていた。
export function upAngle(facing) {
  return (typeof facing === 'number' && Number.isFinite(facing) ? facing : 0) - Math.PI;
}

// 地図に出すものを1回でそろえる。描く側はこれだけ見ればよい。
//
// facing を渡すと**向いているほうが上**になるように回す(渡さなければ
// 盤の向きのまま)。回すのは点だけ ── 絵文字は立てたまま描きたいので、
// canvas ごと回さない(回すと目印が逆さになる)。
export function islandMapData(state, size, pad = 6, facing = null) {
  const bounds = islandBounds(state);
  const hexes = islandHexes(state);
  const marks = islandMarks(state);
  // **目印も「収める点」に入れる。** 桟橋は岸のいちばん外に立つので、
  // 陸の形だけで合わせると円の縁で切れる。
  const points = [...hexes.flat(), ...marks.map((m) => ({ x: m.x, y: m.z }))];
  const t = mapTransform(bounds, size, pad, points);
  const c = size / 2;
  const a = facing == null ? 0 : upAngle(facing);
  const put = (x, z) => (facing == null ? toMap(t, x, z) : rotAbout(toMap(t, x, z), c, c, a));
  return {
    t,
    spin: a,
    at: (x, z) => put(x, z),   // 自分の場所も同じ変換を通す
    hexes: hexes.map((poly) => poly.map((p) => put(p.x, p.y))),
    // **地図の座標だけを返す。** 盤の座標(x, z)を混ぜて返していたら、
    // 呼ぶ側が「m.x は地図、m.z は盤」という取り違えをした(自分でやった)
    marks: marks.map((m) => ({ id: m.id, icon: m.icon, label: m.label, ...put(m.x, m.z) })),
  };
}
