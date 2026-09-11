// 釣りの姿勢のつながり。
// **「沖に投げた直後と構えてる場面の間が途切れて見える」**という報告の中身。
// 段(cast → wait)が変わった瞬間に、振り出しきった姿勢から構えへ
// 1コマで落としていた ── 竿先が身長の 1/3 ぶん飛んでいた。
import test from 'node:test';
import assert from 'node:assert/strict';
import { fishPose, CAST_RECOVER } from '../src/minigame/pose.js';
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

test('釣りの姿勢: 戻しきったら、投げていない構えと同じになる', () => {
  // 戻り切らずに残ると、待っているあいだずっと竿の角度がずれたままになる
  const t = CAST_TIME * (1 + CAST_RECOVER) + 0.2;
  const k = { phase: 'wait', tension: 0, reeling: false, burst: false };
  const done = fishPose(t, 0, { ...k, cast: t / CAST_TIME });
  const never = fishPose(t, 0, { ...k, cast: 0.0 });   // 投げていない(振りかぶりも無い)
  // 振りかぶりのぶん(cast 0 では swing = 0.75)を除いて比べる
  assert.ok(Math.abs(done.arms[1].rootX - (never.arms[1].rootX + 0.75)) < 1e-9,
    `戻りきっていない(${done.arms[1].rootX} / ${never.arms[1].rootX})`);
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
