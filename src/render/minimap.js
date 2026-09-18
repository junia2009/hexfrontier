// 島の地図を描く(店の「島の見取り図」で出る小さな地図)。
//
// Canvas 2D だけ。THREE も DOM も知らない ── ctx を受け取って描くので、
// 記録用の偽 ctx を渡せばテストから中身を確かめられる。
//
// 形と目印の座標は minigame/island-map.js(純粋な計算)。ここは色と順序だけ。

import { islandMapData } from '../minigame/island-map.js';

const SEA = 'rgba(8, 26, 46, 0.82)';
const LAND = '#4d7a43';
const LAND_EDGE = 'rgba(0, 0, 0, 0.25)';
const YOU = '#ffd97d';
const YOU_EDGE = '#3a2b00';

// 目印の絵。小さいので、絵文字は 10px でも読める大きさに寄せてある
const MARK_SIZE = 11;

// size: 一辺(CSS ピクセル)。dpr: 画面の粒(Retina で2)。
// at: 自分の場所と向き { x, z, facing }。facing は walker と同じ atan2(x, z)。
export function drawMinimap(ctx, state, { size = 92, dpr = 1, at = null, pad = 8 } = {}) {
  if (!ctx || !state?.board) return false;
  const d = islandMapData(state, size, pad);

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  // 海(下地)。丸く切り抜いて「のぞき窓」に見せる
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = SEA;
  ctx.fill();
  ctx.save();
  ctx.clip();

  // 陸
  ctx.fillStyle = LAND;
  ctx.strokeStyle = LAND_EDGE;
  ctx.lineWidth = 0.6;
  for (const poly of d.hexes) {
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 目印。**自分より先に描く** ── 重なったとき、自分が下に隠れない
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${MARK_SIZE}px system-ui, sans-serif`;
  for (const m of d.marks) {
    ctx.fillText(m.icon, m.x, m.y);
  }

  // 自分。向きが分かるように三角で描く(地図は回さない ── 島の形が
  // 毎フレーム回ると、どこに何があるか覚えられなくなる)
  if (at) {
    const p = { x: at.x * d.t.scale + d.t.ox, y: at.z * d.t.scale + d.t.oy };
    const f = at.facing ?? 0;
    // facing は atan2(x, z)。地図では x が右、z が下なので、進む先は
    // (sin f, cos f) の向きになる
    const fx = Math.sin(f);
    const fz = Math.cos(f);
    const head = 6;
    const side = 3.6;
    ctx.beginPath();
    ctx.moveTo(p.x + fx * head, p.y + fz * head);
    ctx.lineTo(p.x - fx * side + fz * side, p.y - fz * side - fx * side);
    ctx.lineTo(p.x - fx * side - fz * side, p.y - fz * side + fx * side);
    ctx.closePath();
    ctx.fillStyle = YOU;
    ctx.strokeStyle = YOU_EDGE;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();   // clip を外す

  // 縁取り。島と画面の境目をはっきりさせる
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 217, 125, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
  return true;
}
