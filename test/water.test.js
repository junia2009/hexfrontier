// 水の音。鳴らせはしないが、「効果音としての決まり」は検査できる。
//
// **この検査は三度、逆のことを固定した。** 本物に寄せようとするたびに、
// 物としては正しいが効果音としては誤りな決まりを書いてしまった ──
// 「泡は小さく保て」(水は泡そのものなのに)、「泡は数百個」(重ねると
// 雑音に収束するのに)、「低い層は下へ滑らせろ」(それは屁の音の
// 作りかたなのに)。いまは狙いを**効果音としての正しさ**に置いている。
// 以下はすべて「一度破って怒られた」ことの裏返しなので、理由ごと残す。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  waterSound, WATER_KINDS, FX_LIMITS, SCALE_PCS,
} from '../src/audio/water.js';
import { SFX_NAMES } from '../src/audio/sfx.js';

test('水: 中身が全て有限の数値', () => {
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    assert.ok(w.splash && w.ploop && w.sparkle, `${kind}: 層が足りない`);
    for (const f of ['at', 'freq', 'q', 'dur', 'gain', 'sweep']) {
      assert.ok(Number.isFinite(w.splash[f]) && w.splash[f] >= 0, `${kind} の splash.${f}`);
    }
    for (const f of ['at', 'midi', 'rise', 'dur', 'gain', 'lp']) {
      assert.ok(Number.isFinite(w.ploop[f]) && w.ploop[f] >= 0, `${kind} の ploop.${f}`);
    }
    for (const f of ['at', 'n', 'fLo', 'fHi', 'spread', 'decay', 'rise', 'gain', 'dur']) {
      assert.ok(Number.isFinite(w.sparkle[f]) && w.sparkle[f] >= 0, `${kind} の sparkle.${f}`);
    }
  }
});

test('水: 音程は必ず上がる(これが水の合図)', () => {
  // 漫画の水音が必ず上がるのは、人がこの形を水として覚えているから。
  // **下がる音程は水ではなく体の音になる** ── 最初の版は 73Hz の
  // 正弦波を下げていて「ボヨン」、次の版は低い雑音を下げていて
  // 「うんちしてる感じ」と言われた。上げる以外に選択肢はない。
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    assert.ok(w.ploop.rise > 0, `${kind}: 音程が上がらない`);
    assert.ok(w.sparkle.rise > 0, `${kind}: 滴の音程が上がらない`);
  }
});

test('水: 低い帯に落とさない・低い雑音を滑らせない', () => {
  // 上がっていても、低すぎれば下品な帯に入る。
  // また、ローパスした雑音を下へ滑らせるのは屁の音の作りかたそのもの。
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    assert.ok(w.ploop.midi >= FX_LIMITS.minPloopMidi,
      `${kind}: 音程が低すぎる(midi ${w.ploop.midi})`);
    // 雑音の層は明るいほうだけ。下へ長く滑らせない
    assert.ok(w.splash.freq >= 1500, `${kind}: 雑音が低すぎる(${w.splash.freq}Hz)`);
    assert.ok(w.splash.sweep >= 0.4, `${kind}: 雑音が下へ滑りすぎ(${w.splash.sweep})`);
    assert.ok(w.splash.dur <= 0.09, `${kind}: 雑音が長すぎる(${w.splash.dur}秒)`);
  }
});

test('水: 音程は BGM と同じ音階に乗せる', () => {
  // 効果音全体の決まり。外れた高さで鳴ると、曲と喧嘩して安っぽくなる。
  for (const kind of WATER_KINDS) {
    const { midi, rise } = waterSound(kind).ploop;
    assert.ok(SCALE_PCS.includes(midi % 12), `${kind}: 開始の高さが音階の外(midi ${midi})`);
    assert.ok(SCALE_PCS.includes((midi + rise) % 12), `${kind}: 上がった先が音階の外`);
  }
});

test('水: 短く収める(効果音は居座らない)', () => {
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    for (const [name, L] of Object.entries(w)) {
      assert.ok(L.dur <= FX_LIMITS.maxDur, `${kind}/${name}: 長すぎる(${L.dur}秒)`);
    }
    const end = Math.max(...Object.values(w).map((L) => L.at + L.dur));
    assert.ok(end <= FX_LIMITS.maxDur + 0.1, `${kind}: 全体が長い(${end.toFixed(2)}秒)`);
  }
});

test('水: 粒は増やしすぎない', () => {
  // 粒はランダムな位相の正弦波なので、重ねるほど中心極限定理で
  // ただの雑音に収束する ── 増やすほど水から遠ざかる。
  // 実測でも、聞き分けられる粒は 8〜11 個で頭打ちで、
  // 24 個から 280 個に増やしても一切増えなかった。
  for (const kind of WATER_KINDS) {
    const { n } = waterSound(kind).sparkle;
    assert.ok(Number.isInteger(n) && n >= 3, `${kind}: 滴が少なすぎる(${n})`);
    assert.ok(n <= FX_LIMITS.maxSparkleN, `${kind}: 滴が多すぎて濁る(${n})`);
  }
});

test('水: 層どうしが帯域と時刻で分かれている', () => {
  // 重なると互いを埋めて「複雑なのに何も聞こえない」濁りになる。
  for (const kind of WATER_KINDS) {
    const w = waterSound(kind);
    const ploopHz = 440 * 2 ** ((w.ploop.midi - 69) / 12);
    assert.ok(w.sparkle.fLo > ploopHz * FX_LIMITS.bandGap,
      `${kind}: 滴が音程に重なっている`);
    assert.ok(w.splash.freq > ploopHz * FX_LIMITS.bandGap,
      `${kind}: 雑音が音程に重なっている`);
    // 時刻: 雑音 → 音程 → 滴 の順に出る
    assert.equal(w.splash.at, 0, `${kind}: 雑音が頭から始まっていない`);
    assert.ok(w.ploop.at > 0, `${kind}: 音程が雑音と同時`);
    assert.ok(w.sparkle.at > w.ploop.at, `${kind}: 滴が音程より先`);
  }
});

test('水: 規模が「大きいほど低く・長く・粒が多い」で揃っている', () => {
  const d = waterSound('dive');
  const t = waterSound('thrash');
  const p = waterSound('plop');
  assert.ok(d.ploop.midi < t.ploop.midi && t.ploop.midi < p.ploop.midi, '大きいほど低く、になっていない');
  assert.ok(d.splash.gain > t.splash.gain && t.splash.gain > p.splash.gain, '大きいほど大きく、になっていない');
  assert.ok(d.sparkle.n > t.sparkle.n && t.sparkle.n > p.sparkle.n, '大きいほど粒が多く、になっていない');
  assert.ok(d.sparkle.dur > p.sparkle.dur, '着水の尾が浮きより短い');
});

test('水: 大きさの倍率は全ての層に同じだけ掛かる', () => {
  const a = waterSound('dive', 1);
  const b = waterSound('dive', 0.5);
  for (const k of ['splash', 'ploop', 'sparkle']) {
    const r = b[k].gain / a[k].gain;
    assert.ok(Math.abs(r - 0.5) < 0.02, `${k} だけ絞り方が違う(${r.toFixed(3)})`);
  }
  // 倍率で高さや粒の数まで変わってはいけない(音色が変わってしまう)
  assert.equal(b.ploop.midi, a.ploop.midi);
  assert.equal(b.sparkle.n, a.sparkle.n);
  for (const v of [-3, 99, NaN]) {
    assert.ok(waterSound('dive', v).ploop.gain >= 0, `scale=${v}`);
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
