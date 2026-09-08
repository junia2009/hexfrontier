// 集まりに混ぜる CPU。
//
// **体を島の上に出す。** 順位表に名前が並ぶだけだと、誰も居ない島で数字が
// 勝手に伸びていくことになって気味が悪い。円卓には座らせ、櫓には立たせ、
// 桟橋では竿を出させ、竜からは逃げさせる。
//
// 島の形は state から作る(ground.js の makeGround / fishingSpots /
// watchPost / tableSeats)。サーバーもクライアントも同じ島を「種 + 島の
// 種類」から作れるので、**どちらで動かしても同じところに立つ**
// ── オンラインの部屋ではサーバーが、ひとりで歩くときは手元が動かす。
//
// **乱数はこの遊び専用の種**。対戦の state.rng は絶対に回さない
// (回すとオンライン対戦で全員の乱数列がずれる)。
//
// THREE も DOM も知らない。位置は数字の組で出すだけで、描くのは
// remote-view.js の仕事(人が歩いているのと同じ道を通る)。

import { makeRng, rngNext } from '../../rng.js';
import { WALK_SPEED } from '../motion.js';
import { s as sc } from '../scale.js';
import { ST, WALK_SEATS } from '../remote-st.js';
import { SPECIES } from '../species.js';
import {
  makeGround, meetHome, fishingSpots, watchPost, tableSeats, spawnPoint,
} from '../ground.js';
import {
  COURSE_W, LOG_COUNT, LOG_LEN, LOG_PITCH, LOG_R, logSolid, rollTime, safeZ, toWorld,
  upstreamFace,
} from '../logroll.js';

// 入れられる人数の上限。席の数から自分のぶんを引いたぶんまで
export const CPU_MAX = WALK_SEATS - 1;

// 名前。席番号で引くので、同じ席の CPU はいつも同じ名前になる
// (回を跨いで名前が入れ替わると、誰と遊んでいるのか分からなくなる)。
export const CPU_NAMES = [
  'あおい', 'かえで', 'さくら', 'つばき', 'なぎ', 'はると', 'みなと', 'ゆづき',
];

// すがた。人だけだと誰が CPU か分からないので、ひととおり散らす。
// SPECIES の id は通信に乗る番号なので、並びではなく id で持つ。
const LOOKS = SPECIES.map((sp) => sp.id);

export function cpuName(seat) {
  return CPU_NAMES[seat % CPU_NAMES.length];
}
export function cpuLook(seat) {
  return LOOKS[(seat * 3 + 1) % LOOKS.length];
}

// 名簿の1行。クライアントはこれを人の席と同じように扱える
// (seatName / seatIcon が同じ形を読む)。cpu の印だけが違う。
function cpuRosterRow(seat) {
  return { seat, name: cpuName(seat), look: cpuLook(seat), cpu: true, online: true };
}

// 歩く速さ。人より気持ち遅くして、追い抜けるようにする
const CPU_SPEED = WALK_SPEED * 0.88;
// 目的地に着いたと見なす距離
const ARRIVE = sc(0.10);
// まっすぐ行けないときに試す振り角(海や崖をよける)
const TRIES = [0, 0.5, -0.5, 1.0, -1.0, 1.7, -1.7, 2.5, -2.5];
// 1回の step で進めてよい時間の上限。タブが眠って dt が跳ねても飛ばない
const MAX_DT = 0.25;

// 大富豪で、CPU が考えているふりをする時間
export const THINK_MS = 900;

// 丸太乗り: 流れをどれだけ打ち消せるか。
// 下手でも 0.78 は返す ── 返せないと数秒で全員が同じ側から落ちて勝負にならない。
// **上手い子でも打ち消しきらない**(0.97)── 完全に返せると永久に落ちず、
// 人がどれだけうまく乗っても CPU に勝てなくなる。この幅だと、残る時間は
// おおよそ 10秒(下手)〜制限時間いっぱい(上手)に散る。
const ROLL_HOLD = [0.78, 0.97];
// 立て直しの揺らぎ(人が足踏みでずれるぶん)。速さと周期
const ROLL_WOBBLE = 0.22;
const ROLL_WOBBLE_HZ = [0.5, 1.1];
// 切れ目を何秒先まで読むか。腕前が高いほど早く動く
const ROLL_LOOK = [0.35, 1.3];

// 釣り: 1匹上げるまでの間合いと、上がる魚の大きさ。
// 人が本気で釣ると 3分で 10匹ほどなので、腕前で 6〜13匹あたりに収まるように。
const FISH_GAP_MS = [11000, 24000];
const FISH_CM = [18, 130];
// 蛮族を射る: 1秒あたりに伸びる点と、波が進む間合い。
// 上限(MAX_RATE=6/秒)にはぶつからない範囲で、人の上手い下手に重なるように。
const RAID_RATE = [0.5, 1.45];
const RAID_WAVE_MS = 15000;

// 腕前。席ごとに決まる(同じ席の CPU はいつも同じ強さ)ので、
// 「この子は強い」が回を跨いで通じる。
function skillOf(seat, base) {
  const [, v] = rngNext(makeRng((base ^ (seat * 2654435761)) >>> 0));
  return 0.25 + v * 0.75;   // 0.25〜1.0
}

const lerp = (a, b, k) => a + (b - a) * k;

export class CpuCrowd {
  constructor(kind, { seed = 1 } = {}) {
    this.kind = kind;
    this.base = makeRng(seed);
    this.island = null;      // { ground, home, spots, post }
    this.bodies = new Map(); // seat -> { x, z, y, facing, st, skill, ... }
    this.at = 0;             // 前に動かした時刻
  }

  // 島の形。**渡されなければ体は出さない**(順位表にだけ出る)。
  // 盤を持たない場所から動かしても壊れないように、無くても動くこと。
  setIsland(state) {
    if (!state) { this.island = null; return; }
    const ground = makeGround(state);
    const home = meetHome(state);
    this.island = {
      ground,
      home: { x: home.x, z: home.y },
      spots: fishingSpots(state),
      post: watchPost(state),
      spawn: (seat) => { const p = spawnPoint(state, seat); return { x: p.x, z: p.y }; },
    };
    // 既にいる子は島に立たせ直す(島を作り直したとき)
    for (const seat of [...this.bodies.keys()]) this._place(seat);
  }

  // いま CPU なのはどの席か。増えたぶんは島に立たせ、減ったぶんは片付ける。
  sync(seats) {
    const want = new Set(seats);
    for (const seat of [...this.bodies.keys()]) {
      if (!want.has(seat)) this.bodies.delete(seat);
    }
    for (const seat of want) {
      if (this.bodies.has(seat)) continue;
      this.bodies.set(seat, {
        seat,
        x: 0, z: 0, facing: 0,
        st: ST.walk,
        skill: skillOf(seat, this.base),
        // 遊びごとの持ち物(次に釣れる時刻・座る席など)
        nextAt: 0, spot: null, drift: 0, side: 0,
        // 丸太乗り: 筏を基準にした位置と、乗っているか・落ちたか
        lx: 0, lz: 0, wob: 0, onRaft: false, out: false,
      });
      this._place(seat);
    }
  }

  // 島の上に立たせる。島が無ければ原点のまま(位置は配らない)
  _place(seat) {
    const b = this.bodies.get(seat);
    if (!b || !this.island) return;
    const p = this.island.spawn(seat);
    b.x = p.x;
    b.z = p.z;
  }

  // ---- 動かす ----

  // now は時刻、ctx は遊びごとの手がかり。
  //   daifugo    { players: 席の並び }        … 円卓のどこに座るか
  //   dragonhunt { dragon: {x,z}, alive: Set } … 逃げる先
  step(now, ctx = {}) {
    if (!this.island) { this.at = now; return; }
    const dt = this.at ? Math.min(MAX_DT, (now - this.at) / 1000) : 0;
    this.at = now;
    // **dt = 0 でも本体は回す。** 1回目は必ず 0 になるが、そこで打ち切ると
    // 「乗る」「置く」といった移動でない仕事まで 1 tick 遅れる ── 丸太乗りでは
    // 始まった直後の 1 tick だけ、CPU が島の上に立ったまま写る。
    if (dt < 0) return;
    for (const b of this.bodies.values()) this._stepOne(b, dt, now, ctx);
  }

  _stepOne(b, dt, now, ctx) {
    if (this.kind === 'daifugo') return this._stepTable(b, dt, ctx);
    if (this.kind === 'fishing') return this._stepFish(b, dt);
    if (this.kind === 'raid') return this._stepPost(b, dt);
    if (this.kind === 'dragonhunt') return this._stepFlee(b, dt, now, ctx);
    if (this.kind === 'logroll') return this._stepRoll(b, dt, now, ctx);
  }

  // ---- 丸太乗り ----

  // その回の筏を受け取る。**始まるまでは乗せない**(筏は回っている間だけ
  // 海に浮いている)ので、ここでは持っておくだけ。
  setCourse(course, anchor, { players = [], shore = null } = {}) {
    this.course = course;
    this.rollAnchor = anchor;
    this.rollPlayers = players;
    this.shore = shore;
    for (const b of this.bodies.values()) { b.onRaft = false; b.out = false; }
  }

  // 落ちたか(器が拾って、人と同じ申告の口へ流す)
  hasFallen(seat) {
    return !!this.bodies.get(seat)?.out;
  }

  // 丸太の上で足踏みする。
  //
  // **人と同じ物差しで落ちる。** 位置は筏を基準にした座標(lx, lz)で持ち、
  // 足場があるかは logSolid ── 見た目だけ乗っているのに落ちない、という
  // ことにならないように、判定は人が踏んでいるものと同じ式を通す。
  _stepRoll(b, dt, now, ctx) {
    b.st = ST.walk;
    if (!this.course || !this.rollAnchor || !ctx.running) return;
    const t = rollTime(ctx.elapsed ?? 0);
    if (!b.onRaft) {
      // 乗る。人と同じ立ち位置(startSpots と同じ並び)へ置く
      const i = Math.max(0, this.rollPlayers.indexOf(b.seat));
      const log = this.course.logs[i % LOG_COUNT];
      const lane = Math.floor(i / LOG_COUNT);
      const want = (lane % 2 === 0 ? 1 : -1) * LOG_LEN * (0.3 + 0.08 * Math.floor(lane / 2));
      b.lx = log.x;
      b.lz = safeZ(log, 0, 3, want) ?? want;
      b.onRaft = true;
      b.out = false;
      b.wob = this._roll(b) * Math.PI * 2;
      this._placeRoll(b);
      return;
    }
    if (b.out) return;

    // いま乗っている丸太
    const i = Math.round(b.lx / LOG_PITCH + (LOG_COUNT - 1) / 2);
    const log = this.course.logs[Math.max(0, Math.min(LOG_COUNT - 1, i))];

    // 流れに逆らう。**打ち消しきらない**(腕前ぶん取りこぼす)ので、
    // うまい子ほど長く残るが、誰でもいつかは端へ寄っていく。
    // **猶予中(t <= 0)は流れない。** 人の側(courseGround)と揃える
    const drift = t > 0 ? log.spin * LOG_R : 0;
    const hold = lerp(ROLL_HOLD[0], ROLL_HOLD[1], b.skill);
    b.wob += dt * lerp(ROLL_WOBBLE_HZ[0], ROLL_WOBBLE_HZ[1], 1 - b.skill) * Math.PI * 2;
    const wobble = Math.sin(b.wob) * ROLL_WOBBLE * CPU_SPEED;
    b.lx += (drift * (1 - hold) + wobble) * dt;

    // 切れ目をよける。腕前が高いほど早く読む
    const look = lerp(ROLL_LOOK[0], ROLL_LOOK[1], b.skill);
    const want = safeZ(log, t, look, b.lz);
    if (want != null) {
      const d = want - b.lz;
      const step = Math.min(Math.abs(d), CPU_SPEED * dt);
      b.lz += Math.sign(d) * step;
    }

    // 落ちたか。**人と同じ判定**(筏の外か、足場が抜けているか)
    if (Math.abs(b.lx) > COURSE_W / 2 || !logSolid(log, b.lz, t)) {
      b.out = true;
      b.st = ST.fall;
      if (this.shore) { b.x = this.shore.x; b.z = this.shore.z; b.st = ST.walk; }
      return;
    }
    this._placeRoll(b);
  }

  // 筏の座標から世界の座標へ
  _placeRoll(b) {
    const w = toWorld(this.rollAnchor, b.lx, b.lz);
    b.x = w.x;
    b.z = w.z;
    // 丸太は全部同じ向きに回るので、どの本で測っても上流は同じ
    b.facing = upstreamFace(this.rollAnchor, this.course.logs[0]);
  }

  // 円卓へ歩いて、自分の席に座る。
  // **席の並びは人と同じ式**(ground.js の tableSeats)なので、CPU だけ
  // 卓からずれて座ることはない。
  _stepTable(b, dt, ctx) {
    const players = ctx.players ?? [];
    const i = players.indexOf(b.seat);
    if (i < 0) { b.st = ST.walk; return; }
    const seats = tableSeats(this.island.home, players.length);
    const spot = seats[i];
    if (this._walk(b, spot.x, spot.z, dt)) {
      b.st = ST.sit;
      b.facing = spot.face;
    } else {
      b.st = ST.walk;
    }
  }

  // 桟橋へ歩いて、竿を出す
  _stepFish(b, dt) {
    const spots = this.island.spots;
    if (!spots.length) return;
    if (!b.spot) b.spot = spots[b.seat % spots.length];
    if (this._walk(b, b.spot.x, b.spot.z, dt)) {
      b.st = ST.fish;
      b.facing = Math.atan2(b.spot.outX, b.spot.outZ);
    } else {
      b.st = ST.walk;
    }
  }

  // 櫓のそばに立って沖を見る。**同じ点に重ねない** ── 何人いるのか
  // 分からなくなるので、席の番号ぶん横へずらす。
  _stepPost(b, dt) {
    const post = this.island.post;
    if (!post) return;
    const side = ((b.seat % 4) - 1.5) * sc(0.30);
    const tx = post.x - post.outZ * side;
    const tz = post.z + post.outX * side;
    b.st = ST.walk;   // 弓の姿勢は配っていないので、着いても立ち姿のまま
    if (this._walk(b, tx, tz, dt)) b.facing = Math.atan2(post.outX, post.outZ);
  }

  // 竜から逃げる。**竜は飛んでいるので木も海も無視する**が、こちらは
  // 歩きなので陸から出られない ── まっすぐ逃げられないときは、
  // 逃げる向きから角度を振って歩ける方角を探す(_walk と同じ考え方)。
  _stepFlee(b, dt, now, ctx) {
    b.st = ST.walk;
    const d = ctx.dragon;
    // まだ飛び立っていないうちは、島の中をぶらぶらして散らばる
    if (!d) {
      if (!b.nextAt || now >= b.nextAt) {
        b.nextAt = now + 1500;
        b.drift = this._roll(b) * Math.PI * 2;
      }
      const step = CPU_SPEED * 0.5 * dt;
      this._push(b, b.drift, step);
      return;
    }
    // **まっすぐ逃げる。** 岸に突き当たったら _push が歩ける方角へ回して
    // くれるので、ここで「島の中心へ寄せる」ような細工はしない ── 入れて
    // いたころは、竜が自分と中心のあいだに居るときに竜へ向かって走っていた。
    //
    // 腕前は「どれだけ横に回り込むか」で出す。竜は曲がるのが下手なので、
    // 少し斜めに逃げるほうが振り切りやすい(人が上手に逃げるときと同じ)。
    const away = Math.atan2(b.x - d.x, b.z - d.z);
    if (!b.side) b.side = this._roll(b) < 0.5 ? -1 : 1;
    const dir = away + b.side * b.skill * 0.6;
    this._push(b, dir, CPU_SPEED * dt);
  }

  // 目的地へ一歩。着いていたら true。
  _walk(b, tx, tz, dt) {
    const dx = tx - b.x;
    const dz = tz - b.z;
    const d = Math.hypot(dx, dz);
    if (d < ARRIVE) return true;
    this._push(b, Math.atan2(dx, dz), Math.min(d, CPU_SPEED * dt));
    return false;
  }

  // 向き dir へ step だけ。海や崖なら角度を振って歩けるほうへ回す。
  _push(b, dir, step) {
    const g = this.island.ground;
    for (const off of TRIES) {
      const a = dir + off;
      const nx = b.x + Math.sin(a) * step;
      const nz = b.z + Math.cos(a) * step;
      if (!g(nx, nz).ok) continue;
      b.x = nx;
      b.z = nz;
      b.facing = a;
      return true;
    }
    return false;   // 四方が海。その場で立ち止まる
  }

  // その子だけの乱数を1つ進める(席ごとに独立)
  _roll(b) {
    const [s, v] = rngNext(b.rng ?? makeRng((this.base ^ (b.seat * 40503)) >>> 0));
    b.rng = s;
    return v;
  }

  // ---- 遊びごとの中身 ----

  // 釣り: 上げどきなら [cm] を返す。まだなら null。
  fishCatch(seat, now) {
    const b = this.bodies.get(seat);
    if (!b || b.st !== ST.fish) return null;
    if (!b.nextAt) { b.nextAt = now + this._gap(b); return null; }
    if (now < b.nextAt) return null;
    b.nextAt = now + this._gap(b);
    const k = lerp(0.25, 1, b.skill) * this._roll(b);
    return Math.round(lerp(FISH_CM[0], FISH_CM[1], k));
  }

  _gap(b) {
    // 腕前が高いほど間合いが短い。ゆらぎも入れて、毎回同じ秒数にしない
    const k = 1 - b.skill * 0.7;
    return Math.round(lerp(FISH_GAP_MS[0], FISH_GAP_MS[1], k) * (0.75 + this._roll(b) * 0.5));
  }

  // 蛮族を射る: 始めてからの経過に応じた「いまの合計」と波
  raidScore(seat, elapsedMs) {
    const b = this.bodies.get(seat);
    if (!b) return null;
    // 櫓に着くまでは撃てない
    if (b.st !== ST.walk) return null;
    const rate = lerp(RAID_RATE[0], RAID_RATE[1], b.skill);
    const sec = Math.max(0, elapsedMs) / 1000;
    return {
      score: Math.floor(sec * rate),
      wave: 1 + Math.floor(sec * 1000 / RAID_WAVE_MS),
    };
  }

  // 大富豪: もう打ってよいか(考えているふりの間合い)
  thinkDone(now, actedAt) {
    return now - actedAt >= THINK_MS;
  }

  // ---- 配る ----

  // 位置リレーに差し込む形。walk-relay.js の snapshot と同じ並び:
  //   [席, x, z, y, 向き, 状態, エモート]
  //
  // **y は「地面からの高さ」で、地面の高さそのものではない。**
  // 受け取る側(remote-view.js)が `地面 + y` で置くので、地面の高さを
  // 送ると二重に足されて宙に浮く(実際そうなっていた ── 卓に着いた画面で、
  // 向かいの CPU の足だけが空に見えた)。CPU は跳ばないので常に 0。
  positions() {
    if (!this.island) return [];
    return [...this.bodies.values()]
      .map((b) => [b.seat, round2(b.x), round2(b.z), 0, round2(b.facing), b.st, 0])
      .sort((a, b) => a[0] - b[0]);
  }

  // 名簿。人の席と同じ形で返す
  roster() {
    return [...this.bodies.keys()].sort((a, b) => a - b).map(cpuRosterRow);
  }
}

const round2 = (v) => Math.round(v * 100) / 100;
