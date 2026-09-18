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
import {
  FISH, FISH_BY_ID, PORT_TYPES, contestCm, fishGates, isGated, pickFish, tableFor,
} from '../src/minigame/fish.js';
import {
  bagHtml, fishbookHtml, islandMapHtml, shopHtml, shopPanelHtml, skyTimesHtml,
} from '../src/render/records.js';
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

// ---- 店の品が開く釣り場と時刻 ----

const DAY_PORT = {};
const idsOf = (t) => new Set(t.map((f) => f.id));

test('昼の港: 店の品で開く魚は1匹も出ない(買っても既存の釣りは変わらない)', () => {
  for (const type of PORT_TYPES) {
    const at = tableFor(type);
    assert.equal(at.some((f) => isGated(f)), false, `${type}: 沖か夜の魚が昼の港に漏れている`);
    DAY_PORT[type] = idsOf(at);
  }
});

test('沖: 港の魚は出ない(ガラクタだけ共通)', () => {
  const deep = tableFor('3:1', { deep: true });
  assert.ok(deep.length > 0, '沖で何も釣れない');
  for (const f of deep) {
    assert.ok(f.deep || f.tier === 'junk', `${f.id}: 沖に港の魚が混ざっている`);
  }
  assert.ok(deep.some((f) => f.deep), '沖なのに深場の魚がいない');
});

test('沖: 港と沖で、実際に引ける魚が入れ替わる', () => {
  const draw = (gates) => {
    const got = new Set();
    let rng = 12345;
    for (let i = 0; i < 400; i += 1) {
      let f;
      [rng, f] = pickFish(rng, '3:1', gates);
      got.add(f.id);
    }
    return got;
  };
  const shore = draw({});
  const off = draw({ deep: true });
  assert.equal([...shore].some((id) => off.has(id) && FISH_BY_ID[id].tier !== 'junk'),
    false, 'ガラクタ以外が港と沖の両方で釣れている');
  assert.ok([...off].some((id) => !shore.has(id)), '沖でしか釣れないものが引けていない');
});

test('沖: 港のぬしは沖に出ない(港をめぐる動機を壊さない)', () => {
  const deep = tableFor('3:1', { deep: true });
  for (const f of FISH.filter((x) => x.at)) {
    assert.equal(deep.some((d) => d.id === f.id), false, `${f.id}: ぬしが沖に出ている`);
  }
});

// **夜はいちばん壊しやすいところ。** 昼の表に足してしまうと、ランタンを
// 買った人の昼の釣りが変わる(= 既存の遊びを触る)。
test('夜: 夜の港は「昼の表 + 夜の魚」。昼の魚が消えない', () => {
  for (const type of PORT_TYPES) {
    const night = idsOf(tableFor(type, { night: true }));
    for (const id of tableFor(type).map((f) => f.id)) {
      assert.ok(night.has(id), `${type}: 夜になったら ${id} が釣れなくなった`);
    }
    const added = [...night].filter((id) => !DAY_PORT[type].has(id));
    assert.ok(added.length > 0, `${type}: 夜なのに増えていない`);
    for (const id of added) assert.ok(FISH_BY_ID[id].night, `${id}: 夜の魚ではない`);
  }
});

test('夜: 夜の魚は昼に出ない', () => {
  for (const type of PORT_TYPES) {
    const day = idsOf(tableFor(type));
    for (const f of FISH.filter((x) => x.night)) {
      assert.equal(day.has(f.id), false, `${type}: ${f.id} が昼に出ている`);
    }
  }
});

test('夜の沖: 竿とランタンの両方がそろって初めて出る', () => {
  const both = FISH.filter((f) => f.deep && f.night);
  assert.ok(both.length > 0, '前提: 夜の沖の魚がある');
  for (const f of both) {
    for (const [gates, why] of [
      [{}, '昼の港'], [{ deep: true }, '昼の沖'], [{ night: true }, '夜の港'],
    ]) {
      assert.equal(tableFor('3:1', gates).some((x) => x.id === f.id), false,
        `${f.id}: ${why} で出ている`);
    }
    assert.ok(tableFor('3:1', { deep: true, night: true }).some((x) => x.id === f.id),
      `${f.id}: 夜の沖でも出ない`);
  }
});

test('店の品で開く魚にも値が付いている', () => {
  for (const f of FISH.filter((x) => isGated(x))) {
    assert.ok(coinsForCatch(f.id, f.cm[0]) > 0, `${f.id}: 売れない`);
  }
});

// ---- 何が開いているかの判定(fishGates)----

test('gates: 持っていなければ開かない。持っていても選ばなければ開かない', () => {
  assert.deepEqual(fishGates(), { deep: false, night: false });
  assert.deepEqual(fishGates({ castDeep: true, night: true }), { deep: false, night: false },
    '買っていないのに開いた');
  assert.deepEqual(fishGates({ deepRod: true }), { deep: false, night: false },
    '竿を持っているだけで沖になった(港を選べない)');
  assert.deepEqual(fishGates({ deepRod: true, castDeep: true }), { deep: true, night: false });
  assert.deepEqual(fishGates({ lantern: true, night: true }), { deep: false, night: true });
  assert.deepEqual(fishGates({ lantern: true }), { deep: false, night: false }, '昼なのに夜になった');
});

test('gates: 大会のあいだは、持っていても全部閉じる', () => {
  const all = { deepRod: true, lantern: true, castDeep: true, night: true };
  assert.deepEqual(fishGates({ ...all, contest: true }), { deep: false, night: false });
  assert.deepEqual(fishGates(all), { deep: true, night: true }, '前提: 大会でなければ開く');
});

test('大会への申告: ガラクタと店の品の魚は 0cm', () => {
  assert.equal(contestCm(FISH_BY_ID.aji, 30.4), 30);
  assert.equal(contestCm(FISH_BY_ID.manbou, 280), 280);
  assert.equal(contestCm(FISH_BY_ID.boot, 28), 0, 'ガラクタが得点になっている');
  for (const f of FISH.filter((x) => isGated(x))) {
    assert.equal(contestCm(f, f.cm[1]), 0, `${f.id}: 大会で得点になっている`);
  }
  for (const bad of [null, undefined, NaN, -5, 'あ']) {
    assert.equal(contestCm(FISH_BY_ID.aji, bad), 0, `${String(bad)} で数が出た`);
  }
  assert.equal(contestCm(null, 100), 0);
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

// ---- 売り物を足しても、買わない人の道をふさがない ----
//
// ここが毎回いちばん危ないところ。深場の魚を FISH に足しただけで、
// 実績3つが壊れていた(テストが捕まえた):
//   - 「港でぬしを釣る」が、港に行かず深場で取れてしまう
//   - 「ダイオウイカを釣り上げる」が、シーラカンスで解除される
//   - 「図鑑を全種類うめる」が、竿を買わないと達成不能になる
// 買わないと進めない形にはしない、というのが店の決めごと。夜の魚も同じ扱い。

test('買わない人: 港の魚を全部釣れば、何も買わなくても図鑑は埋まる', () => {
  const shore = FISH.filter((f) => !isGated(f));
  const book = Object.fromEntries(shore.map((f) => [f.id, { n: 1, best: f.cm[1] }]));
  const c = fishCounts(book);
  assert.equal(c.species, c.total, `図鑑が埋まらない(${c.species}/${c.total})`);
  assert.ok(c.total > 0);
});

test('買わない人: 店の品で開く魚では、港の実績を横取りできない', () => {
  const gated = FISH.filter((f) => isGated(f));
  assert.ok(gated.length > 0, '前提: 店の品で開く魚がある');
  const book = Object.fromEntries(gated.map((f) => [f.id, { n: 1, best: f.cm[1] }]));
  const c = fishCounts(book);
  assert.equal(c.lords, 0, '港に行かず「ぬし」の実績が取れる');
  assert.equal(c.myth, false, 'シーラカンス/ホウズキイカで「ダイオウイカ」の実績が取れる');
  assert.equal(c.species, 0, '沖や夜の魚が図鑑の進捗に数えられている');
});

test('図鑑: 持っていない人に、埋められない欄を見せない', () => {
  const base = emptyProgress();
  const count = (h) => (h.match(/fbook-a/g) ?? []).length;
  const shoreN = FISH.filter((f) => !isGated(f)).length;
  const deepN = FISH.filter((f) => f.deep && !f.night).length;
  const nightN = FISH.filter((f) => f.night && !f.deep).length;
  assert.equal(count(fishbookHtml(base)), shoreN, '何も買っていないのに沖や夜の欄が見えている');
  assert.equal(count(fishbookHtml({ ...base, owned: { deepRod: true } })), shoreN + deepN,
    '竿を買っても沖の欄が出ない(あるいは夜の欄まで出ている)');
  assert.equal(count(fishbookHtml({ ...base, owned: { lantern: true } })), shoreN + nightN,
    'ランタンを買っても夜の欄が出ない(あるいは沖の欄まで出ている)');
  assert.equal(count(fishbookHtml({ ...base, owned: { deepRod: true, lantern: true } })),
    FISH.length, '両方買っても夜の沖の欄が出ない');
  // 品を手放しても(別端末など)、釣った実績は残して見せる
  assert.equal(
    count(fishbookHtml({ ...base, fish: { ryuuguu: { n: 1, best: 400 } } })), shoreN + 1,
    '釣った沖の魚が図鑑から消えている',
  );
});

// ---- 漁師の手帳 ----

test('手帳: 持っていなければ目安は出ない。持っていれば出る', () => {
  const base = emptyProgress();
  const plain = fishbookHtml(base);
  assert.doesNotMatch(plain, /〜/, '手帳なしで大きさの目安が出ている');
  const noted = fishbookHtml({ ...base, owned: { fishNote: true } });
  // マンボウは 3:1 の港のぬし。港の名前と大きさの範囲が出る
  assert.match(noted, /3:1の港/, 'ぬしの港が出ていない');
  assert.match(noted, /120〜280cm/, '大きさの目安が出ていない');
  // 釣った欄は「自己最高と匹数」のまま(手帳で上書きしない)
  const got = fishbookHtml({ ...base, owned: { fishNote: true }, fish: { aji: { n: 2, best: 25 } } });
  assert.match(got, /25 cm ・ 2匹/, '釣った欄が目安で潰れている');
});

test('手帳: 伏せた欄の説明が、その魚のいる場所と食い違わない', () => {
  const noted = fishbookHtml({ ...emptyProgress(), owned: { fishNote: true, deepRod: true, lantern: true } });
  assert.match(noted, /夜の沖 ・ 300〜1000cm/, '夜の沖の目安が出ていない');
  // 手帳が無いときは、等級のかわりに場所が出る(legend を「港のぬし」と出さない)
  const plain = fishbookHtml({ ...emptyProgress(), owned: { deepRod: true } });
  assert.match(plain, /沖・ぬし/, '沖のぬしが「港のぬし」と出ている');
});

// ---- 持ち物(店のパネルの中)----

test('持ち物: 何も持っていなければタブも出さない', () => {
  const html = shopPanelHtml(emptyProgress(), { tab: 'bag' });
  assert.doesNotMatch(html, /shop-tab/, '持ち物が空なのにタブが出ている');
  assert.match(html, /shop-buy/, '売り物が出ていない');
});

test('持ち物: 買った品だけが並ぶ', () => {
  const p = buyItem(rich(), 'deepRod').progress;
  const html = shopPanelHtml(p, { tab: 'bag' });
  assert.match(html, /shop-tab:bag/, 'タブが出ていない');
  assert.ok(html.includes('深場の竿'), '買った品が持ち物に無い');
  assert.equal(html.includes('夜釣りのランタン'), false, '買っていない品が持ち物にある');
  assert.equal(bagHtml(emptyProgress()).includes('まだ何も持っていません'), true);
});

test('持ち物: 見取り図を持っていれば一覧が、砂時計を持っていれば時刻が出る', () => {
  const rows = [{ id: 'meet', icon: '📋', label: '大富豪', sub: '受付', dist: 1, sec: 2, dir: '右前' }];
  const p = { ...rich(), owned: { islandMap: true, skyGlass: true } };
  const html = shopPanelHtml(p, { tab: 'bag', mapRows: rows, skyTime: 'night' });
  assert.match(html, /imap-row/, '見取り図の行が出ていない');
  assert.match(html, /右前/, '方角が出ていない');
  assert.match(html, /walk-sky-set:noon/, '時刻を選ぶ口が無い');
  // いま選んでいる時刻が光る
  assert.match(skyTimesHtml('night'), /class="sel" data-act="walk-sky-set:night"/,
    '選んでいる時刻に印が付いていない');
  assert.equal(islandMapHtml([]).includes('目印になるもの'), true, '空の島で行が出ている');
});
