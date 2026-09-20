// 島の銀貨の配分(src/rewards.js)と、progress への積み上げ。
//
// 通貨は「遊ぶ動機」そのものなので、壊れかたが体験に直結する:
//   - どこかの遊びだけ実入りが良いと、ほかを誰も触らなくなる
//   - 二重に数えると、再読み込みするだけで増える
//   - さかのぼりの換算が二度走ると、使い切った人にまた配ってしまう
// どれも「落ちない」たぐいの壊れかたなので、ここで押さえる。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COIN_ICON, ENTRY_COIN, RATE, SOLO_RAID_RATE, TIER_COIN, WIN_COIN,
  coinsForCatch, coinsForContest, coinsForFound, coinsForPastCatches, coinsForRaidRun,
} from '../src/rewards.js';
import { FISH, FISH_BY_ID } from '../src/minigame/fish.js';
import {
  addCatch, addCoins, addContestResult, addRaidRun, emptyProgress, noteSeen, parseProgress,
} from '../src/progress.js';

// ---- 1匹の値 ----

test('銀貨: 等級が上がるほど高い', () => {
  const pick = (tier) => FISH.find((f) => f.tier === tier);
  const at = (tier, ratio) => {
    const f = pick(tier);
    return coinsForCatch(f.id, f.cm[0] + (f.cm[1] - f.cm[0]) * ratio);
  };
  const tiers = ['junk', 'common', 'rare', 'legend', 'myth'];
  const mids = tiers.map((t) => at(t, 0.5));
  for (let i = 1; i < mids.length; i += 1) {
    assert.ok(mids[i] > mids[i - 1], `${tiers[i]} が ${tiers[i - 1]} より安い: ${mids}`);
  }
});

test('銀貨: 同じ種でも大きいほど高く、最大でちょうど2倍', () => {
  for (const f of FISH) {
    const lo = coinsForCatch(f.id, f.cm[0]);
    const hi = coinsForCatch(f.id, f.cm[1]);
    assert.ok(hi > lo, `${f.id}: 大物にしても増えない(${lo} → ${hi})`);
    assert.equal(hi, Math.round(TIER_COIN[f.tier] * 2), `${f.id}: 最大が2倍になっていない`);
    assert.equal(lo, TIER_COIN[f.tier], `${f.id}: 最小が等級の値と違う`);
  }
});

test('銀貨: ガラクタでも必ず1枚は出る', () => {
  for (const f of FISH.filter((x) => x.tier === 'junk')) {
    assert.ok(coinsForCatch(f.id, f.cm[0]) >= 1, `${f.id}: 0 枚になっている`);
  }
});

test('銀貨: 知らない魚や壊れた大きさでも落ちない', () => {
  assert.equal(coinsForCatch('no-such-fish', 100), 0);
  assert.equal(coinsForCatch(null, 100), 0);
  const f = FISH[0];
  for (const bad of [undefined, null, NaN, -5, 'あ', {}]) {
    const v = coinsForCatch(f.id, bad);
    assert.ok(Number.isFinite(v) && v >= 1, `${String(bad)}: ${v}`);
  }
});

// ---- 大会 ----

test('銀貨: 出れば参加賞、勝てば上乗せ', () => {
  const base = coinsForContest({ kind: 'fishing', entered: true, won: false, score: 0 });
  assert.equal(base, ENTRY_COIN, '点0でも参加賞が出ていない');
  const win = coinsForContest({ kind: 'fishing', entered: true, won: true, score: 0 });
  assert.equal(win, ENTRY_COIN + WIN_COIN, '優勝の上乗せが違う');
  const big = coinsForContest({ kind: 'fishing', entered: true, won: false, score: 100 });
  assert.equal(big, ENTRY_COIN + Math.round(RATE.fishing * 100), '出来高が違う');
});

test('銀貨: 見ていただけの回と、知らない遊びには払わない', () => {
  assert.equal(coinsForContest({ kind: 'fishing', entered: false, won: true, score: 500 }), 0);
  assert.equal(coinsForContest({ kind: 'no-such-meet', entered: true, score: 100 }), 0);
  assert.equal(coinsForContest({}), 0);
});

// これは配分の設計そのもの。どれかの係数をいじって釣り合いが崩れたら落ちる。
// 「1回の上出来な回」がどれも同じくらいになるように天井から逆算してある。
test('銀貨: どの遊びも、上出来な1回の実入りが同じ帯に収まる', () => {
  const good = {
    fishing: { score: 150 },              // 150cm(良い型)
    dragonhunt: { score: 90 },            // 逃げきり
    logroll: { score: 90 },               // 完走
    raid: { score: 200 },                 // 良い回
    daifugo: { place: 1, players: 5 },    // 5人卓で大富豪
  };
  const got = {};
  for (const [kind, arg] of Object.entries(good)) {
    got[kind] = coinsForContest({ kind, entered: true, won: true, ...arg });
  }
  const vals = Object.values(got);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  assert.ok(lo >= 40 && hi <= 70, `帯から外れた: ${JSON.stringify(got)}`);
  assert.ok(hi / lo <= 1.5, `遊びごとの差が大きすぎる(${lo}〜${hi}): ${JSON.stringify(got)}`);
});

// ---- ひとりで櫓・見つけたもの ----

test('銀貨: 1本も射たずにおろした回は払わない', () => {
  assert.equal(coinsForRaidRun({ score: 500, shots: 0 }), 0, '射ずに稼げる');
  assert.equal(coinsForRaidRun({ score: 100, shots: 10 }), Math.round(SOLO_RAID_RATE * 100));
});

test('銀貨: ひとりの櫓は大会より1点あたりが安い', () => {
  assert.ok(SOLO_RAID_RATE < RATE.raid, 'ひとりのほうが割が良くなっている');
});

test('銀貨: 見つけたものは決まった額。知らないものは0', () => {
  assert.ok(coinsForFound('nest') > 0);
  assert.equal(coinsForFound('no-such-place'), 0);
});

// ---- さかのぼりの換算 ----

test('銀貨: 過去の釣果は「自己最高1匹 + 残りはまん中」で数える', () => {
  const f = FISH_BY_ID.maguro;
  const mid = (f.cm[0] + f.cm[1]) / 2;
  const got = coinsForPastCatches({ maguro: { n: 3, best: f.cm[1] } });
  const want = coinsForCatch('maguro', f.cm[1]) + 2 * coinsForCatch('maguro', mid);
  assert.equal(got, want);
});

test('銀貨: 換算は 0匹・知らない魚・壊れた値でも落ちない', () => {
  assert.equal(coinsForPastCatches(null), 0);
  assert.equal(coinsForPastCatches({}), 0);
  assert.equal(coinsForPastCatches({ maguro: { n: 0, best: 100 } }), 0, '0匹に払っている');
  assert.equal(coinsForPastCatches({ 'no-such': { n: 5, best: 10 } }), 0);
  assert.ok(Number.isFinite(coinsForPastCatches({ maguro: { n: NaN, best: NaN } })));
});

// ---- progress への積み上げ ----

test('銀貨: 足すと手持ちと通算の両方が増える。減らす方向には動かない', () => {
  let p = emptyProgress();
  assert.equal(p.coins, 0);
  p = addCoins(p, 30);
  assert.deepEqual([p.coins, p.coinsEarned], [30, 30]);
  for (const bad of [-10, 0, NaN, null, undefined, 'あ']) {
    const q = addCoins(p, bad);
    assert.deepEqual([q.coins, q.coinsEarned], [30, 30], `${String(bad)} で動いた`);
  }
});

// **手持ち = 遊びの稼ぎ + 掲示板の依頼の報酬。**
// 依頼(quests.js)は日替わりなので、今日たまたま何が出ているかで額が動く
// ── 時刻を固定したうえで、2つの合計として見る。
// (r.coins だけと突き合わせていたら、依頼を足した日に落ちた)
const AT = Date.UTC(2026, 8, 20, 3);

test('銀貨: 釣ると増える。額は coinsForCatch と一致する', () => {
  const r = addCatch(emptyProgress(), 'maguro', 150, AT);
  assert.equal(r.coins, coinsForCatch('maguro', 150), '返す額が違う');
  assert.equal(r.progress.coins, r.coins + r.questCoins, '手持ちに入っていない');
});

test('銀貨: 大会の二重申告では増えない', () => {
  const one = addContestResult(emptyProgress(), {
    kind: 'fishing', won: true, score: 120, key: 'room#1', at: AT,
  });
  assert.ok(one.coins > 0, '1回目で増えていない');
  const two = addContestResult(one.progress, {
    kind: 'fishing', won: true, score: 120, key: 'room#1', at: AT,
  });
  assert.equal(two.coins, 0, '同じ回で二度払っている');
  assert.equal(two.progress.coins, one.progress.coins, '手持ちが増えている');
});

test('銀貨: 櫓と、見つけたもの', () => {
  const r = addRaidRun(emptyProgress(), { score: 150, wave: 3, shots: 40, hits: 30 }, AT);
  assert.equal(r.coins, coinsForRaidRun({ score: 150, shots: 40 }));
  assert.equal(r.progress.coins, r.coins + r.questCoins);

  const first = noteSeen(emptyProgress(), 'nest');
  assert.ok(first.coins > 0, '初めて行ったのに払われない');
  const second = noteSeen(first.progress, 'nest');
  assert.equal(second.coins, 0, '二度目に払っている');
});

// ---- 保存と移行 ----

test('銀貨: 古い保存を読むと過去の釣果ぶんを一度だけ配る', () => {
  const v1 = {
    v: 1, games: [], achievements: {}, title: null,
    fish: { maguro: { n: 3, best: 150 }, iwashi: { n: 10, best: 18 } },
    meets: {}, seen: {}, raid: {},
  };
  const want = coinsForPastCatches(v1.fish);
  const migrated = parseProgress(JSON.stringify(v1));
  assert.equal(migrated.coins, want, '換算額が違う');
  assert.equal(migrated.coinsEarned, want);

  // 二度目(v2 として保存済み)は配らない
  const again = parseProgress(JSON.stringify(migrated));
  assert.equal(again.coins, want, '読み直すたびに増えている');

  // 使い切った人に配り直さない ── ここが v を見ずに
  // 「coins が無ければ配る」だと、0 の人へ何度でも配ってしまう
  const spent = parseProgress(JSON.stringify({ ...migrated, coins: 0 }));
  assert.equal(spent.coins, 0, '使い切った人に配り直している');
  assert.equal(spent.coinsEarned, want, '通算獲得まで消えている');
});

test('銀貨: 壊れた保存でも 0 から始まる', () => {
  for (const bad of ['{', 'null', '[]', '{"v":2,"coins":"あ"}', '{"v":2,"coins":-5}']) {
    const p = parseProgress(bad);
    assert.ok(Number.isFinite(p.coins) && p.coins >= 0, `${bad}: ${p.coins}`);
    assert.ok(Number.isFinite(p.coinsEarned) && p.coinsEarned >= 0);
  }
});

test('銀貨: 記号がある(画面で使う)', () => {
  assert.ok(COIN_ICON.length > 0);
});

// ---- 大富豪は順位で払う ----
//
// score は実績の記録(いちばん大きい卓で大富豪)に使うので、
// 1位以外は 0 になっている。そのまま報酬に使うと、5人卓の2位が
// 最下位と同じ額になる ── 大富豪で2位は健闘なのに。

test('銀貨: 大富豪は順位が上がるほど高い', () => {
  const at = (place, players = 5) =>
    coinsForContest({ kind: 'daifugo', entered: true, won: place === 1, place, players });
  const five = [1, 2, 3, 4, 5].map((p) => at(p));
  for (let i = 1; i < five.length; i += 1) {
    assert.ok(five[i] < five[i - 1], `${i + 1}位が${i}位以上もらえる: ${five}`);
  }
  assert.equal(at(5), ENTRY_COIN, '最下位でも参加賞は出る');
  assert.ok(at(2) > ENTRY_COIN, '2位が参加賞だけになっている(順位が効いていない)');
});

test('銀貨: 大富豪は卓が大きいほど、同じ順位でも高い', () => {
  const at = (place, players) =>
    coinsForContest({ kind: 'daifugo', entered: true, won: place === 1, place, players });
  assert.ok(at(1, 5) > at(1, 3), '5人卓の1位が3人卓の1位と同じか以下');
  assert.ok(at(2, 5) > at(2, 3), '大きい卓の2位が評価されていない');
});

test('銀貨: 大富豪は score を見ない(順位と卓の人数だけで決まる)', () => {
  const a = coinsForContest({ kind: 'daifugo', entered: true, won: true, place: 1, players: 4, score: 0 });
  const b = coinsForContest({ kind: 'daifugo', entered: true, won: true, place: 1, players: 4, score: 999 });
  assert.equal(a, b, 'score が混ざっている');
});

test('銀貨: 順位や卓の人数が分からなければ参加賞だけ', () => {
  for (const arg of [{}, { place: 1 }, { players: 4 }, { place: 0, players: 0 }]) {
    const v = coinsForContest({ kind: 'daifugo', entered: true, won: false, ...arg });
    assert.equal(v, ENTRY_COIN, `${JSON.stringify(arg)}: ${v}`);
  }
});

test('銀貨: 順位で払うのは大富豪だけ(ほかは score のまま)', () => {
  // 釣りに順位を渡しても額は変わらない
  const a = coinsForContest({ kind: 'fishing', entered: true, won: false, score: 100 });
  const b = coinsForContest({ kind: 'fishing', entered: true, won: false, score: 100, place: 1, players: 5 });
  assert.equal(a, b, '釣りが順位で変わっている');
});
