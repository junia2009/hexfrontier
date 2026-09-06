// ひとりで島を歩くときの集まり。
//
// オンラインの部屋では、集まりの進行はサーバー(room-do.js)が回している。
// ひとりのときはサーバーが居ないので、**同じエンジンを手元で回す。**
// エンジン(meet-core.js とその継承)はもともとトランスポート非依存 ──
// WebSocket も Durable Object も知らない素の計算なので、そのまま動く。
//
// ここが room-do の代わりにやることは4つだけ:
//   - 島の形を渡す(種と島の種類から作る。サーバーと同じ引数)
//   - 一定間隔で tick を回す
//   - 席から来た操作をエンジンへ渡す
//   - CPU の体を「散策部屋から届いた位置」と同じ形で出す
//
// **自分はいつも席0。** ひとりなので取り合いにならないし、席0にしておけば
// オンラインと同じ道(seatName / 順位表 / 円卓の席決め)がそのまま通る。

import { FishingContest } from './fishing-contest.js';
import { DragonHunt } from './dragon-hunt.js';
import { RaidContest } from './raid-contest.js';
import { DaifugoTable } from './daifugo-table.js';
import { meetFor } from '../meets.js';
import { meetHome } from '../ground.js';

const ENGINES = {
  fishing: FishingContest, dragonhunt: DragonHunt, raid: RaidContest, daifugo: DaifugoTable,
};

// ひとりで歩くときの自分の席
export const SOLO_SEAT = 0;
// 進行を進める間隔。サーバーの位置リレー(walk-relay.js の TICK_MS)と揃える
export const LOCAL_TICK_MS = 100;

// 卓の通し番号。同じミリ秒に2つ作られても目印がぶつからないように
let seq = 0;

export class LocalMeet {
  // state は歩いている島そのもの(main.js の makeWalkIsland が作ったもの)。
  // **サーバーと同じ島**でないと、CPU が別の地面を歩くことになる。
  constructor(state, { name = 'あなた', look = 1 } = {}) {
    this.state = state;
    // この卓の目印。**通算の記録が「同じ回」を二重に数えないための鍵**に使う
    // (progress.js の addContestResult)。オンラインでは合言葉が鍵になるが、
    // ひとりのときは合言葉が無い ── 島に入り直すたびに回数が1から始まるので、
    // 目印が無いと「入り直して1回戦をもう一度」が数えられない。
    // Math.random() は使わない(この作りの決まり)。時刻と通し番号で足りる。
    this.id = `${Date.now().toString(36)}-${(seq += 1)}`;
    this.me = { seat: SOLO_SEAT, name, look, online: true };
    const meet = meetFor(state?.mode);
    const Engine = meet && ENGINES[meet.id];
    this.contest = Engine ? new Engine() : null;
    if (!this.contest) return;
    this.contest.setSeed?.(state.seed);
    // ひとりなので、オーナーは自分。CPU の人数も自分が決める
    this.contest.setHost(SOLO_SEAT);
    this.contest.setTaken([SOLO_SEAT]);
    this.contest.setIsland(state);
    if (this.contest.setHome) {
      const home = meetHome(state);
      this.contest.setHome(home.x, home.y);
    }
  }

  get ok() { return !!this.contest; }

  // 自分の位置。竜に追われるので、歩いた先を毎 tick 渡す
  setMyPos(x, z) {
    this.myPos = [SOLO_SEAT, x, z, 0, 0, 0, 0];
  }

  // 進める。戻り値は器の tick と同じ「段が変わった」の合図。
  // 描き直しは呼ぶ側が毎回やる ── ネットワークを跨がないので安いし、
  // 竜の位置や残り時間は段が変わらなくても動き続ける。
  tick(now = Date.now()) {
    if (!this.contest) return false;
    // 竜は全員の位置を見て動く。人は自分ひとりなので、それだけ渡す
    // (CPU のぶんはエンジンが自分で混ぜる ── dragon-hunt.js)。
    this.contest.setPositions?.(this.myPos ? [this.myPos] : []);
    return this.contest.tick(now);
  }

  // 席から来た操作。オンラインの net.contest(...) と同じ形で受ける
  command(what, msg = {}, now = Date.now()) {
    if (!this.contest) return { error: 'この島に受付はありません' };
    return this.contest.command(SOLO_SEAT, what, msg, now);
  }

  // 配る中身。オンラインで届く { t:'contest', contest } の中身と同じもの
  view(now = Date.now()) {
    return this.contest ? this.contest.viewFor(SOLO_SEAT, now) : null;
  }

  // CPU の体。散策部屋から届く walkers と同じ並び
  walkers() {
    return this.contest?.cpuPositions?.() ?? [];
  }

  // 名簿。自分と CPU。walk-mode の setWalkerNames がそのまま読める形
  roster() {
    return [this.me, ...(this.contest?.cpuRoster?.() ?? [])];
  }
}
