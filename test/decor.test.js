// 島の飾り(src/minigame/decor.js)と、店・保存・通信の扱い。
//
// **飾りだけは「何個でも買える」**ので、ほかの品と同じつもりで読むと
// 間違える(「もう持っています」で断らない、置いたら手持ちが減る)。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DECOR, DECOR_BY_ID, DECOR_GAP, DECOR_IDS, DECOR_MAX, STOCK_MAX,
  cleanDecorId, decorNear, placeSpot, visibleDecor, whyCannotPlace,
} from '../src/minigame/decor.js';
import {
  DECOR_ITEMS, ITEM_BY_ID, buyItem, isDecor, isWear, owns, stockOf,
} from '../src/shop.js';
import {
  emptyProgress, parseProgress, placeDecor, placedDecor, takeDecor,
} from '../src/progress.js';
import { createGame, MODE_IDS } from '../src/state.js';
import {
  DESK_CLEAR, SPOT_RADIUS, TABLE_CLEAR, boardPoint, fishingSpots, makeGround,
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
