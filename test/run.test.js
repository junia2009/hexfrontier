// 駆け足と、歩き出しの手応え。
//
// 「歩くのはとても良くなってるけど、速度がとても遅い」という報告から。
// 島の端から端に 11.1 秒かかっていた。速さと歩数は**一本の紐でつながって
// いる**(脚が短いので、速くすると歩数が増えて画面が振動する)ので、
// 歩きは控えめに上げるだけにして、足りないぶんは駆け足が受け持つ。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WalkerMotion, WALK_SPEED, RUN_SPEED, RUN_GAIT, ACCEL,
  CAM_FOLLOW, camFollow, smooth,
} from '../src/minigame/motion.js';
import {
  strideOf, phasePerUnit, restBlend, walkPose, LEG_SWING, STEP_SLIP,
} from '../src/minigame/pose.js';
import { ROLL_WALK, ROLL_ACCEL } from '../src/minigame/logroll.js';
import { DRAGON_SPEED } from '../src/minigame/meet/dragon-hunt.js';

const DT = 1 / 60;
const flat = () => new WalkerMotion(() => ({ y: 0, ok: true }));
// 前へ倒しっぱなしで走らせて、毎コマの速さを返す
function hold(mag, secs, tweak = null) {
  const m = flat();
  m.setPosition(0, 0);
  tweak?.(m);
  const out = [];
  for (let i = 0; i < secs / DT; i++) {
    const r = m.update(DT, { x: 0, y: mag }, 0);
    out.push({ t: (i + 1) * DT, speed: r.speed, running: m.running });
  }
  return out;
}
const speedAt = (log, t) => log.find((r) => r.t >= t - 1e-9).speed;

test('駆け足: 全倒しを続けると速くなる', () => {
  const log = hold(1, 3);
  // 入るまでは歩きの速さ。入ったら駆け足の速さ
  assert.ok(speedAt(log, 0.3) < WALK_SPEED * 1.02, '入る前から速い');
  const last = log[log.length - 1];
  assert.ok(last.running, '倒し続けても駆け足に入らない');
  assert.ok(Math.abs(last.speed - RUN_SPEED) < 1e-3,
    `駆け足の速さが出ていない(${last.speed} / ${RUN_SPEED})`);
  // **すぐには入らない。** ちょっと動かすだけの操作まで速くなると、
  // 散策のテンポが無くなる
  const first = log.find((r) => r.running);
  assert.ok(first.t > 0.25, `${first.t.toFixed(2)}秒で駆け足に入る(早すぎる)`);
  assert.ok(first.t < 0.8, `${first.t.toFixed(2)}秒もかかる(遠くへ行けない)`);
});

test('駆け足: 半端に倒しているあいだは入らない', () => {
  // スティックはアナログ(倒し具合 = 速さ)。**全倒しだけを合図にする** ──
  // 少し倒して寄っていく操作まで駆け足になると、狙ったところで止まれない。
  for (const mag of [0.5, 0.7, 0.85]) {
    const log = hold(mag, 3);
    assert.ok(!log[log.length - 1].running, `倒し ${mag} で駆け足に入った`);
    assert.ok(log[log.length - 1].speed < WALK_SPEED * 1.02, `倒し ${mag} で速すぎる`);
  }
});

test('駆け足: 緩めたらすぐ歩きに戻る', () => {
  const m = flat();
  m.setPosition(0, 0);
  for (let i = 0; i < 2 / DT; i++) m.update(DT, { x: 0, y: 1 }, 0);
  assert.ok(m.running, '駆け足に入っていない');
  m.update(DT, { x: 0, y: 0.5 }, 0);
  assert.ok(!m.running, '緩めても駆け足のまま');
  // 入り直すにはまた全倒しを続ける必要がある(押し直しで即復帰しない)
  m.update(DT, { x: 0, y: 1 }, 0);
  assert.ok(!m.running, '1コマで駆け足に戻った');
});

test('駆け足: 切っておけば入らない(遊びの最中)', () => {
  // 丸太・櫓・竜から逃げる場面は、どれも歩く速さを基準に釣り合いを
  // 取ってある。walk-mode.js が runSpeed を null にして止める。
  const log = hold(1, 3, (m) => { m.runSpeed = null; });
  assert.ok(!log[log.length - 1].running, '切ってあるのに駆け足に入った');
  assert.ok(Math.abs(log[log.length - 1].speed - WALK_SPEED) < 1e-3, '歩きの速さでない');
});

test('駆け足: 竜からは逃げられるが、歩いていたら捕まる', () => {
  // 竜は歩きより遅い(直線では追いつけない)。**駆け足はその上を行く**ので、
  // 竜から逃げる遊びの最中は駆け足を切らないと成立しない
  // (walk-mode.js が this.hunt のあいだ切っている)。
  assert.ok(DRAGON_SPEED < WALK_SPEED, '竜が歩きより速い');
  assert.ok(RUN_SPEED > WALK_SPEED, '駆け足が歩きより速くない');
  assert.ok(RUN_SPEED > DRAGON_SPEED * 1.5,
    '駆け足が竜と近すぎる(切らなくても壊れないなら、この試験の前提が変わっている)');
});

test('駆け足: 丸太の上は別の速さと舵のまま', () => {
  // 丸太乗りは「流されるのを足で押し返せるか」の遊び。舵の効きを
  // 島と揃えたら、達人が 90 秒逃げ切って勝負が決まらなくなった(実測)。
  assert.ok(ROLL_ACCEL < ACCEL, '丸太の舵が島と同じになっている');
  assert.notEqual(ROLL_WALK, WALK_SPEED, '丸太の速さが島と同じになっている');
});

test('駆け足: 歩幅が伸びるので、歩数が暴れない', () => {
  const steps = (speed, gait) => (speed * phasePerUnit(gait)) / Math.PI;
  const walk = steps(WALK_SPEED, 1);
  const run = steps(RUN_SPEED, RUN_GAIT);
  // 秒 6.4 歩で「ガクガクして疲れる」と言われた線。駆け足でも越えない
  assert.ok(run < 6.4, `駆け足の歩数が ${run.toFixed(2)}/秒(画面が振動する)`);
  assert.ok(walk < 6.4, `歩きの歩数が ${walk.toFixed(2)}/秒`);
  // 歩幅を伸ばさないと、同じ速さで秒 8 歩になる
  const naive = (RUN_SPEED * phasePerUnit(1)) / Math.PI;
  assert.ok(naive > run * 1.25,
    `歩幅を伸ばした効きが小さい(伸ばさない ${naive.toFixed(1)} / 伸ばす ${run.toFixed(1)})`);
});

test('駆け足: 歩きの脚の運びは1ミリも変えていない', () => {
  // **ここが変わったら、せっかく直した歩きが道連れになる。**
  for (const gait of [0, 0.25, 0.5, 0.8, 1]) {
    const st = strideOf(gait);
    assert.equal(st.swing, LEG_SWING, `倒し ${gait} で腰の振りが変わった`);
    assert.equal(st.slip, STEP_SLIP, `倒し ${gait} で1歩の距離が変わった`);
    assert.ok(Math.abs(phasePerUnit(gait) - phasePerUnit(1)) < 1e-12,
      `倒し ${gait} で位相の進みが変わった`);
  }
  // 駆け足のほうは伸びている(伸びていなければ上の試験が意味を失う)
  assert.ok(strideOf(RUN_GAIT).swing > LEG_SWING, '駆け足で腰の振りが伸びない');
  assert.ok(strideOf(RUN_GAIT).slip > STEP_SLIP, '駆け足で1歩の距離が伸びない');
});

test('歩き出し: 加速に縮尺を掛けない', () => {
  // ACCEL は「1/秒」の収束レートで、scale.js の決め(時間と角速度は掛けない)
  // の側。sc(9) にしていたので全速の 95% まで 0.65 秒かかり、ちょっと
  // 動かすたびに重かった。
  const log = hold(1, 1.5, (m) => { m.runSpeed = null; });   // 駆け足を混ぜない
  const t95 = log.find((r) => r.speed >= WALK_SPEED * 0.95).t;
  assert.ok(t95 < 0.45, `全速の 95% まで ${t95.toFixed(2)}秒 かかる(重い)`);
  // かといって瞬時でもない(ぬるっと動き出すのは残す)
  assert.ok(t95 > 0.12, `${t95.toFixed(2)}秒 で全速(手応えが硬い)`);
});

test('歩き出し: 最初の半秒で進む距離', () => {
  // 手応えは「最初のひと押しでどれだけ動くか」で決まる。
  // 縮尺を掛けていたころは、すぐ全速の場合の 63% しか進めていなかった。
  const log = hold(1, 0.5, (m) => { m.runSpeed = null; });
  const d = log.reduce((s, r) => s + r.speed * DT, 0);
  assert.ok(d > WALK_SPEED * 0.5 * 0.75,
    `最初の半秒で ${(d / (WALK_SPEED * 0.5) * 100).toFixed(0)}% しか進めない`);
});

// ---- 止まったとき ----

test('止まると足がそろう', () => {
  // **歩きの位相は止まった形のまま残る。** そのままだと片足を前に出した
  // 姿勢で固まる(実測で、左右の脚が 0.264 ラジアン開いたまま止まっていた)。
  const b = restBlend();
  // 脚が開いている位相(sin が大きいところ)から止める
  const mid = walkPose(Math.PI / 2, 1, 0);
  assert.ok(Math.abs(mid.legs[0].rootX) > 0.2, '前提: 開いた姿勢で試していない');
  let out = null;
  for (let i = 0; i < 60; i++) out = b.pose(mid, 0, false, DT);
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs(out.legs[i].rootX) < 1e-9,
      `足が前に出たまま(${out.legs[i].rootX.toFixed(3)})`);
  }
  assert.ok(Math.abs(out.lift) < 1e-9, '腰が沈んだまま');
});

test('止まると: そろうまでが段にならない', () => {
  const b = restBlend();
  const mid = walkPose(Math.PI / 2, 1, 0);
  let prev = mid.legs[0].rootX;
  let max = 0;
  for (let i = 0; i < 60; i++) {
    const p = b.pose(mid, 0, false, DT);
    max = Math.max(max, Math.abs(p.legs[0].rootX - prev));
    prev = p.legs[0].rootX;
  }
  // つながずに切り替えると、開いていたぶんを 1 コマで全部動く。
  // その 1/5 以下に収まること
  const span = Math.abs(mid.legs[0].rootX);
  assert.ok(max < span / 5, `1コマで ${max.toFixed(3)} 動いた(全体で ${span.toFixed(3)})`);
});

test('止まると: 歩き出したら、入るより速く抜ける', () => {
  // 押してから足が出るまでに間があると、操作が重く感じる
  const b = restBlend();
  const mid = walkPose(Math.PI / 2, 1, 0);
  let inT = 0;
  while (b.weight < 1 && inT < 2) { b.pose(mid, 0, false, DT); inT += DT; }
  let outT = 0;
  while (b.weight > 0 && outT < 2) { b.pose(mid, 0, true, DT); outT += DT; }
  assert.ok(outT < inT, `抜けるほうが遅い(入り ${inT.toFixed(2)} / 抜け ${outT.toFixed(2)})`);
  assert.ok(outT < 0.2, `歩き出しに ${outT.toFixed(2)}秒 かかる(重い)`);
  assert.ok(inT > 0.15, `${inT.toFixed(2)}秒 で足がそろう(急に立つ)`);
});

test('止まると: 歩いているあいだは触らない', () => {
  const b = restBlend();
  const p = walkPose(1.2, 1, 0.4);
  const out = b.pose(p, 0.4, true, DT);
  assert.equal(out, p, '歩いているのに姿勢を作り替えている');
  assert.equal(b.weight, 0);
});

test('止まると: reset で白紙に戻る', () => {
  const b = restBlend();
  const mid = walkPose(Math.PI / 2, 1, 0);
  for (let i = 0; i < 60; i++) b.pose(mid, 0, false, DT);
  assert.ok(b.weight > 0.9, '立ち姿になっていない');
  b.reset();
  assert.equal(b.weight, 0);
  assert.equal(b.pose(mid, 0, true, DT), mid, 'reset のあとも混ざっている');
});

// ---- カメラの回り込み ----

// walk-mode.js の _frame と同じ式で、カメラを回しながら歩かせる。
// **輪ができるかどうかは、この閉じた輪を回さないと出ない** ──
// 「行き先はカメラ基準 / カメラは本人の向きを追う」で噛み合うのが本体。
function strollWithCamera(input, secs = 2) {
  const m = flat();
  m.setPosition(0, 0);
  m.runSpeed = null;               // 駆け足は別の話なので混ぜない
  let camYaw = 0;
  const from = { x: m.pos.x, z: m.pos.z };
  for (let i = 0; i < secs / DT; i++) {
    m.update(DT, input, camYaw);
    const speed = Math.hypot(m.vel.x, m.vel.z);
    const follow = camFollow(input);
    if (follow > 0 && speed > WALK_SPEED * 0.35) {
      const d = ((m.facing - camYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2)
        % (Math.PI * 2) - Math.PI;
      camYaw += d * smooth(CAM_FOLLOW * follow, DT);
    }
  }
  return {
    turned: Math.abs(camYaw) * 180 / Math.PI,
    dist: Math.hypot(m.pos.x - from.x, m.pos.z - from.z),
    straight: WALK_SPEED * secs,
  };
}

test('カメラ: 下に倒しても、その場で回らない', () => {
  // **報告の本体。** 行き先はカメラの向きを基準に決めているので、
  // カメラが本人の向きを追うと輪になる。実測で 2 秒に 570°(1.6 周)
  // 回って、ほとんど進んでいなかった(1.45 進むはずが 0.5)。
  const r = strollWithCamera({ x: 0, y: -1 });
  assert.ok(r.turned < 5, `2秒で ${r.turned.toFixed(0)}° 回った`);
  assert.ok(r.dist > r.straight * 0.8,
    `まっすぐ歩けていない(${r.dist.toFixed(2)} / ${r.straight.toFixed(2)})`);
});

test('カメラ: 横に倒しても、その場で回らない', () => {
  for (const x of [1, -1]) {
    const r = strollWithCamera({ x, y: 0 });
    assert.ok(r.turned < 5, `横 ${x} で 2秒に ${r.turned.toFixed(0)}° 回った`);
    assert.ok(r.dist > r.straight * 0.8, `横 ${x} でまっすぐ歩けていない`);
  }
});

test('カメラ: 斜めは少しだけ回り込む(輪にはならない)', () => {
  // 斜めは重み 0 にできない(前向きの成分があるので)。速さのほうで抑える。
  const r = strollWithCamera({ x: 0.7, y: 0.7 });
  assert.ok(r.turned > 2, `斜めでまったく回り込まない(${r.turned.toFixed(0)}°)`);
  assert.ok(r.turned < 45, `斜めで 2秒に ${r.turned.toFixed(0)}° も回る(輪になる)`);
  assert.ok(r.dist > r.straight * 0.6, `斜めで進めていない(${r.dist.toFixed(2)})`);
});

test('カメラ: 真っ直ぐ奥へ歩くときは回さない', () => {
  const r = strollWithCamera({ x: 0, y: 1 });
  assert.ok(r.turned < 1, `真上で ${r.turned.toFixed(1)}° 回った`);
  assert.ok(r.dist > r.straight * 0.9, 'まっすぐ歩けていない');
});

test('カメラ: 回り込む重みは「奥へ」の成分', () => {
  assert.equal(camFollow({ x: 0, y: 1 }), 1);          // 真上
  assert.equal(camFollow({ x: 1, y: 0 }), 0);          // 真横
  assert.equal(camFollow({ x: 0, y: -1 }), 0);         // 真下
  assert.equal(camFollow({ x: 0.6, y: -0.8 }), 0);     // 斜め手前
  assert.equal(camFollow({ x: 0, y: 0 }), 0);          // 倒していない
  const d = camFollow({ x: 0.6, y: 0.8 });
  assert.ok(Math.abs(d - 0.8) < 1e-9, `斜め奥の重みが ${d}`);
});
