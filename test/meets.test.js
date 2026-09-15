// 島ごとの集まり(src/minigame/meets.js)。
//
// **この表がサーバーとクライアントの唯一の根拠**なので、
// 「受付が立たない島で大会が始められる」食い違いをここで潰す。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEETS, meetFor, hasMeet } from '../src/minigame/meets.js';
import { MODES } from '../src/progress.js';

// 島と遊びは1対1。片方の島の受付でもう片方が始まると、看板と中身が食い違う。
test('集まり: 島ごとに開かれるものが決まっている', () => {
  const expected = { base: 'daifugo', fish: 'fishing', dragon: 'dragonhunt', cak: 'raid', sea: 'logroll' };
  for (const mode of MODES) {
    const want = expected[mode] ?? null;
    if (want) {
      assert.ok(hasMeet(mode), `${mode} の島に受付が無い`);
      assert.equal(meetFor(mode).id, want, `${mode} の中身が違う`);
    } else {
      assert.equal(hasMeet(mode), false, `${mode} にも受付が立っている`);
      assert.equal(meetFor(mode), null);
    }
  }
});

// 表の id と、サーバーの進行(server/*.js)が食い違うと、受付は立つのに
// 何も始まらない島ができる。
test('集まり: 表の id にサーバーの進行がある', async () => {
  const { FishingContest } = await import('../src/minigame/meet/fishing-contest.js');
  const { DragonHunt } = await import('../src/minigame/meet/dragon-hunt.js');
  const { RaidContest } = await import('../src/minigame/meet/raid-contest.js');
  const { DaifugoTable } = await import('../src/minigame/meet/daifugo-table.js');
  const { LogRollContest } = await import('../src/minigame/meet/logroll-contest.js');
  const engines = {
    fishing: FishingContest, dragonhunt: DragonHunt, raid: RaidContest, daifugo: DaifugoTable,
    logroll: LogRollContest,
  };
  for (const m of Object.values(MEETS)) {
    assert.ok(engines[m.id], `${m.id}: 進行が無い`);
    assert.equal(new engines[m.id]().kind, m.id, `${m.id}: kind が表と違う`);
  }
});

// 種の配線は3つの集まりで同じ形をしている ── setSeed で受け取った種を base に入れ、
// toJSON / fromJSON で持ち回る(部屋は保存して読み直される)。
// どこか1本でも切れると**毎回まったく同じ回**になるが、見た目は正常に動く。
// 「種が 0 でない」「同じ種なら再現する」を確かめても気づけない ──
// 種を捨てて定数で回していても、その2つは成り立つからだ。
// **2つの異なる種を突き合わせる**のがここの肝。
test('集まり: 種が setSeed から届き、保存して読み直しても残る', async () => {
  const engines = {
    raid: (await import('../src/minigame/meet/raid-contest.js')).RaidContest,
    logroll: (await import('../src/minigame/meet/logroll-contest.js')).LogRollContest,
    daifugo: (await import('../src/minigame/meet/daifugo-table.js')).DaifugoTable,
  };
  const save = (c) => JSON.parse(JSON.stringify(c.toJSON()));
  for (const [id, Engine] of Object.entries(engines)) {
    const seeded = (seed) => { const c = new Engine(); c.setSeed(seed); return c; };

    assert.notEqual(
      seeded(11).base, seeded(22).base,
      `${id}: setSeed の種が base に届いていない(種を捨てて定数で回している)`,
    );

    const c = seeded(31337);
    assert.equal(
      Engine.fromJSON(save(c)).base, c.base,
      `${id}: 保存して読み直すと種が変わる`,
    );
    assert.notEqual(
      Engine.fromJSON(save(seeded(999))).base, Engine.fromJSON(save(c)).base,
      `${id}: 読み直すとどの種でも同じ種になる`,
    );
  }
});

test('集まり: 知らない島や壊れた値でも落ちない', () => {
  for (const bad of [null, undefined, '', 'mystery', 0, {}]) {
    assert.equal(hasMeet(bad), false, `${JSON.stringify(bad)} で受付が立った`);
    assert.equal(meetFor(bad), null);
  }
});

test('集まり: 定義がそろっている(島の種類・看板・文言)', () => {
  for (const [mode, m] of Object.entries(MEETS)) {
    assert.ok(MODES.includes(mode), `${mode}: 島の種類として知らないもの`);
    assert.ok(m.id && m.name && m.title && m.hint, `${mode}: 名前や文言が足りない`);
    // 看板は2行。desk.js が [大きい行, 小さい行] で焼き込む
    assert.equal(m.sign.length, 2, `${mode}: 看板が2行でない`);
    for (const line of m.sign) assert.equal(typeof line, 'string');
  }
});
