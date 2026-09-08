// 丸太乗り(src/minigame/logroll.js)。
//
// **本物の動き(WalkerMotion)を丸太の上で回して測る。** 「転がされる」も
// 「穴に落ちる」も文章では確かめようがないので、実際に立たせて座標を見る。
//
// ここが押さえるもの:
//   1. 立っているだけだと転がされて落ちる(遊びとして成立する下限)
//   2. 逆らって歩けば留まれる(理不尽ではない上限)
//   3. 切れ目が上に来たら抜ける
//   4. 落ちたら**筏に戻らない**(復帰先の固定。ここが緩むと脱落しなくなる)
//   5. 筏はまるごと海の上に浮いている

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/state.js';
import { makeGround } from '../src/minigame/ground.js';
import { WalkerMotion, WALK_SPEED, WATER_Y } from '../src/minigame/motion.js';
import { TILE_TOP } from '../src/terrain.js';
import {
  COURSE_L, COURSE_W, LOG_COUNT, LOG_LEN, LOG_PITCH, LOG_R, LOG_TOP,
  GRACE_MS, courseGround, findAnchor, logSolid, makeCourse, rollTime, safeZ, startSpots,
  toLocal, toWorld, upstreamFace, withCourse,
} from '../src/minigame/logroll.js';

const island = (seed = 7) => createGame({ seed, playerCount: 4, humanIndex: -1, mode: 'sea' });

// 筏を1つ用意する
function setup(seed = 7) {
  const st = island(seed);
  const ground = makeGround(st);
  const anchor = findAnchor(ground);
  const course = makeCourse(st.seed);
  return { st, ground, anchor, course };
}

// 時刻 t の地面(島 + 筏)
const groundAtT = ({ ground, course, anchor }, t) =>
  withCourse(ground, courseGround(course, anchor, t));

// 丸太の上に立たせて、ぶんまわす。input は毎フレームの入力
function ride(fix, { input = { x: 0, y: 0 }, secs = 4, at = null, pin = true }) {
  let t = 0;
  const m = new WalkerMotion((x, z) => groundAtT(fix, t)(x, z));
  const spot = at ?? startSpots(fix.course, fix.anchor, 1)[0];
  m.setPosition(spot.x, spot.z);
  if (pin) m.setRespawn(0, 0, { pin: true });   // 岸に固定(原点は主島の陸)
  const dt = 1 / 60;
  let fell = false;
  for (let i = 0; i < secs / dt; i++) {
    t += dt;
    const r = m.update(dt, input, 0);
    if (r.respawned) { fell = true; break; }
  }
  return { m, fell, t, local: toLocal(fix.anchor, m.pos.x, m.pos.z) };
}

test('丸太: 筏はまるごと海の上に浮いている', () => {
  for (const seed of [1, 7, 99]) {
    const { ground, anchor } = setup(seed);
    assert.ok(anchor, `${seed}: 浮かべる場所が見つからない`);
    // 筏の四隅と縁を見る。1点でも陸なら乗り上げている
    for (let ix = -1; ix <= 1; ix += 0.5) {
      for (let iz = -1; iz <= 1; iz += 0.5) {
        const w = toWorld(anchor, (COURSE_W / 2) * ix, (COURSE_L / 2) * iz);
        assert.equal(ground(w.x, w.z).ok, false,
          `${seed}: 筏が陸に乗り上げている (${w.x.toFixed(2)}, ${w.z.toFixed(2)})`);
      }
    }
  }
});

test('丸太: 同じ種なら同じ筏になる(全員が同じ足場を踏む)', () => {
  const a = makeCourse(12345);
  const b = makeCourse(12345);
  assert.deepEqual(a, b);
  assert.notDeepEqual(makeCourse(1), makeCourse(2));
  assert.equal(a.logs.length, LOG_COUNT);
  // **回る向きはそろっている。** 逆向きが混ざると、そのあいだに
  // 「押し合って動かない谷」ができて、立っているだけで落ちなくなる。
  for (let i = 1; i < a.logs.length; i++) {
    assert.ok(a.logs[i].spin * a.logs[i - 1].spin > 0, `${i}本目が隣と逆に回っている`);
  }
  // 速さは丸太ごとに違う(渡る先で手加減が変わる)
  const spins = a.logs.map((l) => Math.abs(l.spin));
  assert.ok(Math.max(...spins) - Math.min(...spins) > 0.3, '全部同じ速さで回っている');
});

test('丸太: 切れ目は回ってきたときだけ抜ける', () => {
  const { logs } = makeCourse(7);
  const log = logs[0];
  const h = log.holes[0];
  const mid = (h.z0 + h.z1) / 2;
  // 1回転のあいだに、抜ける時刻と抜けない時刻の両方がある
  let open = 0;
  let shut = 0;
  const T = (Math.PI * 2) / Math.abs(log.spin);
  for (let k = 0; k < 60; k++) {
    if (logSolid(log, mid, (T * k) / 60)) shut += 1; else open += 1;
  }
  assert.ok(open > 0, '切れ目がいつまでも来ない');
  assert.ok(shut > open, '穴が開いている時間のほうが長い(渡れない)');
  // 切れ目の外(長さ方向でずれたところ)は、いつでも踏める
  const outside = h.z1 + LOG_LEN * 0.1;
  if (outside < LOG_LEN / 2) {
    for (let k = 0; k < 30; k++) {
      // 別の切れ目に当たらない場所だけ見る
      const other = log.holes.some((o) => outside >= o.z0 && outside <= o.z1);
      if (other) break;
      assert.equal(logSolid(log, outside, (T * k) / 30), true, '切れ目の外なのに抜けた');
    }
  }
});

test('丸太: 筏の外と丸太のあいだは足場でない', () => {
  const fix = setup();
  const at = groundAtT(fix, 0);
  // **筏そのものを見る。** 島の地面と重ねたもので見ると、筏の外が
  // 陸だったときに「足場がある」で通ってしまう(実際そうだった)。
  const raft = courseGround(fix.course, fix.anchor, 0);
  const out = toWorld(fix.anchor, COURSE_W, 0);
  assert.equal(raft(out.x, out.z), null, '筏の外に足場がある');
  const past = toWorld(fix.anchor, 0, LOG_LEN);
  assert.equal(raft(past.x, past.z), null, '丸太の端の外に足場がある');
  // 丸太と丸太のあいだ(隙間はわずかだが、そこは足場でない)
  const between = toWorld(fix.anchor, (fix.course.logs[0].x + fix.course.logs[1].x) / 2, 0);
  assert.equal(raft(between.x, between.z), null, '丸太のあいだに足場がある');
  // 丸太のまん中は踏める(切れ目に当たらない時刻を探す)
  let stood = false;
  for (let t = 0; t < 3 && !stood; t += 0.05) {
    const g = groundAtT(fix, t);
    const on = toWorld(fix.anchor, fix.course.logs[0].x, 0);
    if (g(on.x, on.z).ok) stood = true;
  }
  assert.ok(stood, '丸太の上に一度も乗れない');
});

test('丸太: 上面の高さは水面より上(浮いている丸太に見える)', () => {
  const fix = setup();
  // **世界の高さで比べる。** WATER_Y はタイル上面からの相対なので、
  // そのまま比べると基準が違う数どうしを比べることになる。
  const sea = TILE_TOP + WATER_Y;
  assert.ok(LOG_TOP > sea, '丸太の上面が海面より下にある');
  assert.ok(LOG_TOP - sea < LOG_R * 2, '丸太が浮きすぎている');
  const at = groundAtT(fix, 0);
  const on = toWorld(fix.anchor, fix.course.logs[3].x, 0);
  const g = at(on.x, on.z);
  if (g.ok) assert.equal(g.y, LOG_TOP);
});

// **立っているだけだと負ける。** ここが成立しないと遊びにならない。
test('丸太: 立っているだけだと転がされて落ちる', () => {
  const fix = setup();
  // 切れ目に当たらない場所から始める(転がされて落ちたことを見たいので)
  const log = fix.course.logs[3];
  const lz = safeZ(log, 0, 6, 0);
  const at = toWorld(fix.anchor, log.x, lz ?? 0);
  const r = ride(fix, { input: { x: 0, y: 0 }, secs: 8, at });
  assert.ok(r.fell, `8秒立っていても落ちない(横へ ${r.local.x.toFixed(2)} しか動いていない)`);
});

// **押される速さに合わせて歩けば留まれる。** ここが成立しないと理不尽。
//
// 全開で逆らうのは正解ではない ── 実測すると、今度は上流の端から落ちる
// (半幅 1.35 に対して 1.62 まで行った)。丸太乗りは「押される速さに
// 合わせて足踏みする」釣り合いの遊びなので、**留まれる入力が在ること**を見る。
test('丸太: 押される速さに合わせて歩けば留まれる', () => {
  const fix = setup();
  const log = fix.course.logs[3];
  const lz = safeZ(log, 0, 8, 0);
  const at = toWorld(fix.anchor, log.x, lz ?? 0);
  // 丸太が押してくる向きの逆へ歩き続ける。
  // **押される向きは実装が返す drift から取る** ── ここで角度を組み立て
  // 直すと、実装と食い違ったときにテストのほうが先に嘘をつく
  // (実際、sin と cos を取り違えて 90° ずれた向きへ歩かせていた)。
  // t は回りだしたあとで取る(猶予中は流れが 0 なので向きが読めない)
  const d = courseGround(fix.course, fix.anchor, 1)(at.x, at.z).drift;
  const len = Math.hypot(d.x, d.z);
  // 入力はカメラ基準。motion は dir = atan2(-input.x, input.y) で世界の
  // 向きにするので、世界の向き (sinθ, cosθ) を出したければ
  // input = (-sinθ, cosθ) を渡す。逆向きなので θ は -drift の向き。
  // 入力の向きと世界の動きの対応は (a, b) → (-a, b)(motion.js を実測)。
  // 押される向きの逆へ、押される速さぶんだけ。
  const mag = len / WALK_SPEED;
  const r = ride(fix, {
    input: { x: (d.x / len) * mag, y: (-d.z / len) * mag }, secs: 8, at,
  });
  assert.equal(r.fell, false, `合わせて歩いても落ちた(${r.t.toFixed(1)}秒)`);
  assert.ok(Math.abs(r.local.x) < COURSE_W / 2,
    `筏から出た: 横へ ${r.local.x.toFixed(2)}(半幅 ${(COURSE_W / 2).toFixed(2)})`);
});

// **落ちたら筏には戻らない。** 戻ると脱落が成立しない。
test('丸太: 落ちても筏に戻らない(復帰先が固定されている)', () => {
  const fix = setup();
  const shore = { x: 0, z: 0 };
  let t = 0;
  const m = new WalkerMotion((x, z) => groundAtT(fix, t)(x, z));
  const spot = startSpots(fix.course, fix.anchor, 1)[0];
  m.setPosition(spot.x, spot.z);
  m.setRespawn(shore.x, shore.z, { pin: true });
  const dt = 1 / 60;
  let respawned = false;
  for (let i = 0; i < 60 * 20 && !respawned; i++) {
    t += dt;
    respawned = m.update(dt, { x: 0, y: 0 }, 0).respawned;
  }
  assert.ok(respawned, '20秒経っても落ちない');
  assert.equal(Math.hypot(m.pos.x - shore.x, m.pos.z - shore.z) < 0.01, true,
    `岸ではなく (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)}) に戻った`);
  // 固定していなければ、丸太の上に戻ってしまう(固定の意味を確かめる)
  assert.equal(m.respawnPinned, true);
});

test('丸太: 立たせる場所は人数ぶん散って、どれも足場の上', () => {
  const fix = setup();
  for (const n of [1, 2, 5, 8]) {
    const spots = startSpots(fix.course, fix.anchor, n);
    assert.equal(spots.length, n);
    const at = groundAtT(fix, 0);
    for (const [i, sp] of spots.entries()) {
      assert.equal(at(sp.x, sp.z).ok, true, `${n}人: ${i}番目が足場の上でない`);
    }
    // 同じ点に重ならない
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z);
        assert.ok(d > LOG_R, `${n}人: ${i} と ${j} が重なっている (${d.toFixed(2)})`);
      }
    }
  }
});

test('丸太: safeZ はこれから抜けない場所を返す', () => {
  const { logs } = makeCourse(31);
  for (const log of logs) {
    const lz = safeZ(log, 0, 1.5, 0);
    if (lz == null) continue;
    for (let k = 0; k <= 10; k++) {
      assert.equal(logSolid(log, lz, (1.5 * k) / 10), true,
        `安全なはずの ${lz.toFixed(2)} が ${((1.5 * k) / 10).toFixed(2)}秒後に抜けた`);
    }
  }
});

test('丸太: 世界と筏の座標を往復しても戻る', () => {
  const anchor = { x: 3.2, z: -1.4, angle: 0.7 };
  for (const [x, z] of [[0, 0], [1, -2], [-0.4, 0.9]]) {
    const w = toWorld(anchor, x, z);
    const l = toLocal(anchor, w.x, w.z);
    assert.ok(Math.abs(l.x - x) < 1e-9 && Math.abs(l.z - z) < 1e-9,
      `往復でずれた: ${x},${z} → ${l.x},${l.z}`);
  }
});

test('丸太: 寸法の前後関係(遊びが成立する範囲に収まっている)', () => {
  // 丸太のあいだに落ちない(間隔が直径より少しだけ広い)
  assert.ok(LOG_PITCH > LOG_R * 2, '丸太が重なっている');
  assert.ok(LOG_PITCH < LOG_R * 2.5, '丸太のあいだが空きすぎ(落ちるのが主な負けかたになる)');
  // 上面の流れは歩きより遅い。同じだと歩いても進めない
  const surface = 3.0 * LOG_R;   // いちばん速い丸太
  assert.ok(surface < WALK_SPEED, `丸太のほうが歩きより速い: ${surface} >= ${WALK_SPEED}`);
  assert.ok(surface > WALK_SPEED * 0.3, '丸太が遅すぎて立っているだけで勝てる');
});

test('丸太: 猶予のあいだは足場が流れない', () => {
  const { course, anchor } = setup(7);
  const spot = startSpots(course, anchor, 1)[0];
  // rollTime は猶予のあいだ 0 を返す。その時刻の足場は動いていないこと
  assert.equal(rollTime(GRACE_MS - 1), 0, '猶予中は回りはじめていない');
  const still = courseGround(course, anchor, rollTime(GRACE_MS - 1))(spot.x, spot.z);
  assert.ok(still, '猶予中に足場が無い');
  assert.equal(Math.hypot(still.drift.x, still.drift.z), 0,
    '止まって見えている丸太に流れがある(何もしていない人が筏の外へ運ばれる)');
  // 回りだしたら流れる
  const moving = courseGround(course, anchor, rollTime(GRACE_MS + 500))(spot.x, spot.z);
  assert.ok(moving && Math.hypot(moving.drift.x, moving.drift.z) > 0.1,
    '回りだしても流れない');
});

test('丸太: 猶予のあいだは何もしなくても落ちない', () => {
  const fix = setup(7);
  // 猶予中(t は 0 のまま)を実際の動きで 3 秒回す
  const m = new WalkerMotion(withCourse(fix.ground, courseGround(fix.course, fix.anchor, 0)));
  const spot = startSpots(fix.course, fix.anchor, 1)[0];
  m.setPosition(spot.x, spot.z);
  m.setRespawn(0, 0, { pin: true });
  const from = { x: m.pos.x, z: m.pos.z };
  for (let i = 0; i < 180; i++) {
    const r = m.update(1 / 60, { x: 0, y: 0 }, 0);
    assert.equal(r.respawned, false, `猶予中に落ちた(${(i / 60).toFixed(2)}秒)`);
  }
  const moved = Math.hypot(m.pos.x - from.x, m.pos.z - from.z);
  assert.ok(moved < 0.05, `猶予中に ${moved.toFixed(2)} タイル流された`);
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
  // 丸太は全部同じ向きなので、どの本で測っても同じ上流を向く
  for (const log of course.logs) {
    assert.ok(Math.abs(upstreamFace(anchor, log) - spot.face) < 1e-9, '丸太ごとに向きが違う');
  }
});
