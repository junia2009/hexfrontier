// 散策部屋の「集まり」の進行の器。
//
// 島ごとに何が開かれるかは src/minigame/meets.js の表で決まり、その中身
// (釣り大会・ドラゴンから逃げろ…)がこれを継承する。
//
// **進行はサーバーが持つ。** 締め切りや順位をクライアントに任せると、
// 端末の時計のずれや切断で食い違って「どっちが勝ったか」で揉める。
// ここが決めた view() を全員に配れば、全員が同じ表を見る。
//
// 器が持つのは受付と時間だけ:
//   idle → (誰か入る) entry → (誰かが始める) running → (時間切れ) result → …
// 得点の中身と順位の付け方は、継承したほうが _score / rankRows で決める。

import { CpuCrowd, CPU_MAX } from './cpu.js';
import { WALK_SEATS } from '../remote-st.js';

const PHASES = ['idle', 'entry', 'running', 'result'];

// 結果を見せている時間。過ぎたら受付に戻る
export const RESULT_MS = 25000;
// 開始に必要な人数(ひとりでは成立しない)。**CPU も頭数に入る** ──
// ひとりで島を歩いていても、CPU を入れれば遊べる。
export const MIN_PLAYERS = 2;

export { CPU_MAX };

export class MeetCore {
  constructor({ ms, resultMs = RESULT_MS, minPlayers = MIN_PLAYERS } = {}) {
    this.ms = ms;
    this.resultMs = resultMs;
    this.minPlayers = minPlayers;
    this.phase = 'idle';
    this.entries = new Set();          // エントリーした席(CPU も含む)
    this.scores = new Map();           // seat -> 継承先が決める中身
    this.endsAt = 0;                   // running/result の締め切り
    this.round = 0;                    // 何回目か(画面の作り直しの合図)
    // ---- CPU ----
    // 何人入れるかはオーナー(部屋のホスト)が決める。人の席を避けて、
    // 空いている席に座らせる ── 席番号でできているので、順位表も名簿も
    // 名前も、人の席とまったく同じ道を通る。
    this.hostSeat = -1;
    this.cpuCount = 0;
    this.taken = new Set();            // 人が座っている席
    this.cpus = new Set();             // CPU が座っている席
    this.crowd = null;                 // 体を動かすほう(島を渡されたら効く)
    this.island = null;                // 島の形(渡されるまで体は出ない)
  }

  get running() { return this.phase === 'running'; }

  // エントリーしている人(CPU を除く)。**器の畳みかたはこちらで見る** ──
  // CPU は常に entries に居るので、素の size で見ると人が全員抜けても
  // 受付が開いたままになり、誰も居ない島で CPU だけが遊び続ける。
  humanEntries() {
    return [...this.entries].filter((s) => !this.cpus.has(s));
  }

  // ---- CPU ----

  // ルールや CPU の数を決められる人。**クライアントの言い分ではなく
  // 部屋の名簿から渡す**(room-do がホストの席を取る)。
  setHost(seat) {
    this.hostSeat = Number.isInteger(seat) ? seat : -1;
  }

  // 人が座っている席。ここを避けて CPU を置く
  setTaken(seats) {
    this.taken = new Set((seats ?? []).filter((s) => Number.isInteger(s) && s >= 0));
    this._syncCpu();
  }

  // 島の形。渡すと CPU が体を持って島を歩く(渡さなければ順位表だけ)
  setIsland(state) {
    this.island = state ?? null;
    this._crowd().setIsland(state);
  }

  // 何人入れるか。オーナーだけ、始まる前だけ。
  setCpuCount(seat, n) {
    if (seat !== this.hostSeat) return { error: 'CPU を決めるのはホストです' };
    if (this.phase === 'running') return { error: '始まってからは変えられません' };
    const v = Math.max(0, Math.min(CPU_MAX, Math.floor(Number(n) || 0)));
    this.cpuCount = v;
    this._syncCpu();
    return { ok: true };
  }

  _crowd() {
    if (!this.crowd) this.crowd = new CpuCrowd(this.kind, { seed: this.cpuSeed ?? 1 });
    return this.crowd;
  }

  // CPU の席を決め直す。**人の席は絶対に奪わない。**
  //
  // 席は**後ろから**詰める。部屋(room-core)は前から順に人を座らせるので、
  // 後ろから取れば、あとから人が入ってきても当たりにくい ── 部屋は CPU の
  // ことを知らない(知らせると、集まりの都合で部屋の席が埋まることになる)
  // ので、ぶつからない置きかたで避ける。
  //
  // 走っている最中は席を入れ替えない(点の持ち主が変わってしまう)。
  // ただし**人に座られた席からは退く** ── 満席近くで人が入ってくると、
  // 同じ席に人と CPU が重なる。そのときは、その CPU には抜けてもらう。
  _syncCpu() {
    for (const s of [...this.cpus]) {
      if (this.taken.has(s)) { this.cpus.delete(s); this.dropSeat(s); }
    }
    if (this.phase === 'running') { this._crowd().sync([...this.cpus]); return; }
    const want = [];
    for (let s = WALK_SEATS - 1; s >= 0 && want.length < this.cpuCount; s--) {
      if (!this.taken.has(s)) want.push(s);
    }
    want.sort((a, b) => a - b);
    const next = new Set(want);
    // 減ったぶんはエントリーからも消す
    for (const s of this.cpus) if (!next.has(s)) { this.entries.delete(s); this.scores.delete(s); }
    this.cpus = next;
    for (const s of next) this.entries.add(s);
    this._crowd().sync(want);
    // 人が誰も居ないのに受付が開いたままにならないように
    if (this.phase === 'entry' && this.humanEntries().length === 0) this.phase = 'idle';
  }

  // CPU を動かす。tick から毎回呼ぶ(継承先が中身を足す)
  cpuStep(now) {
    if (!this.cpus.size) return;
    this._crowd().step(now, this._cpuCtx?.(now) ?? {});
    this._cpuPlay?.(now);
  }

  // CPU の体。位置リレーに差し込む形で返す
  cpuPositions() {
    return this.cpus.size ? this._crowd().positions() : [];
  }

  // CPU の名簿。人の席と同じ形(クライアントは区別せずに名前を引ける)
  cpuRoster() {
    return this.cpus.size ? this._crowd().roster() : [];
  }

  // ---- 受付 ----

  enter(seat, now = Date.now()) {
    if (!(seat >= 0)) return { error: '席がありません' };
    // 結果を見ている最中に入ったら、次の回の受付を始める
    if (this.phase === 'result') this._toEntry();
    if (this.phase === 'running') return { error: 'いま開催中です' };
    this.entries.add(seat);
    this.phase = 'entry';
    return { ok: true };
  }

  leave(seat) {
    if (this.phase === 'running') return { error: '開催中は取り消せません' };
    if (this.cpus.has(seat)) return { error: 'CPU は取り消せません' };
    this.entries.delete(seat);
    // 人が誰も居なくなったら受付を畳む。**CPU は数えない** ── 数えると、
    // 誰も居ない島で CPU だけが受付に並び続ける。
    if (this.humanEntries().length === 0 && this.phase === 'entry') this.phase = 'idle';
    return { ok: true };
  }

  // エントリーした人なら誰でも始められる(ホストを待たない)
  start(seat, now = Date.now()) {
    if (this.phase !== 'entry') return { error: 'いま始められません' };
    if (!this.entries.has(seat)) return { error: 'エントリーしていません' };
    if (this.entries.size < this.minPlayers) {
      return { error: `${this.minPlayers}人からです` };
    }
    this.phase = 'running';
    this.round += 1;
    this.endsAt = now + this.ms;
    this.scores = new Map();
    for (const s of this.entries) this.scores.set(s, this._score(now));
    this._onStart?.(now);
    return { ok: true };
  }

  // 器が受ける操作。**継承先は自分のぶんだけ見て、残りをここへ落とす。**
  // 受付・開始・CPU の人数はどの遊びでも同じなので、4か所に書き写さない。
  command(seat, what, msg, now = Date.now()) {
    if (what === 'enter') return this.enter(seat, now);
    if (what === 'leave') return this.leave(seat);
    if (what === 'start') return this.start(seat, now);
    if (what === 'cpu') return this.setCpuCount(seat, msg?.n);
    return { error: `不明な操作: ${what}` };
  }

  // ---- 時間 ----

  // 時間切れなら結果へ、結果を見せ終わったら受付へ。
  // 何か変わったら true(配り直す合図)。
  tick(now = Date.now()) {
    // CPU は受付でも動く(円卓へ歩き、櫓へ向かう)。ここで動かさないと、
    // 始まった瞬間に全員が湧いた場所から瞬間移動することになる。
    this.cpuStep(now);
    if (this.phase === 'running') {
      // 継承先が「時間前に終わらせたい」ときは true を返す(最後のひとり等)
      const early = this._step?.(now) === true;
      if (early || now >= this.endsAt) {
        this.phase = 'result';
        // 締め切りを結果の表示時間で上書きするので、**先に**終わった時刻を
        // 継承先へ渡す ── 渡さないと、結果を見せている 25 秒のあいだ
        // 「まだ生きている人」の記録が伸び続けて、順位が動く。
        this._onEnd?.(now);
        this.endsAt = now + this.resultMs;
        return true;
      }
      return false;
    }
    if (this.phase === 'result' && now >= this.endsAt) {
      this.phase = this.entries.size ? 'entry' : 'idle';
      return true;
    }
    return false;
  }

  // 部屋から抜けた人。開催中でも点は残さない(居ない人が優勝すると変)
  dropSeat(seat) {
    // || で繋ぐと短絡して、席は消えても点が残る(実際そうなっていた)
    const inEntries = this.entries.delete(seat);
    const inScores = this.scores.delete(seat);
    if (!inEntries && !inScores) return false;
    if (this.phase === 'entry' && this.humanEntries().length === 0) this.phase = 'idle';
    // 人が全員抜けたら流れる。**CPU だけ残っても続けない** ── 誰も見て
    // いない島で回り続けるだけで、サーバーが常駐する理由にしかならない。
    if (this.phase === 'running' && this.humanScores().length === 0) {
      this.phase = 'idle';
      this.endsAt = 0;
    }
    return true;
  }

  // 点を持っている人(CPU を除く)
  humanScores() {
    return [...this.scores.keys()].filter((s) => !this.cpus.has(s));
  }

  _toEntry() {
    this.phase = 'entry';
    this.entries = new Set();
    this.scores = new Map();
    this.endsAt = 0;
    // 次の回にも CPU は並んでいる(受付に戻るたびに入れ直させない)
    this._syncCpu();
  }

  // ---- 配る中身 ----

  // **席ごとに違うものを配る遊び**(手札を伏せる大富豪)だけが、
  // perSeat を立てて viewFor を上書きする。既定は全員に同じものなので、
  // 配る側(room-do)は1通だけ作って全員へ送れる。
  get perSeat() { return false; }

  viewFor(seat, now = Date.now()) {
    return this.view(now);
  }

  // 残り時間は「ミリ秒」で配る。締め切りの時刻を配ると、端末の時計が
  // ずれている人だけ違う残り時間を見ることになる。
  view(now = Date.now()) {
    return {
      kind: this.kind,
      phase: this.phase,
      round: this.round,
      entries: [...this.entries].sort((a, b) => a - b),
      remain: this.endsAt ? Math.max(0, this.endsAt - now) : 0,
      total: this.ms,
      minPlayers: this.minPlayers,
      rank: this.rankRows(now),
      // 誰がオーナーで、CPU が何人いて、その名簿。
      // **名簿を一緒に配る。** CPU は部屋の名簿に載らない(部屋の席では
      // ないので)ため、これが無いとクライアントが名前もすがたも引けない。
      hostSeat: this.hostSeat,
      cpuCount: this.cpuCount,
      cpuMax: CPU_MAX,
      cpus: this.cpuRoster(),
      ...(this._extraView?.(now) ?? {}),
    };
  }

  toJSON() {
    return {
      kind: this.kind,
      phase: this.phase,
      round: this.round,
      entries: [...this.entries],
      endsAt: this.endsAt,
      scores: [...this.scores.entries()],
      ms: this.ms,
      cpuCount: this.cpuCount,
      cpus: [...this.cpus],
    };
  }

  // 継承先の static fromJSON から呼ぶ。器のぶんだけ書き戻す。
  _load(o) {
    if (!o) return this;
    this.phase = PHASES.includes(o.phase) ? o.phase : 'idle';
    this.round = Number(o.round) || 0;
    this.entries = new Set(o.entries ?? []);
    this.endsAt = Number(o.endsAt) || 0;
    this.scores = new Map(o.scores ?? []);
    // **席そのものも読み戻す。** 人数だけだと、走っている最中に読み戻した
    // ときに CPU が人として数えられ(humanEntries)、人が全員抜けた回が
    // いつまでも畳まれない。座り直しは setTaken のあとの _syncCpu がやる。
    this.cpuCount = Math.max(0, Math.min(CPU_MAX, Number(o.cpuCount) || 0));
    this.cpus = new Set((o.cpus ?? []).filter((s) => Number.isInteger(s) && s >= 0));
    this._crowd().sync([...this.cpus]);
    this._syncCpu();
    return this;
  }
}
