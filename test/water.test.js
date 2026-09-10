// 水の音。鳴らせはしないが、「何が何の順で起きるか」は検査できる。
// ここの検査は主に**「ボヨン」への逆戻りを防ぐため**にある。
import test from 'node:test';
import assert from 'node:assert/strict';

import { waterSound, WATER_KINDS, DROP_LIMITS } from '../src/audio/water.js';
import { SFX_NAMES } from '../src/audio/sfx.js';

const NOISE_LAYERS = ['slap', 'gulp', 'spray', 'fizz'];
const noisesOf = (w) => NOISE_LAYERS.map((k) => w[k]).filter(Boolean);

test('水: 中身が全て有限の数値', () => {
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    assert.ok(w.slap && w.gulp, `${kind}: 叩きか沈み込みが無い`);
    for (const L of noisesOf(w)) {
      for (const k of ['at', 'freq', 'q', 'dur', 'gain', 'sweep']) {
        assert.ok(Number.isFinite(L[k]), `${kind} の ${k}`);
        assert.ok(k === 'at' ? L[k] >= 0 : L[k] > 0, `${kind} の ${k} が負`);
      }
    }
    if (w.spray) assert.ok(Number.isInteger(w.spray.n) && w.spray.n >= 4, `${kind} の n`);
  }
});

test('水: 沈み込みは帯域が下がる(上げると「弾けた」に聞こえる)', () => {
  // 前の着水音は叩きの帯域を 900→3150Hz と**上に**振っていた。
  // 水は落ちて沈むので、芯の層は必ず下へ動かす。
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    assert.ok(w.gulp.sweep < 1, `${kind}: 沈み込みが下がっていない(${w.gulp.sweep})`);
    assert.ok(w.slap.sweep < 1, `${kind}: 叩きが下がっていない(${w.slap.sweep})`);
    // 芯は叩きよりはっきり低い
    assert.ok(w.gulp.freq < w.slap.freq * 0.6, `${kind}: 沈み込みが叩きより低くない`);
  }
});

test('水: 明るい層は暗い層より後に出す', () => {
  // 飛沫や泡を早く出しすぎると、沈み込みの暗さを覆ってしまう。
  // 実測で、飛沫を 30ms から出していたときは着水 120ms 時点の明るさが
  // 3038→6799Hz と上がって、「沈んだ」に聞こえなかった。
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    assert.ok(w.slap.at <= w.gulp.at, `${kind}: 叩きより沈み込みが先`);
    if (w.spray) assert.ok(w.spray.at > w.gulp.at, `${kind}: 飛沫が沈み込みより先`);
    if (w.fizz) assert.ok(w.fizz.at > w.spray.at, `${kind}: 泡が飛沫より先`);
    if (w.drops) assert.ok(w.drops.at > w.gulp.at, `${kind}: 水滴が沈み込みより先`);
  }
});

test('水: 音程を持つのは水滴だけ。高く・短く・小さく', () => {
  // **ここが本丸。** 前は 73Hz の正弦波を 0.22 秒も鳴らしていて、
  // それだけで音全体のエネルギーの 74% を占めていた ── だから水ではなく
  // 「ボヨン」に聞こえた。泡が音程を持つのは物として正しいが、
  // 「低い・長い・大きい」が揃うと途端に楽器の音になる。
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    // ノイズの層に音程の指定が紛れ込んでいないこと
    for (const L of noisesOf(w)) {
      assert.equal(L.midi, undefined, `${kind}: ノイズの層に音程がある`);
      assert.equal(L.lo, undefined, `${kind}: ノイズの層に音程がある`);
    }
    if (!w.drops) continue;
    const d = w.drops;
    assert.ok(d.lo >= DROP_LIMITS.minHz, `${kind}: 水滴が低すぎる(${d.lo}Hz)`);
    assert.ok(d.hi > d.lo, `${kind}: 水滴の高さの幅が逆`);
    assert.ok(d.dur <= DROP_LIMITS.maxDur, `${kind}: 水滴が長すぎる(${d.dur}秒)`);
    assert.ok(d.gain <= w.gulp.gain * DROP_LIMITS.maxVsGulp,
      `${kind}: 水滴が芯より大きい(${d.gain} vs 沈み込み ${w.gulp.gain})`);
    // 数を散らす(1粒だけだと「ピッ」と鳴って音程が立つ)
    assert.ok(d.n >= 3, `${kind}: 水滴が少なすぎる`);
    assert.ok(d.spread > 0, `${kind}: 水滴が同時に鳴る`);
    // 縮む泡は音が上がる。下げると「ボヨン」寄りに戻る
    assert.ok(d.rise > 0, `${kind}: 水滴が下がっている`);
  }
});

test('水: 種類ごとに規模が違う', () => {
  const dive = waterSound('dive');
  const plop = waterSound('plop');
  // 体ごと落ちるほうが、浮きが落ちるより大きく・深く・長い
  assert.ok(dive.slap.gain > plop.slap.gain * 2, '着水が浮きより大きくない');
  assert.ok(dive.gulp.freq < plop.gulp.freq, '着水が浮きより深くない');
  assert.ok(dive.gulp.dur > plop.gulp.dur * 2, '着水が浮きより長くない');
  // 泡の尾を引くのは体ごと落ちたときだけ
  assert.ok(dive.fizz, '着水に泡の尾が無い');
  assert.equal(plop.fizz, null, '浮きに泡の尾が付いている');
});

test('水: 大きさの倍率は全ての層に同じだけ掛かる', () => {
  const a = waterSound('dive', 1);
  const b = waterSound('dive', 0.5);
  for (const k of [...NOISE_LAYERS, 'drops']) {
    if (!a[k]) continue;
    const r = b[k].gain / a[k].gain;
    assert.ok(Math.abs(r - 0.5) < 0.02, `${k} だけ絞り方が違う(${r.toFixed(3)})`);
  }
  // 行きすぎた値でも壊れない
  for (const v of [-3, 99, NaN]) {
    assert.ok(waterSound('dive', v).gulp.gain >= 0, `scale=${v}`);
  }
});

test('水: 知らない種類でも黙らない', () => {
  assert.deepEqual(waterSound('unknown-kind'), waterSound('dive'));
});

test('水: 鳴らす口が sfx にある', () => {
  for (const name of ['splash', 'cast', 'thrash']) {
    assert.ok(SFX_NAMES.includes(name), `${name} が sfx にない`);
  }
});
