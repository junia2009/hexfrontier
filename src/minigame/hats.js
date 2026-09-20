// かぶりもの ── 店で買う「見た目だけ」の品。
//
// **数に上限が無い使い道**として置いてある。道具(shop.js の5品)は
// 買い切ったらそれきりだが、かぶりものはいくつ足してもよい ──
// 遊びに一切さわらないので、増やしても釣り合いが崩れない。
//
// THREE を使わない。実際のメッシュは body.js の makeHat がこの表を読んで
// 組み立てる(species.js と body.js の関係と同じ)。
//
// **番号(id)は通信に乗る**(散策部屋で相手の頭にも載る)。既存の id は
// 変えない ── 相手が古い版を開いていると、麦わらのつもりが王冠に見える。
//
// 寸法は**頭の半径(headR)に対する割合**で書く。すがたごとに頭の大きさが
// 違うので、絶対値で書くと、ねこには合ってドラゴンには浮く。

export const HATS = [
  {
    id: 'straw',
    name: '麦わら帽子',
    icon: '👒',
    price: 180,
    desc: 'つばの広い麦わら帽子。夏の島によく似合います。',
    kind: 'brim',
    color: 0xe3c87e,
    accent: 0xd2604a,     // 巻いたリボン
    brim: 1.55,           // つばの広さ(頭の半径に対する割合)
    crown: 0.62,          // 山の高さ
  },
  {
    id: 'flower',
    name: '花かんむり',
    icon: '🌸',
    price: 150,
    desc: '小さな花を編んだ輪。頭にふわりと載ります。',
    kind: 'wreath',
    color: 0x6fae5a,      // つる
    accent: 0xff9ec4,     // 花
    petals: 7,
  },
  {
    id: 'pointy',
    name: 'とんがり帽子',
    icon: '🔮',
    price: 260,
    desc: '星をあしらった、先のとがった帽子。',
    kind: 'cone',
    color: 0x5a4a9c,
    accent: 0xffd97d,     // 星とつば飾り
    brim: 1.35,
    crown: 1.9,
  },
  {
    id: 'crown',
    name: '王かんむり',
    icon: '👑',
    price: 500,
    desc: '金のかんむり。島でいちばん高い品です。',
    kind: 'crown',
    color: 0xf2c94c,
    accent: 0xe2604a,     // はめ込んだ宝石
    spikes: 6,
  },
];

export const HAT_BY_ID = Object.fromEntries(HATS.map((h) => [h.id, h]));

export const HAT_IDS = HATS.map((h) => h.id);

// 通信で受けた値を掃除する。**知らない id は「かぶっていない」に倒す** ──
// 相手が新しい版で増えた帽子をかぶっていても、こちらは素頭で描けばよい
// (落とすと、その人だけ描画ごと消える)。
export function cleanHat(id) {
  return typeof id === 'string' && HAT_BY_ID[id] ? id : null;
}
