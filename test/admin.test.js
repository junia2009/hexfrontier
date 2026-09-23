// 管理者の隠し口(src/admin.js)。
//
// ここが見張るのは2つ:
//   - **まちがって開かない**(間を空けて触っただけでは開かない)
//   - **配るものが、線引きの内側に収まっている**(勝ち負けにも実績にも
//     効かないものだけ)。ここが崩れたら、隠し口を出荷物に入れてよい
//     理由そのものが消える。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRANT, TAPS, WINDOW_MS,
  addCoins, dropAll, emptyGate, grantAll, tapGate, tapsLeft,
} from '../src/admin.js';
import { ITEMS, isDecor, owns, stockOf } from '../src/shop.js';
import { emptyProgress, parseProgress } from '../src/progress.js';
import { STOCK_MAX } from '../src/minigame/decor.js';
import { ACHIEVEMENTS } from '../src/achievements.js';
import { gearOf } from '../src/gear.js';

// 続けて叩く(間を空けない)
function tapMany(n, step = 100) {
  let gate = emptyGate();
  let opened = 0;
  let now = 1000;
  for (let i = 0; i < n; i += 1) {
    now += step;
    const r = tapGate(gate, now);
    gate = r.gate;
    if (r.open) opened += 1;
  }
  return { gate, opened };
}

// ---- 開けかた ----

test('隠し口: 続けて7回で開く。6回では開かない', () => {
  assert.ok(TAPS >= 5, `${TAPS} 回では偶然あたる`);
  assert.equal(tapMany(TAPS - 1).opened, 0, '足りない回数で開いた');
  assert.equal(tapMany(TAPS).opened, 1);
});

test('隠し口: 間が空いたら数え直す', () => {
  // **版の表示は画面の下にずっと出ている。** 何日かかけて7回触れたら
  // 開く、では隠したことにならない
  let gate = emptyGate();
  let now = 0;
  for (let i = 0; i < 20; i += 1) {
    now += WINDOW_MS + 1;          // 毎回、窓の外
    const r = tapGate(gate, now);
    gate = r.gate;
    assert.equal(r.open, false, `${i + 1} 回目で開いた`);
  }
  // ぎりぎり窓の内側なら数える
  gate = emptyGate();
  now = 0;
  let opened = false;
  for (let i = 0; i < TAPS; i += 1) {
    now += WINDOW_MS;              // ちょうど窓の端
    const r = tapGate(gate, now);
    gate = r.gate;
    opened = opened || r.open;
  }
  assert.equal(opened, true, '窓の端が数えられていない');
});

test('隠し口: 開いたら数えが戻る(8回目でまた開かない)', () => {
  const { gate } = tapMany(TAPS);
  assert.deepEqual(gate, emptyGate());
  assert.equal(tapsLeft(gate), TAPS);
  // 続けてもう1回叩いても開かない
  assert.equal(tapGate(gate, 9999).open, false);
});

test('隠し口: あと何回かが分かる。壊れた値でも落ちない', () => {
  assert.equal(tapsLeft(emptyGate()), TAPS);
  assert.equal(tapsLeft(null), TAPS);
  assert.equal(tapsLeft({ n: TAPS + 5 }), 0, '負の数を返している');
  for (const bad of [null, undefined, {}, { n: 'x' }, { at: 'y' }]) {
    assert.equal(typeof tapGate(bad, 100).open, 'boolean', `${JSON.stringify(bad)}`);
  }
});

// ---- 配るもの ----

test('管理者: 銀貨を足す。手持ちも通算も増える', () => {
  const p = addCoins(emptyProgress());
  assert.equal(p.coins, GRANT);
  assert.equal(p.coinsEarned, GRANT);
  // 2回足せば2倍(前の値に積む)
  assert.equal(addCoins(p).coins, GRANT * 2);
  // 壊れた値からでも落ちない
  assert.equal(addCoins({ coins: 'x', coinsEarned: -5 }).coins, GRANT);
  assert.equal(addCoins(null).coins, GRANT);
});

test('管理者: 全部そろう。飾りは数で入る', () => {
  const p = grantAll(emptyProgress());
  for (const item of ITEMS) {
    assert.ok(owns(p, item.id), `${item.name} が入っていない`);
    // 飾りは1つずつ買い直さないと並べて試せないので、上限まで入れる
    if (isDecor(item.id)) assert.equal(stockOf(p, item.id), STOCK_MAX, `${item.name}`);
  }
  // 保存を経ても残る(sanitize に落とされない)
  const kept = parseProgress(JSON.stringify(p));
  for (const item of ITEMS) assert.ok(owns(kept, item.id), `${item.name} が保存で消えた`);
});

// **ここが隠し口を出荷物に入れてよい理由そのもの。**
// 配ったせいで実績が付くなら、称号はオンラインの相手にも見えるので、
// 人の画面に出る記録を書き換えることになる。
//
// **`unlockedBy(progress)` を呼んで [] を確かめる、では駄目だった。**
// あれは対戦の締めの ctx を受け取る関数で、progress を渡すと判定が
// 全部例外になり、それを握りつぶして必ず [] を返す ── 何を入れても
// 通る、意味のないテストになる。実績の判定式そのものを読んで、
// 銀貨と持ち物を見ていないことを確かめる。
test('管理者: 実績の判定は銀貨も持ち物も見ていない', () => {
  const FORBIDDEN = ['coins', 'coinsEarned', 'owned', 'stock', 'worn'];
  let checked = 0;
  for (const a of ACHIEVEMENTS) {
    for (const key of ['check', 'progress']) {
      if (typeof a[key] !== 'function') continue;
      checked += 1;
      const src = a[key].toString();
      for (const f of FORBIDDEN) {
        assert.ok(!new RegExp(`\\b${f}\\b`).test(src),
          `実績「${a.name}」の ${key} が ${f} を見ている ── 配ると実績が付く`);
      }
    }
  }
  assert.ok(checked > 10, `判定式を ${checked} 個しか読めていない(読み方が壊れている)`);
});

test('管理者: 配っても図鑑・戦績・実績には触らない', () => {
  const before = emptyProgress();
  for (const p of [addCoins(before), grantAll(before), grantAll(addCoins(before))]) {
    assert.deepEqual(p.fish, before.fish, '図鑑が動いた');
    assert.deepEqual(p.games, before.games, '戦績が動いた');
    assert.deepEqual(p.achievements, before.achievements, '実績が動いた');
    assert.deepEqual(p.meets, before.meets, '大会の成績が動いた');
  }
});

test('管理者: 手放すと買い物まわりだけ消える', () => {
  // 記録を作っておく(消えてはいけないもの)
  const base = {
    ...emptyProgress(),
    fish: { aji: { n: 3, best: 28 } },
    achievements: { 'fish-first': { at: 1, mode: null } },
    games: [{ mode: 'base', won: true }],
    coins: 500,
    coinsEarned: 900,
  };
  let p = grantAll(base);
  p = { ...p, decor: { base: [{ id: 'bench', x: 1, z: 2 }] }, worn: { hat: 'straw', dice: 'dice-gold' } };
  const after = dropAll(p);

  assert.deepEqual(after.owned, {}, '持ち物が残っている');
  assert.deepEqual(after.stock, {}, '飾りの手持ちが残っている');
  assert.deepEqual(after.decor, {}, '島に置いた飾りが残っている');
  for (const v of Object.values(after.worn)) assert.equal(v, null, '着けたままになっている');
  // **残るもの**
  assert.deepEqual(after.fish, base.fish, '図鑑が消えた');
  assert.deepEqual(after.achievements, base.achievements, '実績が消えた');
  assert.deepEqual(after.games, base.games, '戦績が消えた');
  assert.equal(after.coins, 500, '銀貨まで消えた');
  // 手放したあとは既定の見た目に戻る
  assert.equal(gearOf(after, 'dice').id, 'dice-bone');
  assert.equal(after.worn.hat, null);
});

test('管理者: 壊れた progress でも落ちない', () => {
  for (const bad of [null, undefined, {}]) {
    assert.equal(typeof addCoins(bad).coins, 'number');
    assert.equal(typeof grantAll(bad).owned, 'object');
    assert.deepEqual(dropAll(bad).owned, {});
  }
});
