// 卓のしつらえ ── カタン本編の盤で使う見た目の品(設計書 §12)。
//
// **島の外へ出す、はじめての品。** 道具もかぶりものも飾りも「島を歩く」の
// 中だけの話だったが、稼いだ銀貨の行き先が島の中にしか無いのは狭い ──
// 対戦の卓にも持ち込めるようにする。
//
// THREE も DOM も知らない(表と、選んだものを引くだけ)。メッシュや CSS は
// 読む側が組み立てる ── hats.js と body.js の関係と同じ。
//
// ---- 売ってよいものの線引き(shop.js の禁じ手に足す6つめ)----
//
//   1. **自分の画面だけ。** state にも部屋の名簿にも乗せない。乗せた瞬間に
//      「相手の盤を見にくくする品」が作れてしまう。
//   2. **席の色は変えない。** 赤=P0 という共通言語を壊すと、オンラインで
//      「赤の人」が通じなくなる。コマの柄は形と質感だけ。
//   3. **盤から読み取れる情報量を増やさない・減らさない。** 数字も確率の点も
//      地形の種類も、どの柄でも同じだけ読める。**下限はテストで測る**
//      (test/gear.test.js が目と地のコントラスト比を見張っている)。
//   4. **アクセシビリティは売らない。** 色覚に配慮した配色のようなものは
//      設定で無料にすべきもので、商品にすると「見えづらい人だけが金を払う」
//      形になる。ここに並べるのは、あくまで好みの品だけ。
//
// **既定の柄は買えない。** 各スロットの先頭が「はじめから持っているもの」で、
// 値段は付かない。買い切ったあと元に戻したくなったとき、ここへ戻る
// ── 「買ったせいで閉まる扉を作らない」(shop.js の4つめ)の言い換え。

// ---- サイコロ ----
//
// face は地の色、edge は 2D 盤の下側(立体に見せる暗いほう)、pip は目。
// finish は 3D のつや(roughness が小さいほどつやつや、metal が金属)。
//
// **edge も目が読めるだけ明るく保つこと。** 2D盤のサイコロは face → edge の
// グラデーションなので、下のほうの目は edge の上に乗る ── 木・石・金の3つは
// はじめ edge を暗くしすぎていて、そこだけコントラストが 3.6〜3.8 まで落ちて
// いた(地のほうは 5.5〜6.5 あったので、face だけ見ていたら通っていた)。
// テストが face と edge の**両方**を測っている。
//
// **都市と騎士の赤・黄・イベントダイスの色は変えない。** あの3つは色その
// ものが規則(どちらが赤か・イベントは何か)なので、柄で塗り替えると
// 情報が変わる ── 上の3つめに引っかかる。**変わるのはつやだけ**
// (金の柄なら赤いダイスも金属のつやになるが、赤は赤のまま)。
export const DICE = [
  {
    id: 'dice-bone',
    name: '骨のサイコロ',
    icon: '🎲',
    desc: 'はじめから使っている、いつものサイコロ。',
    face: '#f5f2e8',
    edge: '#d9d9d2',
    pip: '#22242a',
    finish: { roughness: 0.35, metalness: 0 },
  },
  {
    id: 'dice-wood',
    name: '木のサイコロ',
    icon: '🎲',
    price: 180,
    desc: '削り出しの木。角がやわらかく見えます。',
    face: '#c99b62',
    edge: '#b98a52',
    pip: '#33240f',
    finish: { roughness: 0.85, metalness: 0 },
  },
  {
    id: 'dice-stone',
    name: '石のサイコロ',
    icon: '🎲',
    price: 220,
    desc: '磨いた石。ざらりとした地に、深く彫った目。',
    face: '#9aa3ad',
    edge: '#8c95a0',
    pip: '#191f25',
    finish: { roughness: 0.95, metalness: 0 },
  },
  {
    id: 'dice-indigo',
    name: '藍染めのサイコロ',
    icon: '🎲',
    price: 300,
    desc: '藍に染めた地に、白抜きの目。',
    face: '#2f4a6b',
    edge: '#1f3149',
    pip: '#eaf0f7',
    finish: { roughness: 0.5, metalness: 0 },
  },
  {
    id: 'dice-gold',
    name: '金のサイコロ',
    icon: '🎲',
    price: 450,
    desc: '打ち出しの金。灯りを受けて光ります。',
    face: '#e8c34a',
    edge: '#c9a132',
    pip: '#3a2c06',
    finish: { roughness: 0.3, metalness: 0.7 },
  },
];

// ---- 卓の灯り ----
//
// **夜の盤が明るくなる。** 島の石灯籠とまったく同じ仕掛け(board3d の
// nightGlow)を、対戦の盤にも効かせる ── 島を育てると夜が明けるのと同じで、
// 卓も育てられるようにする。
//
// **これは「快適になる系」で、優劣ではない。** 根拠は2つ:
//
//   - **灯りが無くても夜の盤は読める。** 島の灯籠で決めたのと同じ線
//     (「買ったせいで閉まる扉を作らない」)。真夜中に固定して、盤が写って
//     いるところの明るさを実測した:
//       灯りなし 84.1 / 燭台 99.7 / 卓上ランプ 109.8
//     灯りなしの 84.1 でも、数字トークンも地形も駒もはっきり読める
//     (目でも確かめた)── 灯りは「暗くて見えないのを直す品」ではなく、
//     「夜の卓を気持ちよくする品」。
//     **昼には効かない**ことも測った(灯りあり 124.3 / なし 122.8。
//     差 1.5 は撮るたびのばらつきの範囲)。board3d が night を掛けている。
//   - **もっと強い前例がすでに通っている。** 「島の砂時計」(200枚)は
//     対戦中の盤の空の時刻ごと変えられる ── 夜そのものを飛ばせる品が
//     すでにあるのに、夜を少し明るくする品だけを断る理由はない。
//
// glow は 0〜1(board3d が night を掛けるので、昼には効かない)。
export const LIGHTS = [
  {
    id: 'light-none',
    name: '灯りなし',
    icon: '🌙',
    desc: '卓に灯りを置きません。夜は夜のまま。',
    glow: 0,
  },
  {
    id: 'light-candle',
    name: '卓の燭台',
    icon: '🕯',
    price: 240,
    desc: '夜の盤に、ろうそくのささやかな灯り。',
    glow: 0.45,
  },
  {
    id: 'light-lamp',
    name: '卓上ランプ',
    icon: '🪔',
    price: 420,
    desc: '夜の盤をしっかり照らします。灯りの色が卓に回ります。',
    glow: 1,
  },
];

// ---- コマ ----
//
// **屋根の形と質感だけを変える。** 胴は席の色のまま、大きさの割合も
// そのまま ── 2つめの線引き(席の色は変えない)と3つめ(情報量を変えない)の
// 両方がここに掛かる:
//
//   - 胴の色を変えると「赤の人」が通じなくなる。
//   - **開拓地と都市の見分けは情報。** 都市は胴 + 塔 + 屋根2つ、開拓地は
//     胴 + 屋根1つ、という組み立てそのものは柄で変えない ── ここを
//     柄ごとの寸法にすると、「都市に見えない都市」が作れてしまう。
//     だから柄が持つのは**屋根の形の名前**だけで、寸法は持たない。
//
// roof は形の名前(描く側が geometry と輪郭に読み替える)。
// **名前は増やしてよいが、勝手な名前は書かない** ── テストが
// ROOF_SHAPES と突き合わせていて、描く側が知らない名前だと落ちる。
export const ROOF_SHAPES = ['cone', 'tall', 'box'];

export const PIECES = [
  {
    id: 'piece-wood',
    name: '木のコマ',
    icon: '🏠',
    desc: 'はじめから使っている、三角屋根のコマ。',
    roof: 'cone',
    finish: { roughness: 0.55, metalness: 0 },
  },
  {
    id: 'piece-stone',
    name: '石造りのコマ',
    icon: '🏛',
    price: 260,
    desc: '平らな陸屋根。ざらりとした石の質感。',
    roof: 'box',
    finish: { roughness: 0.95, metalness: 0 },
  },
  {
    id: 'piece-tent',
    name: '天幕のコマ',
    icon: '⛺',
    price: 320,
    desc: 'とがった天幕の屋根。布のように光を返しません。',
    roof: 'tall',
    finish: { roughness: 0.9, metalness: 0 },
  },
  {
    // **金属の名前を付けない。** 席の色は変えない決めごとなので、
    // 赤い席の「真鍮のコマ」は赤い金属にしかならない ── 名前が嘘になる。
    // 変えているのはつやだけなので、つやの名前にする(実機で見て気づいた)。
    id: 'piece-polish',
    name: '磨きのコマ',
    icon: '✨',
    price: 480,
    desc: '形はそのまま、磨いた金属のつや。灯りをよく映します。',
    roof: 'cone',
    finish: { roughness: 0.25, metalness: 0.65 },
  },
];

// ---- スロット ----
//
// 1つのスロットには**1つだけ着けられる**(かぶりものと同じ)。
// 先頭が既定で、値段が付いていない。
export const SLOTS = [
  {
    id: 'dice',
    icon: '🎲',
    label: 'サイコロ',
    note: '出目は変わりません。見た目だけです',
    items: DICE,
  },
  {
    // **`lamp` にしない。** 島の飾りの石灯籠がすでに `lamp` で、
    // `shop-buy:lamp` が `shop-buy:lamp-candle` の頭に重なる ── 実際、
    // 店の棚のテストが「decor の品が gear の棚に出ている」と誤報した。
    // 走らせるコードは data-act を ':' で割るので動くが、id を前方一致で
    // 探す目とテストが必ず引っかかる。
    id: 'light',
    icon: '🕯',
    label: '卓の灯り',
    note: '夜の盤が明るくなります。灯りが無くても盤は読めます',
    items: LIGHTS,
  },
  {
    id: 'piece',
    icon: '🏠',
    label: 'コマ',
    note: '屋根の形と質感だけ。席の色も大きさも変わりません',
    items: PIECES,
  },
];

export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
export const SLOT_IDS = SLOTS.map((s) => s.id);

// 全部の品(既定もふくむ)。id からスロットと中身を引くのに使う
export const GEAR = SLOTS.flatMap((s) => s.items.map((i) => ({ ...i, slot: s.id })));
export const GEAR_BY_ID = Object.fromEntries(GEAR.map((i) => [i.id, i]));

// **店に並ぶのは値段の付いたものだけ。** 既定は買うものではない
export const GEAR_FOR_SALE = GEAR.filter((i) => i.price != null);

export function isGear(id) {
  return !!GEAR_BY_ID[id];
}

export function slotOf(id) {
  return GEAR_BY_ID[id]?.slot ?? null;
}

// そのスロットの既定(はじめから持っているもの)
export function defaultGear(slot) {
  return SLOT_BY_ID[slot]?.items[0] ?? null;
}

// いま着けているもの。**持っていないものは既定に倒す** ── 保存を直に
// 書き換えても、買わずに使えないようにする(wornHat と同じ扱い)。
export function gearOf(progress, slot) {
  const def = defaultGear(slot);
  if (!def) return null;
  const id = progress?.worn?.[slot] ?? null;
  const item = GEAR_BY_ID[id];
  if (!item || item.slot !== slot) return def;
  if (item.price != null && !progress?.owned?.[id]) return def;   // 買っていない
  return item;
}

// 既定かどうか(持ち物の画面が「つかっている」を出すのに使う)
export function isDefaultGear(progress, slot) {
  return gearOf(progress, slot)?.id === defaultGear(slot)?.id;
}
