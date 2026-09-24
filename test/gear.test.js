// 盤まわり(src/gear.js)── カタン本編の盤で使う見た目の品。
//
// ここが見張るのは**線引き**。見た目の品は「遊びに1ミリも効かない」ことが
// 売ってよい根拠なので、効かないことを機械に確かめさせないと意味がない。
// とくに3つめ(盤から読み取れる情報量を変えない)は目で見ても分からないので、
// **コントラスト比を数で測る**。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  boardTop,
  BOARDS, DICE, GEAR, GEAR_BY_ID, GEAR_FOR_SALE, LIGHTS, PIECES, ROOF_SHAPES, SLOTS, SLOT_IDS,
  hexToNum, numToHex, tintHex,
  defaultGear, gearOf, isDefaultGear, isGear, slotOf,
} from '../src/gear.js';
import { ITEMS, ITEM_BY_ID, SHELF_BY_ID, buyItem, owns } from '../src/shop.js';
import { TERRAIN_STYLE } from '../src/render/board-render.js';
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

test('盤まわり: どのスロットにも既定があり、既定は買えない', () => {
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

test('盤まわり: id は重ならない。店の品とも重ならない', () => {
  const ids = GEAR.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, '盤まわりの中で id が重なっている');
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

test('盤まわり: 店の棚から全部引ける', () => {
  const shelf = SHELF_BY_ID.gear;
  assert.ok(shelf, '盤まわりの棚が無い');
  assert.equal(shelf.items.length, GEAR_FOR_SALE.length);
  for (const i of shelf.items) assert.equal(i.kind, 'gear');
});

test('盤まわり: id からスロットが引ける。知らない id は落とす', () => {
  for (const g of GEAR) assert.equal(slotOf(g.id), g.slot);
  assert.equal(slotOf('nosuchgear'), null);
  assert.equal(slotOf(null), null);
  assert.equal(isGear('dice-wood'), true);
  assert.equal(isGear('bench'), false, '島の飾りを盤まわりと見なしている');
  assert.equal(isGear(undefined), false);
});

// ---- 情報量を変えない(いちばん大事な線引き)----

test('盤まわり: どのサイコロの柄でも、目は地の上で読める', () => {
  for (const d of DICE) {
    const c = contrast(d.face, d.pip);
    assert.ok(c >= MIN_CONTRAST, `${d.name}: 目と地のコントラストが ${c.toFixed(2)}(下限 ${MIN_CONTRAST})`);
    // 2D盤は地→縁のグラデーションで立体に見せる。暗いほうでも読めること
    const e = contrast(d.edge, d.pip);
    assert.ok(e >= MIN_CONTRAST, `${d.name}: 縁と目のコントラストが ${e.toFixed(2)}`);
  }
});

test('盤まわり: サイコロの柄は色を3つとも持っている', () => {
  // 片方の盤にしか色が無いと、見る向きを変えたときに柄が消える
  for (const d of DICE) {
    for (const k of ['face', 'edge', 'pip']) {
      assert.match(d[k] ?? '', /^#[0-9a-f]{6}$/i, `${d.name} の ${k} が色になっていない`);
    }
  }
});

test('盤まわり: 柄はつやだけを変える。出目にも規則にも触らない', () => {
  // **持っているのは見た目の値だけ。** 確率・目の数・規則に関わる名前の
  // フィールドが紛れ込んだら、それは見た目の品ではなくなっている
  const LOOKS = new Set([
    'id', 'name', 'icon', 'price', 'desc', 'slot',
    'face', 'edge', 'pip', 'finish',   // サイコロ
    'glow',                             // 卓の灯り(夜の明るさ。昼には効かない)
    'roof',                             // コマ(屋根の形の名前。寸法は持たない)
    'shift',                            // 盤(色相・彩度・明度のずらし。飾りの色づけ用)
    'palette',                          // 盤(地形ごとの色。**読めるかは下限で測る**)
  ]);
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

// ---- 卓の灯り ----

test('盤まわり: 灯りの既定は 0。買うほど明るくなるが、上限を超えない', () => {
  // **既定が 0 であることが「買わないと閉まる扉を作らない」の中身** ──
  // 灯りゼロの夜でも盤は読める、という前提でここを 0 にしてある
  assert.equal(defaultGear('light').glow, 0, '既定の卓に灯りが点いている');
  const paid = LIGHTS.filter((l) => l.price != null);
  assert.ok(paid.length >= 2, '明るさの段が1つしかない');
  for (const l of LIGHTS) {
    assert.ok(l.glow >= 0 && l.glow <= 1, `${l.name} の glow が ${l.glow}(0〜1 の外)`);
  }
  // 値段の高いほうが明るい(安いほうが明るいと、高いものを買う理由が消える)
  const sorted = [...paid].sort((a, b) => a.price - b.price);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(sorted[i].glow > sorted[i - 1].glow,
      `${sorted[i].name} は ${sorted[i - 1].name} より高いのに明るくない`);
  }
});

test('盤まわり: 灯りは明るさだけ。盤の中身には触らない', () => {
  // glow は board3d が night を掛けて使う値。**昼には効かない**という
  // 決めごとは board3d 側にあるので、ここでは「明るさ以外を持たない」を見る
  for (const l of LIGHTS) {
    assert.equal(typeof l.glow, 'number');
    assert.equal(l.face, undefined, '灯りが盤の色を持っている');
    assert.equal(l.finish, undefined);
  }
});

// ---- コマ ----

test('盤まわり: コマの柄は屋根の形の名前しか持たない', () => {
  // **寸法を持たせない。** 柄ごとの寸法を許すと「都市に見えない都市」が
  // 作れてしまう ── 開拓地と都市の見分けは情報(gear.js の3つめ)。
  // 描く側(board3d / board-render)が名前を寸法に読み替える。
  for (const p of PIECES) {
    assert.ok(ROOF_SHAPES.includes(p.roof), `${p.name}: 知らない屋根の形 ${p.roof}`);
    for (const k of ['scale', 'size', 'body', 'height', 'color']) {
      assert.equal(p[k], undefined, `${p.name} が ${k} を持っている`);
    }
  }
  // 既定は今までの三角屋根(買わない人の見た目が変わらない)
  assert.equal(defaultGear('piece').roof, 'cone');
});

test('盤まわり: 屋根の形は全部使われている。名前がだぶらない', () => {
  const used = new Set(PIECES.map((p) => p.roof));
  for (const r of ROOF_SHAPES) {
    assert.ok(used.has(r), `${r} の屋根を使う柄が無い(描く側だけにある形)`);
  }
  assert.equal(new Set(ROOF_SHAPES).size, ROOF_SHAPES.length);
});

// ---- 盤 ----
//
// **いちばん測る値打ちがあるのはここ。** 地形の色をまとめてずらすので、
// 彩度を落としすぎれば森と牧草地が同じ緑になり、明度を上げすぎれば
// 数字トークンが地形に溶ける ── どちらも「情報量を変えない」に反する。
// 目で見て「まあ読めるな」で済ませず、数で下限を置く。

// 盤にある地形の色(2D盤の TERRAIN_STYLE の上側。3D も同系統)。
// **ここは board-render.js の写しではなく、測るための見本** ── 写しを
// 置くと本体を変えたときに気づかないので、下のテストが本体と突き合わせる。
const TERRAIN_SAMPLE = {
  forest: '#4a8a58',
  pasture: '#a4cf62',
  field: '#f0cd58',
  hill: '#cd7d4c',
  mountain: '#a3aebc',
  desert: '#ecdcae',
  lake: '#4fb6d8',
  sea: '#2a7fb5',
  gold: '#f2d06b',
};

// 数字トークンの円盤(クリーム)と数字(黒)。盤の柄では変えない
const TOKEN_FACE = '#f2ecd8';

// 2色の隔たり。RGB の距離(0〜441)。**人の見えかたに近い重みを掛ける**
function colorDist(a, b) {
  const [x, y] = [hexToNum(a), hexToNum(b)];
  const dr = ((x >> 16) & 255) - ((y >> 16) & 255);
  const dg = ((x >> 8) & 255) - ((y >> 8) & 255);
  const db = (x & 255) - (y & 255);
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

// 既定の盤でいちばん近い2つの地形の隔たり。ここを下回らせない
// **柄そのものを渡す。** 変換(shift)だけを測ってはいけない ── 柄は
// 地形ごとの色(palette)を持てるので、shift を測ると**盤に出ていない色**を
// 見張ることになる。盤が使うのと同じ boardTop を通す
function closestPair(skin) {
  const keys = Object.keys(TERRAIN_SAMPLE);
  let min = Infinity;
  let pair = null;
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const d = colorDist(
        boardTop(keys[i], TERRAIN_SAMPLE[keys[i]], skin),
        boardTop(keys[j], TERRAIN_SAMPLE[keys[j]], skin),
      );
      if (d < min) { min = d; pair = [keys[i], keys[j]]; }
    }
  }
  return { min, pair };
}

test('盤の柄: 地形どうしの見分けが、既定より大きく落ちない', () => {
  const base = closestPair(null);
  // **下限は既定の 80%。** 「絶対値で◯以上」にすると、既定がぎりぎりだった
  // ときに既定だけ通って柄が落ちる ── 比べる相手は既定にする
  const floor = base.min * 0.8;
  for (const b of BOARDS) {
    const got = closestPair(b);
    assert.ok(got.min >= floor,
      `${b.name}: いちばん近い ${got.pair?.join('と')} が ${got.min.toFixed(1)}`
      + `(既定は ${base.pair?.join('と')} の ${base.min.toFixed(1)}、下限 ${floor.toFixed(1)})`);
  }
});

test('盤の柄: どの柄でも、数字トークンが地形から浮く', () => {
  // 円盤が地形に溶けると数字が読めない。**全部の地形について**見る
  const base = Math.min(...Object.values(TERRAIN_SAMPLE)
    .map((t) => colorDist(TOKEN_FACE, t)));
  const floor = base * 0.8;
  for (const b of BOARDS) {
    for (const [name, col] of Object.entries(TERRAIN_SAMPLE)) {
      const d = colorDist(TOKEN_FACE, boardTop(name, col, b));
      assert.ok(d >= floor,
        `${b.name}: ${name} の上で円盤が ${d.toFixed(1)}(既定の最小 ${base.toFixed(1)}、下限 ${floor.toFixed(1)})`);
    }
  }
});

test('盤の柄: 見本の色が本体とそろっている', () => {
  // 上の2つは見本の色で測っている。**本体を変えたら見本も直す** ──
  // ここが無いと、本体だけ変わって「測っていない色」を測り続ける
  for (const [name, col] of Object.entries(TERRAIN_SAMPLE)) {
    assert.equal(TERRAIN_STYLE[name]?.top, col, `${name} の色が本体と違う`);
  }
  assert.equal(
    Object.keys(TERRAIN_SAMPLE).length, Object.keys(TERRAIN_STYLE).length,
    '地形の数が本体と合わない(足した地形を見本に入れ忘れている)',
  );
});

test('盤の柄: 既定は1バイトも変えない', () => {
  assert.equal(defaultGear('board').shift, null);
  for (const col of Object.values(TERRAIN_SAMPLE)) {
    assert.equal(tintHex(col, null), col);
  }
});

test('盤の柄: 色の変換は往復しても壊れない', () => {
  for (const col of Object.values(TERRAIN_SAMPLE)) {
    assert.equal(numToHex(hexToNum(col)), col, `${col} の行き帰りでずれた`);
    // 何も動かさない変換は元のまま(丸めで1ずつずれていかない)
    assert.equal(tintHex(col, { h: 0, s: 1, l: 1 }), col, `${col} が素通しで変わった`);
  }
  // 端の色でも範囲から出ない
  for (const col of ['#000000', '#ffffff', '#ff0000']) {
    for (const b of BOARDS) {
      assert.match(tintHex(col, b.shift), /^#[0-9a-f]{6}$/, `${col} / ${b.name}`);
    }
  }
});

// ---- 選ぶ ----

test('盤まわり: 買っていない柄は使えない(保存を書き換えても)', () => {
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

test('盤まわり: 買えば使える。押し直すと既定に戻る', () => {
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

test('盤まわり: 知らないスロットと知らない id では何も起きない', () => {
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

test('盤まわり: 壊れた progress でも既定を返す', () => {
  for (const bad of [null, undefined, {}, { worn: null }, { worn: { dice: 42 } }]) {
    assert.equal(gearOf(bad, 'dice')?.id, defaultGear('dice').id, `${JSON.stringify(bad)}`);
  }
  assert.equal(gearOf(emptyProgress(), 'nosuchslot'), null);
  assert.equal(defaultGear('nosuchslot'), null);
});

test('盤まわり: 買った品は持ち物に出る(棚ごと消えない)', () => {
  let p = rich();
  p = buyItem(p, 'dice-stone').progress;
  assert.ok(GEAR_BY_ID['dice-stone'], '表から引けない');
  assert.ok(owns(p, 'dice-stone'));
});
