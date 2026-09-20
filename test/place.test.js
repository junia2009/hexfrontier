// 飾りを置く前の下見(src/minigame/place.js)。
//
// **前は一点しか選べなかった。** placeSpot が「足もとの 0.62 前、自分のほうを
// 向けて」を返すだけで、遠さも向きも動かせない ── 並べようとすると立ち位置を
// 足で踏み直すしかなかった(「物設置をもっと接点細かく選べるようにしたい」)。
// ここは、その刻みの決めごとを見張る。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NEAR_MAX, NEAR_MIN, NEAR_STEP, TURN_STEP, TURN_STEPS,
  aimNudge, aimSpot, aimTurn, canNudge, newAim,
} from '../src/minigame/place.js';
import { DECOR_BY_ID, PLACE_AHEAD, placeSpot } from '../src/minigame/decor.js';

const AT = { x: 1.25, z: -0.4, facing: 0.7 };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// **何も触らずに置いた人は、今までとまったく同じ場所に置ける。**
// 下見を足したせいで既定の置き場所が動くと、今まで並べてきた人の手が狂う。
test('下見: はじめの見本は、今までの置き場所とぴたり同じ', () => {
  const a = newAim('bench');
  assert.equal(a.id, 'bench');
  assert.equal(a.away, PLACE_AHEAD);
  assert.equal(a.turn, 0);
  const want = placeSpot(AT);
  const got = aimSpot(a, AT);
  assert.ok(near(got.x, want.x), `x がずれた ${got.x} / ${want.x}`);
  assert.ok(near(got.z, want.z), `z がずれた ${got.z} / ${want.z}`);
  assert.ok(near(got.facing, want.facing), '向きがずれた');
});

test('下見: 見本は自分の正面にある。遠さのぶんだけ離れる', () => {
  for (const facing of [0, 0.7, Math.PI, -2.2, 5.9]) {
    const at = { x: -0.3, z: 2.1, facing };
    let a = newAim('lamp');
    for (const _ of [1, 2, 3]) a = aimNudge(a, 1);
    const s = aimSpot(a, at);
    const d = Math.hypot(s.x - at.x, s.z - at.z);
    assert.ok(near(d, a.away, 1e-9), `離れかたが違う(${d} / ${a.away})`);
    // 正面にある(自分から見本への向きが、自分の向きと同じ)
    const toward = Math.atan2(s.x - at.x, s.z - at.z);
    const diff = Math.abs(((toward - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    assert.ok(diff < 1e-9, `正面にない(ずれ ${diff})`);
  }
});

// 近すぎると置いた瞬間に自分が中にいて押し出される。遠すぎると何を
// 置いているのか見えない
test('下見: 遠さは帯の中に収まる。端では押せない', () => {
  let a = newAim('bench');
  for (let i = 0; i < 200; i += 1) a = aimNudge(a, 1);
  assert.equal(a.away, NEAR_MAX, '遠くの端で止まっていない');
  assert.equal(canNudge(a, 1), false, '端なのに押せる');
  assert.equal(canNudge(a, -1), true);
  for (let i = 0; i < 200; i += 1) a = aimNudge(a, -1);
  assert.equal(a.away, NEAR_MIN, '近くの端で止まっていない');
  assert.equal(canNudge(a, -1), false, '端なのに押せる');
  assert.ok(NEAR_MIN < PLACE_AHEAD && PLACE_AHEAD < NEAR_MAX, 'はじめの位置が帯の外');
  // 1回で動く量。**いちばん細い飾りより小さい** ── これより粗いと、
  // 並べたときに隣との間隔を合わせられない
  const thin = Math.min(...Object.values(DECOR_BY_ID).map((d) => d.r));
  assert.ok(NEAR_STEP < thin, `刻みが粗い(${NEAR_STEP} ≧ いちばん細い飾り ${thin})`);
  // 端から端まで、指が疲れない回数で行ける
  const steps = Math.round((NEAR_MAX - NEAR_MIN) / NEAR_STEP);
  assert.ok(steps >= 6 && steps <= 16, `端から端まで ${steps} 回は多すぎ/少なすぎ`);
});

test('下見: 向きはひとまわりして戻る', () => {
  let a = newAim('flag');
  assert.ok(TURN_STEPS >= 12 && TURN_STEPS <= 36, `向きの刻みが ${TURN_STEPS} 通りは変`);
  for (let i = 0; i < TURN_STEPS; i += 1) a = aimTurn(a, 1);
  assert.ok(near(a.turn, 0, 1e-9), `ひとまわりで戻らない(${a.turn})`);
  // 逆まわりでも 0〜2π に畳まれる(負のまま持ち回さない)
  let b = aimTurn(newAim('flag'), -1);
  assert.ok(b.turn > 0 && b.turn < Math.PI * 2, `畳めていない(${b.turn})`);
  assert.ok(near(b.turn, Math.PI * 2 - TURN_STEP), '逆まわりの1刻みが違う');
  b = aimTurn(b, 1);
  assert.ok(near(b.turn, 0, 1e-9), '戻らない');
});

test('下見: 回すと見本の向きだけ変わる。場所は動かない', () => {
  const a = newAim('planter');
  const b = aimTurn(aimTurn(a, 1), 1);
  const s0 = aimSpot(a, AT);
  const s1 = aimSpot(b, AT);
  assert.ok(near(s0.x, s1.x) && near(s0.z, s1.z), '回したら場所まで動いた');
  assert.ok(near(s1.facing - s0.facing, TURN_STEP * 2), '向きが2刻みぶん変わっていない');
});

test('下見: 何も無くても落ちない', () => {
  assert.equal(aimSpot(null, AT), null);
  assert.equal(aimSpot(newAim('bench'), null), null);
  assert.equal(aimNudge(null, 1), null);
  assert.equal(aimTurn(null, 1), null);
  assert.equal(canNudge(null, 1), false);
});
