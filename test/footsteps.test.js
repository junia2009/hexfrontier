// 足音。音そのものは鳴らせないが、「地面 × 動き」の決めごとは検査できる。
import test from 'node:test';
import assert from 'node:assert/strict';

import { stepSound, GROUND_KINDS, MOTION_KINDS } from '../src/audio/footsteps.js';
import { LAYOUT, TERRAINS } from '../src/rules/board.js';
import { createGame } from '../src/state.js';
import { makeGround } from '../src/minigame/ground.js';
import { SFX_NAMES } from '../src/audio/sfx.js';

const LAYERS = ['scuff', 'body', 'grit'];
const layersOf = (s) => LAYERS.map((k) => s[k]).filter(Boolean);

test('足音: 歩ける地形は全て音を持っている', () => {
  // 海は歩けないので要らない。それ以外は盤に出る以上、必ず音がいる。
  const walkable = TERRAINS.filter((t) => t !== 'sea');
  for (const t of walkable) {
    assert.ok(GROUND_KINDS.includes(t), `${t} の足音がない`);
  }
});

// ヘックスの中心(ground.js と同じ計算)
function hexCenterOf(state, hid) {
  let x = 0; let z = 0;
  for (const vid of LAYOUT.hexVertices[hid]) {
    x += LAYOUT.vertices[vid].x;
    z += LAYOUT.vertices[vid].y;
  }
  return { x: x / 6, z: z / 6 };
}

test('足音: どのモードで出る地形も、既定に落ちない', () => {
  // 実際に盤を作って、そこに出る地形が表に載っているかを見る
  const seen = new Set();
  for (const mode of ['base', 'cak', 'dragon', 'fish', 'sea']) {
    for (const seed of [1, 7, 42]) {
      const s = createGame({ seed, playerCount: 4, humanIndex: 0, mode });
      const ground = makeGround(s);
      for (const hid of s.board.hexIds) {
        // 歩ける(= makeGround が陸とみなす)ヘックスだけ
        const c = hexCenterOf(s, hid);
        if (!ground(c.x, c.z).ok) continue;
        seen.add(s.board.hexes[hid].terrain);
      }
    }
  }
  assert.ok(seen.size >= 6, `地形が少なすぎる(${[...seen]})`);
  for (const t of seen) assert.ok(GROUND_KINDS.includes(t), `${t} の足音がない`);
});

test('足音: 中身が全て有限の数値', () => {
  for (const t of GROUND_KINDS) {
    for (const m of MOTION_KINDS) {
      const s = stepSound(t, m);
      assert.ok(s.scuff, `${t}/${m}: こすれ音が無い`);
      for (const L of layersOf(s)) {
        for (const k of ['freq', 'q', 'dur', 'gain', 'sweep']) {
          assert.ok(Number.isFinite(L[k]) && L[k] > 0, `${t}/${m} の ${k}`);
        }
        if (L.n != null) assert.ok(Number.isInteger(L.n) && L.n >= 4, `${t}/${m} の n`);
        if (L.attack != null) assert.ok(L.attack > 0 && L.attack < L.dur, `${t}/${m} の attack`);
      }
    }
  }
});

// ---- ここから下が「鉄の上を歩いてるみたい」の再発を防ぐ検査 ----

test('足音: どの層も音程を持たない(正弦波を使わない)', () => {
  // 以前は体重の音を midi 指定の正弦波で鳴らしていて、実測すると
  // それだけで音全体のエネルギーの 81〜98% を占めていた。
  // どの地面でもほぼ同じ高さの音が鳴る = 鉄板の上を歩いている音になる。
  // 音の高さを指す値(midi)がどこにも無いことを、構造として押さえる。
  for (const t of GROUND_KINDS) {
    for (const m of MOTION_KINDS) {
      const s = stepSound(t, m);
      for (const [name, L] of Object.entries(s)) {
        if (!L) continue;
        assert.equal(L.midi, undefined, `${t}/${m} の ${name} に音程がある`);
        // 帯域(freq+q)で色を付けるのは可。ただし尖らせすぎない ──
        // Q が高いほど狭い帯だけが鳴って、音程として聞こえはじめる。
        assert.ok(L.q <= 2.5, `${t}/${m} の ${name}: Q=${L.q} は尖りすぎ`);
      }
    }
  }
});

test('足音: 体重の音は共鳴させない(ローパスの Q は臨界以下)', () => {
  // ローパスは Q が 0.707 を超えると遮断点に山ができる。
  // その山は特定の高さなので、上げていくと「ポーン」に化ける。
  for (const t of GROUND_KINDS) {
    const { body } = stepSound(t, 'walk');
    if (body) assert.ok(body.q <= 0.707, `${t}: 体重の音が共鳴している(Q=${body.q})`);
  }
});

test('足音: 体重の音が素材の音を潰さない', () => {
  // 以前の壊れ方はこれ。体重の層だけが大きすぎると、地面の素材を
  // 表している層が聞こえなくなり、どこを歩いても同じ音になる。
  // gain は層ごとにフィルタが違うので音量そのものではないが、
  // 「体重だけが突出していないか」の歯止めとしては働く
  // (実測で、体重の占めるエネルギーが 8割を超えると素材が消えた)。
  for (const t of GROUND_KINDS) {
    for (const m of MOTION_KINDS) {
      const { scuff, body, grit } = stepSound(t, m);
      if (!body) continue;
      const material = scuff.gain + (grit?.gain ?? 0);
      assert.ok(body.gain <= material * 2.2,
        `${t}/${m}: 体重 ${body.gain} が素材 ${material.toFixed(4)} に対して大きすぎる`);
    }
  }
});

test('足音: 素材ごとに層の構成が違う(周波数を変えただけにしない)', () => {
  // 落ち葉と砂は、帯域の中心をずらしただけでは区別が付かない。
  // 落ち葉は粒が主役、砂は粒がひとつも無い摩擦音、と構造から変える。
  const has = (t) => LAYERS.filter((k) => stepSound(t, 'walk')[k]).join('+');
  assert.equal(has('forest'), 'scuff+grit', '落ち葉に体重の音が付いている');
  assert.equal(has('desert'), 'scuff', '砂に粒か体重の音が付いている');
  assert.equal(has('hill'), 'scuff+body', '締まった粘土に粒が付いている');
  // 構成の種類が2つ以上あること(全部同じ形なら「構造から変える」が嘘になる)
  assert.ok(new Set(GROUND_KINDS.map(has)).size >= 3, '層の構成が揃いすぎている');
});

test('足音: 跳ぶ・着地は歩きより重い(大きく・低く・長い)', () => {
  for (const t of GROUND_KINDS) {
    const walk = stepSound(t, 'walk');
    const jump = stepSound(t, 'jump');
    const land = stepSound(t, 'land');
    assert.ok(jump.scuff.gain > walk.scuff.gain, `${t}: 踏み切りが歩きより小さい`);
    assert.ok(land.scuff.gain > jump.scuff.gain, `${t}: 着地が踏み切りより小さい`);
    assert.ok(land.scuff.dur > walk.scuff.dur, `${t}: 着地が短い`);
    assert.ok(land.scuff.freq < walk.scuff.freq, `${t}: 着地が低くない`);
    if (walk.body) {
      assert.ok(land.body.gain > walk.body.gain * 2, `${t}: 着地の重さが足りない`);
    }
  }
});

test('足音: 地面ごとに音が違う(同じ音の使い回しがない)', () => {
  const keys = GROUND_KINDS.map((t) => {
    const s = stepSound(t, 'walk');
    return LAYERS.map((k) => (s[k] ? `${s[k].freq}/${s[k].q}/${s[k].dur}` : '-')).join('|');
  });
  assert.equal(new Set(keys).size, keys.length, '同じ音の地形がある');
});

test('足音: 柔らかい地面は高く長く、硬い地面は低い', () => {
  const w = (t) => stepSound(t, 'walk').scuff;
  // 砂と落ち葉は、土や粘土よりずっと高い
  assert.ok(w('desert').freq > w('field').freq * 2, '砂が土より高くない');
  assert.ok(w('forest').freq > w('hill').freq * 2, '落ち葉が丘より高くない');
  // 砂と落ち葉は長く尾を引く
  assert.ok(w('desert').dur > w('mountain').dur, '砂が岩より短い');
  // 体重の音は硬い地面ほど大きい。砂と落ち葉では鳴らさない
  assert.equal(stepSound('desert').body, null);
  assert.equal(stepSound('forest').body, null);
  assert.ok(stepSound('hill').body.gain > stepSound('pasture').body.gain);
});

test('足音: 揺らぎは高さと大きさだけを振る', () => {
  const a = stepSound('field', 'walk', -1);
  const b = stepSound('field', 'walk', 1);
  assert.ok(b.scuff.freq > a.scuff.freq, '揺らぎで高さが変わらない');
  assert.ok(b.scuff.gain > a.scuff.gain, '揺らぎで大きさが変わらない');
  assert.equal(a.scuff.dur, b.scuff.dur, '長さまで変わっている');
  // 揺らぎは全ての層に掛かる(1層だけ動くと音の釣り合いが崩れる)
  assert.ok(b.body.freq > a.body.freq, '体重の音に揺らぎが掛かっていない');
  assert.ok(b.grit.freq > a.grit.freq, '粒に揺らぎが掛かっていない');
  // 行きすぎた値を渡しても壊れない
  for (const v of [-99, 99, NaN]) {
    const s = stepSound('field', 'walk', v);
    assert.ok(Number.isFinite(s.scuff.freq) && s.scuff.freq > 0, `vary=${v}`);
  }
});

test('足音: ゆっくり歩くと小さい。跳ぶ・着地は速さに関係なく出す', () => {
  const slow = stepSound('field', 'walk', 0, 0);
  const fast = stepSound('field', 'walk', 0, 1);
  assert.ok(slow.scuff.gain < fast.scuff.gain, 'ゆっくりでも同じ大きさで鳴る');
  // 全ての層が同じだけ小さくなる(1層だけ残ると音色が変わってしまう)
  for (const k of LAYERS) {
    if (!fast[k]) continue;
    const r = slow[k].gain / fast[k].gain;
    assert.ok(Math.abs(r - 0.45) < 0.02, `${k} の絞り方が他の層と違う(${r.toFixed(3)})`);
  }
  // 跳躍・着地は歩く速さで絞らない ── 手ごたえが消える
  for (const m of ['jump', 'land']) {
    assert.deepEqual(stepSound('field', m, 0, 0), stepSound('field', m, 0, 1), `${m} が速さで変わる`);
  }
  // 変な値でも黙らない
  for (const v of [-5, 9, NaN]) {
    assert.ok(stepSound('field', 'walk', 0, v).scuff.gain > 0, `gait=${v}`);
  }
});

test('足音: 知らない地形・知らない動きでも黙らない', () => {
  const s = stepSound('unknown-terrain', 'unknown-motion');
  assert.ok(s.scuff.gain > 0);
  assert.deepEqual(s, stepSound('field', 'walk'));
});

test('足音: 鳴らす口が sfx にある', () => {
  for (const name of ['step', 'splash']) {
    assert.ok(SFX_NAMES.includes(name), `${name} が sfx にない`);
  }
});
