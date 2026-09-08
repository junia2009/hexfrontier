// 丸太乗り(航海者たちの島の集まり)。トランスポート非依存。
//
// 沖に浮かぶ回る丸太の上で生き残る。**順位は生き残った時間**で、最後の
// ひとりになったら時間を待たずに終わる ── ドラゴンから逃げろ(dragon-hunt.js)
// とまったく同じ形なので、器の使いかたもそちらに揃えてある。
//
// 竜と違うのは**誰が落ちたかを見る人**。竜はサーバーが位置を見て捕まえるが、
// こちらは各自の端末の当たり判定(logroll.js の地面)が「落ちた」を知っている。
// 位置リレーは 10回/秒の飛び飛びなので、サーバーで見ると落ちた瞬間がずれる。
// 釣り大会・蛮族を射ると同じで、**落ちたことは各自が申告する**。
// 申告できるのは「落ちた」だけで、時刻はサーバーが打つので、生き残った時間を
// 水増しすることはできない。
//
// 筏そのものは**種から作る**(logroll.js の makeCourse)ので配らない。
// 配るのは種と、島のどこに浮かべたか(anchor)だけ。

import { MeetCore, RESULT_MS, MIN_PLAYERS } from './meet-core.js';
import { makeRng, rngNext } from '../../rng.js';
import { makeGround } from '../ground.js';
import { ROLL_MS, GRACE_MS, findAnchor, makeCourse, startSpots } from '../logroll.js';

export { RESULT_MS, MIN_PLAYERS, ROLL_MS, GRACE_MS };

// その回の筏を決める種。部屋の種と「何回目か」から作るので、
// 同じ部屋で2回目を開いても同じ並びにならない。
export function courseSeed(base, round) {
  let s = makeRng(base);
  for (let i = 0; i < round; i++) [s] = rngNext(s);
  return makeRng(s);
}

export class LogRollContest extends MeetCore {
  constructor(opts = {}) {
    super({ ms: ROLL_MS, ...opts });
    this.kind = 'logroll';
    this.base = 1;        // 部屋の種
    this.seed = 0;        // その回の筏の種。始まるまでは 0
    this.anchor = null;   // 筏を浮かべた場所 { x, z, angle }
    this.shore = { x: 0, z: 0 };  // 落ちた人が戻る岸
    this.endedAt = 0;     // 回が終わった時刻(生き残りの記録をここで止める)
    this.startedAt = 0;
  }

  _score(now) { return { outAt: 0, startedAt: now }; }

  setSeed(seed) {
    this.base = makeRng(Number(seed) || 1);
  }

  // 島の形。**筏を浮かべる場所はここで決める** ── 盤ごとに海の空きかたが
  // 違うので、島を渡されて初めて決まる(器が持つ setIsland に相乗りする)。
  setIsland(state) {
    super.setIsland(state);
    if (!state) { this.anchor = null; return; }
    const ground = makeGround(state);
    this.anchor = findAnchor(ground);
    this._syncCourse();
  }

  // 落ちた人が戻る岸。room-do が島の中心から渡す
  setHome(x, z) {
    this.shore = { x: Number(x) || 0, z: Number(z) || 0 };
  }

  _onStart(now) {
    this.seed = courseSeed(this.base, this.round);
    this.startedAt = now;
    this.endedAt = 0;
    this._syncCourse();
  }

  _onEnd(now) { this.endedAt = now; }

  // CPU が乗る筏を渡し直す(人数が変わっても同じ筏の上に立たせる)
  _syncCourse() {
    if (!this.anchor || !this.seed) return;
    this._crowd().setCourse?.(makeCourse(this.seed), this.anchor, {
      players: [...this.entries].sort((a, b) => a - b),
      shore: { ...this.shore },
    });
  }

  // ---- 落ちた ----

  // 落ちたのは各自の端末が知っている。**時刻はここで打つ。**
  fell(seat, now = Date.now()) {
    if (this.phase !== 'running') return { ok: true, quiet: true };
    const s = this.scores.get(seat);
    if (!s) return { error: 'エントリーしていません' };
    if (s.outAt) return { ok: true, quiet: true };   // 二重申告は黙って捨てる
    s.outAt = Math.min(now, this.endsAt);
    return { ok: true };
  }

  command(seat, what, msg, now = Date.now()) {
    if (what === 'fell') return this.fell(seat, now);
    return super.command(seat, what, msg, now);
  }

  // まだ落ちていない席
  aliveSeats() {
    return [...this.scores.entries()].filter(([, s]) => !s.outAt).map(([seat]) => seat);
  }

  // ひとり以下になったら時間を待たずに終わり(竜と同じ)
  _step(now) {
    return this.aliveSeats().length <= 1;
  }

  // ---- CPU ----

  _cpuCtx(now) {
    return { elapsed: now - this.startedAt, running: this.phase === 'running' };
  }

  // 落ちた CPU を拾って、人と同じ口(fell)へ流す
  _cpuPlay(now) {
    if (this.phase !== 'running') return;
    for (const seat of this.cpus) {
      if (this._crowd().hasFallen?.(seat)) this.fell(seat, now);
    }
  }

  // ---- 配る ----

  // 生き残った時間。まだ乗っているなら「いまの時点まで」。
  aliveMs(seat, now) {
    const s = this.scores.get(seat);
    if (!s) return 0;
    const end = s.outAt || this.endedAt || Math.min(now, this.endsAt);
    return Math.max(0, end - s.startedAt);
  }

  rankRows(now = Date.now()) {
    const rows = [...this.scores.keys()]
      .map((seat) => ({
        seat,
        ms: this.aliveMs(seat, now),
        alive: !this.scores.get(seat).outAt,
      }))
      .sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || b.ms - a.ms || a.seat - b.seat);
    // 同じ時間まで残ったら同率。竜と同じ数えかたを通す
    return placeByAlive(rows);
  }

  // 筏を組み立てるのに要るものだけ配る(丸太そのものは種から作れる)
  _extraView() {
    return {
      seed: this.seed,
      anchor: this.anchor ? { ...this.anchor } : null,
      shore: { ...this.shore },
      grace: GRACE_MS,
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      base: this.base,
      seed: this.seed,
      anchor: this.anchor,
      shore: this.shore,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
    };
  }

  static fromJSON(o) {
    const c = new LogRollContest({ ms: o?.ms ?? ROLL_MS })._load(o);
    c.base = makeRng(Number(o?.base) || 1);
    c.seed = Number(o?.seed) || 0;
    c.anchor = o?.anchor ?? null;
    c.shore = o?.shore ?? { x: 0, z: 0 };
    c.startedAt = Number(o?.startedAt) || 0;
    c.endedAt = Number(o?.endedAt) || 0;
    return c;
  }
}

// 生き残りの順位。**逃げ切った人どうしは同率**、落ちた人は時間の長い順。
// 竜(contest.js の huntAhead)と同じ考えかただが、あちらは「捕まった」で
// こちらは「落ちた」なので、名前だけ変えて同じ数えかたを通す。
function placeByAlive(rows) {
  const out = [];
  let place = 0;
  let seen = 0;
  let prev = null;
  for (const r of rows) {
    seen += 1;
    const key = r.alive ? 'alive' : r.ms;
    if (prev === null || key !== prev) { place = seen; prev = key; }
    out.push({ ...r, place });
  }
  return out;
}
