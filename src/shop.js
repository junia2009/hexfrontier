// 島の店 ── 銀貨の使い道(設計書 §12)
//
// **売るのは「行ける場所」と「見た目」だけ。** 既存の遊びを有利にするものは
// 置かない。理由は3つ:
//
//   1. 主要な稼ぎ口に倍率が掛かると複利になる(釣りが速くなる →
//      銀貨が増える → もっと速くなる)。
//   2. 大会とオンライン対戦は対称な勝負なので、払った人が勝つのは壊れている。
//   3. 図鑑も自己最高も釣果が条件。釣れやすくすると、昔の記録と今の記録が
//      比べられなくなる ── すでに遊んだ人の記録を後から安くすることになる。
//
// 深場の竿がこの線引きの見本。「既存の魚が釣りやすくなる」のではなく
// 「港には出ない魚が釣れる場所が開く」。図鑑の空欄が増えるのが報酬で、
// 大会は港で開かれるので不公平にもならない。
//
// 全て純粋関数。localStorage も画面も触らない。

export const ITEMS = [
  {
    id: 'deepRod',
    name: '深場の竿',
    icon: '🎣',
    price: 400,
    // 何が起きるかを1行で。「強くなる」と読める書きかたにしない
    desc: '同じ桟橋から沖へ投げられるようになります。深場には港に出ない魚がいます。',
    note: '大会は港で開かれるので、大会の釣りは変わりません。',
  },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// 値付けの根拠:
// 上出来な大会1回が 48〜60 枚、港で数匹釣って 30〜60 枚。
// 400 枚はおよそ 20〜30 分ぶんで、「次に遊ぶ理由」として残りつつ
// 1日で届く。使い道が増えたら、そのときの物価に合わせて見直す前提。

export function priceOf(id) {
  return ITEM_BY_ID[id]?.price ?? 0;
}

export function owns(progress, id) {
  return !!progress?.owned?.[id];
}

// 買えるか。買えない理由を日本語で返す(買えるなら null)
export function whyCannotBuy(progress, id) {
  const item = ITEM_BY_ID[id];
  if (!item) return 'その品は置いていません';
  if (owns(progress, id)) return 'もう持っています';
  const have = progress?.coins ?? 0;
  if (have < item.price) return `あと${item.price - have}枚たりません`;
  return null;
}

// 買う。**払えないときは何も変えない** ── 呼び出し側が whyCannotBuy を
// 見ていなくても、手持ちが負にならないようにここで止める。
//
// 戻り値: { progress, ok, reason }
export function buyItem(progress, id) {
  const reason = whyCannotBuy(progress, id);
  if (reason) return { progress, ok: false, reason };
  const item = ITEM_BY_ID[id];
  return {
    progress: {
      ...progress,
      // 使っても coinsEarned は減らさない(通算獲得の意味が消える)
      coins: (progress.coins ?? 0) - item.price,
      owned: { ...(progress.owned ?? {}), [id]: true },
    },
    ok: true,
    reason: null,
  };
}
