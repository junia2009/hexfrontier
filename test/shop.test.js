// 島の店(src/shop.js)と、深場の竿が開くもの(fish.js の表)。
//
// 通貨を使う口なので、壊れると「払ったのに手に入らない」「払わずに手に入る」
// のどちらかが起きる。どちらも黙って起きるたぐいなので、ここで押さえる。
//
// **売り物の線引きもここで見張る。** 既存の遊びを有利にする品を置かない、
// というのがこの店の設計なので、深場の魚が港へ漏れていないことを確かめる。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ITEMS, ITEM_BY_ID, buyItem, owns, priceOf, whyCannotBuy,
} from '../src/shop.js';
import { emptyProgress, parseProgress } from '../src/progress.js';
import { FISH, PORT_TYPES, pickFish, tableFor } from '../src/minigame/fish.js';
import { fishbookHtml, shopHtml } from '../src/render/records.js';
import { fishCounts } from '../src/achievements.js';
import { coinsForCatch } from '../src/rewards.js';

const rich = (n = 1000) => ({ ...emptyProgress(), coins: n, coinsEarned: n });

// ---- 買う ----

test('店: 足りなければ買えない。手持ちも持ち物も動かない', () => {
  const poor = { ...emptyProgress(), coins: priceOf('deepRod') - 1, coinsEarned: 400 };
  const why = whyCannotBuy(poor, 'deepRod');
  assert.match(why, /たりません/, `理由が違う: ${why}`);
  const r = buyItem(poor, 'deepRod');
  assert.equal(r.ok, false);
  assert.equal(r.progress.coins, poor.coins, '払えないのに減っている');
  assert.equal(owns(r.progress, 'deepRod'), false, '払えないのに手に入っている');
});

test('店: ちょうどの金額で買える', () => {
  const exact = { ...emptyProgress(), coins: priceOf('deepRod'), coinsEarned: 400 };
  assert.equal(whyCannotBuy(exact, 'deepRod'), null, 'ちょうどで買えない');
  const r = buyItem(exact, 'deepRod');
  assert.equal(r.ok, true);
  assert.equal(r.progress.coins, 0);
});

test('店: 買うと手持ちだけ減る。通算獲得は減らない', () => {
  const p = rich(500);
  const r = buyItem(p, 'deepRod');
  assert.equal(r.progress.coins, 500 - priceOf('deepRod'));
  assert.equal(r.progress.coinsEarned, 500, '通算獲得まで減っている');
  assert.equal(owns(r.progress, 'deepRod'), true);
});

test('店: 二度は買えない(二重に払わない)', () => {
  const one = buyItem(rich(), 'deepRod');
  assert.match(whyCannotBuy(one.progress, 'deepRod'), /もう持って/);
  const two = buyItem(one.progress, 'deepRod');
  assert.equal(two.ok, false);
  assert.equal(two.progress.coins, one.progress.coins, '二度目に払っている');
});

test('店: 知らない品は買えない', () => {
  const r = buyItem(rich(), 'no-such-item');
  assert.equal(r.ok, false);
  assert.equal(r.progress.coins, 1000, '知らない品に払っている');
  assert.equal(priceOf('no-such-item'), 0);
});

test('店: 壊れた progress でも落ちない', () => {
  for (const bad of [null, undefined, {}, { coins: NaN }, { owned: 'あ' }]) {
    assert.doesNotThrow(() => whyCannotBuy(bad, 'deepRod'));
    assert.equal(owns(bad, 'deepRod'), false);
  }
});

test('店: 持ち物は保存を経ても残る。壊れた値は「持っていない」に倒す', () => {
  const bought = buyItem(rich(), 'deepRod').progress;
  const back = parseProgress(JSON.stringify({ ...bought, v: 2 }));
  assert.equal(owns(back, 'deepRod'), true, '保存を経ると消える');
  const junk = parseProgress(JSON.stringify({ v: 2, owned: { deepRod: 'yes', other: 1 } }));
  assert.deepEqual(junk.owned, {}, 'true 以外を持ち物として拾っている');
});

// ---- 深場の竿が開くもの ----

test('深場: 港の表に深場の魚は出ない(買っても既存の釣りは変わらない)', () => {
  for (const type of PORT_TYPES) {
    const at = tableFor(type);
    assert.equal(at.some((f) => f.deep), false, `${type}: 深場の魚が港に漏れている`);
  }
});

test('深場: 沖の表に港の魚は出ない(ガラクタだけ共通)', () => {
  const deep = tableFor('3:1', true);
  assert.ok(deep.length > 0, '沖で何も釣れない');
  for (const f of deep) {
    assert.ok(f.deep || f.tier === 'junk', `${f.id}: 沖に港の魚が混ざっている`);
  }
  assert.ok(deep.some((f) => f.deep), '沖なのに深場の魚がいない');
});

test('深場: 港と沖で、実際に引ける魚が入れ替わる', () => {
  const draw = (deep) => {
    const got = new Set();
    let rng = 12345;
    for (let i = 0; i < 400; i += 1) {
      let f;
      [rng, f] = pickFish(rng, '3:1', deep);
      got.add(f.id);
    }
    return got;
  };
  const shore = draw(false);
  const off = draw(true);
  assert.equal([...shore].some((id) => off.has(id) && id !== 'boot' && id !== 'weed' && id !== 'bottle'),
    false, 'ガラクタ以外が港と沖の両方で釣れている');
  assert.ok([...off].some((id) => !shore.has(id)), '沖でしか釣れないものが引けていない');
});

test('深場: 港のぬしは沖に出ない(港をめぐる動機を壊さない)', () => {
  const deep = tableFor('3:1', true);
  for (const f of FISH.filter((x) => x.at)) {
    assert.equal(deep.some((d) => d.id === f.id), false, `${f.id}: ぬしが沖に出ている`);
  }
});

test('深場の魚にも値が付いている', () => {
  for (const f of FISH.filter((x) => x.deep)) {
    assert.ok(coinsForCatch(f.id, f.cm[0]) > 0, `${f.id}: 売れない`);
  }
});

// ---- 店の画面 ----

test('店の画面: 買えないときは押せず、理由が出る', () => {
  const poor = { ...emptyProgress(), coins: 0 };
  const html = shopHtml(poor);
  assert.match(html, /shop-buy:deepRod/, '買う口が無い');
  assert.match(html, /disabled/, '0枚なのに押せる');
  assert.match(html, /たりません/, '理由が出ていない');
});

test('店の画面: 買えるときは押せる。買ったあとは「持っています」', () => {
  const p = rich();
  const can = shopHtml(p);
  assert.doesNotMatch(can.match(/data-act="shop-buy:deepRod"[^>]*/)[0], /disabled/,
    '買えるのに押せない');
  const after = shopHtml(buyItem(p, 'deepRod').progress);
  assert.match(after, /持っています/, '買ったのに表示が変わらない');
  assert.doesNotMatch(after, /shop-buy:deepRod/, '買ったのにまだ買う口が出ている');
});

test('店の画面: 手持ちと、売り物が全部出る', () => {
  const html = shopHtml({ ...emptyProgress(), coins: 77 });
  assert.match(html, /77/, '手持ちが出ていない');
  for (const item of ITEMS) {
    assert.ok(html.includes(item.name), `${item.id}: 並んでいない`);
    assert.ok(html.includes(String(item.price)), `${item.id}: 値段が出ていない`);
  }
});

test('店: 売り物の定義がそろっている', () => {
  assert.ok(ITEMS.length > 0);
  for (const item of ITEMS) {
    assert.ok(item.id && item.name && item.icon && item.desc, `${item.id}: 項目が足りない`);
    assert.ok(Number.isInteger(item.price) && item.price > 0, `${item.id}: 値段が変`);
    assert.equal(ITEM_BY_ID[item.id], item);
  }
});

// ---- 深場を足しても、竿を買わない人の道をふさがない ----
//
// ここが今回いちばん危ないところだった。深場の魚を FISH に足しただけで、
// 実績3つが壊れていた(テストが捕まえた):
//   - 「港でぬしを釣る」が、港に行かず深場で取れてしまう
//   - 「ダイオウイカを釣り上げる」が、シーラカンスで解除される
//   - 「図鑑を全種類うめる」が、竿を買わないと達成不能になる
// 買わないと進めない形にはしない、というのが店の決めごと。

test('深場: 港の魚を全部釣れば、竿を買わなくても図鑑は埋まる', () => {
  const shore = FISH.filter((f) => !f.deep);
  const book = Object.fromEntries(shore.map((f) => [f.id, { n: 1, best: f.cm[1] }]));
  const c = fishCounts(book);
  assert.equal(c.species, c.total, `図鑑が埋まらない(${c.species}/${c.total})`);
  assert.ok(c.total > 0);
});

test('深場: 深場の魚では、港の実績を横取りできない', () => {
  const deep = FISH.filter((f) => f.deep);
  assert.ok(deep.length > 0, '前提: 深場の魚がある');
  const book = Object.fromEntries(deep.map((f) => [f.id, { n: 1, best: f.cm[1] }]));
  const c = fishCounts(book);
  assert.equal(c.lords, 0, '港に行かず「ぬし」の実績が取れる');
  assert.equal(c.myth, false, 'シーラカンスで「ダイオウイカ」の実績が取れる');
  assert.equal(c.species, 0, '深場の魚が図鑑の進捗に数えられている');
});

test('深場: 図鑑は、竿を持っていない人に埋められない欄を見せない', () => {
  const base = emptyProgress();
  const count = (h) => (h.match(/fbook-a/g) ?? []).length;
  const shoreN = FISH.filter((f) => !f.deep).length;
  assert.equal(count(fishbookHtml(base)), shoreN, '竿なしに深場の欄が見えている');
  assert.equal(count(fishbookHtml({ ...base, owned: { deepRod: true } })), FISH.length,
    '竿を買っても深場の欄が出ない');
  // 竿を手放しても(別端末など)、釣った実績は残して見せる
  assert.equal(
    count(fishbookHtml({ ...base, fish: { ryuuguu: { n: 1, best: 400 } } })), shoreN + 1,
    '釣った深場の魚が図鑑から消えている',
  );
});
