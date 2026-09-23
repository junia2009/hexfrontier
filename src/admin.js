// 管理者の隠し口 ── **作る側が店を試すためのもの**。
//
// 店の品を検証するのに、毎回そのぶんを釣って稼ぐのは時間の無駄
// (道具5品で 1220枚、盤まわりまで入れると4000枚を超える)。
// 銀貨を足す・全部持つ・手放す、の3つだけを置く。
//
// ---- なぜ出荷物に入れてよいか ----
//
// **配れる中身が、もともと勝ち負けに効かないから。** 店の線引き
// (shop.js のいちばん上と gear.js)で、売り物は次のどれかに限ってある:
//
//   - 見た目だけの品(かぶりもの・飾り・盤まわり)
//   - 行ける場所が増える品(深場の竿・ランタン)。ただし**大会の間は
//     全部閉じる**し、これで開く魚は実績にも図鑑の「全種類」にも数えない
//     (fish.js の isGated / achievements.js の fishCounts)
//
// そして**実績は銀貨も持ち物も見ていない**(achievements.js に owned も
// coins も出てこない)。称号はオンラインの相手にも見えるので、ここが
// 効いていたら人の画面を書き換えることになる ── 効いていない。
// つまり、この口で壊せるのは**自分の集める楽しみ**だけ。
//
// **それでも見つけにくい所に置く。** 版の表示(#build-tag)を続けて叩く
// ── Android の開発者向けオプションと同じ作法で、まちがって開かない。
//
// THREE も DOM も知らない(数えるのと、progress を作り替えるだけ)。

import { ITEMS, isDecor } from './shop.js';
import { STOCK_MAX } from './minigame/decor.js';

// 続けて何回叩いたら開くか。**間が空いたら数え直す** ── 版の表示は
// 画面の下にずっと出ているので、何日かかけて7回触れたら開く、では困る。
export const TAPS = 7;
export const WINDOW_MS = 3000;

export const emptyGate = () => ({ n: 0, at: 0 });

// 1回叩いた。新しい数えかたと、開いたかどうかを返す。
// **開いたら数えを戻す** ── 8回目でまた開く、を防ぐ。
export function tapGate(gate, now) {
  const g = gate ?? emptyGate();
  const n = now - (g.at ?? 0) <= WINDOW_MS ? (g.n ?? 0) + 1 : 1;
  if (n >= TAPS) return { gate: emptyGate(), open: true };
  return { gate: { n, at: now }, open: false };
}

// あと何回で開くか(押すたびに小さく出す。無言だと壊れたのかと思う)
export function tapsLeft(gate) {
  return Math.max(0, TAPS - (gate?.n ?? 0));
}

// ---- 配るもの ----

// 1回ぶん。**店ぜんぶが2回で買えるくらい**にしてある(全部で 4000枚ほど)
export const GRANT = 2500;

export function addCoins(progress) {
  const p = progress ?? {};
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { ...p, coins: n(p.coins) + GRANT, coinsEarned: n(p.coinsEarned) + GRANT };
}

// 店の品を全部持つ。**飾りは数で持つ**ので、上限まで入れておく
// (1つずつ買い直さないと並べて試せない)。
export function grantAll(progress) {
  const p = progress ?? {};
  const owned = { ...(p.owned ?? {}) };
  const stock = { ...(p.stock ?? {}) };
  for (const item of ITEMS) {
    owned[item.id] = true;
    if (isDecor(item.id)) stock[item.id] = STOCK_MAX;
  }
  return { ...p, owned, stock };
}

// 買った品を手放す。**「買う前」の見え方を試すため**の戻り道。
//
// 消すのは買い物まわりだけ ── 戦績も図鑑も実績も残す(そこまで消したい
// ときは戦績画面の「記録を消す」がある)。
// **着けているものも外す**(持っていないものを着けたままにしない)。
// **島に置いた飾りも引き上げる** ── 残すと、持っていない飾りが島に
// 出たままになって「買う前」にならない。
export function dropAll(progress) {
  const p = progress ?? {};
  return {
    ...p,
    owned: {},
    stock: {},
    decor: {},
    worn: Object.fromEntries(Object.keys(p.worn ?? { hat: null }).map((k) => [k, null])),
  };
}
