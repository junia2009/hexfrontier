// 盤面の座標変換(src/render/board-render.js)と、タップの逆引き(src/input.js)。
//
// どちらもテストが1行も触っていなかった。描く処理そのものは canvas が要るので
// 動かせないが、**座標の計算とタップの逆引きは純粋**なので、ここは全部見られる。
//
// この2つが食い違うと「押した場所と違うものが選ばれる」「盤の端に手が届かない」
// になり、遊べなくなる。絵の細部よりよほど重い。
//
// いちばん強いのは**往復**の検査 ── 盤上の全部の頂点・辺・ヘックスを
// 画面の座標へ落とし、そこを押したつもりで逆引きして、元の id が返るか。
// 変換と逆引きは別々のファイルに書かれているので、どちらがずれても落ちる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/state.js';
import {
  LAYOUT, boardVertexIds, boardEdgeIds,
} from '../src/rules/board.js';
import {
  computeView, toPixel, hexCenterOf, PLAYER_COLORS, PLAYER_COLORS_DARK,
} from '../src/render/board-render.js';
import { pickVertex, pickEdge, pickHex } from '../src/input.js';

const MODES = ['base', 'cak', 'dragon', 'fish', 'sea'];
// 縦持ち・横持ち・小さい画面。どれでも同じように成り立つこと
const SIZES = [[390, 700], [844, 390], [320, 480], [1200, 900]];

const boardOf = (mode, seed = 4) =>
  createGame({ seed, playerCount: 4, humanIndex: 0, mode }).board;

test('座標: 盤の頂点が全部、画面の内側に収まる', () => {
  // はみ出すと「端の開拓地に指が届かない」になる。しかも気づきにくい。
  for (const mode of MODES) {
    const board = boardOf(mode);
    for (const [w, h] of SIZES) {
      const view = computeView(w, h, board);
      for (const vid of boardVertexIds(board)) {
        const v = LAYOUT.vertices[vid];
        const [px, py] = toPixel(view, v.x, v.y);
        assert.ok(px >= 0 && px <= w, `${mode} ${w}x${h}: 頂点が横にはみ出す(${px.toFixed(1)})`);
        assert.ok(py >= 0 && py <= h, `${mode} ${w}x${h}: 頂点が縦にはみ出す(${py.toFixed(1)})`);
      }
    }
  }
});

test('座標: 盤の外に余白が残る(港は辺の外へ出るので、ぴったりでは足りない)', () => {
  // 「画面の中に入っている」だけでは足りない ── 余白を 0 にしても
  // 頂点はちょうど端に載るので、上のテストは通ってしまう(実際に見逃した)。
  // 港や看板は頂点より外に描くので、**触れていないこと**まで見る。
  // 実測: 陸の盤は 1.35 単位、航海者たちは 0.40 単位の余白がある。
  const MIN = 0.35; // 単位。いちばん狭い航海者たちより少しだけ内側に置く
  for (const mode of MODES) {
    const board = boardOf(mode);
    for (const [w, h] of SIZES) {
      const view = computeView(w, h, board);
      let clearance = Infinity;
      for (const vid of boardVertexIds(board)) {
        const v = LAYOUT.vertices[vid];
        const [px, py] = toPixel(view, v.x, v.y);
        clearance = Math.min(clearance, px, w - px, py, h - py);
      }
      assert.ok(
        clearance >= MIN * view.scale,
        `${mode} ${w}x${h}: 余白が足りない(${(clearance / view.scale).toFixed(2)}単位)`,
      );
    }
  }
});

test('座標: 画面を大きくすると、そのぶん盤も大きくなる', () => {
  const board = boardOf('base');
  const small = computeView(390, 700, board);
  const big = computeView(780, 1400, board);
  assert.ok(big.scale > small.scale, '倍の画面で拡大率が上がらない');
  // ちょうど倍にしたので拡大率もおよそ倍
  assert.ok(Math.abs(big.scale / small.scale - 2) < 0.01, `倍率が倍になっていない: ${big.scale / small.scale}`);
});

test('座標: 盤の中心が画面の中心に来る', () => {
  for (const mode of MODES) {
    const board = boardOf(mode);
    const [w, h] = [390, 700];
    const view = computeView(w, h, board);
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const vid of boardVertexIds(board)) {
      const v = LAYOUT.vertices[vid];
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const [cx, cy] = toPixel(view, (minX + maxX) / 2, (minY + maxY) / 2);
    assert.ok(Math.abs(cx - w / 2) < 0.5, `${mode}: 横の中心がずれている(${cx} vs ${w / 2})`);
    assert.ok(Math.abs(cy - h / 2) < 0.5, `${mode}: 縦の中心がずれている(${cy} vs ${h / 2})`);
  }
});

test('逆引き: 頂点を押したら、その頂点が返る(盤上の全部で)', () => {
  for (const mode of MODES) {
    const board = boardOf(mode);
    const view = computeView(390, 700, board);
    const all = boardVertexIds(board);
    for (const vid of all) {
      const v = LAYOUT.vertices[vid];
      const [px, py] = toPixel(view, v.x, v.y);
      assert.equal(pickVertex(view, px, py, all), vid, `${mode}: 頂点 ${vid} の往復が合わない`);
    }
  }
});

test('逆引き: 辺を押したら、その辺が返る(盤上の全部で)', () => {
  for (const mode of MODES) {
    const board = boardOf(mode);
    const view = computeView(390, 700, board);
    const all = boardEdgeIds(board);
    for (const eid of all) {
      const e = LAYOUT.edges[eid];
      const [px, py] = toPixel(view, e.x, e.y);
      assert.equal(pickEdge(view, px, py, all), eid, `${mode}: 辺 ${eid} の往復が合わない`);
    }
  }
});

test('逆引き: ヘックスを押したら、そのヘックスが返る(盤上の全部で)', () => {
  for (const mode of MODES) {
    const board = boardOf(mode);
    const view = computeView(390, 700, board);
    const all = board.hexIds;
    for (const hid of all) {
      const c = hexCenterOf(hid);
      const [px, py] = toPixel(view, c.x, c.y);
      assert.equal(pickHex(view, px, py, all), hid, `${mode}: ヘックス ${hid} の往復が合わない`);
    }
  }
});

test('逆引き: 候補に入っていないものは絶対に返さない', () => {
  // 「置ける場所」だけを候補に渡す作りなので、ここが漏れると
  // 置けない場所に置けてしまう(エンジンが弾くが、操作が嘘になる)
  const board = boardOf('base');
  const view = computeView(390, 700, board);
  const all = boardVertexIds(board);
  const target = all[0];
  const v = LAYOUT.vertices[target];
  const [px, py] = toPixel(view, v.x, v.y);

  const without = all.filter((x) => x !== target);
  const got = pickVertex(view, px, py, without);
  assert.notEqual(got, target, '候補から外したものが返った');
  if (got !== null) assert.ok(without.includes(got), '候補にないものが返った');
});

test('逆引き: 遠くを押したら何も返さない(誤爆しない)', () => {
  const board = boardOf('base');
  const view = computeView(390, 700, board);
  const all = boardVertexIds(board);
  // 盤からじゅうぶん離れた場所
  assert.equal(pickVertex(view, -9999, -9999, all), null, '画面外を押して頂点が返った');
  assert.equal(pickEdge(view, -9999, -9999, boardEdgeIds(board)), null, '画面外を押して辺が返った');
  assert.equal(pickHex(view, -9999, -9999, board.hexIds), null, '画面外を押してヘックスが返った');
  // 候補が空なら当然 null
  assert.equal(pickVertex(view, 100, 100, []), null, '候補が空なのに何か返った');
});

test('逆引き: ヘックスの真ん中を押しても、辺や頂点は拾わない', () => {
  // 判定の半径が広すぎると「何もないところを押したのに何か選ばれる」になる。
  // 「遠くを押したら null」だけだと、半径を何倍にしても通ってしまう
  // (9倍にして素通りしたので足した)。
  // 実測: ヘックスの中心から辺の中点まで 0.87 単位、頂点まで 1.00 単位。
  // いまの判定は辺 0.40 / 頂点 0.45 単位なので、どちらも届かないのが正しい。
  for (const mode of MODES) {
    const board = boardOf(mode);
    const view = computeView(390, 700, board);
    const verts = boardVertexIds(board);
    const edges = boardEdgeIds(board);
    for (const hid of board.hexIds) {
      const c = hexCenterOf(hid);
      const [px, py] = toPixel(view, c.x, c.y);
      assert.equal(pickEdge(view, px, py, edges), null, `${mode} ${hid}: 中心を押して辺が返った`);
      assert.equal(pickVertex(view, px, py, verts), null, `${mode} ${hid}: 中心を押して頂点が返った`);
    }
  }
});

test('逆引き: 少しずれて押しても、いちばん近いものが返る', () => {
  const board = boardOf('base');
  const view = computeView(390, 700, board);
  const all = boardVertexIds(board);
  const vid = all[Math.floor(all.length / 2)];
  const v = LAYOUT.vertices[vid];
  const [px, py] = toPixel(view, v.x, v.y);
  // 指はぴったりには当たらない。判定の半径の内側なら拾えること
  for (const [dx, dy] of [[6, 0], [0, 6], [-6, -6], [8, 8]]) {
    assert.equal(pickVertex(view, px + dx, py + dy, all), vid,
      `(${dx},${dy}) ずらしたら別のものが返った`);
  }
});

test('ヘックスの中心: 6頂点の平均で、ヘックスの内側にある', () => {
  const board = boardOf('base');
  for (const hid of board.hexIds) {
    const c = hexCenterOf(hid);
    const vs = LAYOUT.hexVertices[hid].map((vid) => LAYOUT.vertices[vid]);
    const mx = vs.reduce((a, v) => a + v.x, 0) / 6;
    const my = vs.reduce((a, v) => a + v.y, 0) / 6;
    assert.ok(Math.abs(c.x - mx) < 1e-9 && Math.abs(c.y - my) < 1e-9, `${hid}: 中心が平均でない`);
    // 6頂点から見て「だいたい等距離」= ゆがんでいない
    const ds = vs.map((v) => Math.hypot(v.x - c.x, v.y - c.y));
    assert.ok(Math.max(...ds) - Math.min(...ds) < 1e-9, `${hid}: 中心から6頂点までの距離が不揃い`);
  }
});

test('ヘックスの中心: 2度目も同じ値を返す(覚えておく作りが壊れていない)', () => {
  const board = boardOf('base');
  const hid = board.hexIds[0];
  assert.deepEqual(hexCenterOf(hid), hexCenterOf(hid));
});

test('色: 4人ぶんあって、全員違う色', () => {
  assert.equal(PLAYER_COLORS.length, 4);
  assert.equal(PLAYER_COLORS_DARK.length, 4);
  assert.equal(new Set(PLAYER_COLORS).size, 4, '同じ色の人がいる');
  for (const c of [...PLAYER_COLORS, ...PLAYER_COLORS_DARK]) {
    assert.match(c, /^#[0-9a-f]{6}$/, `色の書きかたが揃っていない: ${c}`);
  }
  // 濃いほうは実際に濃い(影や縁に使うので、明るいと沈まない)
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  for (let i = 0; i < 4; i += 1) {
    assert.ok(lum(PLAYER_COLORS_DARK[i]) < lum(PLAYER_COLORS[i]),
      `${i}番目の濃い色が明るい色より暗くない`);
  }
});
