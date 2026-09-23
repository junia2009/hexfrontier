// 盤まわりの見本(src/render/gear-swatch.js)。
//
// 見本の仕事はひとつ ──「選ぶ前に、何になるか分かる」。
// だからここが見張るのは**差が出ていること**と、**本物と同じ色であること**。
// 絵として綺麗かは測れないが、「4つの盤の見本が同じ絵」や
// 「見本だけ古い色のまま」は測れる。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROOFS_COVERED, SWATCH_ROOFS, SWATCH_TERRAINS, gearSwatch,
} from '../src/render/gear-swatch.js';
import {
  BOARDS, DICE, GEAR, LIGHTS, PIECES, ROOF_SHAPES, SLOTS, tintHex,
} from '../src/gear.js';
import { TERRAIN_STYLE } from '../src/render/board-render.js';
import { bagHtml, gearPanelHtml, shopHtml } from '../src/render/records.js';
import { emptyProgress, useGear } from '../src/progress.js';

// 見本の中の色をぜんぶ拾う
const colorsIn = (svg) => (svg.match(/#[0-9a-fA-F]{3,6}/g) ?? []).map((c) => c.toLowerCase());

test('見本: 盤まわりの品は全部、見本が出る', () => {
  for (const item of GEAR) {
    const svg = gearSwatch(item.id);
    assert.ok(svg.startsWith('<svg'), `${item.name} に見本が無い`);
    assert.ok(colorsIn(svg).length > 0, `${item.name} の見本に色が無い`);
  }
  assert.equal(GEAR.length, DICE.length + LIGHTS.length + PIECES.length + BOARDS.length);
});

test('見本: 知らない id では空を返す(落ちない)', () => {
  // 持ち物も店も、盤まわり以外の品を同じ関数に通す
  for (const bad of [null, undefined, '', 'straw', 'islandMap', 'dice', 'board']) {
    assert.equal(gearSwatch(bad), '', `${bad} で何か返した`);
  }
});

// ---- 盤 ----

test('見本: 盤の見本は、本物と同じ変換を通っている', () => {
  // **別表に色を書き写していないことの担保。** 書き写すと、柄を足したときに
  // 見本だけ古い色で残る ── 目で見て気づけない類のずれ
  for (const b of BOARDS) {
    const got = colorsIn(gearSwatch(b.id));
    const want = SWATCH_TERRAINS.map((t) => tintHex(TERRAIN_STYLE[t].top, b.shift).toLowerCase());
    assert.deepEqual(got, want, `${b.name} の見本の色が本物とちがう`);
  }
});

test('見本: 4つの盤は、見本の色が全部ちがう', () => {
  const seen = new Map();
  for (const b of BOARDS) {
    const key = colorsIn(gearSwatch(b.id)).join(',');
    const dup = seen.get(key);
    assert.equal(dup, undefined, `${b.name} と ${dup} の見本が同じ色`);
    seen.set(key, b.name);
  }
  // 既定とくらべて、**どの地形も**同じ色のままではない柄であること
  for (const b of BOARDS.filter((x) => x.shift)) {
    const base = colorsIn(gearSwatch(BOARDS[0].id));
    const now = colorsIn(gearSwatch(b.id));
    const same = base.filter((c, i) => c === now[i]).length;
    assert.ok(same < base.length, `${b.name} の見本が既定と同じ`);
  }
});

test('見本: 盤の見本は六角形で、地形のぶんだけ並ぶ', () => {
  // 六角形にしているのは「これは盤の話だ」を名前抜きで伝えるため。
  // 四角のチップに戻すとそれが消える
  const svg = gearSwatch(BOARDS[0].id);
  const n = (svg.match(/<polygon/g) ?? []).length;
  assert.equal(n, SWATCH_TERRAINS.length);
  // 頂点は6つ(x,y の組が6組)
  const pts = svg.match(/points="([^"]+)"/)[1].trim().split(/\s+/);
  assert.equal(pts.length, 6, '六角形になっていない');
  for (const t of SWATCH_TERRAINS) assert.ok(TERRAIN_STYLE[t], `知らない地形 ${t}`);
});

// ---- サイコロ ----

test('見本: サイコロは地・ふち・目の3色が出る', () => {
  for (const d of DICE) {
    const svg = gearSwatch(d.id);
    for (const [key, hex] of [['face', d.face], ['edge', d.edge], ['pip', d.pip]]) {
      assert.ok(svg.includes(hex), `${d.name} の見本に ${key}(${hex})が無い`);
    }
    assert.ok((svg.match(/<circle/g) ?? []).length >= 5, `${d.name} の目が足りない`);
  }
});

// ---- コマ ----

test('見本: 屋根の形を全部描ける', () => {
  // gear.js が形を増やしたのに見本が知らないと、**全部三角屋根**になる。
  // 見た目だけの品なので実機で気づきにくい
  assert.ok(ROOFS_COVERED, `描けない屋根がある: ${ROOF_SHAPES.filter((r) => !SWATCH_ROOFS.includes(r))}`);
  assert.deepEqual([...SWATCH_ROOFS].sort(), [...ROOF_SHAPES].sort());
});

test('見本: コマは屋根の形かつやで見分けがつく', () => {
  const byId = Object.fromEntries(PIECES.map((p) => [p.id, gearSwatch(p.id)]));
  const shapes = new Set(PIECES.map((p) => byId[p.id].match(/<path d="([^"]+)"/)[1]));
  // 同じ屋根の形を持つ品が居てもよいが、その2つはつやで分かれること
  for (const a of PIECES) {
    for (const b of PIECES) {
      if (a.id >= b.id) continue;
      assert.notEqual(byId[a.id], byId[b.id], `${a.name} と ${b.name} の見本が同じ`);
    }
  }
  assert.ok(shapes.size >= 2, '屋根の形が1種類しか描かれていない');
});

test('見本: コマの見本に席の色を置かない', () => {
  // 席の色は柄で変わらない(gear.js の線引き2)。見本に赤や青を置くと
  // 「色が変わる品」に見える
  const SEAT = ['#d94f4f', '#4f7fd9', '#e0a83a', '#4fbf7a'];
  for (const p of PIECES) {
    for (const c of colorsIn(gearSwatch(p.id))) {
      assert.ok(!SEAT.includes(c), `${p.name} の見本に席の色 ${c} が入っている`);
    }
  }
});

// ---- 灯り ----

test('見本: 灯りは明るいものほど大きく光る', () => {
  const radius = (id) => {
    const m = gearSwatch(id).match(/r="([\d.]+)" fill="url/);
    return m ? Number(m[1]) : 0;
  };
  const sorted = [...LIGHTS].sort((a, b) => (a.glow ?? 0) - (b.glow ?? 0));
  let prev = -1;
  for (const l of sorted) {
    const r = radius(l.id);
    assert.ok(r > prev, `${l.name} の灯りが前より大きくない(${r} <= ${prev})`);
    prev = r;
  }
  // 灯りなしは光らない
  assert.equal(radius(LIGHTS[0].id), 0, '「灯りなし」が光っている');
});

// ---- 並べたときの事故 ----

// ---- 並べる側(店・持ち物・支度の画面)----

test('盤まわり: 枠ごとに仕切られ、既定もタイルに並ぶ', () => {
  // **既定が一覧に無いと戻れなかった。** 前は「使っている品をもう一度押す」
  // という、画面のどこにも書いていない戻り道しか無かった
  const p = emptyProgress();
  const html = gearPanelHtml(p);
  for (const s of SLOTS) {
    assert.ok(html.includes(`${s.icon} ${s.label}`), `枠「${s.label}」の見出しが無い`);
    const def = s.items[0];
    assert.ok(html.includes(`use-gear:${def.id}"`), `${s.label} の既定「${def.name}」が並んでいない`);
  }
  // 何も買っていない人には、買っていない品は出さない(持ち物は売り場ではない)
  for (const g of GEAR.filter((i) => i.price != null)) {
    assert.ok(!html.includes(`use-gear:${g.id}"`), `買っていない「${g.name}」が出ている`);
  }
  assert.equal((html.match(/gear-group/g) ?? []).length, SLOTS.length);
});

test('盤まわり: いま使っているものに印が付き、選ぶと移る', () => {
  const owned = { ...emptyProgress(), owned: { 'board-dusk': true } };
  const before = gearPanelHtml(owned);
  // 既定に印
  assert.match(before, /class="gear-tile sel"[^>]*data-act="use-gear:board-classic"/s);
  const after = gearPanelHtml(useGear(owned, 'board', 'board-dusk'));
  assert.match(after, /class="gear-tile sel"[^>]*data-act="use-gear:board-dusk"/s);
  // 印は1枠に1つだけ
  assert.equal((after.match(/gear-tile sel/g) ?? []).length, SLOTS.length);
  // 選んでいるものの説明が出る
  assert.ok(after.includes('夕日に焼けた色合い'), '選んだ品の説明が出ていない');
});

test('盤まわり: 「店で買えます」は、既定しか無い枠にだけ出る', () => {
  // **故障注入が抜けた場所。** `mine.length < 2` を `<= 2` にしても誰も
  // 落ちなかった ── 1つ買った枠にまで「店で買えます」が出続ける
  const p = { ...emptyProgress(), owned: { 'board-dusk': true } };
  const html = gearPanelHtml(p);
  const groups = html.split('<div class="gear-group">').slice(1);
  assert.equal(groups.length, SLOTS.length);
  for (const [i, s] of SLOTS.entries()) {
    const bought = s.items.filter((x) => x.price != null && p.owned[x.id]).length;
    const hint = groups[i].includes('gear-none');
    assert.equal(hint, bought === 0,
      `${s.label}(買った品 ${bought} 個)の「店で買えます」が ${hint}`);
  }
  // 何も買っていなければ全部の枠に出る
  const none = gearPanelHtml(emptyProgress());
  assert.equal((none.match(/gear-none/g) ?? []).length, SLOTS.length);
});

test('持ち物: 盤まわりの品は1品1行の側を通らない', () => {
  // 枠ごとのタイルに分けたので、bagItemHtml には来ない。**来ない道を
  // 残すと、故障注入がすり抜ける**(実際2件すり抜けた)
  const all = { ...emptyProgress(), owned: Object.fromEntries(GEAR.map((g) => [g.id, true])) };
  const bag = bagHtml(all, { shelf: 'gear' });
  assert.ok(bag.includes('gear-group'), '盤まわりの棚がタイルになっていない');
  assert.ok(!bag.includes('bag-item'), '盤まわりが1品1行で出ている');
  assert.ok(!bag.includes('もどす'), '隠しトグルの「もどす」が残っている');
  // ほかの棚はこれまでどおり1品1行
  const tool = bagHtml({ ...all, owned: { ...all.owned, islandMap: true } }, { shelf: 'tool' });
  assert.ok(tool.includes('bag-item'), '道具の棚まで変わってしまった');
});

test('盤まわり: 見本つきで並ぶ(絵文字だけにならない)', () => {
  // ここが抜けると「分かりにくすぎる」に逆戻りする ── 🌇 と ❄️ と 📜 が
  // 並んでいても、どんな盤になるかは分からない
  const all = { ...emptyProgress(), owned: Object.fromEntries(GEAR.map((g) => [g.id, true])) };
  const html = gearPanelHtml(all);
  assert.equal((html.match(/<svg class="gsw"/g) ?? []).length, GEAR.length,
    '見本の数が品の数と合わない');
});

test('店と持ち物: 盤まわりの品は見本の顔で出る。ほかの品は絵文字のまま', () => {
  const rich = { ...emptyProgress(), coins: 9999 };
  const shop = shopHtml(rich, { shelf: 'gear' });
  assert.ok(shop.includes('shop-icon has-sw'), '店の棚に見本が出ていない');
  assert.ok(shop.includes('<svg class="gsw"'), '店の見本が SVG になっていない');
  // かぶりものの棚は絵文字のまま(見本を持たない品に空の顔を出さない)
  const wear = shopHtml(rich, { shelf: 'wear' });
  assert.ok(!wear.includes('has-sw'), 'かぶりものに見本が出ている');
  assert.ok(wear.includes('class="shop-icon">'), 'かぶりものの絵文字が消えた');
});

test('見本: グラデの id が品ごとにちがう', () => {
  // **同じページに並ぶ。** id が重なると、後ろの定義が先のものを塗り替えて、
  // 「石のサイコロが木の色で出る」が起きる(SVG の参照は文書ぜんぶで1つ)
  const ids = [];
  for (const item of GEAR) {
    for (const m of gearSwatch(item.id).matchAll(/id="([^"]+)"/g)) ids.push(m[1]);
  }
  assert.equal(new Set(ids).size, ids.length, `id が重なっている: ${ids}`);
  assert.ok(ids.length > 0, 'id を1つも拾えていない(測り方が壊れている)');
});
