// ドラゴンから逃げろ(src/minigame/meet/dragon-hunt.js)。
//
// 竜を動かすのも捕まえるのもサーバーなので、「どっちが勝ったか」で
// 揉めないための決まりごとを、ここで押さえる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DragonHunt, HUNT_MS, GRACE_MS, DRAGON_SPEED, CATCH_R,
} from '../src/minigame/meet/dragon-hunt.js';
import { WALK_SPEED } from '../src/minigame/motion.js';
import { fleePick } from '../src/minigame/contest.js';

const at = (t) => t;
// 2人でエントリーして始めたところまで進める
function started(now = 0, opts = {}) {
  const h = new DragonHunt(opts);
  h.setHome(0, 0);
  h.enter(0, at(now));
  h.enter(1, at(now));
  h.start(0, at(now));
  return h;
}
// 位置を置いて、猶予明けから ms ぶん回す(100ms 刻み = 実物の tick と同じ)
function run(h, from, ms, place) {
  for (let t = from; t <= from + ms; t += 100) {
    place(h, t);
    h.tick(at(t));
  }
}

// 竜が届かないうちに時間切れになる回。順位の付け方そのものを見る。
// (立ち止まっていると速さに関係なくいずれ捕まるので、短い回で見る)
test('竜: 誰も捕まらずに時間切れなら全員1位(同率)', () => {
  const ms = GRACE_MS + 1000;   // 飛べるのは1秒だけ = 0.8 タイルぶん
  const h = started(0, { ms });
  run(h, 0, ms, (x) => x.setPositions([[0, -6, 0], [1, 6, 0]]));
  h.tick(at(ms + 1));
  assert.equal(h.phase, 'result', '時間で終わらない');
  const rank = h.view(at(ms + 1)).rank;
  assert.deepEqual(rank.map((r) => r.place), [1, 1], `逃げ切ったのに順位が付いた: ${JSON.stringify(rank)}`);
  assert.ok(rank.every((r) => r.alive), '逃げ切ったのに捕まった扱い');
});

// 速さの釣り合い。立ち止まれば捕まり、歩き続ければ捕まらない ──
// これが崩れると鬼ごっことして成立しない。
test('竜: 立ち止まれば捕まり、歩き続ければ捕まらない', () => {
  const stand = started(0);
  run(stand, 0, GRACE_MS + 12000, (x) => x.setPositions([[0, 3, 0], [1, -3, 0]]));
  assert.ok(stand.scores.get(0).caughtAt || stand.scores.get(1).caughtAt,
    '立ち止まっていても誰も捕まらない(竜が遅すぎる)');

  // まっすぐ逃げ続ける。竜は 0.82 倍なので距離は開く一方
  const flee = started(0);
  let a = 3;
  let b = -3;
  run(flee, 0, GRACE_MS + 12000, (x, t) => {
    if (t > GRACE_MS) { a += WALK_SPEED * 0.1; b -= WALK_SPEED * 0.1; }
    x.setPositions([[0, a, 0], [1, b, 0]]);
  });
  assert.equal(flee.scores.get(0).caughtAt, 0, '歩いて逃げたのに捕まった');
  assert.equal(flee.scores.get(1).caughtAt, 0, '歩いて逃げたのに捕まった');
});

test('竜: 中心に立ち止まっていたら捕まる', () => {
  const h = started(0);
  // 0番は竜の目の前でじっとしている。1番は遠く
  run(h, 0, GRACE_MS + 4000, (x, t) => x.setPositions([[0, 0.05, 0], [1, 6, 0]]));
  const s = h.scores.get(0);
  assert.ok(s.caughtAt > 0, '目の前にいるのに捕まらない');
  assert.ok(s.caughtAt >= GRACE_MS, `猶予中に捕まった: ${s.caughtAt}`);
});

test('竜: 猶予のあいだは動かない', () => {
  const h = started(0);
  run(h, 0, GRACE_MS - 500, (x, t) => x.setPositions([[0, 0.05, 0], [1, 6, 0]]));
  assert.deepEqual(
    { x: h.dragon.x, z: h.dragon.z }, { x: 0, z: 0 },
    '猶予中に竜が動いた',
  );
  assert.equal(h.scores.get(0).caughtAt, 0, '猶予中に捕まえた');
});

test('竜: 最後のひとりになったら時間前でも終わる', () => {
  const h = started(0);
  run(h, 0, GRACE_MS + 6000, (x, t) => x.setPositions([[0, 0.05, 0], [1, 6, 0]]));
  assert.equal(h.phase, 'result', `まだ ${h.phase}`);
  const rank = h.view(at(GRACE_MS + 6000)).rank;
  assert.equal(rank[0].seat, 1, '逃げ切った人が1位でない');
  assert.equal(rank[0].place, 1);
  assert.equal(rank[1].place, 2, '捕まった人が2位でない');
});

test('竜: 位置がまだ届いていなくても落ちない', () => {
  const h = started(0);
  run(h, 0, GRACE_MS + 2000, (x) => x.setPositions([]));
  assert.equal(h.phase, 'running');
  assert.equal(h.scores.get(0).caughtAt, 0);
  // 壊れた値も弾く
  h.setPositions([[0, 'あ', 0], null, [9], [1, NaN, 1]]);
  h.tick(at(GRACE_MS + 2100));
  assert.equal(h.pos.size, 0, '壊れた位置が入った');
});

test('竜: 抜けた人は順位に残らない', () => {
  const h = started(0);
  run(h, 0, GRACE_MS + 1000, (x) => x.setPositions([[0, 3, 0], [1, -3, 0]]));
  assert.equal(h.dropSeat(1), true);
  const rank = h.view(at(GRACE_MS + 1000)).rank;
  assert.equal(rank.length, 1, '抜けた人が順位に残っている');
  assert.equal(rank[0].seat, 0);
});

test('竜: 竜の位置も配る(全員が同じ竜を見る)', () => {
  const h = started(0);
  run(h, 0, GRACE_MS + 1500, (x) => x.setPositions([[0, 3, 0], [1, -3, 0]]));
  const v = h.view(at(GRACE_MS + 1500));
  assert.equal(typeof v.dragon.x, 'number');
  assert.equal(typeof v.dragon.a, 'number');
  assert.ok(Math.hypot(v.dragon.x, v.dragon.z) > 0, '竜が中心から動いていない');
  assert.equal(v.kind, 'dragonhunt');
});

test('竜: 保存して読み戻しても竜の居場所が変わらない', () => {
  const h = started(0);
  run(h, 0, GRACE_MS + 2000, (x) => x.setPositions([[0, 3, 0], [1, -3, 0]]));
  const back = DragonHunt.fromJSON(JSON.parse(JSON.stringify(h.toJSON())));
  assert.deepEqual(back.view(at(GRACE_MS + 2000)), h.view(at(GRACE_MS + 2000)));
});

test('竜: ひとりでは始まらない', () => {
  const h = new DragonHunt();
  h.enter(0, at(0));
  assert.ok(h.start(0, at(0)).error, 'ひとりで始まった');
  h.enter(1, at(0));
  assert.ok(h.start(0, at(0)).ok);
});

test('竜: 申告する操作は無い(サーバーが全部見ている)', () => {
  const h = started(0);
  assert.ok(h.command(0, 'land', { cm: 500 }).error, '釣果を受け付けてしまった');
});

// 秒でまるめる意味。ほぼ同時に捕まったのに、数ミリ秒の差で順位が付くと
// 「なんで自分が下なの」になる。同じ秒まで生き残ったら同率にする。
test('竜: ほとんど同時に捕まったら同率', () => {
  const h = started(0);
  h.scores.get(0).caughtAt = GRACE_MS + 5000;
  h.scores.get(1).caughtAt = GRACE_MS + 5200;   // 0.2秒差
  const rank = h.view(at(GRACE_MS + 6000)).rank;
  assert.deepEqual(rank.map((r) => r.place), [1, 1], `0.2秒差で順位が付いた: ${JSON.stringify(rank)}`);
  // 1秒以上ちがえば順位は付く
  h.scores.get(0).caughtAt = GRACE_MS + 3000;
  const rank2 = h.view(at(GRACE_MS + 6000)).rank;
  assert.deepEqual(rank2.map((r) => r.place), [1, 2], '2秒差なのに同率になった');
});

// 猶予のあいだに相手が部屋を抜けると、竜が飛び立つ前にひとりになる。
// そこで止めないと、ひとりだけの鬼ごっこが最後まで続く。
test('竜: 猶予中に相手が抜けたら、その場で終わる', () => {
  const h = started(0);
  h.setPositions([[0, 3, 0], [1, -3, 0]]);
  h.tick(at(500));
  assert.equal(h.phase, 'running');
  h.dropSeat(1);
  h.tick(at(1000));
  assert.equal(h.phase, 'result', `ひとりになっても ${h.phase} のまま`);
});

// 結果は25秒見せる。そのあいだ「逃げきった人」の記録が伸び続けると、
// 順位表の秒数が動き、丸めの境目をまたいで同率が付いたり消えたりする。
test('竜: 結果を見せているあいだ、記録も順位も動かない', () => {
  const ms = GRACE_MS + 2000;
  const h = started(0, { ms });
  run(h, 0, ms, (x) => x.setPositions([[0, -6, 0], [1, 0.05, 0]]));
  h.tick(at(ms + 1));
  assert.equal(h.phase, 'result');
  const first = h.view(at(ms + 100)).rank;
  const later = h.view(at(ms + 20000)).rank;
  assert.deepEqual(later, first, '結果を見ているあいだに順位表が変わった');
});

// 「逃げきり」と「捕まった」は、秒がどう転んでも入れ替わらない。
// 最後のひとりになった回は、捕まった直後に終わるので秒はほぼ同じになる。
test('竜: 逃げきりは、捕まった人と同率にならない', () => {
  const h = started(0);
  h.scores.get(0).caughtAt = 30000;   // 捕まった
  h.endedAt = 30100;                  // その 0.1 秒後に回が終わった
  const rank = h.view(at(40000)).rank;
  const alive = rank.find((r) => r.alive);
  const caught = rank.find((r) => !r.alive);
  assert.equal(alive.place, 1, '逃げきったのに1位でない');
  assert.equal(caught.place, 2, `捕まったのに ${caught.place} 位`);
});

// ---- 逃げ先の選びかた(fleePick)----
//
// CPU(meet/cpu.js)とあそびかたデモの自動運転が、両方ここを通る。
//
// **実測で見つけた穴が2つある。**
//   1. 竜の逆へまっすぐ逃げると**海に落ちる**。短編の順位も生き残り時間も
//      1位のまま、絵は水の中で「🌊 海に落ちた!」が出ていた
//      ── 数字だけ見ていたら通っていた。
//   2. 「逆向きにいちばん近い、歩ける向き」にすると**岸に沿って走り、
//      行き止まりの岬に入って捕まる**(13〜31 秒で袋小路)。
// だから「どこまで歩けるか」も見て選ぶ。ここはその2つを押さえる。

// 半径 r の丸い島。おまけで、細くて行き止まりの岬を生やせる
function isle(r = 4, spit = null) {
  return (x, z) => {
    if (Math.hypot(x, z) <= r) return true;
    if (!spit) return false;
    // spit: { a(向き), len(長さ), w(半幅) } ── 島の縁から生える細い道
    const sn = Math.sin(spit.a);
    const c = Math.cos(spit.a);
    const along = x * sn + z * c;              // 岬に沿った距離
    const side = x * c - z * sn;               // 岬の横へのずれ
    return along > 0 && along <= r + spit.len && Math.abs(side) <= spit.w;
  };
}

// その向きへ d だけ進んだ先
const step = (x, z, a, d) => [x + Math.sin(a) * d, z + Math.cos(a) * d];

test('竜: 逃げ先は必ず陸(まっすぐ逃げると海でも、海は選ばない)', () => {
  const ok = isle(4);
  // 島の北の縁に立っていて、竜は真南 ── 「逆へまっすぐ」は海
  const [x, z] = [0, 3.6];
  const dragon = { x: 0, z: 0 };
  const a = fleePick(x, z, dragon, ok);
  assert.ok(a != null, '陸があるのに逃げ先が見つからない');
  for (const d of [0.5, 1, 1.5]) {
    assert.ok(ok(...step(x, z, a, d)),
      `${d} 進んだ先が海(向き ${a.toFixed(2)})── 「海に落ちた!」が出る`);
  }
});

test('竜: 行き止まりの岬には入らない', () => {
  // 北へ細い岬。立っているのは島の中、竜は南 ── 素直に逃げると岬へ入る
  const ok = isle(4, { a: 0, len: 0.6, w: 0.35 });
  const dragon = { x: 0, z: -3 };
  const a = fleePick(0, 3.2, dragon, ok);
  assert.ok(a != null, '逃げ先が見つからない');
  // 岬(ほぼ真北)を選んでいないこと。±25度を岬とみなす
  assert.ok(Math.abs(a) > 0.44 && Math.abs(a - Math.PI * 2) > 0.44,
    `行き止まりの岬(北)へ逃げようとしている(向き ${a.toFixed(2)})`);
  // それでも竜からは離れる側を選んでいる(北寄り = cos > 0)
  assert.ok(Math.cos(a) > 0, `竜のほうへ走っている(向き ${a.toFixed(2)})`);
});

test('竜: どこへも歩けなければ何も返さない', () => {
  assert.equal(fleePick(0, 0, { x: 1, z: 1 }, () => false), null,
    '海しか無いのに逃げ先を返した(海へ走り込む)');
});

test('竜: 竜がまだ居なくても、歩ける向きは返す', () => {
  const a = fleePick(0, 0, null, isle(4));
  assert.ok(a != null, '竜が飛び立つ前に固まってしまう');
});
