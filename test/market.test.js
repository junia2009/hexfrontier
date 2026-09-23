// 魚の相場(src/market.js)と、その日の値で売る勘定(rewards.js / progress.js)。
//
// 掲示板の依頼と同じで、日替わりのものは壊れても
// 「今日はたまたま変だな」で流される。**何年ぶんも回して**見る。
//
// いちばん大事なのは **島の物価が動かないこと**。相場を入れただけで
// 全体が値上がりすると、道具と飾りの値付けを全部やり直すことになる。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BAG, BANDS, BOARD_TOP, bandOf, marketBoard, marketRate, marketToday,
} from '../src/market.js';
import { FISH, FISH_BY_ID, portLabel } from '../src/minigame/fish.js';
import { coinsForCatch, coinsForPastCatches, coinsForSale } from '../src/rewards.js';
import { addCatch, emptyProgress, questBoard } from '../src/progress.js';
import { questsHtml } from '../src/render/records.js';
import { ISLAND_TZ_MIN } from '../src/quests.js';

const DAY = 86400000;
// 2026-09-20 12:00 の島の時刻あたり。ここを起点に日をずらして回す
const T0 = Date.UTC(2026, 8, 20, 3);
const day = (n) => T0 + n * DAY;
const DAYS = 2000;

const SELLABLE = FISH.filter((f) => f.tier !== 'junk');

// ---- くじの中身 ----

test('相場: 倍率の平均はちょうど 1.0', () => {
  // **小数で足さない。** 0.1 は2進で表せないので、素直に足すと 20 にならず
  // 「平均が 1 からずれた」のか「足し算の誤差」なのか分からなくなる
  const sum = BAG.reduce((s, v) => s + Math.round(v * 10), 0);
  assert.equal(sum, BAG.length * 10, `合計が ${sum / 10} になっている(20.0 でないと物価が動く)`);
});

test('相場: 高値のほうが少ない(たまに来る形)', () => {
  const hi = BAG.filter((v) => v > 1.15).length;
  const lo = BAG.filter((v) => v < 0.85).length;
  assert.ok(lo > hi, '安値のほうが多くないと、いつも高い島になる');
  assert.ok(Math.max(...BAG) >= 1.5, '当たりの日が無いと待つ意味が無い');
});

// ---- 何年ぶんも回す ----

test('相場: 何年回しても、ならすと素の値と同じ', () => {
  let sum = 0;
  let n = 0;
  for (let d = 0; d < DAYS; d += 1) {
    for (const f of SELLABLE) {
      sum += marketRate(f.id, day(d));
      n += 1;
    }
  }
  const mean = sum / n;
  assert.ok(Math.abs(mean - 1) < 0.02, `全体の平均が ${mean.toFixed(4)}(1.0 から離れすぎ)`);
});

test('相場: 1種類だけ回しても、ならすと素の値と同じ', () => {
  // 種に魚の id を混ぜているので、**特定の魚だけずっと高い/安い**という
  // 偏りが出うる(混ぜかたが悪いと起きる)。1匹ずつ見る
  for (const f of SELLABLE) {
    let sum = 0;
    for (let d = 0; d < DAYS; d += 1) sum += marketRate(f.id, day(d));
    const mean = sum / DAYS;
    assert.ok(Math.abs(mean - 1) < 0.05, `${f.name} の平均が ${mean.toFixed(4)}`);
  }
});

test('相場: 出る値はくじの中のものだけ', () => {
  const bag = new Set(BAG);
  for (let d = 0; d < 200; d += 1) {
    for (const f of SELLABLE) assert.ok(bag.has(marketRate(f.id, day(d))));
  }
});

// ---- 日付だけで決まる ----

test('相場: 同じ日なら何時に見ても同じ', () => {
  for (let h = 0; h < 24; h += 1) {
    // 島の 0 時から 24 時間ぶん(ISLAND_TZ_MIN のぶん戻した時刻が島の 0 時)
    const t = (Math.floor((T0 + ISLAND_TZ_MIN * 60000) / DAY)) * DAY
      - ISLAND_TZ_MIN * 60000 + h * 3600000;
    assert.equal(marketRate('aji', t), marketRate('aji', T0), `${h} 時でずれた`);
  }
});

test('相場: 日が変わると動く', () => {
  // 1匹だけ見ると「たまたま同じ値を引いた日」が続くので、全体で見る
  const at = (d) => SELLABLE.map((f) => marketRate(f.id, day(d))).join(',');
  let moved = 0;
  for (let d = 1; d < 60; d += 1) if (at(d) !== at(d - 1)) moved += 1;
  assert.equal(moved, 59, '日が変わっても動かない日がある');
});

test('相場: 同じ日でも魚ごとに違う', () => {
  const rates = new Set(SELLABLE.map((f) => marketRate(f.id, T0)));
  assert.ok(rates.size > 3, '同じ日の魚が全部同じ値になっている(種に id が効いていない)');
});

test('相場: ガラクタと知らないものは素の値(1.0)', () => {
  for (const f of FISH.filter((x) => x.tier === 'junk')) {
    for (let d = 0; d < 100; d += 1) {
      assert.equal(marketRate(f.id, day(d)), 1, `${f.name} に相場が乗っている`);
    }
  }
  assert.equal(marketRate('nosuchfish', T0), 1);
  assert.equal(marketRate(null, T0), 1);
  assert.equal(marketRate(undefined, T0), 1);
  assert.equal(marketRate(42, T0), 1);
});

// ---- 呼びかた ----

test('相場: 帯はどの倍率にも1つ当たる', () => {
  for (const v of BAG) {
    const b = bandOf(v);
    assert.ok(b, `${v} に当たる帯が無い`);
    assert.ok(v >= b.min);
  }
  assert.equal(bandOf(1).label, '平年なみ');
  assert.equal(bandOf(1.8).label, '大漁景気');
  assert.equal(bandOf(0.5).label, '買いたたき');
  // **境目はその帯のもの**(`min` は「以上」)。ちょうどの値で1つ下の帯に
  // 落ちないこと ── くじの中に境目ぴったりの倍率が無いので、`>=` を `>` に
  // 変えても全部のテストが通ってしまった(故障注入で見つかった)。
  // くじを足したときに初めて表に出る類のずれなので、境目で直接押さえる
  for (const b of BANDS) assert.equal(bandOf(b.min).label, b.label, `${b.label} の境目`);
  // 範囲の外(来ないが、帯を無しにしない)
  assert.ok(bandOf(0));
  assert.ok(bandOf(9));
});

test('相場: 上向きの帯は 1.0 より上だけ', () => {
  for (const b of BANDS) {
    if (b.up) assert.ok(b.min > 1, `${b.label} が 1.0 以下で上向きになっている`);
  }
});

test('相場: 動いていない帯は1つだけ。1.0 をまたぐ', () => {
  // 釣果の札はこの印だけを見て「出すか出さないか」を決める
  // (`rate !== 1` で消したつもりが、0.9 でも「平年なみ」が出ていた)
  const flat = BANDS.filter((b) => b.flat);
  assert.equal(flat.length, 1, '動いていない帯が1つでないと、札の出し分けが決まらない');
  assert.ok(bandOf(1).flat, '×1.0 が「動いた日」になっている');
  assert.ok(bandOf(0.9).flat, '×0.9 で札に帯が出てしまう');
  assert.ok(bandOf(1.1).flat, '×1.1 で札に帯が出てしまう');
  assert.ok(!bandOf(1.4).flat && !bandOf(0.6).flat, '動いた日の帯が消えている');
  assert.ok(BANDS.filter((b) => !b.flat).every((b) => b.min >= 1.15 || b.min < 0.85));
});

// ---- 掲示板に出すぶん ----

test('相場: 釣れない魚は出さない', () => {
  const shore = marketToday(T0, {});
  assert.ok(shore.length, '港の魚が1匹も出ていない');
  for (const r of shore) {
    const f = FISH_BY_ID[r.id];
    assert.ok(!f.deep && !f.night, `${f.name} は買わないと行けない場所の魚`);
  }
  // 竿とランタンを持っていれば出る
  const all = marketToday(T0, { deep: true, night: true });
  assert.ok(all.length > shore.length);
  assert.ok(all.some((r) => FISH_BY_ID[r.id].deep && FISH_BY_ID[r.id].night));
  // 片方だけ持っている人
  const deep = marketToday(T0, { deep: true });
  assert.ok(deep.some((r) => FISH_BY_ID[r.id].deep));
  assert.ok(!deep.some((r) => FISH_BY_ID[r.id].night));
});

test('相場: ガラクタは出さない', () => {
  for (const r of marketToday(T0, { deep: true, night: true })) {
    assert.notEqual(FISH_BY_ID[r.id].tier, 'junk');
  }
});

test('相場: 高い順に並ぶ', () => {
  for (let d = 0; d < 100; d += 1) {
    const rows = marketToday(day(d), { deep: true, night: true });
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(rows[i - 1].rate >= rows[i].rate, `${d} 日目の並びが崩れている`);
    }
  }
});

test('相場: 島に無い港のぬしは出さない', () => {
  const nushi = FISH.filter((f) => f.at);
  assert.ok(nushi.length, 'ぬしが1匹もいない(前提が崩れている)');
  // 港が1種類だけの島
  const one = marketToday(T0, {}, ['wood']);
  for (const r of one) {
    const f = FISH_BY_ID[r.id];
    assert.ok(!f.at || f.at === 'wood', `${f.name} は木の港にしか出ない魚ではない`);
  }
  assert.ok(one.some((r) => FISH_BY_ID[r.id].at === 'wood'), '木の港のぬしが落ちている');
  // 港が1つも無い島(ありえないが、黙って落ちないこと)
  for (const r of marketToday(T0, {}, [])) assert.equal(FISH_BY_ID[r.id].at, undefined);
  // 渡さなければ絞らない(掲示板以外から呼ぶとき)
  assert.ok(marketToday(T0, {}).some((r) => r.at));
});

test('相場: ぬしの行には、どの港かが付いてくる', () => {
  for (const r of marketToday(T0, { deep: true, night: true })) {
    assert.equal(r.at, FISH_BY_ID[r.id].at ?? null, `${r.name}`);
  }
});

test('相場: 掲示板は上から数件だけ', () => {
  const all = marketToday(T0, {});
  const board = marketBoard(T0, {});
  assert.equal(board.length, BOARD_TOP);
  assert.ok(all.length > BOARD_TOP, '全部が収まってしまうなら切る意味が無い');
  assert.deepEqual(board, all.slice(0, BOARD_TOP));
  assert.equal(marketBoard(T0, {}, null, 1).length, 1);
  assert.equal(marketBoard(T0, {}, null, 0).length, 0);
  assert.equal(marketBoard(T0, {}, null, -3).length, 0);
  // 港で絞ったぶんも、ちゃんと上から取れている
  assert.deepEqual(marketBoard(T0, {}, ['wood']), marketToday(T0, {}, ['wood']).slice(0, BOARD_TOP));
});

test('相場: 掲示板に出た値は、実際に売れる値と同じ', () => {
  // 掲示板と手に入る額が違っていたら、相場そのものが嘘になる
  for (const r of marketBoard(T0, { deep: true, night: true }, null, 5)) {
    const f = FISH_BY_ID[r.id];
    const cm = f.cm[1];
    assert.equal(coinsForSale(f.id, cm, T0), Math.max(1, Math.round(coinsForCatch(f.id, cm) * r.rate)));
  }
});

// ---- その日の値で売る ----

test('売値: 素の値に倍率を掛けたもの', () => {
  for (let d = 0; d < 50; d += 1) {
    const t = day(d);
    for (const f of SELLABLE) {
      const cm = (f.cm[0] + f.cm[1]) / 2;
      const want = Math.max(1, Math.round(coinsForCatch(f.id, cm) * marketRate(f.id, t)));
      assert.equal(coinsForSale(f.id, cm, t), want, `${f.name}`);
    }
  }
});

test('売値: 安値の日でも 0 枚にはならない', () => {
  for (let d = 0; d < 400; d += 1) {
    for (const f of FISH) {
      assert.ok(coinsForSale(f.id, f.cm[0], day(d)) >= 1, `${f.name} が 0 枚になった`);
    }
  }
});

test('売値: ガラクタは相場で動かない', () => {
  for (const f of FISH.filter((x) => x.tier === 'junk')) {
    for (let d = 0; d < 100; d += 1) {
      assert.equal(coinsForSale(f.id, f.cm[1], day(d)), coinsForCatch(f.id, f.cm[1]));
    }
  }
});

test('売値: 知らない魚は 0 枚', () => {
  assert.equal(coinsForSale('nosuchfish', 30, T0), 0);
  assert.equal(coinsForSale(null, 30, T0), 0);
});

test('売値: 釣ると、その日の値がそのまま入って倍率も返る', () => {
  const p = emptyProgress();
  const t = day(7);
  const r = addCatch(p, 'aji', 22, t);
  assert.equal(r.rate, marketRate('aji', t));
  assert.equal(r.coins, coinsForSale('aji', 22, t));
  // 依頼の達成ぶんは別枠。銀貨は「売値 + 依頼」
  assert.equal(r.progress.coins, r.coins + r.questCoins);
});

test('売値: 同じ1匹でも、日が変わると額が変わる', () => {
  const p = emptyProgress();
  const seen = new Set();
  for (let d = 0; d < 60; d += 1) seen.add(addCatch(p, 'tai', 50, day(d)).coins);
  assert.ok(seen.size > 3, '日が変わっても額が動いていない');
});

// ---- 掲示板の見た目 ----

test('掲示板: 相場が無ければ何も出さない(依頼だけ)', () => {
  const board = questBoard(emptyProgress(), T0);
  const html = questsHtml(board, { now: T0 });
  assert.ok(!html.includes('きょうの相場'), '相場を渡していないのに見出しが出た');
  assert.ok(html.includes('の依頼'), '依頼の見出しが消えた');
});

test('掲示板: 相場は魚の名前と倍率が出る。依頼は消えない', () => {
  const board = questBoard(emptyProgress(), T0);
  const rows = marketBoard(T0, { deep: true, night: true });
  const html = questsHtml(board, { now: T0, market: rows });
  assert.ok(html.includes('きょうの相場'));
  for (const r of rows) {
    assert.ok(html.includes(r.name), `${r.name} が出ていない`);
    assert.ok(html.includes(`×${r.rate.toFixed(1)}`), `${r.name} の倍率が出ていない`);
    assert.ok(html.includes(bandOf(r.rate).label), `${r.name} の呼びかたが出ていない`);
    if (r.at) assert.ok(html.includes(portLabel(r.at)), `${r.name} の港が出ていない`);
  }
  // ぬしが1匹も混ざらない日があるので、港の行は別に作って確かめる
  const nushi = marketToday(T0, {}).filter((r) => r.at).slice(0, 2);
  const withAt = questsHtml(board, { now: T0, market: nushi });
  for (const r of nushi) assert.ok(withAt.includes(portLabel(r.at)), `${r.name} の港が出ていない`);
  // **依頼が主役。** 相場を足したせいで依頼が消えたら本末転倒
  for (const q of board) assert.ok(html.includes(q.text), `依頼「${q.text}」が消えた`);
});

// ---- さかのぼりの換算 ----

test('さかのぼり: 相場を掛けない(いつ開いても同じ額)', () => {
  // ここに相場を掛けると、**アプリを開いた日**でもらえる額が変わる。
  // 高値の日に初めて開いた人だけが得をする、という形にはしない
  const book = { aji: { n: 5, best: 28 }, tai: { n: 2, best: 70 } };
  const first = coinsForPastCatches(book);
  for (let d = 0; d < 200; d += 1) assert.equal(coinsForPastCatches(book), first);
  // 素の値の合計と一致する(倍率が紛れ込んでいないことの裏づけ)
  const mid = (f) => (f.cm[0] + f.cm[1]) / 2;
  const want = coinsForCatch('aji', 28) + 4 * coinsForCatch('aji', mid(FISH_BY_ID.aji))
    + coinsForCatch('tai', 70) + 1 * coinsForCatch('tai', mid(FISH_BY_ID.tai));
  assert.equal(first, want);
});
