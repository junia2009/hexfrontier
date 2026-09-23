// 魚の相場 ── その日の買い取り値(設計書 §12)。
//
// **日替わりで、魚ごとに値段が上下する。** 今日はアジが高い、明日はタイが高い。
// 「今日は何を狙うか」という選びかたが毎日1つ増える ── 釣りそのものは
// まったく変わらないのに、行き先を考える理由ができる。
//
// 決めごと:
//
//   1. **日付だけで決まる。** 誰が開いても、いつ開いても同じ相場。
//      乱数の種は「日 + 魚の id」だけ ── 端末ごとに違うと、
//      掲示板に出ている値と手に入る額がずれる。
//   2. **釣りやすさは1ミリも変わらない。** 動くのは値段だけ。図鑑も
//      自己最高も大会の申告も、相場とは無関係(shop.js の線引きと同じ)。
//   3. **ならすと今までと同じ。** 倍率の平均はちょうど 1.0(下の BAG)。
//      高い日が続いて全体が値上がりする、という形にはしない ──
//      道具や飾りの値付けを相場のたびに見直すことになる。
//   4. **昔の釣果には掛けない。** さかのぼりの換算(coinsForPastCatches)は
//      素の値のまま。掛けてしまうと、いつアプリを開いたかで
//      もらえる額が変わる。
//
// 日の変わり目は掲示板の依頼と同じ(quests.js の dayIndex。UTC+9 固定)。
// **端末の時計の地域は見ない** ── 旅先で日付が飛ぶと相場も飛ぶ。

import { makeRng, rngInt } from './rng.js';
import { FISH, FISH_BY_ID } from './minigame/fish.js';
import { dayIndex } from './quests.js';

// 倍率のくじ。**合計がちょうど 20.0(= 20個の平均が 1.0)**。
// 下振れを多めに、上振れを少なく長く ── 「たまに来る高値の日」を
// 待つ形にしたいので、いつも高いより、まれに大きいほうがよい。
//
// **ここを触ったら合計を数え直すこと。** 平均が 1 からずれると、
// 相場を入れただけで島の物価が動く(test/market.test.js が見張っている)。
export const BAG = [
  0.5, 0.6, 0.6, 0.7, 0.7, 0.8, 0.8, 0.8, 0.9, 0.9,
  1.0, 1.0, 1.1, 1.1, 1.2, 1.2, 1.3, 1.4, 1.6, 1.8,
];

// 相場の呼びかた。**高い順に見て、最初に当たったものを使う。**
//
// flat は「動いていない日」の印。**釣果の札には出さない** ── 毎回
// 「平年なみ」が出ると読み飛ばすようになって、高値の日に気づけなくなる。
// 掲示板は表なので、そこには出す(並びの中で意味がある)。
export const BANDS = [
  { min: 1.5, label: '大漁景気', icon: '🎉', up: true },
  { min: 1.15, label: '高値', icon: '📈', up: true },
  { min: 0.85, label: '平年なみ', icon: '〜', up: false, flat: true },
  { min: 0.65, label: '安値', icon: '📉', up: false },
  { min: 0, label: '買いたたき', icon: '📉', up: false },
];

export function bandOf(rate) {
  return BANDS.find((b) => rate >= b.min) ?? BANDS[BANDS.length - 1];
}

// 文字列から種をつくる。**日と魚の id の両方を混ぜる** ── 日だけだと
// 全部の魚が同じ倍率になり、魚の id だけだと毎日同じ値段になる。
//
// **ここの混ぜかたは何であってもよい。** 求めるのは「散らばっていること」と
// 「同じ入力なら同じ値」だけで、どの日にどの魚がいくらになるかは決めごとでは
// ない。だから故障注入でこのループの境目を1つずらしても、どのテストも
// 落ちない(相場は別の並びになるが、平均も散らばりも決定性も保たれる)──
// 捕まえようとすると「この日のアジは 0.9」と書くことになり、それは
// テストではなく**たまたま出た値の書き写し**になる。等価変異として残す。
function seedOf(day, fishId) {
  let h = 2166136261;
  const s = `${day}:${fishId}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// その日のその魚の倍率。
//
// **1.0 は「相場が無い」と同じ意味**にしてある ── 知らない魚と、
// ガラクタ(長ぐつ・海そう・空きびん)は必ず 1.0。ガラクタは売り物では
// ないので掲示板にも出さないのに、額だけ動くと理由が見えない。
export function marketRate(fishId, now = Date.now()) {
  if (!fishId || typeof fishId !== 'string') return 1;
  const fish = FISH_BY_ID[fishId];
  if (!fish || fish.tier === 'junk') return 1;
  const day = dayIndex(now);
  const [, i] = rngInt(makeRng(seedOf(day, fishId)), BAG.length);
  return BAG[i];
}

// その日の相場ぜんぶ。高い順。
//
// **行けない魚は出さない。** 出しても広告にしかならない:
//
//   - gates は店の品で開く場所({ deep, night })。深場の竿を持っていない
//     人に「シーラカンスが高値」と言っても、行きようがない。
//   - ports はいまの島にある港の種類。ぬし(f.at)はその港にしか出ない ──
//     **島は歩くたびに作り直される**ので、今日その港が無ければ今日は釣れない。
//     渡さなければ絞らない。
export function marketToday(now = Date.now(), gates = {}, ports = null) {
  const open = (f) => (!f.deep || gates.deep) && (!f.night || gates.night)
    && (!f.at || !ports || ports.includes(f.at));
  return FISH
    .filter((f) => f.tier !== 'junk' && open(f))
    .map((f) => ({
      id: f.id, name: f.name, icon: f.icon, at: f.at ?? null, rate: marketRate(f.id, now),
    }))
    .sort((a, b) => b.rate - a.rate || a.id.localeCompare(b.id));
}

// 掲示板に出すぶん。**高いほうから n 件だけ。** 全部並べると20行を超えて、
// 依頼が読めなくなる(掲示板は依頼が主役)。
export const BOARD_TOP = 3;

export function marketBoard(now = Date.now(), gates = {}, ports = null, n = BOARD_TOP) {
  return marketToday(now, gates, ports).slice(0, Math.max(0, n));
}
