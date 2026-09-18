// 島の店 ── 銀貨の使い道(設計書 §12)
//
// **売るのは「行ける場所・分かること・見える景色」だけ。** 既存の遊びを
// 有利にするものは置かない。理由は3つ:
//
//   1. 主要な稼ぎ口に倍率が掛かると複利になる(釣りが速くなる →
//      銀貨が増える → もっと速くなる)。
//   2. 大会とオンライン対戦は対称な勝負なので、払った人が勝つのは壊れている。
//   3. 図鑑も自己最高も釣果が条件。釣れやすくすると、昔の記録と今の記録が
//      比べられなくなる ── すでに遊んだ人の記録を後から安くすることになる。
//
// **4つめは「買ったせいで閉まる扉を作らない」。** 深場の竿を出したとき、
// 持っているあいだ必ず沖へ投げる作りにしてしまい、買った人は港の魚
// (ぬしもダイオウイカも)を釣れなくなっていた ── 買うと図鑑が埋まらなく
// なる、という逆向きの壊れかた。**開く品には必ず「使わない」側を残す**。
// いまは投げ先を桟橋で選べる(walk-mode.js の castDeep)。
//
// 大会のあいだは、店の品で開くものを全部閉じる(fish.js の fishGates)。
// 大会は港の昼に固定 ── 払った人だけが大きい魚を申告できる形にしない。
//
// 全て純粋関数。localStorage も画面も触らない。

export const ITEMS = [
  {
    id: 'fishNote',
    name: '漁師の手帳',
    icon: '📖',
    price: 120,
    // 何が起きるかを1行で。「強くなる」と読める書きかたにしない
    desc: '図鑑のまだ釣っていない欄に、どこで釣れるかと大きさの目安が出ます。',
    note: '釣れやすさは変わりません。どこを探せばいいか分かるだけです。',
  },
  {
    id: 'islandMap',
    name: '島の見取り図',
    icon: '🗺',
    price: 150,
    desc: '島を歩いている間、画面の左上に島の地図が出ます。自分のいる場所と向き、'
      + '🏪店・📋受付・⚓桟橋・🏹櫓・🐉巣の場所が、歩きながら分かります。',
    note: '人や竜の居場所は出ません。動かないものの場所だけです。じゃまなら持ち物からしまえます。',
  },
  {
    id: 'skyGlass',
    name: '島の砂時計',
    icon: '⏳',
    price: 200,
    desc: '空の時刻を選べます(昼・夕暮れ・夜・朝)。夜を待たずに夜にできます。',
    note: '変わるのは自分の画面だけ。大会の間は島の時刻に戻ります。',
  },
  {
    id: 'lantern',
    name: '夜釣りのランタン',
    // 🏮 はチョウチンアンコウが使っているので油ランプの絵を使う
    icon: '🪔',
    price: 350,
    desc: '夜の桟橋に灯りをともします。夜にしか出てこない魚がいます。',
    note: '昼の釣りと大会の釣りは変わりません。深場の竿と両方そろうと、夜の沖が開きます。',
  },
  {
    id: 'deepRod',
    name: '深場の竿',
    icon: '🎣',
    price: 400,
    desc: '同じ桟橋から沖へも投げ分けられるようになります。深場には港に出ない魚がいます。',
    note: '港へ投げるのはいつでも選べます。大会は港で開かれるので、大会の釣りは変わりません。',
  },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// 値付けの根拠:
// 上出来な大会1回が 48〜60 枚、港で数匹釣って 30〜60 枚。
// いちばん高い 400 枚はおよそ 20〜30 分ぶんで、「次に遊ぶ理由」として
// 残りつつ1日で届く。安い3つ(120〜200)は1〜2回遊べば買えるので、
// 「たまったけど何も買えない」で終わらないようにしてある。
// 使い道が増えたら、そのときの物価に合わせて見直す前提。

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
