// 釣りの姿勢のつながり。
// **「沖に投げた直後と構えてる場面の間が途切れて見える」**という報告の中身。
// 段(cast → wait)が変わった瞬間に、振り出しきった姿勢から構えへ
// 1コマで落としていた ── 竿先が身長の 1/3 ぶん飛んでいた。
import test from 'node:test';
import assert from 'node:assert/strict';
import { fishPose, fishPoseBlender, CAST_RECOVER } from '../src/minigame/pose.js';
import { CAST_TIME } from '../src/minigame/fishing.js';

const DT = 1 / 60;

// walk-mode.js の _fishFrame と同じ渡し方で、投げてから待ちまでを回す。
// **cast は 1 で頭打ちにしない**(振り出したあとの戻りに要る)。
function cast(frames = 120) {
  const out = [];
  let t = 0;
  for (let i = 0; i < frames; i++) {
    t += DT;
    out.push({
      t,
      phase: t < CAST_TIME ? 'cast' : 'wait',
      pose: fishPose(t, 0, {
        phase: t < CAST_TIME ? 'cast' : 'wait',
        cast: t / CAST_TIME,
        tension: 0, reeling: false, burst: false,
      }),
    });
  }
  return out;
}

const rodOf = (f) => f.pose.arms[1].rootX;
const steps = (fs, pick) => fs.slice(1).map((f, i) => Math.abs(pick(f) - pick(fs[i])));

test('釣りの姿勢: 投げ終わりで竿が飛ばない', () => {
  const fs = cast();
  const bi = fs.findIndex((f) => f.phase === 'wait') - 1;   // 段が変わったコマ
  assert.ok(bi > 5, '段が変わるところが見つからない');
  const d = steps(fs, rodOf);
  const at = d[bi];
  // 直前の5コマと同じくらいであること(飛んでいたら桁が変わる)。
  // 直す前はここが 0.50 ラジアンで、まわりの 20 倍以上あった。
  const around = d.slice(bi - 5, bi).reduce((s, v) => s + v, 0) / 5;
  assert.ok(at < around * 3,
    `切り替わりのコマだけ竿が ${at.toFixed(3)} 動いた(まわりは ${around.toFixed(3)})`);
});

test('釣りの姿勢: どのコマも竿が飛ばない', () => {
  const d = steps(cast(), rodOf);
  const max = Math.max(...d);
  // 投げの中でいちばん速いのは振りかぶり(0.065 ラジアン/コマ)。
  // それを超える動きがどこかにあれば、そこが段になっている。
  assert.ok(max < 0.08, `1コマで ${max.toFixed(3)} ラジアン動いた`);
});

test('釣りの姿勢: 腰も飛ばない', () => {
  // 竿だけ直して腰を段のままにすると、こんどは体が跳ねる
  const d = steps(cast(), (f) => f.pose.hips.x);
  assert.ok(Math.max(...d) < 0.02, `腰が1コマで ${Math.max(...d).toFixed(4)} 動いた`);
});

test('釣りの姿勢: 戻しきったら、ふつうの構えと同じになる', () => {
  // 戻り切らずに残ると、待っているあいだずっと竿の角度がずれたままになる
  const t = CAST_TIME * (1 + CAST_RECOVER) + 0.2;
  const k = { phase: 'wait', tension: 0, reeling: false, burst: false };
  const done = fishPose(t, 0, { ...k, cast: t / CAST_TIME });
  const plain = fishPose(t, 0, k);     // 投げの進み具合を渡さない構え
  assert.ok(Math.abs(done.arms[1].rootX - plain.arms[1].rootX) < 1e-9,
    `戻りきっていない(${done.arms[1].rootX} / ${plain.arms[1].rootX})`);
  assert.ok(Math.abs(done.hips.x - plain.hips.x) < 1e-9, '腰が戻りきっていない');
});

test('釣りの姿勢: 進み具合を渡さないときは、竿を担がない', () => {
  // 散策部屋で他の人の釣りを描くとき(remote-view.js)は cast を渡さない。
  // ここを「これから振りかぶる(0)」と読むと、相手だけ竿を後ろへ 0.75
  // 引いたまま止まって見える。
  const plain = fishPose(3, 0, { phase: 'wait' });
  const after = fishPose(3, 0, { phase: 'wait', cast: 99 });
  assert.ok(Math.abs(plain.arms[1].rootX - after.arms[1].rootX) < 1e-9,
    `竿を担いだままになっている(${plain.arms[1].rootX})`);
  assert.ok(Math.abs(plain.hips.x) < 1e-9, `腰が反ったままになっている(${plain.hips.x})`);
});

test('釣りの姿勢: 戻しの長さがゼロだと元の不具合に戻る', () => {
  // CAST_RECOVER を 0 にすると段に戻る、という関係そのものを押さえる。
  // (定数の意味が変わったら、このテストが先に落ちる)
  assert.ok(CAST_RECOVER > 0.2, `戻しが短すぎる(${CAST_RECOVER})`);
  assert.ok(CAST_RECOVER < 1.5, `戻しが長すぎる(${CAST_RECOVER})`);
  // 戻しのあいだ、竿はずっと同じ向きへ戻り続ける(行ったり来たりしない)
  const fs = cast();
  const from = Math.ceil(CAST_TIME / DT);
  const to = Math.floor(CAST_TIME * (1 + CAST_RECOVER) / DT);
  let up = 0; let down = 0;
  for (let i = from; i < to; i++) {
    const d = rodOf(fs[i]) - rodOf(fs[i - 1]);
    if (d > 1e-6) up++; else if (d < -1e-6) down++;
  }
  assert.ok(up === 0 || down === 0, `戻しの途中で向きが変わった(上 ${up} / 下 ${down})`);
});

// ---- 段のつなぎ(fishPoseBlender)----

// 釣り1回ぶんの段の並び。walk-mode.js が fishing.js の view() から渡すとおり。
// 投げ 0.55 秒 → 待ち 2 秒 → アタリ 0.6 秒 → 取り込み 3 秒 → 釣果。
const SEQ = [
  { phase: 'cast', dur: CAST_TIME },
  { phase: 'wait', dur: 2.0 },
  { phase: 'bite', dur: 0.6 },
  { phase: 'fight', dur: 3.0, tension: 0.6, reeling: true },
  { phase: 'landed', dur: 1.0 },
];

// 一連を 60fps で回して、毎コマの姿勢を返す
function play(blender = fishPoseBlender()) {
  const out = [];
  let t = 0;
  for (const step of SEQ) {
    const end = t + step.dur;
    while (t < end) {
      t += DT;
      const k = {
        phase: step.phase, cast: t / CAST_TIME,
        tension: step.tension ?? 0, reeling: !!step.reeling, burst: false,
      };
      out.push({ t, phase: step.phase, pose: blender.pose(t, 0, k) });
    }
  }
  return out;
}

test('釣りの姿勢: どの段の切り替わりでも竿が飛ばない', () => {
  const fs = play();
  const d = steps(fs, rodOf);
  const worst = [];
  for (let i = 1; i < fs.length; i++) {
    if (fs[i].phase === fs[i - 1].phase) continue;
    const around = d.slice(Math.max(0, i - 6), i - 1);
    const base = around.reduce((s, v) => s + v, 0) / (around.length || 1);
    worst.push({ to: fs[i].phase, at: d[i - 1], base });
  }
  assert.ok(worst.length === SEQ.length - 1, `段の変わり目が ${worst.length} しかない`);
  for (const w of worst) {
    // 直す前は 取り込み → 釣果 が 0.72 ラジアン(まわりの 100 倍以上)だった
    assert.ok(w.at < 0.05,
      `${w.to} へ変わるコマで竿が ${w.at.toFixed(3)} ラジアン動いた(まわり ${w.base.toFixed(4)})`);
  }
});

test('釣りの姿勢: つなぎを入れても、途中で姿勢が暴れない', () => {
  const d = steps(play(), rodOf);
  assert.ok(Math.max(...d) < 0.08, `1コマで ${Math.max(...d).toFixed(3)} ラジアン動いた`);
});

test('釣りの姿勢: つなぎは最後には効かなくなる(素の姿勢に戻る)', () => {
  // 混ざったまま残ると、掲げた姿勢がうっすら残り続ける
  const b = fishPoseBlender();
  const fs = play(b);
  const last = fs[fs.length - 1];
  const raw = fishPose(last.t, 0, { phase: 'landed', cast: last.t / CAST_TIME });
  assert.ok(Math.abs(rodOf(last) - raw.arms[1].rootX) < 1e-9, 'つなぎが残っている');
});

test('釣りの姿勢: 竿を出し直したら、前回の終わりから混ざらない', () => {
  // reset を忘れると、2回目の投げが「魚を掲げた姿勢」から始まる
  const b = fishPoseBlender();
  play(b);                       // 1回目(釣果の姿勢で終わる)
  b.reset();
  const k = { phase: 'cast', cast: DT / CAST_TIME, tension: 0, reeling: false, burst: false };
  const first = b.pose(DT, 0, k);
  const raw = fishPose(DT, 0, k);
  assert.ok(Math.abs(first.arms[1].rootX - raw.arms[1].rootX) < 1e-9,
    `前回の姿勢が混ざっている(${first.arms[1].rootX} / ${raw.arms[1].rootX})`);
});

test('釣りの姿勢: もともと繋がっている切り替わりは混ぜない', () => {
  // **混ぜること自体にも動きがある。** 重みの立ち上がりが素の動きに乗るので、
  // 段差のないところまで混ぜると、かえって速くなる(実測 0.049 → 0.073)。
  // 投げ → 待ちは CAST_RECOVER で繋いであるので、ここは素通しになるはず。
  const fs = play();
  const i = fs.findIndex((f) => f.phase === 'wait');
  const raw = fishPose(fs[i].t, 0, {
    phase: 'wait', cast: fs[i].t / CAST_TIME, tension: 0, reeling: false, burst: false,
  });
  assert.ok(Math.abs(rodOf(fs[i]) - raw.arms[1].rootX) < 1e-9,
    '段差が無いのに混ぜている');
});

test('釣りの姿勢: つなぎは素の動きを速くしない', () => {
  const withB = Math.max(...steps(play(), rodOf));
  // 混ぜずに同じ並びを回したときの、1コマの最大
  let t = 0; const plain = [];
  for (const step of SEQ) {
    const end = t + step.dur;
    while (t < end) {
      t += DT;
      plain.push({ pose: fishPose(t, 0, {
        phase: step.phase, cast: t / CAST_TIME,
        tension: step.tension ?? 0, reeling: !!step.reeling, burst: false,
      }) });
    }
  }
  // 段が変わったコマを除いた「ふだんの動き」の最大(= 振りかぶり)
  const fs = play();
  const d = steps(plain, rodOf);
  let normal = 0;
  for (let i = 1; i < fs.length; i++) {
    if (fs[i].phase !== fs[i - 1].phase) continue;   // 段差のコマは別の話
    normal = Math.max(normal, d[i - 1]);
  }
  assert.ok(withB <= normal * 1.02,
    `つなぎを入れたら速くなった(${withB.toFixed(4)} > ${normal.toFixed(4)})`);
});
