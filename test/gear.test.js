// 卓のしつらえ(src/gear.js)── カタン本編の盤で使う見た目の品。
//
// ここが見張るのは**線引き**。見た目の品は「遊びに1ミリも効かない」ことが
// 売ってよい根拠なので、効かないことを機械に確かめさせないと意味がない。
// とくに3つめ(盤から読み取れる情報量を変えない)は目で見ても分からないので、
// **コントラスト比を数で測る**。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DICE, GEAR, GEAR_BY_ID, GEAR_FOR_SALE, SLOTS, SLOT_IDS,
  defaultGear, gearOf, isDefaultGear, isGear, slotOf,
} from '../src/gear.js';
import { ITEMS, ITEM_BY_ID, SHELF_BY_ID, buyItem, owns } from '../src/shop.js';
import { emptyProgress, parseProgress, useGear } from '../src/progress.js';

// 明るさとコントラスト比(WCAG の式)。目が地の上で読めるかを測る
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// 読めることの下限。WCAG AA の本文と同じ 4.5:1。
// **既定の骨のサイコロは 13.85** あるので、どの柄も既定より読みにくくは
// なるが、読めなくはならない ── ここが「情報量を変えない」の実際の意味。
const MIN_CONTRAST = 4.5;

const rich = () => ({ ...emptyProgress(), coins: 99999 });

// ---- 表そのもの ----

test('しつらえ: どのスロットにも既定があり、既定は買えない', () => {
  assert.ok(SLOTS.length, 'スロットが1つも無い');
  for (const s of SLOTS) {
    const def = defaultGear(s.id);
    assert.ok(def, `${s.label} に既定が無い`);
    assert.equal(def.price, undefined, `${s.label} の既定に値段が付いている`);
    assert.equal(def, s.items[0], '既定は先頭に置く約束');
    // 既定以外は全部売り物(値段の無い品が埋もれていると、店から選べない)
    for (const i of s.items.slice(1)) {
      assert.ok(i.price > 0, `${i.name} に値段が無い`);
    }
  }
});

test('しつらえ: id は重ならない。店の品とも重ならない', () => {
  const ids = GEAR.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, 'しつらえの中で id が重なっている');
  // 既定は店に並ばないので、店に出るのは値段付きだけ
  for (const g of GEAR_FOR_SALE) {
    assert.ok(ITEM_BY_ID[g.id], `${g.name} が店に並んでいない`);
  }
  assert.equal(
    ITEMS.filter((i) => i.kind === 'gear').length, GEAR_FOR_SALE.length,
    '店に並ぶ数が合わない',
  );
  // 既定は店に並べない
  for (const s of SLOTS) assert.equal(ITEM_BY_ID[s.items[0].id], undefined, '既定が店にある');
});

test('しつらえ: 店の棚から全部引ける', () => {
  const shelf = SHELF_BY_ID.gear;
  assert.ok(shelf, '卓のしつらえの棚が無い');
  assert.equal(shelf.items.length, GEAR_FOR_SALE.length);
  for (const i of shelf.items) assert.equal(i.kind, 'gear');
});

test('しつらえ: id からスロットが引ける。知らない id は落とす', () => {
  for (const g of GEAR) assert.equal(slotOf(g.id), g.slot);
  assert.equal(slotOf('nosuchgear'), null);
  assert.equal(slotOf(null), null);
  assert.equal(isGear('dice-wood'), true);
  assert.equal(isGear('bench'), false, '島の飾りをしつらえと見なしている');
  assert.equal(isGear(undefined), false);
});

// ---- 情報量を変えない(いちばん大事な線引き)----

test('しつらえ: どのサイコロの柄でも、目は地の上で読める', () => {
  for (const d of DICE) {
    const c = contrast(d.face, d.pip);
    assert.ok(c >= MIN_CONTRAST, `${d.name}: 目と地のコントラストが ${c.toFixed(2)}(下限 ${MIN_CONTRAST})`);
    // 2D盤は地→縁のグラデーションで立体に見せる。暗いほうでも読めること
    const e = contrast(d.edge, d.pip);
    assert.ok(e >= MIN_CONTRAST, `${d.name}: 縁と目のコントラストが ${e.toFixed(2)}`);
  }
});

test('しつらえ: サイコロの柄は色を3つとも持っている', () => {
  // 片方の盤にしか色が無いと、見る向きを変えたときに柄が消える
  for (const d of DICE) {
    for (const k of ['face', 'edge', 'pip']) {
      assert.match(d[k] ?? '', /^#[0-9a-f]{6}$/i, `${d.name} の ${k} が色になっていない`);
    }
  }
});

test('しつらえ: 柄はつやだけを変える。出目にも規則にも触らない', () => {
  // **持っているのは見た目の値だけ。** 確率・目の数・規則に関わる名前の
  // フィールドが紛れ込んだら、それは見た目の品ではなくなっている
  const LOOKS = new Set(['id', 'name', 'icon', 'price', 'desc', 'face', 'edge', 'pip', 'finish', 'slot']);
  for (const g of GEAR) {
    for (const k of Object.keys(g)) {
      assert.ok(LOOKS.has(k), `${g.name} に見た目でない値がある: ${k}`);
    }
    if (g.finish) {
      for (const k of Object.keys(g.finish)) {
        assert.ok(['roughness', 'metalness'].includes(k), `${g.name} の finish に ${k}`);
      }
    }
  }
});

// ---- 選ぶ ----

test('しつらえ: 買っていない柄は使えない(保存を書き換えても)', () => {
  const p = emptyProgress();
  assert.equal(gearOf(p, 'dice').id, defaultGear('dice').id, 'はじめから既定でない');
  assert.ok(isDefaultGear(p, 'dice'));
  // 買わずに選ぼうとしても既定のまま
  const q = useGear(p, 'dice', 'dice-gold');
  assert.equal(gearOf(q, 'dice').id, defaultGear('dice').id, '買わずに使えてしまう');
  // 保存を直に書き換えても、読み込みで落とす
  const forged = parseProgress(JSON.stringify({ ...p, v: 4, worn: { hat: null, dice: 'dice-gold' } }));
  assert.equal(gearOf(forged, 'dice').id, defaultGear('dice').id, '保存の書き換えで使えてしまう');
});

test('しつらえ: 買えば使える。押し直すと既定に戻る', () => {
  let p = rich();
  const r = buyItem(p, 'dice-wood');
  assert.ok(r.ok, r.reason);
  p = r.progress;
  assert.ok(owns(p, 'dice-wood'));
  // **買っただけでは変わらない**(かぶりものと同じ)
  assert.ok(isDefaultGear(p, 'dice'), '買った瞬間に見た目が変わっている');
  p = useGear(p, 'dice', 'dice-wood');
  assert.equal(gearOf(p, 'dice').id, 'dice-wood');
  assert.equal(isDefaultGear(p, 'dice'), false);
  // 既定へ戻す道がある(既定は店に無いので、ここが無いと二度と戻せない)
  p = useGear(p, 'dice', null);
  assert.ok(isDefaultGear(p, 'dice'), '既定に戻せない');
  // 保存を経ても残る
  p = useGear(p, 'dice', 'dice-wood');
  assert.equal(gearOf(parseProgress(JSON.stringify(p)), 'dice').id, 'dice-wood');
});

test('しつらえ: 知らないスロットと知らない id では何も起きない', () => {
  let p = rich();
  p = buyItem(p, 'dice-wood').progress;
  const used = useGear(p, 'dice', 'dice-wood');
  assert.equal(useGear(used, 'nosuchslot', 'dice-wood'), used, '知らないスロットで動いた');
  assert.equal(gearOf(useGear(used, 'dice', 'nosuchgear'), 'dice').id, defaultGear('dice').id);
  // スロット違いの id は入れない(サイコロの欄にコマの柄、など)
  for (const slot of SLOT_IDS) {
    for (const g of GEAR) {
      if (g.slot === slot) continue;
      assert.notEqual(gearOf(useGear(used, slot, g.id), slot)?.id, g.id, `${slot} に ${g.id}`);
    }
  }
});

test('しつらえ: 壊れた progress でも既定を返す', () => {
  for (const bad of [null, undefined, {}, { worn: null }, { worn: { dice: 42 } }]) {
    assert.equal(gearOf(bad, 'dice')?.id, defaultGear('dice').id, `${JSON.stringify(bad)}`);
  }
  assert.equal(gearOf(emptyProgress(), 'nosuchslot'), null);
  assert.equal(defaultGear('nosuchslot'), null);
});

test('しつらえ: 買った品は持ち物に出る(棚ごと消えない)', () => {
  let p = rich();
  p = buyItem(p, 'dice-stone').progress;
  assert.ok(GEAR_BY_ID['dice-stone'], '表から引けない');
  assert.ok(owns(p, 'dice-stone'));
});
