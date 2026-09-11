// 「寄せる」ときの補間。
// **釣りを始めた瞬間に「ガク」となる**という報告の中身で、原因は
// 釣り場の足場へ瞬間移動させていたこと(1コマで 0.20 単位・144° 飛んでいた)。
// 直したいまは ease01 + approachAngle で時間をかけて詰めている。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ease01, approachAngle } from '../src/minigame/motion.js';

test('寄せる: 両端はぴったり 0 と 1', () => {
  assert.equal(ease01(0), 0);
  assert.equal(ease01(1), 1);
  // 範囲外でも飛び出さない(dt が大きい回で 1 を越えることがある)
  assert.equal(ease01(-3), 0);
  assert.equal(ease01(2.5), 1);
});

test('寄せる: 後戻りしない', () => {
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const v = ease01(i / 100);
    assert.ok(v >= prev, `${i}% で後戻りした(${prev} → ${v})`);
    prev = v;
  }
});

test('寄せる: 動き出しと止まりぎわが遅い', () => {
  // これが無いと、始まりと終わりに角が立つ(= そこで「ガク」となる)。
  const d = (k) => ease01(k + 0.01) - ease01(k);
  assert.ok(d(0) < d(0.45) / 3, `動き出しが遅くない(${d(0)} vs ${d(0.45)})`);
  assert.ok(d(0.99) < d(0.45) / 3, `止まりぎわが遅くない(${d(0.99)} vs ${d(0.45)})`);
});

test('寄せる: 釣り場へ寄る一連が、1コマぶんずつしか動かない', () => {
  // 報告のあった場面をそのまま回す: 0.20 単位はなれた足場へ、
  // 144° よそを向いた状態から、0.22 秒かけて寄る(60fps)。
  const DUR = 0.22;
  const from = { x: 0, z: 0, facing: 0 };
  const to = { x: 0.14, z: 0.14, facing: 144 * Math.PI / 180 };
  let t = 0; let px = 0; let pz = 0; let pf = 0;
  let maxMove = 0; let maxTurn = 0; let last = null;
  for (let i = 0; i < 20; i++) {
    t = Math.min(DUR, t + 1 / 60);
    const e = ease01(t / DUR);
    const x = from.x + (to.x - from.x) * e;
    const z = from.z + (to.z - from.z) * e;
    const f = from.facing + (approachAngle(from.facing, to.facing, Infinity) - from.facing) * e;
    maxMove = Math.max(maxMove, Math.hypot(x - px, z - pz));
    maxTurn = Math.max(maxTurn, Math.abs(f - pf));
    px = x; pz = z; pf = f; last = { x, z, f };
  }
  // 瞬間移動なら 1 コマで全部(0.198 単位 / 144°)動く。
  // 少なくともその 1/5 以下には収まっていること
  assert.ok(maxMove < 0.198 / 5, `1コマで ${maxMove.toFixed(4)} 単位も動いた`);
  assert.ok(maxTurn < (144 / 5) * Math.PI / 180, `1コマで ${(maxTurn * 180 / Math.PI).toFixed(1)}° も回った`);
  // 最後はきっちり着く(手前で止まると、そのあと足場からずれたまま釣る)
  assert.ok(Math.hypot(last.x - to.x, last.z - to.z) < 1e-9, '足場に着いていない');
  assert.ok(Math.abs(last.f - to.facing) < 1e-9, '沖を向いていない');
});

test('寄せる: 向きは最短回り(180° をまたいでも逆に回らない)', () => {
  // 生の差で補間すると、170° → -170° が「20° 回る」ではなく
  // 「340° 逆に回る」になる。その場でくるっと回って見える。
  const cases = [
    [170, -170, 20],
    [-170, 170, -20],
    [0, 179, 179],
    [0, -179, -179],
    [10, 350, -20],
  ];
  for (const [a, b, want] of cases) {
    const ra = a * Math.PI / 180;
    const rb = b * Math.PI / 180;
    const got = (approachAngle(ra, rb, Infinity) - ra) * 180 / Math.PI;
    assert.ok(Math.abs(got - want) < 1e-6, `${a}° → ${b}° が ${got.toFixed(1)}° 回り(期待 ${want}°)`);
    assert.ok(Math.abs(got) <= 180 + 1e-6, `${a}° → ${b}° で半周より大きく回った`);
  }
});

test('寄せる: 最大量を切ると、そのぶんしか回らない', () => {
  const got = approachAngle(0, 1.5, 0.1);
  assert.ok(Math.abs(got - 0.1) < 1e-9, `${got} だけ回った(0.1 のはず)`);
  const back = approachAngle(0, -Math.PI / 2, 0.1);
  assert.ok(Math.abs(back + 0.1) < 1e-9, `${back} だけ回った(-0.1 のはず)`);
});
