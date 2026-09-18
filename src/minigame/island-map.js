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
export function toMap(t, x, z) {
  return { x: x * t.scale + t.ox, y: z * t.scale + t.oy };
}

// 地図に出すものを1回でそろえる。描く側はこれだけ見ればよい。
export function islandMapData(state, size, pad = 6) {
  const bounds = islandBounds(state);
  const hexes = islandHexes(state);
  const marks = islandMarks(state);
  // **目印も「収める点」に入れる。** 桟橋は岸のいちばん外に立つので、
  // 陸の形だけで合わせると円の縁で切れる。
  const points = [...hexes.flat(), ...marks.map((m) => ({ x: m.x, y: m.z }))];
  const t = mapTransform(bounds, size, pad, points);
  return {
    t,
    hexes: hexes.map((poly) => poly.map((p) => toMap(t, p.x, p.y))),
    marks: marks.map((m) => ({ ...m, ...toMap(t, m.x, m.z) })),
  };
}
