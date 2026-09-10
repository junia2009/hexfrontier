// 水の音。鳴らせはしないが、「何でできているか」は検査できる。
//
// **この検査は一度、物として逆のことを固定してしまった。**
// 前の版では「泡は芯のノイズより小さく保て・粒は数個」と書いていた。
// 音程が暴れるのを防ぐつもりだったが、水の音の正体はまさにその泡なので、
// 守るほど水から遠ざかる決まりになっていた。いまは逆に
// 「泡が主役で、数が十分あること」を押さえる。
import test from 'node:test';
import assert from 'node:assert/strict';

import { waterSound, WATER_KINDS, BUBBLE_LIMITS } from '../src/audio/water.js';
import { SFX_NAMES } from '../src/audio/sfx.js';

const NOISE_LAYERS = ['impact', 'cavity'];

test('水: 中身が全て有限の数値', () => {
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    assert.ok(w.impact && w.cavity && w.bubbles, `${kind}: 層が足りない`);
    for (const k of NOISE_LAYERS) {
      for (const f of ['at', 'freq', 'q', 'dur', 'gain', 'sweep']) {
        assert.ok(Number.isFinite(w[k][f]), `${kind} の ${k}.${f}`);
        assert.ok(f === 'at' ? w[k][f] >= 0 : w[k][f] > 0, `${kind} の ${k}.${f} が負`);
      }
    }
    for (const f of ['at', 'n', 'fLo', 'fHi', 'spread', 'decay', 'rise', 'gain', 'dur']) {
      assert.ok(Number.isFinite(w.bubbles[f]), `${kind} の bubbles.${f}`);
      assert.ok(w.bubbles[f] >= 0, `${kind} の bubbles.${f} が負`);
    }
  }
});

test('水: 泡が主役。数が足りていること', () => {
  // **ここが本丸。** 水の音はほとんどが気泡の共鳴でできていて、
  // 本物の飛沫では泡が数百個いっぺんに生まれる。
  // 前の版は6粒しか置かず、残りをフィルタしたノイズで埋めていたので、
  // 音程は消えても「ノイズがシュッと鳴る音」にしかならなかった。
  for (const kind of WATER_KINDS) {
    const b = waterSound(kind).bubbles;
    assert.ok(b.n >= BUBBLE_LIMITS.minN, `${kind}: 泡が少なすぎる(${b.n})`);
    assert.ok(Number.isInteger(b.n), `${kind}: 泡の数が整数でない`);
    // 時間にばらけて湧くこと(同時に鳴らすと一発の和音になる)
    assert.ok(b.spread > 0, `${kind}: 泡が同時に生まれる`);
    assert.ok(b.decay > 0, `${kind}: 泡の湧きが減っていかない`);
  }
  // いちばん派手なのは体ごとの着水
  const n = (k) => waterSound(k).bubbles.n;
  assert.ok(n('dive') > n('thrash') && n('thrash') > n('plop'), '規模の順が合っていない');
});

test('水: 泡は高く、縮みながら音が上がる', () => {
  // 泡は大きいほど低い。低い泡ばかりにすると「ボヨン」に化ける
  // (最初の版がまさにそれで、73Hz の正弦波が音の 74% を占めていた)。
  // また、縮んでいく泡は音が上がる ── これが「ポチャン」の「ャン」。
  for (const kind of WATER_KINDS) {
    const b = waterSound(kind).bubbles;
    // 泡の高さは大きさで決まる(ミンナールト: f ≒ 3.28/半径[m])。
    // 下限は「泡としてありうる最大の大きさ」から来ている。
    assert.ok(b.fLo >= BUBBLE_LIMITS.minHz, `${kind}: 泡が低すぎる(${b.fLo}Hz)`);
    assert.ok(b.fLo <= BUBBLE_LIMITS.maxLoHz, `${kind}: 泡の下限が高すぎる(${b.fLo}Hz)`);
    assert.ok(b.fHi > b.fLo * 3, `${kind}: 泡の大きさの幅が狭い`);
    assert.ok(b.rise > 0, `${kind}: 泡の音が上がらない`);
  }
});

test('水: ノイズの層に音程を持たせない', () => {
  // 一撃と空洞はあくまで雑音。ここに正弦波を混ぜると楽器の音になる。
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    for (const k of NOISE_LAYERS) {
      assert.equal(w[k].midi, undefined, `${kind}: ${k} に音程がある`);
      assert.equal(w[k].n, undefined, `${kind}: ${k} に泡の数がある`);
    }
  }
});

test('水: 空洞の唸りは低く、帯域が下がる(沈む)', () => {
  // 最初の版は叩きの帯域を 900→3150Hz と**上に**振っていて、
  // 「沈んだ」ではなく「弾けた」に聞こえていた。水は落ちて沈む。
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    assert.ok(w.cavity.sweep < 1, `${kind}: 空洞が下がっていない(${w.cavity.sweep})`);
    assert.ok(w.impact.sweep < 1, `${kind}: 一撃が下がっていない(${w.impact.sweep})`);
    assert.ok(w.cavity.freq < w.impact.freq * 0.6, `${kind}: 空洞が一撃より低くない`);
    // 共鳴させない(ローパスは Q が 0.707 を超えると遮断点に山ができる)
    assert.ok(w.cavity.q <= 0.707, `${kind}: 空洞が共鳴している(Q=${w.cavity.q})`);
  }
});

test('水: 頭から鳴る(一撃 → 空洞 → 泡)', () => {
  // 着水でいちばん大きいのは水面が割れた瞬間。前の版は音の山が
  // 真ん中(60〜300ms)に来ていて、遅れて「シュッ」と鳴っていた。
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    assert.equal(w.impact.at, 0, `${kind}: 一撃が頭から始まっていない`);
    assert.ok(w.cavity.at >= w.impact.at, `${kind}: 空洞が一撃より先`);
    assert.ok(w.bubbles.at < 0.05, `${kind}: 泡が遅れすぎ(${w.bubbles.at})`);
  }
});

test('水: 種類ごとに規模が違う', () => {
  const dive = waterSound('dive');
  const plop = waterSound('plop');
  // 体ごと落ちるほうが、浮きが落ちるより大きく・深く・長い
  assert.ok(dive.impact.gain > plop.impact.gain * 2, '着水が浮きより大きくない');
  assert.ok(dive.cavity.freq < plop.cavity.freq, '着水が浮きより深くない');
  assert.ok(dive.bubbles.dur > plop.bubbles.dur * 2, '着水の尾が短い');
  // 泡も、体ごと落ちたほうが大きい(低い泡まで出る)
  assert.ok(dive.bubbles.fLo < plop.bubbles.fLo, '着水の泡が浮きより大きくない');
});

test('水: 大きさの倍率は全ての層に同じだけ掛かる', () => {
  const a = waterSound('dive', 1);
  const b = waterSound('dive', 0.5);
  for (const k of [...NOISE_LAYERS, 'bubbles']) {
    const r = b[k].gain / a[k].gain;
    assert.ok(Math.abs(r - 0.5) < 0.02, `${k} だけ絞り方が違う(${r.toFixed(3)})`);
  }
  // 倍率で泡の数や高さまで変わってはいけない(音色が変わってしまう)
  assert.equal(b.bubbles.n, a.bubbles.n);
  assert.equal(b.bubbles.fLo, a.bubbles.fLo);
  // 行きすぎた値でも壊れない
  for (const v of [-3, 99, NaN]) {
    assert.ok(waterSound('dive', v).cavity.gain >= 0, `scale=${v}`);
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
