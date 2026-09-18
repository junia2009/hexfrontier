// 島の時刻(daynight.js)と、島の地図(island-map.js / render/minimap.js)。
//
// どちらも店の品(夜釣りのランタン・島の見取り図・島の砂時計)が乗っている
// 土台なので、ここが狂うと「空は夜なのに夜の魚が来ない」「地図の印が
// 島からはみ出す」という、遊んでいて気づきにくい壊れかたをする。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NIGHT_KEYS, NIGHT_MIN, SKY_CYCLE_SEC, SKY_TIMES,
  isNight, isNightAt, nightAt, skyPhase, skyTimeOf,
} from '../src/minigame/daynight.js';
import {
  islandBounds, islandHexes, islandMapData, islandMarks, mapTransform, toMap,
} from '../src/minigame/island-map.js';
import { drawMinimap } from '../src/render/minimap.js';
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


// ---- 島の地図 ----
//
// 文字で「右前・歩いて約5秒」と並べていたころは、読んでも頭の中で方角に
// 直す必要があり、パネルを開くと時間が止まっていた ── 使い道がないと
// 言われて、**歩きながら見える絵**に作り直した。
// ここで押さえるのは「島の形に収まっているか」と「目印が実物と同じ場所か」。

const island = (mode = 'cak', seed = 4242) => createGame({ mode, players: 2, seed });

test('地図: 島の形は陸のヘックスだけ。海の上に地面を描かない', () => {
  for (const mode of MODE_IDS) {
    const s = island(mode, 9);
    const hexes = islandHexes(s);
    assert.ok(hexes.length > 0, `${mode}: 島が空`);
    for (const poly of hexes) assert.equal(poly.length, 6, `${mode}: 六角形でない`);
    if (mode === 'sea') {
      // 航海者たちは主島+小島だけ。盤のヘックス全部を描くと海まで陸になる
      assert.ok(hexes.length < s.board.hexIds.length, '海のヘックスまで陸にしている');
    }
  }
});

test('地図: 島も目印も丸い窓の内側に収まり、形は歪まない', () => {
  const size = 92;
  const pad = 8;
  const R = size / 2 - pad;
  for (const mode of MODE_IDS) {
    const s = island(mode, 3);
    const d = islandMapData(s, size, pad);
    // **丸く切り抜いてある**ので、四角ではなく円の内側で見る
    // (四角に合わせていたころ、角の桟橋が切れていた)
    const inside = (p, why) => {
      const r = Math.hypot(p.x - size / 2, p.y - size / 2);
      assert.ok(r <= R + 1e-6, `${mode}: ${why} が丸窓からはみ出す(r=${r.toFixed(1)} > ${R})`);
    };
    for (const poly of d.hexes) for (const p of poly) inside(p, '陸');
    for (const m of d.marks) inside(m, `目印 ${m.id}`);
  }
  // 縦横に同じ率が掛かっている(掛け分けると島が楕円に潰れる)
  const s = island('base');
  const b = islandBounds(s);
  const t = islandMapData(s, size, pad).t;
  const a = toMap(t, b.minX, b.minY);
  const c = toMap(t, b.maxX, b.maxY);
  const kx = (c.x - a.x) / (b.maxX - b.minX);
  const ky = (c.y - a.y) / (b.maxY - b.minY);
  assert.ok(Math.abs(kx - ky) < 1e-9, `縦横で率が違う: ${kx} / ${ky}`);
  // 島の中心が枠の中心
  assert.ok(Math.abs((a.x + c.x) / 2 - size / 2) < 1e-6, '横に寄っている');
  assert.ok(Math.abs((a.y + c.y) / 2 - size / 2) < 1e-6, '縦に寄っている');
  // 点を渡さない呼び方でも落ちない(四角の角までを半径にする)
  assert.ok(mapTransform(b, size, pad).scale > 0);
  assert.ok(mapTransform(null, size, pad).scale === 1);
});

test('地図: 目印は ground.js の実物と同じ場所(地図のために座標を建て直さない)', () => {
  const s = island('cak');
  const marks = islandMarks(s);
  const at = (id) => marks.find((m) => m.id === id);
  const home = spawnPoint(s);
  assert.deepEqual([at('meet').x, at('meet').z], [home.x, home.y], '受付がずれている');
  const shop = shopPoint(s);
  assert.deepEqual([at('shop').x, at('shop').z], [shop.x, shop.z], '店がずれている');
  const post = watchPost(s);
  assert.deepEqual([at('post').x, at('post').z], [post.x, post.z], '櫓がずれている');
  const ports = fishingSpots(s);
  assert.equal(marks.filter((m) => m.id.startsWith('port:')).length, ports.length, '桟橋の数が違う');
  for (const p of ports) {
    const m = at(`port:${p.edgeId}`);
    assert.deepEqual([m.x, m.z], [p.x, p.z], `${p.edgeId}: 桟橋がずれている`);
  }
  // **動くものは出さない。** 竜そのものや他の人を出すと、大会で有利になる
  assert.equal(marks.some((m) => m.id === 'dragon' || m.id.startsWith('player')), false,
    '動くものが地図に出ている');
});

test('地図: 竜の島には巣、そうでない島には出ない。盤が無ければ空', () => {
  const dragon = island('dragon');
  assert.ok(nestPoint(dragon), '前提: 竜の島に巣がある');
  assert.ok(islandMarks(dragon).some((m) => m.id === 'nest'), '巣が出ていない');
  assert.equal(islandMarks(island('fish')).some((m) => m.id === 'nest'), false,
    '巣の無い島に巣が出ている');
  assert.deepEqual(islandMarks(null), []);
  assert.deepEqual(islandHexes({}), []);
  assert.equal(islandBounds({}), null);
});

// 記録用の偽 ctx。描いたものを全部ためる(THREE も canvas も要らない)
function fakeCtx() {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    canvas: { width: 0, height: 0 },
    save: rec('save'), restore: rec('restore'), scale: rec('scale'),
    clearRect: rec('clearRect'), beginPath: rec('beginPath'), closePath: rec('closePath'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), arc: rec('arc'), clip: rec('clip'),
    fill: rec('fill'), stroke: rec('stroke'), fillText: rec('fillText'),
    set fillStyle(v) { calls.push(['fillStyle', v]); },
    set strokeStyle(v) { calls.push(['strokeStyle', v]); },
    set lineWidth(v) { calls.push(['lineWidth', v]); },
    set font(v) { calls.push(['font', v]); },
    set textAlign(v) { calls.push(['textAlign', v]); },
    set textBaseline(v) { calls.push(['textBaseline', v]); },
  };
}

test('地図を描く: 島と目印と自分が、この順で出る', () => {
  const s = island('cak');
  const ctx = fakeCtx();
  const size = 92;
  const ok = drawMinimap(ctx, s, { size, at: { x: 0, z: 0, facing: 0 } });
  assert.equal(ok, true);
  // 陸のヘックスぶんの塗り(海の丸と自分の三角のぶんを除く)
  const fills = ctx.calls.filter((c) => c[0] === 'fill').length;
  assert.ok(fills >= islandHexes(s).length, `陸が描かれていない(${fills})`);
  // 目印は絵文字で出す
  const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.deepEqual([...new Set(texts)].sort(), ['⚓', '📋', '🏪', '🏹'].sort(),
    `目印が足りない/多い: ${texts.join('')}`);
  // 自分は目印より**あと**に描く(重なったとき下に隠れない)
  const lastText = ctx.calls.map((c) => c[0]).lastIndexOf('fillText');
  const lastTri = ctx.calls.map((c) => c[0]).lastIndexOf('lineTo');
  assert.ok(lastTri > lastText, '自分の印が目印の下に隠れている');
});

test('地図を描く: 自分の印は向いているほうへ尖る', () => {
  const s = island('base');
  const tip = (facing) => {
    const ctx = fakeCtx();
    drawMinimap(ctx, s, { size: 92, at: { x: 0, z: 0, facing } });
    // 三角は moveTo(先端) → lineTo → lineTo。最後の moveTo が先端
    const i = ctx.calls.map((c) => c[0]).lastIndexOf('moveTo');
    return { x: ctx.calls[i][1], y: ctx.calls[i][2] };
  };
  const c = tip(0);         // +z(地図では下)を向いている
  const back = tip(Math.PI);
  const right = tip(Math.PI / 2);   // +x(地図では右)
  assert.ok(c.y > back.y, '前を向いても先端が下へ出ない');
  assert.ok(right.x > c.x, '右を向いても先端が右へ出ない');
  // 向きが分からなくても落ちない
  assert.doesNotThrow(() => drawMinimap(fakeCtx(), s, { at: { x: 0, z: 0 } }));
  assert.equal(drawMinimap(null, s, {}), false);
  assert.equal(drawMinimap(fakeCtx(), null, {}), false);
});
