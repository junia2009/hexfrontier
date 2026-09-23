// 盤まわりの「見本」。
//
// **色の品を、文で売っていた。** 盤の柄を選ぶ手がかりが
// 「夕日に焼けた色合い。畑と丘に赤みが差します」という文だけで、
// 肝心の色がどこにも出ていなかった ──「分かりにくすぎる」と言われた。
// しかも盤は対戦中にしか無いので、押しても目の前では何も変わらない。
// **選ぶところに、現物を出す。**
//
// ここは文字列を返すだけ(THREE も DOM も canvas も使わない)。
// gear.js が色と形を持ち、ここが SVG に読み替える ── hats.js と
// body.js の関係と同じで、node のテストから中身を直に測れる。
//
// **見本は本物と同じ変換を通す。** 盤の見本は board-render.js の
// TERRAIN_STYLE に gear.js の tintHex を掛けて作る ── 別表に色を
// 書き写すと、柄を足したときに見本だけ古い色のまま残る。

import { GEAR_BY_ID, ROOF_SHAPES, tintHex } from '../gear.js';
import { TERRAIN_STYLE } from './board-render.js';

// 盤の見本に出す地形。**6つに絞る。**
// 全部(9つ)出すと 36px の中では色が細切れになって、かえって差が見えない。
// 選んだのは「柄で動きの大きい順」── 畑と丘は夕暮れで赤みが差すところ、
// 森と牧草地はいちばん近い2色(ここが潰れていないかを見せる)、
// 山と砂漠は寒暖の向きが出るところ。
export const SWATCH_TERRAINS = ['forest', 'pasture', 'field', 'hill', 'mountain', 'desert'];

// 六角形の頂点(平頂 flat-top)。r は外接円の半径
function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 180) * (60 * i);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// 盤 ── 地形を小さな蜂の巣に並べる。**チップの列ではなく六角形にする**:
// 「これは盤の話だ」が、名前を読まなくても分かる
function boardSwatch(item) {
  const R = 5.6;
  const dx = R * 1.5;
  const dy = R * Math.sqrt(3);
  const cells = SWATCH_TERRAINS.map((t, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = R + col * dx;
    const cy = R * Math.sqrt(3) / 2 + row * dy + (col % 2) * (dy / 2);
    const fill = tintHex(TERRAIN_STYLE[t].top, item.shift);
    return `<polygon points="${hexPoints(cx, cy, R)}" fill="${fill}"/>`;
  }).join('');
  return `<svg class="gsw" viewBox="0 0 28 25" aria-hidden="true">${cells}</svg>`;
}

// サイコロ ── 地は face→edge のグラデ(2D 盤と同じ塗り)、目は pip。
// **edge も出す。** 下のほうの目は edge の上に乗るので、edge を暗くしすぎた
// 柄はここで目が沈んで見える(そこを直したのが gear.js の履歴)
function diceSwatch(item) {
  const g = `gsw-${item.id}`;
  const pips = [[8, 8], [18, 8], [13, 13], [8, 18], [18, 18]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.1" fill="${item.pip}"/>`).join('');
  return `<svg class="gsw" viewBox="0 0 26 26" aria-hidden="true">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${item.face}"/><stop offset="1" stop-color="${item.edge}"/>
    </linearGradient></defs>
    <rect x="1" y="1" width="24" height="24" rx="5" fill="url(#${g})"/>${pips}</svg>`;
}

// コマ ── 屋根の形とつやだけ。
//
// **胴に色を置かない。** 席の色は柄で変わらない決めごと(gear.js の2つめ)
// なので、見本に赤を置くと「赤くなる品」に見えてしまう。灰で形を見せて、
// 変わるところ(屋根の形・つや)だけを出す。
const ROOF_PATH = {
  cone: 'M3 13 L13 4 L23 13 Z',        // 三角屋根
  tall: 'M4 13 L13 1 L22 13 Z',        // とがった天幕
  box: 'M3 13 L3 10 L23 10 L23 13 Z',  // 平らな陸屋根
};

function pieceSwatch(item) {
  const roof = ROOF_PATH[item.roof] ?? ROOF_PATH.cone;
  // **0.4 は「金属かどうか」の境目。** ここの > を >= にしても振る舞いは
  // 変わらない(コマの metalness は 0 か 0.65 で、0.4 ちょうどが無い)──
  // 故障注入の見逃し1件はこれで、等価変異。柄を足して 0.4 を使うなら考え直す
  const metal = (item.finish?.metalness ?? 0) > 0.4;
  const body = metal ? '#d5dae1' : '#bcc3cb';
  // つやは斜めのハイライトで出す(磨きのコマだけ光る)
  const shine = metal
    ? '<path d="M9 14 L13 14 L10 24 L7 24 Z" fill="#ffffff" opacity="0.45"/>'
    : '';
  return `<svg class="gsw" viewBox="0 0 26 26" aria-hidden="true">
    <path d="${roof}" fill="#8d959e"/>
    <rect x="5" y="13" width="16" height="11" rx="1" fill="${body}"/>${shine}</svg>`;
}

// 卓の灯り ── 夜の地に、明るさぶんの灯り。
// **灯りなしも見本を出す**(暗いまま)。並べて初めて「どれだけ変わるか」が分かる
function lightSwatch(item) {
  const g = `gsw-${item.id}`;
  const glow = Math.max(0, Math.min(1, item.glow ?? 0));
  const halo = glow > 0
    ? `<defs><radialGradient id="${g}">
         <stop offset="0" stop-color="#ffd9a0" stop-opacity="${(0.35 + 0.6 * glow).toFixed(2)}"/>
         <stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/>
       </radialGradient></defs>
       <circle cx="13" cy="13" r="${(5 + 8 * glow).toFixed(1)}" fill="url(#${g})"/>
       <circle cx="13" cy="13" r="${(1.6 + 1.6 * glow).toFixed(1)}" fill="#ffe9c4"/>`
    : '';
  return `<svg class="gsw" viewBox="0 0 26 26" aria-hidden="true">
    <rect x="1" y="1" width="24" height="24" rx="5" fill="#1b2438"/>${halo}</svg>`;
}

const BY_SLOT = {
  board: boardSwatch,
  dice: diceSwatch,
  piece: pieceSwatch,
  light: lightSwatch,
};

// 盤まわりの品の見本。**知らない id では空を返す**(絵文字のまま出る)──
// 持ち物も店も、盤まわり以外の品を同じ関数に通すので落としてはいけない
export function gearSwatch(id) {
  const item = GEAR_BY_ID[id];
  if (!item) return '';
  const make = BY_SLOT[item.slot];
  return make ? make(item) : '';
}

// 描ける屋根の名前(テストが ROOF_SHAPES と突き合わせる)
export const SWATCH_ROOFS = Object.keys(ROOF_PATH);

// gear.js が屋根の名前を増やしたのに、ここが知らないままなら見本が嘘になる。
// **読み込んだ時点で気づけるように**、名前の集合をここで突き合わせておく
// (テストでも見張るが、E2E で「なぜか全部三角屋根」を追うのは高くつく)
export const ROOFS_COVERED = ROOF_SHAPES.every((r) => r in ROOF_PATH);
