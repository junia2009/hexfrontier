// 島の飾り(src/minigame/decor.js)と、店・保存・通信の扱い。
//
// **飾りだけは「何個でも買える」**ので、ほかの品と同じつもりで読むと
// 間違える(「もう持っています」で断らない、置いたら手持ちが減る)。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DECOR, DECOR_BY_ID, DECOR_GAP, DECOR_IDS, DECOR_MAX, LAMP_FULL, STOCK_MAX,
  cleanDecorId, decorNear, lampGlow, placeSpot, visibleDecor, whyCannotPlace,
} from '../src/minigame/decor.js';
import {
  DECOR_ITEMS, ITEM_BY_ID, buyItem, isDecor, isWear, owns, stockOf,
} from '../src/shop.js';
import {
  emptyProgress, parseProgress, placeDecor, placedDecor, takeDecor,
} from '../src/progress.js';
import { createGame, MODE_IDS } from '../src/state.js';
import {
  DESK_CLEAR, SPOT_RADIUS, TABLE_CLEAR, boardPoint, fishingSpots, hexCenter, makeGround,
  shopPoint, spawnPoint, watchPost,
} from '../src/minigame/ground.js';
import { RoomCore } from '../server/room-core.js';

const game = (mode = 'fish', seed = 11) => createGame({ seed, playerCount: 4, humanIndex: -1, mode });
const rich = (n = 5000) => ({ ...emptyProgress(), coins: n, coinsEarned: n });
// 島のどこか、広場から十分離れた陸の点を1つ選ぶ
function freeSpot(s) {
  const ground = makeGround(s);
  for (let r = 1.8; r < 5; r += 0.3) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const at = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      if (ground(at.x, at.z).ok && !whyCannotPlace(s, at)) return at;
    }
  }
  throw new Error('置ける場所が見つからない');
}

// **表に足して、見た目を足し忘れると「買えるのに出ない飾り」になる。**
// decor-fx.js は THREE を使うのでテストから読めない(node_modules 無しで
// 通す決まり)ので、**文字として**突き合わせる ── 絵は目で見るしかないが、
// 「作る関数がそもそも無い」はここで止まる。
test('飾り: 表の品ぜんぶに、見た目を作る関数がある', () => {
  const fx = readFileSync(new URL('../src/minigame/decor-fx.js', import.meta.url), 'utf8');
  const at = fx.indexOf('const BUILD = {');
  assert.ok(at > 0, 'decor-fx.js の BUILD が見つからない(探し方が壊れている)');
  const build = fx.slice(at, fx.indexOf('}', at) + 1);
  for (const d of DECOR) {
    assert.match(build, new RegExp(`\\b${d.id}\\b`),
      `${d.name}(${d.id})の見た目が BUILD に無い ── 買えるのに島に出ない`);
    assert.match(fx, new RegExp(`function ${d.id}\\b`),
      `${d.name}(${d.id})を作る関数が無い`);
  }
});

// **高さも役どころもばらけていること。** はじめの4つは 0.22〜1.0 の
// 「置物」ばかりで、並べても同じ景色にしかならなかった。
test('飾り: 高さがばらけていて、見上げるものも低いものもある', () => {
  const hs = DECOR.map((d) => d.h);
  assert.ok(Math.min(...hs) <= 0.2, `いちばん低い飾りが ${Math.min(...hs)}(低いものが無い)`);
  assert.ok(Math.max(...hs) >= 0.5, `いちばん高い飾りが ${Math.max(...hs)}(見上げるものが無い)`);
  // 同じ高さの品ばかりにしない(3段階は欲しい)
  const steps = new Set(hs.map((h) => Math.round(h * 8)));
  assert.ok(steps.size >= 4, `高さが ${steps.size} 種類しかない`);
});

test('飾り: 表がそろっている', () => {
  assert.ok(DECOR.length >= 3);
  const ids = new Set();
  for (const d of DECOR) {
    assert.match(d.id, /^[a-z]+$/, `${d.id}: id は英小文字だけ`);
    assert.equal(ids.has(d.id), false, `${d.id}: id が重なっている`);
    ids.add(d.id);
    assert.ok(d.name && d.icon && d.desc, `${d.id}: 名前・絵・説明のどれかが無い`);
    assert.ok(d.price >= 100 && d.price <= 400, `${d.id}: 値段が帯の外`);
    // 見た目とぶつかる大きさを合わせるのに要る
    assert.ok(d.r > 0 && d.h > 0, `${d.id}: 太さか高さが無い`);
  }
  assert.deepEqual(DECOR_IDS, DECOR.map((d) => d.id));
  assert.equal(cleanDecorId('bench'), 'bench');
  for (const bad of [null, 3, 'しらないもの', '']) assert.equal(cleanDecorId(bad), null);
});

// **ここが飾りの肝。** ほかの品は買い切りなので、同じ扱いにすると
// 2つめが買えない(置いてからでないと買えない、という妙な店になる)。
test('飾り: 何個でも買える。置くと手持ちが減り、しまうと戻る', () => {
  let p = rich();
  for (const d of DECOR) assert.equal(isDecor(d.id), true, `${d.id} が飾り扱いでない`);
  assert.equal(isWear('bench'), false);
  assert.equal(stockOf(p, 'bench'), 0);
  assert.equal(owns(p, 'bench'), false);

  p = buyItem(p, 'bench').progress;
  p = buyItem(p, 'bench').progress;
  assert.equal(stockOf(p, 'bench'), 2, '2つめが買えていない');
  assert.equal(owns(p, 'bench'), true);
  assert.equal(p.coins, 5000 - ITEM_BY_ID.bench.price * 2);

  const s = game();
  const at = freeSpot(s);
  const r = placeDecor(p, s.mode, 'bench', { ...at, facing: 0.5 });
  assert.equal(r.ok, true);
  p = r.progress;
  assert.equal(stockOf(p, 'bench'), 1, '置いたのに手持ちが減っていない');
  assert.equal(placedDecor(p, s.mode).length, 1);
  assert.deepEqual(placedDecor(p, s.mode)[0], { id: 'bench', x: at.x, z: at.z, f: 0.5 });

  // しまうと手持ちへ戻る(捨てない)。買い直しになったら置き直せない
  const t = takeDecor(p, s.mode, 0);
  assert.equal(t.ok, true);
  assert.equal(stockOf(t.progress, 'bench'), 2, 'しまったのに戻っていない');
  assert.equal(placedDecor(t.progress, s.mode).length, 0);
  // 無いものはしまえない
  assert.equal(takeDecor(t.progress, s.mode, 0).ok, false);
  // 持っていないものは置けない
  assert.equal(placeDecor(emptyProgress(), s.mode, 'bench', at).ok, false);
});

test('飾り: 持てる数には上限がある(通信に乗る値なので)', () => {
  let p = rich(99999);
  for (let i = 0; i < STOCK_MAX; i += 1) p = buyItem(p, 'flag').progress;
  assert.equal(stockOf(p, 'flag'), STOCK_MAX);
  const over = buyItem(p, 'flag');
  assert.equal(over.ok, false, '上限を超えて買えた');
  assert.match(over.reason, /個まで/);
  assert.equal(over.progress, p, '買えないのに手持ちが動いた');
});

// **遊びの邪魔になる場所は断る。** ここが緩いと、受付や釣り場をベンチで
// 塞いで、その島で何もできなくなる。
// **島を育てると夜が明ける。** 灯りを置いていくほど島ぜんぶが明るくなる
// (「石灯籠を購入して島に置いていくにつれて、少しずつ明るくなる過程を
//   ゲームとして再現したい」)。ここが崩れると、買っても夜が変わらない。
//
// **数えるのは表の `night` が立っている品**(石灯籠・たき火)。
// はじめ lampGlow は `id === 'lamp'` と名指ししていて、たき火を足したら
// 「燃えているのに島が暗いまま」になった ── このテストがそれで落ちた。
test('灯り: 置いた数だけ夜が明るくなる', () => {
  const lamps = (n) => Array.from({ length: n }, (_, i) => ({ id: 'lamp', x: i, z: 0 }));
  assert.equal(lampGlow([]), 0, 'はじめの夜が暗くない');
  assert.equal(lampGlow(lamps(LAMP_FULL)), 1, `${LAMP_FULL}個で満ちない`);
  // **1つめから目に見えて効く。** 先細りにすると最後の1つが無駄になる
  const step = lampGlow(lamps(1));
  assert.ok(step > 0, '1つめが効いていない');
  for (let n = 1; n <= LAMP_FULL; n += 1) {
    assert.ok(Math.abs(lampGlow(lamps(n)) - step * n) < 1e-9,
      `${n}個めの効きかたが揃っていない`);
  }
  // 上限を超えても 1 まで。明るさが際限なく上がると昼になる
  assert.equal(lampGlow(lamps(LAMP_FULL + 20)), 1, '上限を超えた');
  // **灯りだけ数える。** ベンチや石像をいくつ並べても夜は明るくならない
  const dark = DECOR.filter((d) => !d.night).map((d, i) => ({ id: d.id, x: i, z: 0 }));
  assert.ok(dark.length >= 3, '光らない飾りが少なすぎて、確かめになっていない');
  assert.equal(lampGlow(dark), 0, `光らない飾りが数えられている(${dark.map((o) => o.id)})`);
  assert.equal(lampGlow([...dark, ...lamps(2)]), step * 2, '混ざると数が狂う');
  // **たき火も数える。** 火のともる品は、どれでも島を明るくする
  const lit = DECOR.filter((d) => d.night);
  assert.ok(lit.length >= 2, `光る飾りが ${lit.length} 種類しかない`);
  for (const d of lit) {
    assert.equal(lampGlow([{ id: d.id, x: 0, z: 0 }]), step,
      `${d.name} は night なのに島が明るくならない`);
  }
  // 壊れた値でも落ちない
  for (const bad of [null, undefined, [null], [{}], [{ id: 3 }]]) {
    assert.equal(lampGlow(bad), 0, `${JSON.stringify(bad)} で落ちるか数えている`);
  }
});

// **掲示板は店とまったく同じ置きかた。** 広場のとなりのヘックスの中心
// (数字トークンの円盤の上)に、広場を向いて建つ。
//
// 前は広場のふち(受付から 1.70)に立てていて、「位置が好きじゃない。
// 店と同じ感じにして欲しい」と言われた。島に建つ物の置きかたが2通りあると、
// それだけで作りが雑に見える ── ここが崩れたら、また2通りに戻っている。
test('掲示板: 店と同じ「広場のとなりの数字の上」に建つ', () => {
  for (const mode of MODE_IDS) {
    for (const seed of [11, 42, 7]) {
      const s = game(mode, seed);
      const tag = `${mode}:${seed}`;
      const home = spawnPoint(s);
      const board = boardPoint(s);
      const shop = shopPoint(s);
      assert.ok(board, `${tag} 掲示板が建たない`);
      assert.ok(shop, `${tag} 前提: 店が建つ`);
      // いちばん近いヘックスの中心との差。**0 でないと円盤の上ではない**
      const near = (p) => {
        let best = null;
        for (const hid of s.board.hexIds) {
          const c = hexCenter(hid);
          const d = Math.hypot(c.x - p.x, c.y - p.z);
          if (!best || d < best.d) best = { hid, d };
        }
        return best;
      };
      const nb = near({ x: board.x, z: board.z });
      const ns = near({ x: shop.x, z: shop.z });
      assert.ok(nb.d < 1e-9, `${tag} ヘックスの中心に無い(${nb.d.toFixed(4)} ずれ)`);
      assert.ok(ns.d < 1e-9, `${tag} 店がヘックスの中心に無い(前提が崩れた)`);
      // **店と同じマスに重ねない**
      assert.notEqual(nb.hid, ns.hid, `${tag} 店と同じヘックスに建った`);
      // 広場のとなり(ヘックスの間隔は 1.73)。遠いと誰も読みに行かない
      const d = Math.hypot(board.x - home.x, board.z - home.y);
      assert.ok(d > 1.5 && d < 2.0, `${tag} 広場のとなりではない(${d.toFixed(2)})`);
      // 読む面は広場のほう
      const toHome = Math.atan2(home.x - board.x, home.y - board.z);
      assert.ok(Math.abs(board.facing - toHome) < 1e-9, `${tag} 広場を向いていない`);
    }
  }
});

test('飾り: 受付・店・掲示板・櫓・釣り場・海には置けない', () => {
  for (const mode of MODE_IDS) {
    const s = game(mode);
    const home = spawnPoint(s);
    const tag = `${mode}:`;
    assert.match(whyCannotPlace(s, { x: home.x, z: home.y }) ?? '', /広場/, `${tag} 広場に置けた`);
    // 広場のふち(卓の島は広い)
    const plaza = mode === 'base' ? TABLE_CLEAR : DESK_CLEAR;
    assert.ok(whyCannotPlace(s, { x: home.x + plaza * 0.9, z: home.y }), `${tag} 広場のふちに置けた`);
    const board = boardPoint(s);
    assert.ok(whyCannotPlace(s, { x: board.x, z: board.z }), `${tag} 掲示板に置けた`);
    const shop = shopPoint(s);
    if (shop) assert.ok(whyCannotPlace(s, { x: shop.x, z: shop.z }), `${tag} 店に置けた`);
    const post = watchPost(s);
    if (post) assert.ok(whyCannotPlace(s, { x: post.x, z: post.z }), `${tag} 櫓に置けた`);
    for (const f of fishingSpots(s)) {
      assert.ok(whyCannotPlace(s, { x: f.x, z: f.z }), `${tag} 釣り場に置けた`);
    }
    assert.match(whyCannotPlace(s, { x: 40, z: 40 }) ?? '', /海/, `${tag} 海に置けた`);
    // 何もない陸には置ける
    assert.equal(whyCannotPlace(s, freeSpot(s)), null, `${tag} 置ける場所が無い`);
  }
});

test('飾り: 飾りどうしは重ならない。1つの島の数にも上限がある', () => {
  const s = game();
  const at = freeSpot(s);
  const placed = [{ id: 'bench', x: at.x, z: at.z, f: 0 }];
  assert.match(whyCannotPlace(s, at, placed) ?? '', /そば/, '同じ場所に重ねられた');
  // 間隔ぶん離れていれば置ける
  assert.equal(whyCannotPlace(s, { x: at.x + DECOR_GAP * 1.01, z: at.z }, placed), null);
  const full = Array.from({ length: DECOR_MAX }, (_, i) => ({ id: 'flag', x: 90 + i, z: 90, f: 0 }));
  assert.match(whyCannotPlace(s, freeSpot(s), full) ?? '', /16個まで/, '上限を超えて置けた');
});

// 置き場所は**足もとではなく少し前**。足もとに置くと、自分がその中に
// 立っていることになって押し出される。
test('飾り: 置くのは足もとより前で、こちらを向く', () => {
  const at = { x: 1, z: 2, facing: 0 };            // +z を向いている
  const p = placeSpot(at);
  assert.ok(p.z > at.z, '前に出ていない');
  assert.ok(Math.abs(p.x - at.x) < 1e-9);
  assert.ok(Math.hypot(p.x - at.x, p.z - at.z) > 0.2, '近すぎる(自分と重なる)');
  // 置いたものはこちらを向く
  assert.ok(Math.abs(Math.abs(p.facing - at.facing) - Math.PI) < 1e-9);
});

// 座標は盤のもの。**島の種類が同じなら別の種の島でも同じ場所に出る**が、
// 航海者たちの島は海の位置が種で変わるので、陸でなくなったものは出さない。
test('飾り: 陸でなくなった飾りは出さない(消しはしない)', () => {
  const s = game('sea');
  const at = freeSpot(s);
  const list = [
    { id: 'bench', x: at.x, z: at.z, f: 0 },
    { id: 'flag', x: 40, z: 40, f: 0 },        // 海のはるか沖
    { id: 'しらないもの', x: at.x + 1, z: at.z, f: 0 },
  ];
  const shown = visibleDecor(s, list);
  assert.deepEqual(shown.map((d) => d.id), ['bench'], '海の上や知らない品が出ている');
  assert.deepEqual(visibleDecor(null, list), []);
});

test('飾り: 手の届く範囲のものだけ拾える', () => {
  const list = [{ id: 'bench', x: 0, z: 0, f: 0 }, { id: 'flag', x: 3, z: 0, f: 0 }];
  assert.equal(decorNear(list, { x: 0.1, z: 0 })?.id, 'bench');
  assert.equal(decorNear(list, { x: 1.5, z: 0 }), null, '遠いのに拾えた');
  // 近いほうを採る
  const two = [{ id: 'flag', x: 0.4, z: 0, f: 0 }, { id: 'bench', x: 0.05, z: 0, f: 0 }];
  assert.equal(decorNear(two, { x: 0, z: 0 }).id, 'bench');
  assert.equal(decorNear(null, { x: 0, z: 0 }), null);
});

test('飾り: 店に並んでいて、値段は decor.js と同じ', () => {
  assert.equal(DECOR_ITEMS.length, DECOR.length);
  for (const d of DECOR) {
    const item = ITEM_BY_ID[d.id];
    assert.ok(item, `${d.id}: 店に並んでいない`);
    assert.equal(item.price, d.price, `${d.id}: 値段がずれている`);
    assert.equal(item.name, d.name);
  }
});

// ---- 保存と通信 ----

test('飾り: 壊れた保存でも落ちない。知らない島・品・座標は落とす', () => {
  const round = (o) => parseProgress(JSON.stringify({ v: 2, ...o }));
  assert.deepEqual(round({}).decor, {});
  assert.deepEqual(round({ decor: 7 }).decor, {});
  assert.deepEqual(round({ decor: { しらない島: [{ id: 'bench', x: 1, z: 1 }] } }).decor, {});
  const ok = round({
    decor: {
      fish: [
        { id: 'bench', x: 1, z: 2, f: 0.5 },
        { id: 'なぞ', x: 1, z: 2 },
        { id: 'flag', x: 'x', z: 2 },
        { id: 'lamp', x: 3, z: 4 },
      ],
    },
  });
  assert.deepEqual(ok.decor.fish, [
    { id: 'bench', x: 1, z: 2, f: 0.5 },
    { id: 'lamp', x: 3, z: 4, f: 0 },
  ]);
  // 多すぎるぶんは切る
  const many = round({
    decor: { fish: Array.from({ length: 50 }, (_, i) => ({ id: 'flag', x: i, z: 0 })) },
  });
  assert.equal(many.decor.fish.length, DECOR_MAX);
  // 手持ちの数も掃除する
  assert.deepEqual(round({ stock: { bench: 3, なぞ: 2, flag: -1, lamp: 'x' } }).stock, { bench: 3 });
  assert.deepEqual(round({ stock: { flag: 999 } }).stock, { flag: STOCK_MAX });
});

test('飾り: 部屋の名簿に乗って、相手の島にも出る', () => {
  const room = new RoomCore({ code: 'TEST', seed: 1, kind: 'walk' });
  room.join({ clientId: 'a', name: 'あ', look: 2, decor: [{ id: 'bench', x: 1, z: 2, f: 0 }] });
  room.join({ clientId: 'b', name: 'い', look: 3 });
  assert.deepEqual(room.lobbyInfo().seats[0].decor, [{ id: 'bench', x: 1, z: 2, f: 0 }]);
  assert.deepEqual(room.lobbyInfo().seats[1].decor, []);
  room.setDecor('b', [{ id: 'lamp', x: 5, z: 6, f: 1 }]);
  assert.deepEqual(room.lobbyInfo().seats[1].decor, [{ id: 'lamp', x: 5, z: 6, f: 1 }]);
  // **配る前に掃除する。** ここを通さないと、1人が部屋じゅうを埋められる
  room.setDecor('a', [
    { id: 'なぞ', x: 1, z: 1 },
    { id: 'flag', x: null, z: 1 },
    ...Array.from({ length: 50 }, (_, i) => ({ id: 'flag', x: i, z: 0 })),
  ]);
  const got = room.lobbyInfo().seats[0].decor;
  assert.equal(got.length, DECOR_MAX, '上限を超えて配った');
  assert.equal(got.every((d) => DECOR_BY_ID[d.id]), true, '知らない品を配った');
  // 送らなければ空(古い版の相手)
  room.setDecor('a', 'こわれた値');
  assert.deepEqual(room.lobbyInfo().seats[0].decor, []);
});
