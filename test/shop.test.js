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
  ITEMS, ITEM_BY_ID, SHELVES, SHELF_IDS, bagShelves, buyItem, buyableCount, cleanBagShelf,
  cleanShelf, owns, priceOf, shelfItems, shelfOf, shortDesc, soldOut, whyCannotBuy,
} from '../src/shop.js';
import { emptyProgress, parseProgress } from '../src/progress.js';
import {
  FISH, FISH_BY_ID, PORT_TYPES, contestCm, fishGates, isGated, pickFish, tableFor,
} from '../src/minigame/fish.js';
import {
  bagHtml, fishbookHtml, mapSwitchHtml, shopHtml, skyTimesHtml, storeHtml,
} from '../src/render/records.js';
import { skyTimeOf } from '../src/minigame/daynight.js';
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
  const html = shopHtml(poor, { shelf: 'tool' });
  assert.match(html, /shop-buy:deepRod/, '買う口が無い');
  assert.match(html, /disabled/, '0枚なのに押せる');
  assert.match(html, /たりません/, '理由が出ていない');
});

test('店の画面: 買えるときは押せる。買ったあとは「持っています」', () => {
  const p = rich();
  const can = shopHtml(p, { shelf: 'tool' });
  assert.doesNotMatch(can.match(/data-act="shop-buy:deepRod"[^>]*/)[0], /disabled/,
    '買えるのに押せない');
  const after = shopHtml(buyItem(p, 'deepRod').progress, { shelf: 'tool' });
  assert.match(after, /持っています/, '買ったのに表示が変わらない');
  assert.doesNotMatch(after, /shop-buy:deepRod/, '買ったのにまだ買う口が出ている');
});

test('店の画面: 手持ちと、その棚の売り物が全部出る', () => {
  for (const shelf of SHELVES) {
    const html = shopHtml({ ...emptyProgress(), coins: 77 }, { shelf: shelf.id });
    assert.match(html, /手持ち[^<]*<b>77<\/b>/, `${shelf.id}: 手持ちが出ていない`);
    for (const item of shelf.items) {
      assert.ok(html.includes(item.name), `${item.id}: 並んでいない`);
      assert.ok(html.includes(String(item.price)), `${item.id}: 値段が出ていない`);
    }
  }
});

// ---- 棚(「何でも屋で見にくい」を直したときの決めごと)----
//
// 13品を1本の列に積むと、携帯(390×844)で **4.64画面ぶん**あった(実測)。
// 下まで行くと手持ちの銀貨も棚の見出しも画面の外で、道具と見た目の品が
// 同じ札で混ざっていた。ここから下は、そのときに入れた約束の番人。

test('棚: 売り物はどれか1つの棚にだけ入る', () => {
  assert.equal(SHELVES.length, 4);   // 道具・かぶりもの・島の飾り・盤まわり
  const seen = new Set();
  for (const s of SHELVES) {
    assert.ok(s.icon && s.label && s.note, `${s.id}: 見出しが足りない`);
    assert.ok(s.items.length > 0, `${s.id}: 空の棚`);
    for (const item of s.items) {
      assert.equal(seen.has(item.id), false, `${item.id}: 2つの棚に出ている`);
      seen.add(item.id);
      assert.equal(shelfOf(item.id), s.id, `${item.id}: shelfOf が違う棚を返す`);
    }
  }
  // **売り物を足して棚に入れ忘れると、店から消える。** ここで捕まえる
  assert.equal(seen.size, ITEMS.length, '棚に入っていない売り物がある');
  assert.deepEqual(SHELF_IDS, SHELVES.map((s) => s.id));
  assert.equal(shelfOf('しらないしな'), null);
});

test('棚: 知らない棚は最初の棚に倒す', () => {
  assert.equal(cleanShelf('wear'), 'wear');
  for (const bad of [null, undefined, '', 'みらいのたな', 3, {}]) {
    assert.equal(cleanShelf(bad), SHELVES[0].id, `${String(bad)} で落ちている`);
  }
});

// **見ている棚のものだけ出す。** これが崩れると 4.64 画面に戻る
test('店の画面: 選んだ棚の品だけが出る', () => {
  const p = rich(9999);
  for (const s of SHELVES) {
    const html = shopHtml(p, { shelf: s.id });
    for (const other of SHELVES) {
      if (other.id === s.id) continue;
      for (const item of other.items) {
        // **引用符まで入れて探す。** `shop-buy:lamp` だけで探すと
        // `shop-buy:lamp-candle` の頭に当たって、出ていないものを
        // 「出ている」と言う(実際に誤報した。id の頭が重なったとき)
        assert.equal(html.includes(`shop-buy:${item.id}"`), false,
          `${s.id} の棚に ${item.id}(${other.id} の棚)が出ている`);
      }
    }
    // 棚を選ぶ口は3つとも出ている(でないと別の棚へ行けない)
    for (const t of SHELVES) assert.match(html, new RegExp(`shop-shelf:${t.id}`));
  }
});

// **上から順に「いま手が届くもの」。** 買った品が真ん中に居座ると、
// まだ買えるものを探すのに毎回そこを読み飛ばすことになる
test('棚の並び: 安い順。買い切った品は下', () => {
  const p = rich(9999);
  const prices = shelfItems('tool', p).map((i) => i.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), '安い順になっていない');
  // いちばん安いものを買うと、それが最後に回る
  const cheap = shelfItems('tool', p)[0];
  const after = shelfItems('tool', buyItem(p, cheap.id).progress);
  assert.equal(after.at(-1).id, cheap.id, '買った品が下へ送られていない');
  assert.equal(soldOut(buyItem(p, cheap.id).progress, cheap.id), true);
  // **飾りは何個でも買えるので、買っても下へ送らない**(まだ買えるものだから)
  const d = shelfItems('decor', p)[0];
  const bought = buyItem(p, d.id).progress;
  assert.equal(soldOut(bought, d.id), false, '飾りが「買い切り」扱いになっている');
  assert.equal(shelfItems('decor', bought)[0].id, d.id, '飾りが下へ送られた');
});

test('棚: 買える数が出る。買えないときは出さない', () => {
  const broke = { ...emptyProgress(), coins: 0 };
  for (const s of SHELVES) assert.equal(buyableCount(broke, s.id), 0, `${s.id}: 0枚で買える`);
  assert.doesNotMatch(shopHtml(broke, { shelf: 'tool' }), /shop-cnt/, '0なのに数が出ている');
  // 道具のいちばん安いものだけ買える額
  const tools = shelfItems('tool', broke);
  const p = { ...emptyProgress(), coins: tools[0].price };
  assert.equal(buyableCount(p, 'tool'), 1);
  assert.match(shopHtml(p, { shelf: 'tool' }), /shop-cnt">1</, '買える数が出ていない');
  // 買い切ったら数から抜ける
  assert.equal(buyableCount(buyItem(p, tools[0].id).progress, 'tool'), 0,
    '買ったのにまだ「買える」と数えている');
});

// **くわしい説明は押したときだけ。** 全部の説明をいつも開いておくと、
// 棚で短くした意味が無くなる
test('店の画面: くわしい説明は開いた1つだけ', () => {
  const p = rich(9999);
  const shut = shopHtml(p, { shelf: 'tool' });
  const item = ITEM_BY_ID.deepRod;
  assert.equal(shut.includes(item.desc), false, '閉じているのに長い説明が出ている');
  assert.ok(shut.includes(shortDesc(item)), '短い説明が出ていない');
  assert.match(shut, /shop-more:deepRod/, '開く口が無い');
  const open = shopHtml(p, { shelf: 'tool', open: 'deepRod' });
  assert.ok(open.includes(item.desc), '開いても長い説明が出ない');
  assert.ok(open.includes(item.note), '開いても注意書きが出ない');
  // **開いている札はちょうど1つ。** 短い説明が desc と丸ごと同じ品もある
  // (説明が短い品)ので、文字で数えると数えそこなう ── 開いた札の数で見る
  assert.equal((shut.match(/shop-detail/g) ?? []).length, 0, '何も押していないのに開いている');
  assert.equal((open.match(/shop-detail/g) ?? []).length, 1, '開いている札が1つではない');
  assert.equal((open.match(/aria-expanded="true"/g) ?? []).length, 1);
});

// **短い説明は desc をそのまま切って使う。** 短い版を別に書くと、
// 必ず片方だけ直されてずれる(値段を hats.js と shop.js に別々に書かないのと同じ)。
//
// 30字は**実測の上限**。札の説明の欄は幅 177px・2行までで、1行におよそ
// 15字入る。超えたぶんは黙って切れる(「漁師の手帳」が33字で1行ぶん切れていた)。
test('短い説明: desc を切ったもの。札の2行に収まる長さ', () => {
  for (const item of ITEMS) {
    const s = shortDesc(item);
    assert.ok(item.desc.startsWith(s), `${item.id}: desc と食い違う`);
    assert.ok(s.length > 0, `${item.id}: 空`);
    assert.ok(s.length <= 30, `${item.id}: 札の2行に収まらない(${s.length}字)「${s}」`);
  }
  // 短ければ丸ごと。**最初の一文だけにすると、飾りが名前の繰り返しになる**
  // (「木のベンチ。」── 効きめは2文目に書いてある)
  assert.equal(shortDesc({ desc: '木のベンチ。島のすきな場所に置けます。' }),
    '木のベンチ。島のすきな場所に置けます。', '短いのに切られた');
  // 長ければ最初の一文
  const long = 'あいうえおかきくけこさしすせそ。たちつてとなにぬねの。はひふへほ。';
  assert.equal(shortDesc({ desc: long }), 'あいうえおかきくけこさしすせそ。');
  // 境目ちょうど(30字)は丸ごと。31字から切る ── 故障注入で
  // 「<= を < に」しても誰も落ちなかったので足した
  const n30 = `${'あ'.repeat(19)}。${'い'.repeat(10)}`;
  assert.equal(n30.length, 30);
  assert.equal(shortDesc({ desc: n30 }), n30, 'ちょうど30字が切られた');
  assert.equal(shortDesc({ desc: `${n30}う` }), `${'あ'.repeat(19)}。`, '31字が切られていない');
  // 「。」が無ければ、長くても丸ごと返す(切りどころが無い)
  assert.equal(shortDesc({ desc: 'あ'.repeat(50) }), 'あ'.repeat(50));
  assert.equal(shortDesc({ desc: '一文だけ' }), '一文だけ', '。が無いと空になる');
  assert.equal(shortDesc(null), '');
});

// **値段は消さない。** 足りないときに値段を「あと◯枚」に置き換えると、
// 品くらべ(どれが高いのか)ができなくなる
test('店の画面: 足りないときも値段は出る。足りない数は別に出す', () => {
  const rod = ITEM_BY_ID.deepRod;
  const html = shopHtml({ ...emptyProgress(), coins: rod.price - 100 }, { shelf: 'tool' });
  assert.ok(html.includes(String(rod.price)), '足りないと値段が消えている');
  assert.match(html, /shop-lack">あと100枚/, '足りない数が出ていない');
  // 足りていれば出さない
  assert.doesNotMatch(shopHtml(rich(9999), { shelf: 'tool' }), /shop-lack/,
    '買えるのに「あと」が出ている');
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

// ---- 店の中(屋台の前)と、持ち物(どこでも)----

test('店の中: 店主が話しかけてきて、売り物が並ぶ', () => {
  const html = storeHtml({ ...emptyProgress(), coins: 1000 });
  assert.match(html, /shop-greet/, '店主のひとことが無い');
  assert.match(html, /店主/, '誰が話しているのか分からない');
  assert.match(html, /shop-buy:deepRod/, '売り物が出ていない');
});

test('店の中: 店主のひとことは、手持ちと買ったもので変わる', () => {
  const broke = storeHtml({ ...emptyProgress(), coins: 0 });
  assert.match(broke, /たまったら/, '一枚も無い人へのひとことになっていない');
  let p = { ...emptyProgress(), coins: 99999 };
  for (const item of ITEMS) p = buyItem(p, item.id).progress;
  assert.match(storeHtml(p), /全部あんたのもん/, '全部買った人へのひとことになっていない');
  // **境目。** いちばん安い品にちょうど届いたら「たまったらまたおいで」ではない
  // ── 買えるのに追い返される(故障注入で「< を <= に」しても落ちなかった)
  const cheapest = Math.min(...ITEMS.map((i) => i.price));
  assert.match(storeHtml({ ...emptyProgress(), coins: cheapest }), /いらっしゃい/,
    'ちょうど買えるのに追い返している');
  assert.match(storeHtml({ ...emptyProgress(), coins: cheapest - 1 }), /たまったら/);
});

// **かぶる/ぬぐが逆さまになっていないか。** 逆だと、かぶっている帽子に
// 「かぶる」が出て、押しても何も起きないように見える。
// (故障注入で「worn === item.id」をひっくり返しても誰も落ちなかった)
test('持ち物: かぶっているものだけ「ぬぐ」になる', () => {
  const p = {
    ...rich(9999), owned: { straw: true, crown: true }, worn: { hat: 'straw' },
  };
  const html = bagHtml(p, { hat: 'straw', shelf: 'wear' });
  const row = (name) => html.slice(html.indexOf(name), html.indexOf(name) + 400);
  assert.match(row('麦わら帽子'), /wear-hat:none[^>]*>ぬぐ/, 'かぶっているのに「ぬぐ」が無い');
  assert.match(row('麦わら帽子'), /bag-on/, 'かぶっている印が無い');
  assert.match(row('王かんむり'), /wear-hat:crown[^>]*>かぶる/, 'かぶっていないのに「かぶる」が無い');
  assert.doesNotMatch(row('王かんむり'), /bag-on/, 'かぶっていないものに印が付いている');
  // 何もかぶっていなければ、どれも「かぶる」
  const bare = bagHtml(p, { hat: null, shelf: 'wear' });
  assert.equal((bare.match(/>ぬぐ</g) ?? []).length, 0, '素頭なのに「ぬぐ」が出ている');
});

// **買うときと使うときで並びを揃える。** 違うと、さっき買ったものが
// どこにあるか分からなくなる。故障注入で「棚の振り分けをひっくり返しても
// 誰も落ちない」と出たので足した。
test('持ち物: 棚は持っているぶんだけ。見ている棚の品だけ出る', () => {
  const p = { ...rich(9999), owned: { deepRod: true, crown: true }, stock: { bench: 1 } };
  // 棚は3つとも出る(3つとも持っている)。中身は選んだ棚のものだけ
  for (const [shelf, いる, いない] of [
    ['tool', '深場の竿', ['王かんむり', 'ベンチ']],
    ['wear', '王かんむり', ['深場の竿', 'ベンチ']],
    ['decor', 'ベンチ', ['深場の竿', '王かんむり']],
  ]) {
    const html = bagHtml(p, { shelf });
    assert.ok(html.includes(いる), `${shelf}: あるはずの品が無い`);
    for (const x of いない) {
      assert.equal(html.includes(x), false, `${shelf}: よその棚の ${x} が出ている`);
    }
    for (const t of ['tool', 'wear', 'decor']) {
      assert.match(html, new RegExp(`bag-shelf:${t}`), `${shelf}: ${t} の棚へ行けない`);
    }
    assert.match(html, new RegExp(`class="sel" data-act="bag-shelf:${shelf}"`), '選んだ棚が光らない');
  }
  // **持っていない棚は出さない。** 押して「何も無い」と分かるだけ
  const only = bagHtml({ ...rich(), owned: { deepRod: true } });
  assert.ok(only.includes('深場の竿'));
  assert.equal(only.includes('bag-shelf:wear'), false, '何も持っていない棚へ行ける');
  assert.equal(only.includes('bag-shelf:decor'), false, '何も持っていない棚へ行ける');
  // 棚が1つしか無ければ帯ごと出さない(選びようが無い)
  assert.equal(only.includes('bag-shelf:tool'), false, '選びようが無いのに帯が出ている');
  // 持っていない棚を選んでいたら、持っている棚に倒す(手放したあと)
  assert.ok(bagHtml({ ...rich(), owned: { deepRod: true } }, { shelf: 'wear' })
    .includes('深場の竿'), '空の棚を開いたまま固まった');
});

// **同じ説明を何度も出さない。** 前は飾り4品ぜんぶに「半透明の見本が…」、
// かぶりもの4品ぜんぶに「見た目だけの品です」と書いてあった(実測 2.83画面)。
test('持ち物: 棚に1回で済む説明を、品ごとにくり返さない', () => {
  const p = {
    ...rich(9999),
    owned: { straw: true, flower: true, pointy: true, crown: true },
    stock: { bench: 2, lamp: 1, flag: 1, planter: 1 },
  };
  for (const shelf of ['wear', 'decor']) {
    const html = bagHtml(p, { shelf });
    const note = SHELVES.find((s) => s.id === shelf).note;
    assert.equal((html.match(new RegExp(note, 'g')) ?? []).length, 1,
      `${shelf}: 棚の説明が1回ではない`);
    // 品ごとの注意書きは、開いた1つにだけ出る
    assert.equal((html.match(/shop-detail/g) ?? []).length, 0, '何も押していないのに開いている');
  }
  const open = bagHtml(p, { shelf: 'decor', open: 'bench' });
  assert.equal((open.match(/shop-detail/g) ?? []).length, 1, '開いている札が1つではない');
  assert.ok(open.includes(ITEM_BY_ID.bench.desc), '開いても長い説明が出ない');
});

test('持ち物: 買った品だけが並ぶ', () => {
  const p = buyItem(rich(), 'deepRod').progress;
  const html = bagHtml(p);
  assert.ok(html.includes('深場の竿'), '買った品が持ち物に無い');
  assert.equal(html.includes('夜釣りのランタン'), false, '買っていない品が持ち物にある');
  assert.equal(bagHtml(emptyProgress()).includes('まだ何も持っていません'), true);
});

test('持ち物: 見取り図は地図の入り切り、砂時計は時刻を選ぶ口が出る', () => {
  const p = { ...rich(), owned: { islandMap: true, skyGlass: true } };
  const html = bagHtml(p, { mapOn: true, skyTime: 'night' });
  // 地図は**押せばすぐ効く**(説明を開かなくてよい)
  assert.match(html, /walk-map-toggle[^>]*>しまう/, '出ているのに「しまう」にならない');
  assert.match(bagHtml(p, { mapOn: false }), /walk-map-toggle[^>]*>出す/, 'しまってあるのに「出す」にならない');
  // 砂時計は**いま選んでいる時刻**を札に出す。押すと選び直せる
  assert.match(html, /bag-more:skyGlass/, '砂時計を開く口が無い');
  assert.ok(html.includes(skyTimeOf('night').label), 'いまの時刻が札に出ていない');
  assert.equal(html.includes('walk-sky-set:noon'), false, '閉じているのに時刻の一覧が出ている');
  const open = bagHtml(p, { skyTime: 'night', open: 'skyGlass' });
  assert.match(open, /walk-sky-set:noon/, '開いても時刻を選べない');
  // いま選んでいる時刻が光る
  assert.match(skyTimesHtml('night'), /class="sel" data-act="walk-sky-set:night"/,
    '選んでいる時刻に印が付いていない');
  assert.match(mapSwitchHtml(true), /🏪/, '地図に何が出るのか書いていない');
});
