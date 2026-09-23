// かぶりもの(src/minigame/hats.js)と、店・持ち物・通信の扱い。
//
// **見た目だけの品**という約束が守られているかを見る ── ここが崩れると、
// 「払った人が強い」が静かに入り込む。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HATS, HAT_BY_ID, HAT_IDS, cleanHat } from '../src/minigame/hats.js';
import {
  HAT_ITEMS, ITEMS, ITEM_BY_ID, TOOL_IDS, buyItem, isWear, owns, priceOf,
} from '../src/shop.js';
import { emptyProgress, parseProgress, wearHat, wornHat } from '../src/progress.js';
import { RoomCore } from '../server/room-core.js';

const rich = (n = 3000) => ({ ...emptyProgress(), coins: n, coinsEarned: n });

test('かぶりもの: 表がそろっている', () => {
  assert.ok(HATS.length >= 4, '品が少なすぎる');
  const ids = new Set();
  for (const h of HATS) {
    assert.match(h.id, /^[a-z]+$/, `${h.id}: id は英小文字だけ`);
    assert.equal(ids.has(h.id), false, `${h.id}: id が重なっている`);
    ids.add(h.id);
    assert.ok(h.name && h.icon && h.desc, `${h.id}: 名前・絵・説明のどれかが無い`);
    assert.ok(h.price >= 100 && h.price <= 600, `${h.id}: 値段が帯の外(${h.price})`);
    assert.ok(['brim', 'cone', 'wreath', 'crown'].includes(h.kind), `${h.id}: 知らない形`);
  }
  assert.deepEqual(HAT_IDS, HATS.map((h) => h.id));
  assert.equal(HAT_BY_ID[HATS[0].id], HATS[0]);
});

// **これが「浮いた帽子」を二度とやらないための番人。**
//
// sit は帽子の下端が頭のどこに来るか(頭の中心 0、てっぺん 1)。
// 1 以上だと頭に載らず宙に浮く ── 耳や角のぶん(species.js の top)を
// 足して持ち上げていたころ、耳の高いきつねとドラゴンだけ 32 通り中 8 通りで
// 帽子が頭から浮いていた(実測、最大 1.3cm。「被り物が浮いてる」と報告された)。
test('かぶりもの: どれも頭に載る(宙に浮かない)', () => {
  for (const h of HATS) {
    assert.equal(typeof h.sit, 'number', `${h.id}: sit が無い`);
    assert.ok(h.sit < 1, `${h.id}: 頭のてっぺんより上に置いている(浮く) sit=${h.sit}`);
    // 低すぎると顔まで飲み込む。頭の上半分に収める
    assert.ok(h.sit >= 0.4, `${h.id}: 深くかぶりすぎ(顔が隠れる) sit=${h.sit}`);
    assert.ok(h.sit <= 0.8, `${h.id}: 浅すぎて引っかかりが無い sit=${h.sit}`);
  }
});

// **店は1か所。** 値段と説明を hats.js と shop.js に別々に書くと必ずずれる。
test('かぶりもの: 店の並びは hats.js をそのまま読む', () => {
  assert.equal(HAT_ITEMS.length, HATS.length);
  for (const h of HATS) {
    const item = ITEM_BY_ID[h.id];
    assert.ok(item, `${h.id}: 店に並んでいない`);
    assert.equal(item.price, h.price, `${h.id}: 値段がずれている`);
    assert.equal(item.name, h.name);
    assert.equal(item.icon, h.icon);
    assert.equal(priceOf(h.id), h.price);
    assert.equal(isWear(h.id), true);
  }
  // 道具はかぶりものに数えない
  for (const id of TOOL_IDS) assert.equal(isWear(id), false, `${id} がかぶりもの扱い`);
  // 道具が先、かぶりものが後
  assert.deepEqual(ITEMS.slice(0, TOOL_IDS.length).map((i) => i.id), TOOL_IDS);
});

// 買い切ったら銀貨が死ぬ、を避けるために足したもの。
// **道具だけのころ(1220枚)より明らかに広い**こと。
test('かぶりもの: 使い道が広がっている', () => {
  const tools = ITEMS.filter((i) => TOOL_IDS.includes(i.id)).reduce((s, i) => s + i.price, 0);
  const all = ITEMS.reduce((s, i) => s + i.price, 0);
  assert.equal(tools, 1220, '道具の合計が変わった(帯の見直しが要る)');
  assert.ok(all >= tools * 1.7, `使い道が広がっていない(${tools} → ${all})`);
});

test('かぶりもの: 買って、かぶって、ぬげる', () => {
  let p = rich();
  assert.equal(wornHat(p), null, '最初から何かかぶっている');
  // 買っただけでは**かぶらない**(集めるほど勝手に見た目が変わらない)
  p = buyItem(p, 'straw').progress;
  assert.equal(owns(p, 'straw'), true);
  assert.equal(wornHat(p), null, '買っただけでかぶっている');
  p = wearHat(p, 'straw');
  assert.equal(wornHat(p), 'straw');
  // 別のものをかぶると前のは外れる(2つ同時にはかぶらない)
  p = buyItem(p, 'crown').progress;
  p = wearHat(p, 'crown');
  assert.equal(wornHat(p), 'crown');
  p = wearHat(p, null);
  assert.equal(wornHat(p), null, 'ぬげない');
});

// **持っていないものは着けられない。** ここが緩いと、保存を書き換えるだけで
// 買わずにかぶれる(店の意味が消える)。
test('かぶりもの: 持っていないものはかぶれない。保存を書き換えても直る', () => {
  const p = wearHat(emptyProgress(), 'crown');
  assert.equal(wornHat(p), null, '買っていないのにかぶれた');
  // 道具はかぶりものではない
  let q = buyItem(rich(), 'lantern').progress;
  q = wearHat(q, 'lantern');
  assert.equal(wornHat(q), null, '道具をかぶった');
  // 保存を直に書き換えた場合も、読み込みで落ちる
  const forged = JSON.stringify({ ...emptyProgress(), v: 2, worn: { hat: 'crown' } });
  // worn は卓のしつらえのスロットも持つ(gear.js)ので、帽子の欄だけを見る
  // ── 丸ごと比べると、スロットを足すたびにここが落ちる
  assert.equal(parseProgress(forged).worn.hat, null);
  // 持っていれば残る
  const ok = buyItem(rich(), 'flower').progress;
  const kept = parseProgress(JSON.stringify(wearHat(ok, 'flower')));
  assert.equal(wornHat(kept), 'flower', '持っているのに外れた');
  // 壊れた値でも落ちない
  for (const bad of [null, 3, 'x', { hat: 7 }, { hat: {} }]) {
    const w = parseProgress(JSON.stringify({ v: 2, worn: bad })).worn;
    assert.equal(w.hat, null, `${JSON.stringify(bad)}`);
    // どの欄も「何も着けていない」に倒れていること(卓のしつらえも同じ)
    for (const v of Object.values(w)) assert.equal(v, null);
  }
});

// ---- 通信 ----

test('かぶりもの: 知らない id は「かぶっていない」に倒す', () => {
  assert.equal(cleanHat('straw'), 'straw');
  // 新しい版で増えた帽子。**落とさず素頭で描く** ── 弾くと、その人だけ
  // 描画ごと消える
  assert.equal(cleanHat('みらいのぼうし'), null);
  for (const bad of [null, undefined, 3, {}, [], '']) assert.equal(cleanHat(bad), null);
});

test('かぶりもの: 部屋の名簿に乗って、相手にも届く', () => {
  const room = new RoomCore({ code: 'TEST', seed: 1, kind: 'walk' });
  room.join({ clientId: 'a', name: 'あ', look: 2, hat: 'straw' });
  room.join({ clientId: 'b', name: 'い', look: 3 });
  const seats = room.lobbyInfo().seats;
  assert.equal(seats[0].hat, 'straw', '名簿に乗っていない');
  assert.equal(seats[1].hat, null, 'かぶっていない人に帽子が付いた');
  // かぶり直す
  assert.equal(room.setLook('b', 3, 'crown').hat, 'crown');
  assert.equal(room.lobbyInfo().seats[1].hat, 'crown');
  // **ぬぐ(null)と、送ってこない(undefined)は別。**
  // まとめて扱うと、脱げないか、古い版の相手の帽子が勝手に消える
  assert.equal(room.setLook('b', 3, null).hat, null, 'ぬげない');
  room.setLook('a', 2);                       // hat を送らない古い版
  assert.equal(room.lobbyInfo().seats[0].hat, 'straw', '送らないだけで脱げた');
  // 知らない帽子は素頭に倒す
  room.setLook('a', 2, 'しらないぼうし');
  assert.equal(room.lobbyInfo().seats[0].hat, null);
});

test('かぶりもの: 再接続しても、かぶったまま戻る', () => {
  const room = new RoomCore({ code: 'TEST', seed: 1, kind: 'walk' });
  room.join({ clientId: 'a', name: 'あ', look: 2, hat: 'pointy' });
  room.disconnect('a');
  room.join({ clientId: 'a', name: 'あ', look: 2, hat: 'pointy' });
  assert.equal(room.lobbyInfo().seats[0].hat, 'pointy');
});
