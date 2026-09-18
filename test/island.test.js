// 島の時刻(daynight.js)と、島の見取り図(island-guide.js)。
//
// どちらも店の品(夜釣りのランタン・島の見取り図・島の砂時計)が乗っている
// 土台なので、ここが狂うと「空は夜なのに夜の魚が来ない」「地図の方角が逆」
// という、遊んでいて気づきにくい壊れかたをする。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NIGHT_KEYS, NIGHT_MIN, SKY_CYCLE_SEC, SKY_TIMES,
  isNight, isNightAt, nightAt, skyPhase, skyTimeOf,
} from '../src/minigame/daynight.js';
import { DIRS, dirIndex, islandGuide, walkSeconds } from '../src/minigame/island-guide.js';
import { createGame, MODE_IDS } from '../src/state.js';
import {
  POST_CLEAR, SHOP_CLEAR, SHOP_REACH, SPAWN_RING, TABLE_CLEAR,
  fishingSpots, makeGround, nestPoint, shopPoint, spawnPoint, watchPost,
} from '../src/minigame/ground.js';

// ---- 時刻 ----

test('時刻: 5分で1周して、折り返さない', () => {
  assert.equal(SKY_CYCLE_SEC, 300);
  assert.equal(skyPhase(0), 0);
  assert.ok(Math.abs(skyPhase(150_000) - 0.5) < 1e-9, '半周で 0.5 にならない');
  assert.ok(Math.abs(skyPhase(300_000) - 0) < 1e-9, '1周で 0 に戻らない');
  for (const t of [-1000, 1, 123_456, 7_777_777]) {
    const p = skyPhase(t);
    assert.ok(p >= 0 && p < 1, `${t} で ${p}`);
  }
});

test('時刻: 夜の濃さは折れ線どおり。真夜中だけが「夜」', () => {
  for (const k of NIGHT_KEYS) {
    assert.ok(Math.abs(nightAt(k.t) - k.night) < 1e-9, `t=${k.t} で ${nightAt(k.t)}`);
  }
  assert.equal(isNight(nightAt(0.5)), true, '真夜中が夜でない');
  assert.equal(isNight(nightAt(0)), false, '真昼が夜になっている');
  assert.equal(isNight(nightAt(0.35)), false, '夕暮れが夜になっている');
  assert.equal(isNight(nightAt(0.7)), false, '朝が夜になっている');
  // しきい値のところで切れている
  assert.equal(isNight(NIGHT_MIN), true);
  assert.equal(isNight(NIGHT_MIN - 1e-9), false);
  // 壊れた値でも落ちない
  for (const bad of [null, undefined, NaN, 'あ', {}]) {
    assert.doesNotThrow(() => nightAt(bad));
    assert.equal(isNight(bad), false, `${String(bad)} が夜になっている`);
  }
});

test('時刻: 夜は1周のうち1/4ほど(待てば必ず来る)', () => {
  let n = 0;
  const step = 1 / 1000;
  for (let p = 0; p < 1; p += step) if (isNight(nightAt(p))) n += 1;
  const ratio = n / 1000;
  assert.ok(ratio > 0.1 && ratio < 0.4, `夜の割合が ${ratio}`);
  // 実時刻からも同じ判定が出る
  assert.equal(isNightAt(150_000), true, '真夜中の時刻で夜にならない');
  assert.equal(isNightAt(0), false);
});

test('砂時計: 選べる時刻がそろっていて、知らない id は島の時に倒れる', () => {
  assert.equal(SKY_TIMES[0].id, 'live');
  assert.equal(SKY_TIMES[0].phase, null, '「島の時」が時刻を止めている');
  for (const s of SKY_TIMES.slice(1)) {
    assert.ok(typeof s.phase === 'number' && s.phase >= 0 && s.phase < 1, `${s.id}: ${s.phase}`);
    assert.ok(s.label && s.icon, `${s.id}: 名前かアイコンが無い`);
  }
  // 「夜」を選んだら夜になること(ランタンを買った人がここを頼りにする)
  assert.equal(isNight(nightAt(skyTimeOf('night').phase)), true, '「夜」が夜でない');
  assert.equal(isNight(nightAt(skyTimeOf('dusk').phase)), false, '「夕暮れ」が夜になっている');
  for (const bad of ['no-such', null, undefined, 5]) {
    assert.equal(skyTimeOf(bad).id, 'live', `${String(bad)} が島の時に倒れない`);
  }
});

// ---- 見取り図 ----

const island = (mode = 'cak') => createGame({ mode, players: 2, seed: 4242 });

test('見取り図: 向いているほうが「まっすぐ前」、画面の右が「右」', () => {
  // facing は atan2(x, z)。+z を向いているとき、**画面の右は -x 側**
  // (カメラは背中から見ている。実機のカメラの右ベクトルで確かめた)
  assert.equal(DIRS[dirIndex(0, 0, 1)], 'まっすぐ前');
  assert.equal(DIRS[dirIndex(0, -1, 0)], '右');
  assert.equal(DIRS[dirIndex(0, 1, 0)], '左');
  assert.equal(DIRS[dirIndex(0, 0, -1)], '真うしろ');
  assert.equal(DIRS[dirIndex(0, -1, 1)], '右前');
  assert.equal(DIRS[dirIndex(0, 1, -1)], '左うしろ');
  // 向きを変えると、同じ場所の呼び方も回る
  assert.equal(DIRS[dirIndex(Math.PI / 2, 1, 0)], 'まっすぐ前');
  assert.equal(DIRS[dirIndex(Math.PI, 0, -1)], 'まっすぐ前');
  // 1周しても同じ(角度を畳んでいる)
  assert.equal(dirIndex(Math.PI * 2, 0, 1), dirIndex(0, 0, 1));
  for (const bad of [null, NaN, 'あ']) {
    assert.equal(DIRS[dirIndex(bad, 0, 1)], 'まっすぐ前', `${String(bad)} で崩れた`);
  }
});

test('見取り図: 歩く時間は距離に比例して、0にはならない', () => {
  assert.ok(walkSeconds(10) > walkSeconds(1));
  assert.equal(walkSeconds(0), 1, '目の前が 0 秒になっている');
  for (const bad of [null, NaN, -3, 'あ']) assert.equal(walkSeconds(bad), 1);
});

test('見取り図: 島にあるものが全部並ぶ(港・受付・櫓・巣)', () => {
  const s = island('cak');   // 蛮族を射る(櫓が建つ)島
  const rows = islandGuide(s, { x: 0, z: 0, facing: 0 });
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes('meet'), '受付が出ていない');
  assert.ok(ids.includes('post'), '櫓が出ていない');
  const ports = fishingSpots(s);
  assert.equal(ids.filter((i) => i.startsWith('port:')).length, ports.length, '桟橋の数が合わない');
  // 竜の島には巣が出て、そうでない島には出ない
  const dragon = island('dragon');
  assert.ok(nestPoint(dragon), '前提: 竜の島に巣がある');
  assert.ok(islandGuide(dragon).some((r) => r.id === 'nest'), '巣が出ていない');
  assert.equal(rows.some((r) => r.id === 'nest'), !!nestPoint(s));
});

test('見取り図: 近い順に並び、距離と方角がその場所と合っている', () => {
  const s = island('fish');
  const from = { x: 1.2, z: -0.4, facing: 0.7 };
  const rows = islandGuide(s, from);
  assert.ok(rows.length > 1);
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i].dist >= rows[i - 1].dist, `${i}番目が近い順になっていない`);
  }
  // 受付の行を、ground.js の座標から自分で出し直して突き合わせる
  const home = spawnPoint(s);
  const meet = rows.find((r) => r.id === 'meet');
  const want = Math.hypot(home.x - from.x, home.y - from.z);
  assert.ok(Math.abs(meet.dist - want) < 1e-9, `受付までの距離がずれている: ${meet.dist} / ${want}`);
  assert.equal(meet.dir, DIRS[dirIndex(from.facing, home.x - from.x, home.y - from.z)]);
  assert.equal(meet.sec, walkSeconds(want));
});

// ---- 島の店(屋台の建つ場所)----
//
// **画面のボタンではなく島の上にある**ので、建つ場所が壊れると
// 「店が無い島」「受付にめり込んだ店」「海の上の店」が黙って出来上がる。

test('店: どの島にも1軒建ち、陸の上で、毎回同じ場所', () => {
  for (const mode of MODE_IDS) {
    const s = createGame({ mode, players: 3, seed: 31 });
    const p = shopPoint(s);
    assert.ok(p, `${mode}: 店が建たない`);
    assert.equal(makeGround(s)(p.x, p.z).ok, true, `${mode}: 海の上に建っている`);
    assert.deepEqual(shopPoint(createGame({ mode, players: 3, seed: 31 })), p,
      `${mode}: 同じ島なのに場所が変わる`);
  }
});

test('店: 受付の広場とも櫓とも重ならない', () => {
  for (const mode of MODE_IDS) {
    const s = createGame({ mode, players: 4, seed: 88 });
    const p = shopPoint(s);
    const home = spawnPoint(s);
    const d = Math.hypot(p.x - home.x, p.z - home.y);
    assert.ok(d >= TABLE_CLEAR + SHOP_CLEAR, `${mode}: 受付に近すぎる(${d.toFixed(2)})`);
    // 降り立つ輪の上に建つと、島に降りた瞬間から店に入っていることになる
    assert.ok(d > SPAWN_RING + SHOP_REACH, `${mode}: 降り立つ輪と重なっている`);
    const post = watchPost(s);
    if (post) {
      const dp = Math.hypot(p.x - post.x, p.z - post.z);
      assert.ok(dp >= POST_CLEAR + SHOP_CLEAR, `${mode}: 櫓に近すぎる(${dp.toFixed(2)})`);
    }
  }
});

test('店: 竜の山には建てない(近づくと竜が起きる場所に客を呼ばない)', () => {
  const s = createGame({ mode: 'dragon', players: 3, seed: 5 });
  const nest = nestPoint(s);
  const p = shopPoint(s);
  assert.ok(nest && p);
  assert.ok(Math.hypot(p.x - nest.x, p.z - nest.y) > 0.5, '巣のヘックスに建っている');
});

test('店: 入口は広場のほうを向く(歩いてきた人の正面に店番が立つ)', () => {
  const s = createGame({ mode: 'fish', players: 2, seed: 12 });
  const p = shopPoint(s);
  const home = spawnPoint(s);
  assert.equal(p.facing, Math.atan2(home.x - p.x, home.y - p.z));
  // 盤が無ければ建てない(落ちない)
  assert.equal(shopPoint(null), null);
  assert.equal(shopPoint({}), null);
});

test('見取り図: 店も目印として並ぶ(画面にボタンが無いので、ここが道しるべ)', () => {
  const s = createGame({ mode: 'base', players: 2, seed: 3 });
  const row = islandGuide(s, { x: 0, z: 0, facing: 0 }).find((r) => r.id === 'shop');
  assert.ok(row, '見取り図に店が出ていない');
  const p = shopPoint(s);
  assert.ok(Math.abs(row.dist - Math.hypot(p.x, p.z)) < 1e-9, '店までの距離がずれている');
});

test('見取り図: 桟橋には港の種類が出る', () => {
  const s = island('base');
  const rows = islandGuide(s).filter((r) => r.id.startsWith('port:'));
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(/の港$/.test(r.sub), `港の説明が変: ${r.sub}`);
  }
});

test('見取り図: どの島でも落ちない。盤が無ければ空', () => {
  for (const mode of MODE_IDS) {
    const s = createGame({ mode, players: 3, seed: 7 });
    const rows = islandGuide(s, { x: 0, z: 0, facing: 1 });
    assert.ok(rows.length > 0, `${mode}: 何も出ない`);
    // 櫓が建たない島に櫓の行を出さない(ground.js の watchPost と揃っていること)
    const hasPost = rows.some((r) => r.id === 'post');
    assert.equal(hasPost, mode === 'cak' && !!watchPost(s), `${mode}: 櫓の有無が食い違う`);
  }
  assert.deepEqual(islandGuide(null), []);
  assert.deepEqual(islandGuide({}), []);
});
