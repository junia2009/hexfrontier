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
} from '../src/minigame/motion.js';
import { strideOf, phasePerUnit, LEG_SWING, STEP_SLIP } from '../src/minigame/pose.js';
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
