// 丸太乗り(src/minigame/logroll.js)。
//
// **本物の動き(WalkerMotion)をでっかい丸太の上で回して測る。**
// 「転がされる」も「切れ目に落ちる」も文章では確かめようがないので、
// 実際に立たせて座標を見る。
//
// ここが押さえるもの:
//   1. 立っているだけだと転がされて落ちる(遊びとして成立する下限)
//   2. 逆らって歩けば留まれる(理不尽ではない上限)
//   3. 切れ目が上に来たら抜ける。**どの瞬間にも逃げ場がある**
//   4. 落ちたら**丸太に戻らない**(復帰先の固定。ここが緩むと脱落しなくなる)
//   5. 丸太はまるごと海の上に浮いている
//   6. 曲面がそのまま歩ける(横へ行くほど低くなり、端で足場が切れる)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/state.js';
import { makeGround } from '../src/minigame/ground.js';
import { WalkerMotion, WALK_SPEED, WATER_Y } from '../src/minigame/motion.js';
import { TILE_TOP } from '../src/terrain.js';
import { contestOutcome } from '../src/minigame/contest.js';
import { addContestResult, emptyProgress, summarize } from '../src/progress.js';
import { achievementById } from '../src/achievements.js';
import {
  COURSE_L, COURSE_W, DRUM_AXIS, DRUM_BAND, DRUM_LEN, DRUM_R, DRUM_TOP, GRACE_MS,
  FREE_TURN, HOLE_ARC, angleAt, courseGround, findAnchor, holeOpen, makeCourse, rollTime, safeZ,
  ROLL_MS, slipRate, spinAt, startSpots, toLocal, toWorld, turnAt, turnOf,
  upstreamFace, withCourse,
} from '../src/minigame/logroll.js';

const island = (seed = 7) => createGame({ seed, playerCount: 4, humanIndex: -1, mode: 'sea' });

// 丸太を1本用意する
function setup(seed = 7) {
  const st = island(seed);
  const ground = makeGround(st);
  const anchor = findAnchor(ground);
  const course = makeCourse(st.seed);
  return { st, ground, anchor, course };
}

// 時刻 t の地面(島 + 丸太)
const groundAtT = ({ ground, course, anchor }, t) =>
  withCourse(ground, courseGround(course, anchor, t));

// 丸太の上に立たせて、ぶんまわす。
// input は毎フレームの入力。**関数を渡すと、そのときの状態から決められる**
// ── 人は流されぐあいを見ながら足を出すので、固定の入力で測ると
// 「うまく乗れるか」ではなく「その1通りが当たるか」を測ってしまう。
function ride(fix, { input = { x: 0, y: 0 }, secs = 4, at = null, pin = true }) {
  let t = 0;
  const m = new WalkerMotion((x, z) => groundAtT(fix, t)(x, z));
  const spot = at ?? startSpots(fix.course, fix.anchor, 1)[0];
  m.setPosition(spot.x, spot.z);
  if (pin) m.setRespawn(0, 0, { pin: true });   // 岸に固定(原点は主島の陸)
  const dt = 1 / 60;
  let fell = false;
  let worst = 0;
  for (let i = 0; i < secs / dt; i++) {
    t += dt;
    const local = toLocal(fix.anchor, m.pos.x, m.pos.z);
    const a = Math.asin(Math.max(-1, Math.min(1, local.x / DRUM_R)));
    worst = Math.max(worst, Math.abs(a));
    const inp = typeof input === 'function' ? input({ t, a, local, m }) : input;
    const r = m.update(dt, inp, 0);
    // **足元が抜けた時点で負け**(walk-mode の _watchDrumFall と同じ物差し)。
    // 沈みきるのを待つと、沈むあいだに漕いで丸太へ戻れたり、まわりの
    // 小島へ降り立って脱落しそこねたりする。
    if (r.falling || r.inWater || r.respawned) { fell = true; break; }
  }
  return { m, fell, t, worst, local: toLocal(fix.anchor, m.pos.x, m.pos.z) };
}

// 腕前 skill の人の操作。流れと滑りに逆らいつつ、切れ目を先読みしてよける。
//
// **スティックは合計 1 まで。** よけるのに使ったぶんは流れに使えない ──
// この取り合いが遊びの手ごたえそのものなので、片方だけを模すと
// 「うまく乗れるか」ではなく「その1通りが当たるか」を測ってしまう。
//
// 入力から世界の動きへの対応は motion.js を実測して:
//   world = WALK_SPEED × (-input.x, input.y)   (|input| ≤ 1)
function rider(fix, { skill = 1, react = 0 } = {}) {
  const c = Math.cos(fix.anchor.angle);
  const sn = Math.sin(fix.anchor.angle);
  const dir = fix.course.dir;
  let lag = 0;
  let held = { x: 0, y: 0 };
  return ({ t, a, local }) => {
    lag -= 1 / 60;
    if (lag > 0) return held;
    lag = react;
    // 局所 x へ出したい速さ(流れと滑りの逆 + てっぺんへ戻るぶん)
    const vx = -(dir * spinAt(t) + slipRate(a)) * DRUM_R * Math.cos(a) - 1.4 * a * DRUM_R;
    // 局所 z へ(切れ目から逃げる)
    const want = safeZ(fix.course, a, t, 0.4 + skill, local.z);
    const vz = want == null ? 0
      : Math.max(-WALK_SPEED, Math.min(WALK_SPEED, (want - local.z) * 3));
    let ix = (-(vx * c - vz * sn) / WALK_SPEED) * skill;
    let iy = ((vx * sn + vz * c) / WALK_SPEED) * skill;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    held = { x: ix, y: iy };
    return held;
  };
}

test('丸太: まるごと海の上に浮いている', () => {
  for (const seed of [1, 7, 99]) {
    const { ground, anchor } = setup(seed);
    assert.ok(anchor, `${seed}: 浮かべる場所が見つからない`);
    for (let ix = -1; ix <= 1; ix += 0.5) {
      for (let iz = -1; iz <= 1; iz += 0.5) {
        const w = toWorld(anchor, (COURSE_W / 2) * ix, (COURSE_L / 2) * iz);
        assert.equal(ground(w.x, w.z).ok, false,
          `${seed}: 丸太が陸に乗り上げている (${w.x.toFixed(2)}, ${w.z.toFixed(2)})`);
      }
    }
  }
});

test('丸太: 同じ種なら同じ丸太になる(全員が同じ足場を踏む)', () => {
  const a = makeCourse(12345);
  assert.deepEqual(a, makeCourse(12345));
  assert.notDeepEqual(makeCourse(1), makeCourse(2));
  assert.ok(a.dir === 1 || a.dir === -1, '回る向きが決まっていない');
  assert.ok(a.holes.length >= 4, '切れ目が少なすぎる');
});

// **どの瞬間にも逃げ場がある。** 切れ目が同時に上がってきて丸太を
// 横切ってしまうと、何をしても落ちる回ができる。
test('丸太: 切れ目どうしが角で離れている(逃げ場が消えない)', () => {
  for (const seed of [1, 7, 31, 99, 12345]) {
    const c = makeCourse(seed);
    for (let i = 0; i < c.holes.length; i++) {
      for (let j = i + 1; j < c.holes.length; j++) {
        let d = Math.abs(c.holes[i].a - c.holes[j].a) % (Math.PI * 2);
        if (d > Math.PI) d = Math.PI * 2 - d;
        // **切れ目の角 + 歩く時間**ぶん離れていること。切れ目が上に居る
        // あいだはまたげないので、間隔が切れ目の角ぎりぎりだと、1つ目を
        // よけた足でそのまま2つ目へ踏み込むことになる。
        //
        // 比べる先は**秒で書いた実数**にする ── FREE_TURN と比べると、
        // FREE_TURN を縮めたときに期待値も一緒に縮んで何も見張らない。
        // いちばん速く回っているときでも、これだけは自由に歩けること。
        const freeSec = (d - HOLE_ARC) / (spinAt(1e9));
        assert.ok(freeSec >= 0.6,
          `${seed}: 切れ目 ${i},${j} のあいだに ${freeSec.toFixed(2)}秒 しか歩く間がない`);
      }
    }
    // 切れ目2つ合わせても丸太を覆えない(覆うと逃げ場そのものが消える)
    for (let i = 0; i < c.holes.length; i++) {
      for (let j = i + 1; j < c.holes.length; j++) {
        const both = (c.holes[i].z1 - c.holes[i].z0) + (c.holes[j].z1 - c.holes[j].z0);
        assert.ok(both < DRUM_LEN,
          `${seed}: 切れ目 ${i},${j} が合わせて丸太を覆う (${both.toFixed(2)})`);
      }
    }
    // どの時刻・どの角でも、長さ方向のどこかは踏める
    for (let k = 0; k < 40; k++) {
      const t = (k * 90) / 40;
      for (const a of [-0.8, -0.3, 0, 0.3, 0.8]) {
        assert.notEqual(safeZ(c, a, t, 0, 0), null,
          `${seed}: t=${t.toFixed(1)} 角${a} に逃げ場がない`);
      }
    }
  }
});

test('丸太: 切れ目は回ってきたときだけ抜ける', () => {
  const c = makeCourse(7);
  const h = c.holes[0];
  const mid = (h.z0 + h.z1) / 2;
  // 1回転のあいだに、抜ける時刻と抜けない時刻の両方がある
  let open = 0;
  let shut = 0;
  for (let k = 0; k < 200; k++) {
    const t = (k * 60) / 200;
    if (holeOpen(c, 0 - turnOf(c, t), mid)) open += 1; else shut += 1;
  }
  assert.ok(open > 0, '切れ目がいつまでも来ない');
  assert.ok(shut > open, '穴が開いている時間のほうが長い(渡れない)');
  // 切れ目の外(長さ方向でずれたところ)は、いつでも踏める
  const outside = h.z1 + (h.z1 - h.z0) * 0.6;
  const clear = outside < DRUM_LEN / 2
    && !c.holes.some((o) => outside >= o.z0 && outside <= o.z1);
  if (clear) {
    for (let k = 0; k < 60; k++) {
      assert.equal(holeOpen(c, 0 - turnOf(c, k), outside), false, '切れ目の外なのに抜けた');
    }
  }
});

test('丸太: 端の外は足場でない', () => {
  const fix = setup();
  const drum = courseGround(fix.course, fix.anchor, 0);
  // **丸太そのものを見る。** 島の地面と重ねたもので見ると、外が陸だった
  // ときに「足場がある」で通ってしまう(実際そうだった)。
  const side = toWorld(fix.anchor, DRUM_R * 1.05, 0);
  assert.equal(drum(side.x, side.z), null, '丸太の横に足場がある');
  const past = toWorld(fix.anchor, 0, DRUM_LEN * 0.6);
  assert.equal(drum(past.x, past.z), null, '丸太の端の外に足場がある');
  // **帯のすぐ外は足場でない。** 帯は水面(ほぼ真横)まで届いているので、
  // 「真横の手前で切れる」ではなく「丸太の輪郭を出たら終わり」で見る
  // ── sin(帯) はもう 1 に近いので、角に足しても外側にならない。
  const out = toWorld(fix.anchor, DRUM_R * (Math.sin(DRUM_BAND) + 0.01), 0);
  assert.equal(drum(out.x, out.z), null, '丸太の輪郭の外に足場がある');
  // てっぺんは踏める
  const top = toWorld(fix.anchor, 0, 0);
  assert.ok(drum(top.x, top.z) || courseGround(fix.course, fix.anchor, 0.3)(top.x, top.z),
    'てっぺんに一度も乗れない');
});

test('丸太: 曲面がそのまま地面になっている(横へ行くほど低い)', () => {
  const fix = setup();
  const drum = courseGround(fix.course, fix.anchor, 0);
  const top = toWorld(fix.anchor, 0, 0);
  const g0 = drum(top.x, top.z);
  assert.ok(g0, 'てっぺんが足場でない');
  assert.ok(Math.abs(g0.y - DRUM_TOP) < 1e-9, `てっぺんの高さが違う: ${g0.y}`);
  let last = g0.y;
  for (const a of [0.3, 0.6, 0.9, 1.1]) {
    const w = toWorld(fix.anchor, DRUM_R * Math.sin(a), 0);
    const g = drum(w.x, w.z);
    if (!g) continue;   // 切れ目に当たっていたら飛ばす
    assert.ok(g.y < last, `角 ${a} で高さが下がっていない`);
    assert.ok(Math.abs(g.y - (DRUM_AXIS + DRUM_R * Math.cos(a))) < 1e-9, '円になっていない');
    last = g.y;
  }
  // 海面より上(丸太は半分沈んでいるが、歩けるところは水の上)
  const sea = TILE_TOP + WATER_Y;
  assert.ok(DRUM_AXIS === sea, '軸が海面に無い');
  assert.ok(DRUM_AXIS + DRUM_R * Math.cos(DRUM_BAND) > sea, '足場の端が水没している');
});

test('丸太: 猶予のあいだは足場が流れない', () => {
  const { course, anchor } = setup(7);
  const spot = startSpots(course, anchor, 1)[0];
  assert.equal(rollTime(GRACE_MS - 1), 0, '猶予中は回りはじめていない');
  const still = courseGround(course, anchor, rollTime(GRACE_MS - 1))(spot.x, spot.z);
  assert.ok(still, '猶予中に足場が無い');
  assert.equal(Math.hypot(still.drift.x, still.drift.z), 0,
    '止まって見えている丸太に流れがある(何もしていない人が外へ運ばれる)');
  const moving = courseGround(course, anchor, rollTime(GRACE_MS + 500))(spot.x, spot.z);
  assert.ok(moving && Math.hypot(moving.drift.x, moving.drift.z) > 0.1, '回りだしても流れない');
});

test('丸太: 猶予のあいだは何もしなくても落ちない', () => {
  const fix = setup();
  const m = new WalkerMotion(withCourse(fix.ground, courseGround(fix.course, fix.anchor, 0)));
  const spot = startSpots(fix.course, fix.anchor, 1)[0];
  m.setPosition(spot.x, spot.z);
  m.setRespawn(0, 0, { pin: true });
  const from = { x: m.pos.x, z: m.pos.z };
  for (let i = 0; i < 180; i++) {
    assert.equal(m.update(1 / 60, { x: 0, y: 0 }, 0).respawned, false,
      `猶予中に落ちた(${(i / 60).toFixed(2)}秒)`);
  }
  assert.ok(Math.hypot(m.pos.x - from.x, m.pos.z - from.z) < 0.05, '猶予中に流された');
});

// **立っているだけだと負ける。** ここが成立しないと遊びにならない。
test('丸太: 立っているだけだと転がされて落ちる', () => {
  const fix = setup();
  const r = ride(fix, { input: { x: 0, y: 0 }, secs: 20 });
  assert.ok(r.fell, `20秒立っていても落ちない(角 ${Math.asin(r.local.x / DRUM_R).toFixed(2)})`);
  // **棒立ちはすぐ負ける**(歩き続ける遊びなので、そこは厳しくてよい)。
  // ただし一拍は要る ── 気づいて足を出す間もないと理不尽。
  // ここは ride が回りはじめてから測っているので、始まりの猶予(GRACE_MS)は
  // 別に付く。
  assert.ok(r.t > 1, `${r.t.toFixed(1)}秒で落ちた(気づく間もない)`);
  assert.ok(r.t < 4, `${r.t.toFixed(1)}秒も立っていられる(歩かなくてよくなる)`);
});

// **腕前で残る時間が変わり、誰も逃げ切らない。**
//
// 上面の流れは終盤に歩きを追い越すので、どれだけうまくても最後は押し負ける
// ── これが無いと 90 秒がにらみ合いになって勝負が決まらない。
test('丸太: 腕前で残る時間が変わる(そして誰も逃げ切らない)', () => {
  const fix = setup();
  const ace = ride(fix, { input: rider(fix, { skill: 1, react: 0 }), secs: 95 });
  const mid = ride(fix, { input: rider(fix, { skill: 0.85, react: 0.2 }), secs: 95 });
  const bad = ride(fix, { input: rider(fix, { skill: 0.7, react: 0.3 }), secs: 95 });
  assert.ok(ace.fell, `達人が ${ROLL_MS / 1000}秒 逃げ切った(勝負が決まらない)`);
  assert.ok(ace.t > 30, `うまく歩いても ${ace.t.toFixed(1)}秒 しか残れない(理不尽)`);
  assert.ok(ace.t > mid.t + 8, `達人とふつうの差が小さい: ${ace.t.toFixed(1)} vs ${mid.t.toFixed(1)}`);
  assert.ok(mid.t > bad.t + 5, `ふつうとへたの差が小さい: ${mid.t.toFixed(1)} vs ${bad.t.toFixed(1)}`);
  assert.ok(bad.t > GRACE_MS / 1000, `へたが猶予のうちに落ちた: ${bad.t.toFixed(1)}秒`);
});

// **滑り落ちるぶんが要る。** これが無いと、丸太が丸いことが
// 「端のほうが安全」になってしまい(押す力が cos で弱まるのに歩きは水平で
// 一定)、何をしても落ちなくなる。
test('丸太: てっぺんを外れるほど外へ押される', () => {
  const fix = setup();
  const at = (a) => {
    const w = toWorld(fix.anchor, DRUM_R * Math.sin(a), 0);
    return courseGround(fix.course, fix.anchor, 1)(w.x, w.z);
  };
  assert.equal(Math.abs(slipRate(0)), 0, 'てっぺんで滑る');
  let last = 0;
  for (const a of [0.2, 0.5, 0.9, 1.3]) {
    const v = Math.abs(slipRate(a));
    assert.ok(v > last, `角 ${a} で滑りが強くなっていない`);
    last = v;
  }
  // 滑りは外向き(角の符号と同じ)
  assert.ok(slipRate(0.5) > 0 && slipRate(-0.5) < 0, '滑りが内向き');
  // 押される速さは、端のほうが強い(丸太の丸さで弱まりきらない)
  const near = at(0.15);
  const far = at(1.25);
  if (near && far) {
    assert.ok(Math.hypot(far.drift.x, far.drift.z) > Math.hypot(near.drift.x, near.drift.z),
      '端のほうが押されない(端が安全地帯になっている)');
  }
});

// **どの盤でも理不尽な回にならない。** 切れ目の並びによっては、腕前に
// かかわらず数秒で落ちる回ができていた(実測: 先読みを 1.0〜3.2 秒の
// どれにしても 8〜17 秒で落ちる盤があった)。
test('丸太: どの盤でも、うまく歩けばひととおり残れる', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const fix = setup(seed);
    const r = ride(fix, { input: rider(fix, { skill: 1, react: 0 }), secs: 95 });
    assert.ok(r.t > 30,
      `種 ${seed}: うまく歩いても ${r.t.toFixed(1)}秒 で落ちた(理不尽な盤)`);
    assert.ok(r.fell, `種 ${seed}: 逃げ切った(勝負が決まらない)`);
  }
});

// **落ちたら丸太には戻らない。** 戻ると脱落が成立しない。
test('丸太: 落ちても丸太に戻らない(復帰先が固定されている)', () => {
  const fix = setup();
  const shore = { x: 0, z: 0 };
  let t = 0;
  const m = new WalkerMotion((x, z) => groundAtT(fix, t)(x, z));
  const spot = startSpots(fix.course, fix.anchor, 1)[0];
  m.setPosition(spot.x, spot.z);
  m.setRespawn(shore.x, shore.z, { pin: true });
  const dt = 1 / 60;
  let respawned = false;
  for (let i = 0; i < 60 * 40 && !respawned; i++) {
    t += dt;
    respawned = m.update(dt, { x: 0, y: 0 }, 0).respawned;
  }
  assert.ok(respawned, '40秒経っても落ちない');
  assert.ok(Math.hypot(m.pos.x - shore.x, m.pos.z - shore.z) < 0.01,
    `岸ではなく (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)}) に戻った`);
  assert.equal(m.respawnPinned, true);
});

test('丸太: 立たせる場所はてっぺんに並び、どれも足場の上', () => {
  const fix = setup();
  for (const n of [1, 2, 5, 8]) {
    const spots = startSpots(fix.course, fix.anchor, n);
    assert.equal(spots.length, n);
    const at = groundAtT(fix, 0);
    for (const [i, sp] of spots.entries()) {
      assert.equal(at(sp.x, sp.z).ok, true, `${n}人: ${i}番目が足場の上でない`);
      // てっぺん(角 0)に立つ
      const l = toLocal(fix.anchor, sp.x, sp.z);
      assert.ok(Math.abs(l.x) < 1e-9, `${n}人: ${i}番目がてっぺんに居ない`);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z);
        assert.ok(d > DRUM_LEN / 20, `${n}人: ${i} と ${j} が重なっている (${d.toFixed(2)})`);
      }
    }
    // **猶予のあいだ、立った場所が抜けない**(何もしていないのに落ちない)
    for (const sp of spots) {
      const lz = toLocal(fix.anchor, sp.x, sp.z).z;
      for (let k = 0; k <= 6; k++) {
        const t = (GRACE_MS / 1000) * (k / 6);
        assert.equal(holeOpen(fix.course, -turnOf(fix.course, t), lz), false,
          '立った場所に切れ目が来た');
      }
    }
  }
});

test('丸太: safeZ はこれから抜けない場所を返す', () => {
  const c = makeCourse(31);
  for (const a of [-0.9, 0, 0.6]) {
    for (const t0 of [0, 12, 40]) {
      const lz = safeZ(c, a, t0, 1.5, 0);
      assert.notEqual(lz, null, `角${a} t=${t0} に逃げ場がない`);
      for (let k = 0; k <= 10; k++) {
        const t = t0 + (1.5 * k) / 10;
        assert.equal(holeOpen(c, a - turnOf(c, t), lz), false,
          `安全なはずの ${lz.toFixed(2)} が ${t.toFixed(2)}秒で抜けた`);
      }
    }
  }
});

test('丸太: 立ち位置は流れのほうを向く', () => {
  const { course, anchor } = setup(7);
  const spot = startSpots(course, anchor, 1)[0];
  const g = courseGround(course, anchor, 1)(spot.x, spot.z);
  assert.ok(g, '立ち位置に足場が無い');
  // motion.js の facing は「+Z を 0」── 向きは (sin, cos)
  const dir = { x: Math.sin(spot.face), z: Math.cos(spot.face) };
  const len = Math.hypot(g.drift.x, g.drift.z);
  const dot = (dir.x * g.drift.x + dir.z * g.drift.z) / len;
  assert.ok(dot < -0.999, `流れに正対していない(内積 ${dot.toFixed(3)})`);
  assert.equal(upstreamFace(anchor, course), spot.face);
});

test('丸太: 回る速さは上がっていく(にらみ合いにならない)', () => {
  assert.ok(spinAt(0) > 0, '止まっている');
  assert.ok(spinAt(90) > spinAt(0) * 1.5, '最後まで同じ速さ');
  // 回った角は速さの積分。ずれると見た目と判定が離れる
  let sum = 0;
  const dt = 0.01;
  for (let t = 0; t < 90; t += dt) sum += spinAt(t + dt / 2) * dt;
  assert.ok(Math.abs(sum - turnAt(90)) < 0.05,
    `積分が合わない: ${sum.toFixed(3)} vs ${turnAt(90).toFixed(3)}`);
  assert.equal(turnAt(0), 0);
});

test('丸太: 世界と丸太の座標を往復しても戻る', () => {
  const anchor = { x: 3.2, z: -1.4, angle: 0.7 };
  for (const [x, z] of [[0, 0], [1, -2], [-0.4, 0.9]]) {
    const w = toWorld(anchor, x, z);
    const l = toLocal(anchor, w.x, w.z);
    assert.ok(Math.abs(l.x - x) < 1e-9 && Math.abs(l.z - z) < 1e-9,
      `往復でずれた: ${x},${z} → ${l.x},${l.z}`);
  }
  // 角と局所 x も往復する
  for (const a of [-1.1, -0.4, 0, 0.7, 1.1]) {
    assert.ok(Math.abs(angleAt(DRUM_R * Math.sin(a)) - a) < 1e-9, `角 ${a} が戻らない`);
  }
  assert.equal(angleAt(DRUM_R * 1.01), null, '丸太の外に角がある');
});

test('丸太: 寸法と速さの前後関係(遊びが成立する範囲に収まっている)', () => {
  // **でっかい。** 棒人間の背丈(およそ sc(1.0) = 0.5)の何倍か
  assert.ok(DRUM_R * 2 > 0.5 * 3.5, `丸太が細い: 直径 ${(DRUM_R * 2).toFixed(2)}`);
  // ただし太すぎない ── 端まで遠いと、転がされても戻る余地がありすぎて
  // 誰も落ちなくなる(半径 sc(3.2) で試したときが実際そうだった)
  assert.ok(DRUM_BAND * DRUM_R < 2.0,
    `てっぺんから端まで遠すぎる: ${(DRUM_BAND * DRUM_R).toFixed(2)} タイル`);
  // 何人か並べる長さがある
  assert.ok(DRUM_LEN > DRUM_R * 2, '長さより太さが勝っている(筒に見えない)');
  // **はじめは歩きより遅く、終わりは歩きより速い。**
  // 遅いままだとスティックを倒しておくだけで誰も落ちず、
  // はじめから速いと猶予が明けた瞬間に全員落ちる。
  assert.ok(spinAt(0) * DRUM_R < WALK_SPEED * 0.6,
    `はじめから速すぎる: ${(spinAt(0) * DRUM_R).toFixed(2)}`);
  assert.ok(spinAt(1e9) * DRUM_R > WALK_SPEED,
    `最後まで歩きより遅い: ${(spinAt(1e9) * DRUM_R).toFixed(2)} <= ${WALK_SPEED}`);
  // 切れ目はよけられる幅(丸太の半分を覆わない)
  assert.ok(HOLE_ARC * DRUM_R < DRUM_LEN / 2, '切れ目が丸太の半分を覆っている');
});

// **落ちたら海であること。** 丸太のまわりに海の余白が足りないと、端から
// 落ちた人が隣の小島に降り立つ ── 水に触れないので脱落にならず(落ちたのに
// 生き残る)、しかもその小島は歩いては出られないので回のあとで詰む。
test('丸太: 落ちた先は必ず海(まわりに小島が無い)', () => {
  // 跳べる水平距離はおよそ 0.76 タイル。空中でも歩けるぶん、余裕を見る
  const REACH = 1.2;
  for (const seed of [1, 7, 13, 99]) {
    const { ground, anchor } = setup(seed);
    assert.ok(anchor, `${seed}: 浮かべる場所が見つからない`);
    for (let lz = -DRUM_LEN / 2 - REACH; lz <= DRUM_LEN / 2 + REACH; lz += 0.2) {
      for (let lx = -DRUM_R - REACH; lx <= DRUM_R + REACH; lx += 0.2) {
        // 丸太の外側 REACH タイルまでに陸があってはいけない
        const outside = Math.abs(lx) > DRUM_R || Math.abs(lz) > DRUM_LEN / 2;
        if (!outside) continue;
        const w = toWorld(anchor, lx, lz);
        assert.equal(ground(w.x, w.z).ok, false,
          `${seed}: 丸太のそば (${lx.toFixed(1)}, ${lz.toFixed(1)}) に陸がある`);
      }
    }
  }
});

// **見えない棚を作らない。** 足場を水面より内側で切ると、そこから水面までが
// 「見えているのに立てない」帯になり、落ちた人が空中を歩いて丸太へ戻れる
// (実測: 1.15 で切っていたときは達人が永久に落ちなかった)。
test('丸太: 歩ける帯は水面まで届いている(見えない棚が無い)', () => {
  const sea = TILE_TOP + WATER_Y;
  const edge = DRUM_AXIS + DRUM_R * Math.cos(DRUM_BAND);
  assert.ok(edge > sea, '足場の端が水没している');
  assert.ok(edge - sea < DRUM_R * 0.1,
    `足場の端と水面のあいだに ${(edge - sea).toFixed(3)} の棚がある`);
});

// **戦績と実績にちゃんと積まれること。**
//
// ここは「新しい遊びを足したときに忘れる」ところ ── 丸太乗りを足した
// ときも、contestOutcome が釣り大会あつかいで落ちてくるのに気づかず、
// 存在しない me.cm を見て**優勝が一度も記録されず、順位も全員1位**に
// なっていた(実測)。
test('丸太: 回の結果が順位と記録になる', () => {
  const view = {
    kind: 'logroll',
    rank: [
      { seat: 0, ms: 45000, alive: true, place: 1 },
      { seat: 1, ms: 20000, alive: false, place: 2 },
      { seat: 2, ms: 12000, alive: false, place: 3 },
    ],
  };
  assert.deepEqual(contestOutcome(view, 0), { entered: true, won: true, score: 45, place: 1 });
  assert.deepEqual(contestOutcome(view, 1), { entered: true, won: false, score: 20, place: 2 });
  assert.deepEqual(contestOutcome(view, 2), { entered: true, won: false, score: 12, place: 3 });
  // 出ていない席は数えない
  assert.equal(contestOutcome(view, 5).entered, false);
  // **全員が落ちた回でも、いちばん長く乗っていた人が勝ち**(竜と違う)。
  // 丸太は終盤に歩きより速くなるので、この回のほうが普通。
  const allFell = {
    kind: 'logroll',
    rank: [
      { seat: 0, ms: 30000, alive: false, place: 1 },
      { seat: 1, ms: 10000, alive: false, place: 2 },
    ],
  };
  assert.equal(contestOutcome(allFell, 0).won, true, '全員落ちた回に勝者が出ない');
  // ひとりだけの回は優勝にしない(ほかの集まりと同じ)
  const solo = { kind: 'logroll', rank: [{ seat: 0, ms: 30000, alive: true, place: 1 }] };
  assert.equal(contestOutcome(solo, 0).won, false);
});

test('丸太: 優勝と自己最高で実績がつく', () => {
  let p = emptyProgress();
  const view = {
    kind: 'logroll',
    rank: [
      { seat: 0, ms: 45000, alive: true, place: 1 },
      { seat: 1, ms: 20000, alive: false, place: 2 },
    ],
  };
  const o = contestOutcome(view, 0);
  const r1 = addContestResult(p, { kind: 'logroll', won: o.won, score: o.score, key: 'a#1' });
  p = r1.progress;
  assert.equal(p.meets.logroll.won, 1, '優勝が数えられていない');
  assert.equal(p.meets.logroll.best, 45, '自己最高が残っていない');
  assert.ok(r1.unlocked.includes('roll-win'), `優勝の実績が付かない: ${r1.unlocked}`);
  assert.ok(!r1.unlocked.includes('roll-minute'), '45秒で 60秒の実績が付いた');
  // 60 秒を超えたら、粘りの実績も付く
  const long = { kind: 'logroll', rank: [
    { seat: 0, ms: 64000, alive: false, place: 1 },
    { seat: 1, ms: 20000, alive: false, place: 2 },
  ] };
  const o2 = contestOutcome(long, 0);
  const r2 = addContestResult(p, { kind: 'logroll', won: o2.won, score: o2.score, key: 'a#2' });
  assert.ok(r2.unlocked.includes('roll-minute'), `粘りの実績が付かない: ${r2.unlocked}`);
  // 進捗バーに出る(取っていない人に「あと何秒か」が見える)
  assert.equal(summarize(r2.progress).bests.rollBest, 64);
  assert.ok(achievementById('roll-minute')?.title, '称号が無い');
});
