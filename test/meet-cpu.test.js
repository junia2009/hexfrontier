// 集まりに混ぜる CPU(src/minigame/meet/cpu.js と器のぶん)。
//
// **体が島の上にあることを、本物の盤で測る。** 「歩いている」は文章では
// 確かめようがないので、島を作って歩かせ、海に出ていないか・目的地に
// 着いたかを座標で見る。
//
// ここが押さえるもの:
//   1. CPU が人の席を奪わない(あとから人が入っても)
//   2. CPU が陸から出ない(海の上を歩かない)
//   3. 遊びごとに、行くべきところへ行く(円卓・桟橋・櫓)
//   4. ひとりでも遊びが成立する(オフラインの器)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/state.js';
import { CpuCrowd, CPU_MAX, cpuName, cpuLook } from '../src/minigame/meet/cpu.js';
import { MeetCore, MIN_PLAYERS } from '../src/minigame/meet/meet-core.js';
import { DaifugoTable } from '../src/minigame/meet/daifugo-table.js';
import { FishingContest } from '../src/minigame/meet/fishing-contest.js';
import { RaidContest } from '../src/minigame/meet/raid-contest.js';
import { DragonHunt, GRACE_MS } from '../src/minigame/meet/dragon-hunt.js';
import { LogRollContest, ROLL_MS } from '../src/minigame/meet/logroll-contest.js';
import {
  DRUM_BAND, DRUM_LEN, DRUM_R, angleAt, holeOpen, makeCourse, toLocal,
} from '../src/minigame/logroll.js';
import { LocalMeet, SOLO_SEAT } from '../src/minigame/meet/local.js';
import { makeGround, tableSeats, meetHome, watchPost, fishingSpots } from '../src/minigame/ground.js';
import { WALK_SEATS, ST } from '../src/minigame/remote-st.js';
import { SPECIES } from '../src/minigame/species.js';

const island = (mode, seed = 7) => createGame({ seed, playerCount: 4, humanIndex: -1, mode });

// 器を1つ用意して、ホストの席0が CPU を n 人入れたところまで進める
function withCpus(Engine, mode, n, { seed = 7, host = 0 } = {}) {
  const st = island(mode, seed);
  const e = new Engine();
  e.setSeed?.(st.seed);
  e.setHost(host);
  e.setTaken([host]);
  e.setIsland(st);
  if (e.setHome) { const h = meetHome(st); e.setHome(h.x, h.y); }
  const res = e.setCpuCount(host, n);
  return { e, st, res };
}

// 時間を刻んで進める(実時間を待たない)
function run(e, ms, step = 100, from = 1_000_000) {
  for (let t = 0; t <= ms; t += step) e.tick(from + t);
  return from + ms;
}

test('CPU: 人数はオーナーだけが決められる', () => {
  const { e } = withCpus(MeetCoreStub, 'base', 0);
  e.setHost(0);
  assert.equal(e.setCpuCount(1, 3).error, 'CPU を決めるのはホストです');
  assert.equal(e.cpuCount, 0);
  assert.ok(e.setCpuCount(0, 3).ok);
  assert.equal(e.cpuCount, 3);
  assert.equal(e.cpus.size, 3);
});

test('CPU: 人数は 0〜席数-1 に収まる', () => {
  const { e } = withCpus(MeetCoreStub, 'base', 0);
  e.setCpuCount(0, 999);
  assert.equal(e.cpuCount, CPU_MAX);
  assert.equal(CPU_MAX, WALK_SEATS - 1);
  e.setCpuCount(0, -5);
  assert.equal(e.cpuCount, 0);
  assert.equal(e.cpus.size, 0);
});

// **人の席は絶対に奪わない。** 部屋は前から詰めるので、CPU は後ろから座る。
test('CPU: 人の席を奪わない(あとから人が入っても)', () => {
  const { e } = withCpus(MeetCoreStub, 'base', 3);
  for (const s of e.cpus) assert.equal(s >= WALK_SEATS - 3, true, `前の席に座った: ${s}`);
  assert.equal(e.cpus.has(0), false);
  // 人が増えていく。CPU は毎回どく
  for (let human = 1; human < WALK_SEATS - 3; human++) {
    e.setTaken([...Array(human + 1).keys()]);
    for (const s of e.cpus) {
      assert.equal(s > human, true, `人の席(${human})に CPU が座っている: ${s}`);
    }
    assert.equal(e.cpus.size, 3);
  }
});

// 満席近くで人が入ってきたら、その席の CPU には抜けてもらう
test('CPU: 席が足りなくなったら減る', () => {
  const { e } = withCpus(MeetCoreStub, 'base', CPU_MAX);
  assert.equal(e.cpus.size, CPU_MAX);
  e.setTaken([...Array(WALK_SEATS).keys()]);   // 満席
  assert.equal(e.cpus.size, 0);
  for (const s of e.entries) assert.equal(e.cpus.has(s), false);
});

test('CPU: 名前とすがたは席で決まる(回を跨いで入れ替わらない)', () => {
  for (let s = 0; s < WALK_SEATS; s++) {
    assert.equal(cpuName(s), cpuName(s));
    assert.ok(cpuName(s).length > 0);
    assert.ok(SPECIES.some((sp) => sp.id === cpuLook(s)), `知らないすがた: ${cpuLook(s)}`);
  }
});

test('CPU: 名簿は人の席と同じ形で配られる', () => {
  const { e } = withCpus(MeetCoreStub, 'base', 2);
  const rows = e.view().cpus;
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(typeof r.seat, 'number');
    assert.equal(r.name, cpuName(r.seat));
    assert.equal(r.look, cpuLook(r.seat));
    assert.equal(r.cpu, true);
  }
  assert.equal(e.view().cpuCount, 2);
  assert.equal(e.view().cpuMax, CPU_MAX);
});

// ---- 体 ----

// **海の上を歩かない。** 竜は飛ぶので地形を無視するが、CPU は歩き。
test('CPU: どの遊びでも陸から出ない', () => {
  for (const [mode, Engine] of [['base', DaifugoTable], ['fish', FishingContest],
    ['cak', RaidContest], ['dragon', DragonHunt]]) {
    const { e, st } = withCpus(Engine, mode, 4);
    const ground = makeGround(st);
    const at = run(e, 60000);
    const pos = e.cpuPositions();
    assert.equal(pos.length, 4, `${mode}: 体が出ていない`);
    for (const [seat, x, z, y] of pos) {
      assert.equal(ground(x, z).ok, true, `${mode}: 席${seat} が海の上 (${x}, ${z})`);
      // **y は「地面からの高さ」。** 地面の高さを送ると受け取る側で二重に
      // 足されて宙に浮く(remote-view.js は 地面 + y で置く)。CPU は跳ばない。
      assert.equal(y, 0, `${mode}: 席${seat} の y が 0 でない (${y})`);
    }
    assert.ok(at > 0);
  }
});

// 円卓へ歩いて座る。**席の並びは人と同じ式**なので、卓からずれない。
test('CPU: 大富豪では円卓の自分の席に座る', () => {
  const { e, st } = withCpus(DaifugoTable, 'base', 3);
  e.enter(0, 1_000_000);
  run(e, 40000);
  const players = [...e.entries].sort((a, b) => a - b);
  const seats = tableSeats(
    { x: meetHome(st).x, z: meetHome(st).y }, players.length,
  );
  for (const [seat, x, z, , facing, st2] of e.cpuPositions()) {
    const spot = seats[players.indexOf(seat)];
    const d = Math.hypot(x - spot.x, z - spot.z);
    assert.ok(d < 0.05, `席${seat} が卓の席から離れている: ${d.toFixed(3)}`);
    assert.equal(st2, ST.sit, `席${seat} が座っていない`);
    // 配る値は小数2桁に丸めてある(walk-relay.js と同じ)
    assert.ok(Math.abs(facing - spot.face) < 0.01, `席${seat} が卓を向いていない`);
  }
});

test('CPU: 釣り大会では桟橋に立って竿を出す', () => {
  const { e, st } = withCpus(FishingContest, 'fish', 3);
  run(e, 60000);
  const spots = fishingSpots(st);
  for (const [seat, x, z, , , st2] of e.cpuPositions()) {
    assert.equal(st2, ST.fish, `席${seat} が竿を出していない`);
    const near = spots.some((s) => Math.hypot(s.x - x, s.z - z) < 0.05);
    assert.ok(near, `席${seat} が釣り場に居ない (${x}, ${z})`);
  }
});

test('CPU: 蛮族を射るでは櫓のそばに立つ', () => {
  const { e, st } = withCpus(RaidContest, 'cak', 3);
  run(e, 60000);
  const post = watchPost(st);
  for (const [seat, x, z] of e.cpuPositions()) {
    const d = Math.hypot(post.x - x, post.z - z);
    assert.ok(d < 0.5, `席${seat} が櫓から離れている: ${d.toFixed(2)}`);
  }
});

// ---- 点 ----

test('CPU: 釣り大会で点が入る(人と同じ申告の口を通る)', () => {
  const { e } = withCpus(FishingContest, 'fish', 3);
  e.enter(0, 1_000_000);
  run(e, 20000);                       // 桟橋まで歩く時間
  const at = 1_000_000 + 20000;
  e.start(0, at);
  run(e, 100000, 200, at);
  for (const seat of e.cpus) {
    const s = e.scores.get(seat);
    assert.ok(s.count > 0, `席${seat} が1匹も釣っていない`);
    assert.ok(s.cm > 0 && s.cm < 3000, `席${seat} の合計が変: ${s.cm}`);
  }
  // 順位表に並ぶ
  assert.equal(e.rankRows().length, 4);
});

test('CPU: 蛮族を射るで点が入る(上限は人と同じ)', () => {
  const { e } = withCpus(RaidContest, 'cak', 3);
  e.enter(0, 1_000_000);
  run(e, 25000);
  const at = 1_000_000 + 25000;
  e.start(0, at);
  run(e, 60000, 200, at);
  for (const seat of e.cpus) {
    const s = e.scores.get(seat);
    assert.ok(s.score > 0, `席${seat} が1点も取っていない`);
    // 1秒あたりの上限(MAX_RATE=6)を超えない
    assert.ok(s.score <= 12 + 60 * 6, `席${seat} の点が上限を超えた: ${s.score}`);
    assert.ok(s.wave >= 1);
  }
});

// **CPU が打たないと卓が止まる。** ここが動かないのが最大の失敗。
//
// 人の手番は人が打つ(打たなければ止まるのが正しい ── 45秒の放置よけを
// 待つ)。見たいのは「CPU が放置よけを待たずに自分で打つ」ことなので、
// 人のぶんだけ手で打って、卓が **AUTO_MS よりずっと速く** 進むかを見る。
test('CPU: 大富豪は放置よけを待たずに自分で打つ', () => {
  const { e } = withCpus(DaifugoTable, 'base', 3);
  e.enter(0, 1_000_000);
  run(e, 30000);                        // 円卓へ歩く
  let at = 1_000_000 + 30000;
  assert.ok(e.start(0, at).ok, 'はじめられない');
  let cpuPlays = 0;
  const handOf = (s) => e.table?.hands[s]?.length ?? 0;
  let held = new Map([...e.cpus].map((s) => [s, handOf(s)]));
  // 人の手番だけ手で打ちながら、30秒ぶん進める。
  // AUTO_MS(45秒)より短いので、放置よけでは1手も進まない長さ。
  for (let t = 0; t <= 30000; t += 100) {
    at += 100;
    e.tick(at);
    const tb = e.table;
    if (!tb || tb.result) break;
    const who = tb.awaiting ? tb.awaiting.player : tb.players[tb.turn];
    // 人のぶんは放置よけと同じ打ちかたで代打する。
    // **場があるときに weakestPlay をそのまま出さない** ── あれは場を見て
    // いないので、通らない手を出し続けて卓が止まる(実際そうなった)。
    if (who === 0) e.autoPlay(at);
    for (const s of e.cpus) {
      if (handOf(s) < held.get(s)) { cpuPlays += 1; held.set(s, handOf(s)); }
    }
  }
  assert.ok(cpuPlays >= 3, `CPU が打った回数が少なすぎる: ${cpuPlays}`);
});

// **CPU が場を取り返すこと。** 放置よけ(autoPlay)は場があると必ずパスする
// ので、それを CPU に流用していたころは、人がひとりで出し続けて必ず勝てた。
// 「場に札があるところへ CPU が出す」を1度も見なければ、その状態に戻っている。
test('CPU: 場に出ている札の上から出す(パスしかしない相手ではない)', () => {
  let onField = 0;
  let humanWins = 0;
  const games = 6;
  for (let g = 0; g < games; g++) {
    const { e } = withCpus(DaifugoTable, 'base', 3, { seed: 11 + g });
    e.enter(0, 1_000_000);
    run(e, 30000);
    let at = 1_000_000 + 30000;
    e.start(0, at);
    for (let i = 0; i < 4000; i++) {
      const t = e.table;
      if (!t || t.result) break;
      const had = !!t.field;
      const who = t.awaiting ? t.awaiting.player : t.players[t.turn];
      const before = t.hands[who].length;
      at += 100;
      if (who === 0) e.autoPlay(at);      // 人は放置よけと同じ打ちかた
      else e.tick(at);
      const now = e.table;
      if (!now || now.result) break;
      // CPU が、場に札があるところへ出した(枚数が減った)
      if (who !== 0 && had && now.hands[who].length < before) onField += 1;
    }
    const order = e.table?.result?.order;
    if (order && order[0] === 0) humanWins += 1;
  }
  assert.ok(onField > 0, 'CPU が場に出ている札の上から1度も出していない');
  // 同じ打ちかたをする相手なので、人が全勝することはまず無い
  assert.ok(humanWins < games, `人が${games}戦全勝した(CPU が弱すぎる)`);
});

// 人が席を外しても、CPU だけで最後まで進んで決着する
test('CPU: 大富豪は CPU だけでも決着まで進む', () => {
  const { e } = withCpus(DaifugoTable, 'base', 3);
  e.enter(0, 1_000_000);
  run(e, 30000);
  const at = 1_000_000 + 30000;
  e.start(0, at);
  e.dropSeat(0);                        // 人が席を立つ
  run(e, 600000, 200, at);
  assert.equal(e.phase, 'idle', '人が居なくなったのに畳まれていない');
});

// ---- 竜 ----

test('CPU: 竜から逃げる(すぐには捕まらない)', () => {
  const { e } = withCpus(DragonHunt, 'dragon', 3);
  e.enter(0, 1_000_000);
  run(e, 10000);
  const at = 1_000_000 + 10000;
  e.start(0, at);
  // 人(席0)は動かないので必ず捕まる。CPU は逃げる。
  // 位置は毎 tick 渡す(room-do の walk tick と同じ)
  for (let t = 0; t <= GRACE_MS + 20000; t += 100) {
    e.setPositions([[0, 0, 0]]);
    e.tick(at + t);
  }
  const alive = [...e.cpus].filter((s) => !e.scores.get(s)?.caughtAt);
  assert.ok(alive.length >= 1, 'CPU が全員すぐ捕まった');
});

// **竜に CPU が見えていること。** 逃げ切ったことだけを見ていると、
// 「竜に見えていないから捕まらない」も通ってしまう(実際そうなっていた)。
// 人が捕まったあと、竜が CPU を狙いにいくかで確かめる。
test('CPU: 竜は CPU も狙う(位置がちゃんと渡っている)', () => {
  const { e } = withCpus(DragonHunt, 'dragon', 3);
  e.enter(0, 1_000_000);
  run(e, 10000);
  const at = 1_000_000 + 10000;
  e.start(0, at);
  e.scores.get(0).caughtAt = at;        // 人はもう捕まっている
  for (let t = 0; t <= GRACE_MS + 3000; t += 100) {
    e.setPositions([[0, 0, 0]]);
    e.tick(at + t);
  }
  assert.notEqual(e.target, null, '竜が誰も狙っていない(CPU が見えていない)');
  assert.ok(e.cpus.has(e.target), `狙っているのが CPU ではない: ${e.target}`);
  // 竜は巣から動き出している
  const d = e.view().dragon;
  assert.ok(Math.hypot(d.x - e.home.x, d.z - e.home.z) > 0.1, '竜が巣から動いていない');
});

// ---- ひとりで遊ぶ器 ----

test('ひとり: CPU を入れれば集まりが成立する', () => {
  const st = island('base');
  const m = new LocalMeet(st, { name: 'あなた', look: 1 });
  assert.ok(m.ok, '基本の島なのに受付が無い');
  // ひとりでは始められない
  m.command('enter', {}, 1_000_000);
  assert.equal(m.command('start', {}, 1_000_000).error, `${MIN_PLAYERS}人からです`);
  // CPU を入れれば始められる
  assert.ok(m.command('cpu', { n: 3 }).ok);
  for (let t = 0; t <= 30000; t += 100) m.tick(1_000_000 + t);
  assert.ok(m.command('start', {}, 1_030_000).ok, 'CPU を入れても始められない');
  const v = m.view(1_030_000);
  assert.equal(v.phase, 'running');
  assert.equal(v.cpus.length, 3);
  assert.ok(v.table, '手札が配られていない');
  // 名簿は自分 + CPU
  assert.equal(m.roster().length, 4);
  assert.equal(m.roster()[0].seat, SOLO_SEAT);
  // 体も出る
  assert.equal(m.walkers().length, 3);
});

// **もう全部の島に受付がある**ので、島の種類では試せない。
// 知らない島(壊れた設定・古い保存)でも落ちないことを見る。
test('ひとり: 受付の無い島では作らない', () => {
  const m = new LocalMeet({ ...island('sea'), mode: 'しらない島' });
  assert.equal(m.ok, false);
  assert.equal(m.view(), null);
  assert.equal(m.command('enter').error, 'この島に受付はありません');
  assert.deepEqual(m.walkers(), []);
});

test('ひとり: 4つの島ぜんぶで回る', () => {
  for (const mode of ['base', 'fish', 'dragon', 'cak']) {
    const m = new LocalMeet(island(mode));
    assert.ok(m.ok, `${mode} に受付が無い`);
    m.command('cpu', { n: 2 });
    m.command('enter', {}, 1_000_000);
    m.setMyPos(0, 0);
    for (let t = 0; t <= 20000; t += 100) m.tick(1_000_000 + t);
    assert.ok(m.command('start', {}, 1_020_000).ok, `${mode} で始められない`);
    for (let t = 0; t <= 30000; t += 200) m.tick(1_020_000 + t);
    const v = m.view(1_050_000);
    assert.ok(['running', 'result', 'entry', 'idle'].includes(v.phase), `${mode}: ${v.phase}`);
    assert.equal(v.rank.length >= 3, true, `${mode} の順位表に CPU が並ばない`);
  }
});

// 保存から読み戻しても、CPU は CPU のまま(人として数えない)
test('CPU: 保存から読み戻しても人と取り違えない', () => {
  const { e } = withCpus(DaifugoTable, 'base', 2);
  e.enter(0, 1_000_000);
  run(e, 30000);
  e.start(0, 1_030_000);
  const back = DaifugoTable.fromJSON(JSON.parse(JSON.stringify(e.toJSON())));
  assert.equal(back.cpuCount, 2);
  assert.deepEqual([...back.cpus].sort(), [...e.cpus].sort());
  assert.deepEqual(back.humanEntries(), [0]);
});

// 器そのものを試すための最小の継承(遊びの中身を持たない)
class MeetCoreStub extends MeetCore {
  constructor() { super({ ms: 60000 }); this.kind = 'fishing'; }
  _score() { return {}; }
  rankRows() { return []; }
}

// ---- 丸太乗り ----

// **CPU が丸太に乗って、落ちること。** 乗らなければ順位表に並ぶだけになり、
// 落ちなければ人がどう乗っても勝てなくなる。
test('CPU: 丸太乗りでは丸太に乗り、腕前ぶん残って落ちる', () => {
  const { e } = withCpus(LogRollContest, 'sea', 5);
  e.enter(0, 1_000_000);
  const at = 1_000_000;
  assert.ok(e.start(0, at).ok, 'はじめられない');
  // 乗った直後は全員が丸太の上(足場の上)にいる
  e.tick(at + 100);
  const course = makeCourse(e.seed);
  for (const [seat, x, z] of e.cpuPositions()) {
    const p = toLocal(e.anchor, x, z);
    const a = angleAt(p.x);
    assert.notEqual(a, null, `席${seat} が丸太の外に立った (${p.x.toFixed(2)})`);
    assert.ok(Math.abs(a) < DRUM_BAND && Math.abs(p.z) < DRUM_LEN / 2,
      `席${seat} が足場の外に立った`);
    assert.equal(holeOpen(course, a, p.z), false, `席${seat} が切れ目の上に立った`);
  }
  // 進めると、順に落ちていく
  run(e, ROLL_MS + 5000, 100, at);
  const out = [...e.cpus].filter((s) => e.scores.get(s)?.outAt);
  assert.ok(out.length >= 3, `${out.length}人しか落ちていない(勝負にならない)`);
  // 走り終わっていること。**result とは限らない** ── 早じまいすると
  // 25秒の結果表示も終わって受付へ戻っているので、走っていないことだけ見る。
  assert.notEqual(e.phase, 'running', '制限時間を過ぎても走り続けている');
});

// 腕前が効いていること。**同じなら順位表が意味を持たない。**
test('CPU: 丸太乗りは腕前で残る時間が変わる', () => {
  const { e } = withCpus(LogRollContest, 'sea', 6);
  e.enter(0, 1_000_000);
  const at = 1_000_000;
  e.start(0, at);
  e.fell(0, at + 100);           // 人はすぐ落ちる(CPU だけを見たい)
  run(e, ROLL_MS + 5000, 100, at);
  const times = [...e.cpus].map((s) => e.aliveMs(s, at + ROLL_MS));
  const spread = Math.max(...times) - Math.min(...times);
  assert.ok(spread > 4000, `残った時間がほぼ同じ: ${times.map((t) => (t / 1000).toFixed(1))}`);
  // 早い者から順に並ぶ
  const rows = e.rankRows(at + ROLL_MS + 5000);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].place <= rows[i].place, '順位が並んでいない');
  }
});

// 落ちた CPU は岸へ戻る(海の上に立ったままにならない)
test('CPU: 落ちた CPU は海の上に残らない', () => {
  const { e, st } = withCpus(LogRollContest, 'sea', 4);
  e.setHome(0, 0);
  e.enter(0, 1_000_000);
  const at = 1_000_000;
  e.start(0, at);
  run(e, 40000, 100, at);
  const ground = makeGround(st);
  for (const [seat, x, z] of e.cpuPositions()) {
    if (!e.scores.get(seat)?.outAt) continue;   // まだ乗っている子は丸太の上
    assert.equal(ground(x, z).ok, true, `落ちた席${seat} が海の上に立っている`);
  }
});
