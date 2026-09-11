// 影の箱の置き方。
// **「キャラの影がなびく・チカチカして安定しない」**という報告の中身で、
// 原因は (1) 箱が大きすぎて影マップの目が粗かったこと、
// (2) 箱が升目の上を滑っていたこと。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapFocus, shadowBasis, texelSize,
  SUN_DIST, SHADOW_BOX_BOARD, SHADOW_BOX_WALK,
} from '../src/shadow-fit.js';

const unit = (v) => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
// この島の太陽。仰角 40〜53°のあいだを 300 秒かけて巡る(board3d.js の _tickSky)
const sunAt = (phase) => {
  const ang = phase * Math.PI * 2 - Math.PI * 0.25;
  const elev = 0.35 + 0.65 * Math.max(0.12, Math.cos(phase * Math.PI * 2) * 0.5 + 0.5);
  return unit([Math.cos(ang) * 0.8, elev, Math.sin(ang) * 0.8]);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('影: 歩きモードの箱のほうが目が細かい', () => {
  // ここが「チカチカ」の一番の原因。キャラは腕の太さが 0.05 単位しかないので、
  // 目が粗いと腕が升目に入ったり出たりして消えたり出たりする。
  assert.ok(SHADOW_BOX_WALK < SHADOW_BOX_BOARD, '歩きの箱が盤面より小さくない');
  const 盤面 = texelSize(SHADOW_BOX_BOARD, 2048);
  const 歩き = texelSize(SHADOW_BOX_WALK, 2048);
  assert.ok(歩き < 盤面 / 2, `目の細かさが2倍にもならない(${盤面} → ${歩き})`);
  // 腕(0.05 単位)が最低でも 5 テクセルは乗ること
  assert.ok(0.05 / 歩き >= 5, `腕が ${(0.05 / 歩き).toFixed(1)} テクセルしかない`);
});

test('影: 基底は直交している(升目がゆがまない)', () => {
  for (const p of [0, 0.1, 0.25, 0.4, 0.6, 0.9]) {
    const { right, up, fwd } = shadowBasis(sunAt(p));
    for (const [n, v] of [['right', right], ['up', up], ['fwd', fwd]]) {
      assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9, `${n} が単位ベクトルでない(${p})`);
    }
    assert.ok(Math.abs(dot(right, up)) < 1e-9, `横と縦が直交していない(${p})`);
    assert.ok(Math.abs(dot(right, fwd)) < 1e-9, `横と奥行が直交していない(${p})`);
    assert.ok(Math.abs(dot(up, fwd)) < 1e-9, `縦と奥行が直交していない(${p})`);
  }
});

test('影: 箱の中心は必ず升目の上に乗る', () => {
  const box = SHADOW_BOX_WALK; const map = 2048;
  const t = texelSize(box, map);
  const sun = sunAt(0.02);
  const { right, up } = shadowBasis(sun);
  for (const f of [[0, 0, 0], [2.6, 0, 1.2], [-4.13, 0, 7.77], [0.0031, 0, -0.0017]]) {
    const c = snapFocus(f, sun, box, map);
    for (const [n, axis] of [['横', right], ['縦', up]]) {
      const k = dot(c, axis) / t;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6,
        `${n}方向が升目からずれている(${f} → ${k})`);
    }
  }
});

test('影: 少しずつ動かしても、箱は升目ぶんずつしか動かない', () => {
  // これが「なびく」の正体。中心が連続に滑ると、影の輪郭が升目の境目を
  // 行ったり来たりして、ずっとゆらゆらする。
  const box = SHADOW_BOX_WALK; const map = 2048;
  const t = texelSize(box, map);
  const sun = sunAt(0.02);
  const { right, up } = shadowBasis(sun);
  let last = null; let moved = 0; let still = 0;
  for (let i = 0; i < 200; i++) {
    // テクセル 1/10 ずつ、じわじわ動かす
    const c = snapFocus([i * t * 0.1, 0, 0], sun, box, map);
    if (last) {
      for (const [n, axis] of [['横', right], ['縦', up]]) {
        const step = (dot(c, axis) - dot(last, axis)) / t;
        assert.ok(Math.abs(step - Math.round(step)) < 1e-6,
          `${n}方向に升目の途中まで滑った(${step})`);
      }
      // 升目に乗る面(横×縦)のなかで、動いたか止まったか。
      // 奥行き方向はわざと吸着させていない(平行投影なので影に効かない)。
      const dx = (dot(c, right) - dot(last, right)) / t;
      const dy = (dot(c, up) - dot(last, up)) / t;
      if (Math.hypot(dx, dy) < 0.5) still++; else moved++;
    }
    last = c;
  }
  // 20 テクセルぶんしか動かしていないので、ほとんどのコマは「動かない」
  assert.ok(still > moved * 2, `段ではなく滑っている(止 ${still} / 動 ${moved})`);
});

test('影: 寄せた先は、升目の半分より遠くへはずれない', () => {
  const box = SHADOW_BOX_WALK; const map = 2048;
  const t = texelSize(box, map);
  for (const p of [0, 0.15, 0.33, 0.7]) {
    const sun = sunAt(p);
    for (const f of [[2.6, 0, 1.2], [-5, 0, 3], [0.7, 0, -6.2]]) {
      const c = snapFocus(f, sun, box, map);
      const d = Math.hypot(c[0] - f[0], c[1] - f[1], c[2] - f[2]);
      assert.ok(d <= t * 0.71 + 1e-9,
        `寄せ先が ${d.toFixed(5)} もずれた(升目 ${t.toFixed(5)})`);
    }
  }
});

test('影: 太陽が真上でも壊れない', () => {
  // この島の太陽はそこまで上がらないが、0 除算で影が消えるのは避ける。
  for (const sun of [[0, 1, 0], [0, -1, 0], [0, 0, 0]]) {
    const c = snapFocus([2, 0, 3], sun, SHADOW_BOX_WALK, 2048);
    assert.ok(c.every(Number.isFinite), `壊れた(${sun} → ${c})`);
  }
});

test('影: 箱の奥行きに太陽までの距離が収まる', () => {
  // 太陽を SUN_DIST に置くので、影カメラの near/far がそれを挟んでいないと
  // 島が丸ごと切り落とされて影が消える(board3d.js は near 1 / far SUN_DIST*2.2)。
  assert.ok(SUN_DIST > SHADOW_BOX_BOARD, '太陽が箱より内側にある');
  assert.ok(SUN_DIST * 2.2 > SUN_DIST + SHADOW_BOX_BOARD, '奥行きが足りない');
});
