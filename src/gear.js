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
