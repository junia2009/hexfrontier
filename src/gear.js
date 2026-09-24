// 盤まわり ── カタン本編の盤で使う見た目の品(設計書 §12)。
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

// ---- 盤 ----
//
// **地形の色を、全部まとめて同じだけずらす。** 地形ごとに別々の色を持たせる
// のではなく、色相・彩度・明度への1つの変換にしてある ── 理由は3つめの
// 線引き(情報量を変えない):
//
//   - 地形ごとに自由な色を持てると、森と牧草地を同じ緑にする柄が作れる。
//     **同じだけずらすなら、地形どうしの隔たりはおおむね保たれる。**
//   - 「おおむね」で済ませない。**どれだけ隔たっているかを測って**、
//     いちばん近い2つの地形の差と、数字トークンとのコントラストの両方に
//     下限を置く(test/gear.test.js)。彩度を落としすぎた柄はそこで落ちる。
//   - 色は2D盤・3D盤・地表の3か所に散っているが、**変換は1本**なので
//     3か所が食い違わない。
//
// h は色相のずらし(度)、s は彩度の倍率、l は明度の倍率。
//
// ---- 変換1本では、天井があった ----
//
// 「変化が小さすぎて分かりにくい。高い銀貨払ってまで買いたくないし、
// 買ってしまったらガッカリさせてしまう」と言われて、**どれだけ控えめか**を
// 測った ── 下限の内側で取れる変化量は最大 403 なのに、3つの柄は 59/69/72。
// **空いている余地の8割を使っていなかった。**
//
// ではなぜ強くできなかったか。総当たりで探して分かったのは、
// **どの方向へ強くしても、畑 #f0cd58 と黄金地 #f2d06b が先に潰れる**こと。
// この2色は既定でも 33.6 しか離れておらず(全地形で最接近)、盤ぜんぶを
// 同じだけ動かす限り、ここが上限を決めていた。
//
// そして強くする方向にも罠があった。**色相を大きく回すと海が緑になる**
// (「夕暮れ 強」で sea=#0cb189)── 下限は通るのに、盤が夕暮れに見えない。
// 光の色(RGB のチャンネル倍率)で試しても、やはり畑と黄金地で頭打ち。
//
// ---- だから、柄が色を持てるようにした(palette)----
//
// **禁じていたのは「地形ごとの色」ではなく「読めなくなること」だった。**
// 変換1本に縛っていたのは、森と牧草地を同じ緑にする柄を作れないようにする
// ための代用品で、本当の保証は下限のテストのほう(test/gear.test.js)。
// 色を持てれば、**畑と黄金地をわざと引き離しながら**大胆にできる ──
// 実際、新しい3つはどれも地形どうしの隔たりが **既定の 33.6 より広い**。
//
// palette を持つ柄は、地形の色をそこから引く。shift のほうは残して、
// 地形以外(木や岩などの飾りの色づけ)の気分を決めるのに使う。
export const BOARDS = [
  {
    id: 'board-classic',
    name: 'いつもの盤',
    icon: '⬡',
    desc: 'はじめから使っている盤の色。',
    shift: null,
  },
  {
    id: 'board-dusk',
    name: '夕暮れの盤',
    icon: '🌇',
    price: 300,
    desc: '日の沈むころ。畑は燃えるような橙、丘は赤土、海は藍に沈みます。',
    shift: { h: -18, s: 1.2, l: 0.9 },
    palette: {
      forest: '#2f5738', pasture: '#d99a3c', field: '#e2661f', hill: '#9e2b2b',
      mountain: '#6d5f7e', desert: '#f2b06a', lake: '#3d6e9e', sea: '#1f3f66', gold: '#ffd84f',
    },
  },
  {
    id: 'board-frost',
    name: '霜の盤',
    icon: '❄️',
    price: 360,
    desc: '凍てついた朝。森は深い青緑、山は雪をかぶり、湖は氷の色になります。',
    shift: { h: 30, s: 0.85, l: 0.98 },
    palette: {
      forest: '#2d6f7a', pasture: '#7ec5c0', field: '#d7dba0', hill: '#9c8090',
      mountain: '#c6dcee', desert: '#aebdb4', lake: '#7fe0f0', sea: '#1f5ba0', gold: '#e8b93c',
    },
  },
  {
    id: 'board-sepia',
    name: '古地図の盤',
    icon: '📜',
    price: 420,
    desc: '羊皮紙に描かれた海図。褪せた墨と土の色で、海まで茶色がかります。',
    shift: { h: 5, s: 0.5, l: 0.95 },
    palette: {
      forest: '#4e5c3a', pasture: '#97a06a', field: '#d8ab45', hill: '#9c5c33',
      mountain: '#86846f', desert: '#d9c391', lake: '#6f8f86', sea: '#3f5c6b', gold: '#f0c93f',
    },
  },
  {
    // **前は作れなかった柄。** 変換1本のころ「宵」を試したら、暗くすると
    // 畑と黄金地が 24.9 まで詰まって下限を割った ── 諦めて外した。
    // 色を持てるようになって、いちばん大胆な柄(変化 179)が通った。
    id: 'board-night',
    name: '宵の盤',
    icon: '🌙',
    price: 480,
    desc: '日が落ちたあとの盤。深い緑と藍に沈み、畑の金だけが残ります。',
    shift: { h: -5, s: 1.1, l: 0.72 },
    palette: {
      forest: '#22402f', pasture: '#5b8544', field: '#a88b31', hill: '#7a3c26',
      mountain: '#5c6a8c', desert: '#a3956e', lake: '#2d78ad', sea: '#12365e', gold: '#d6a93a',
    },
  },
];

// 上面から下面(立体に見せる暗いほう)を作る倍率。
// **既定の9地形の上下比を測って決めた**(明度 0.766 / 彩度 0.926 の平均)──
// 柄ごとに下面まで手で置くと、上だけ直して下を忘れた柄が必ず出る。
export const SHADE = { s: 0.93, l: 0.77 };

// 地形の色(上面)。**柄が色を持っていればそれ、無ければ変換で作る。**
// base は既定の色(board-render.js の TERRAIN_STYLE / 3D の TERRAIN_COLORS)。
export function boardTop(terrain, base, skin) {
  return skin?.palette?.[terrain] ?? tintHex(base, skin?.shift ?? null);
}

// 地形の色(下面)。柄が色を持つときは、上面から同じ倍率で落とす
export function boardBottom(terrain, baseBottom, skin) {
  const top = skin?.palette?.[terrain];
  return top ? tintHex(top, SHADE) : tintHex(baseBottom, skin?.shift ?? null);
}

// 3D 側は 0xRRGGBB の数で持っているので、その入口
export function boardTopNum(terrain, baseNum, skin) {
  const p = skin?.palette?.[terrain];
  return p ? hexToNum(p) : tintColor(baseNum, skin?.shift ?? null);
}

// **どれも一度は測って決めた。** 思いついた柄をそのまま置いてはいない。
//
// 変換1本だったころの記録(なぜ色を持つ形に変えたか):
//
//   - 「雪の盤」(明るくする)は**テストに弾かれた**。砂漠 #ecdcae は
//     もともと数字トークンの円盤 #f2ecd8 に近く(既定でも隔たり 79.9)、
//     明るくすると必ず溶ける ── 1.16 倍で 28.8 まで落ちた。
//   - **暗くする方向も全部落ちた。** 「深緑」「宵」は、畑と黄金地が詰まって
//     下限(既定の 80% = 26.9)を割る ── 26.2 と 24.9。
//   - 通った3つは、変化量が 59 / 69 / 72 しかなかった(取れる最大は 403)。
//
// 色を持てるようにしたあとの実測(変化量 / 地形どうしの最接近 / 円盤の最小。
// 既定は 0 / 33.6 / 79.9、下限は 26.9 / 63.9):
//
//   夕暮れ 162 / 92.6 / 225.2      霜   119 / 72.8 /  79.7
//   古地図 114 / 55.9 / 152.0      宵   179 / 86.8 / 276.5
//
// **2〜3倍濃くなって、しかも地形どうしは既定より離れている。**
// 弾かれていた「宵」も、色を持てるようになって通った。

// ---- 色をずらす(2D盤・3D盤・地表が同じ1本を使う)----
//
// 入口も出口も 0xRRGGBB の数。**文字列と数を混ぜない** ── 2D盤は '#rrggbb'、
// 3D盤は 0x… で色を持っているので、片方に合わせると必ず取り違える。
// 呼ぶ側が自分の形に直す(hexToNum / numToHex)。

// **ここの比較の境目は、故障注入では捕まらない。** 8件が生き残ったので
// 1つずつ確かめたが、全部**等価変異**だった ── HSL と RGB の変換は
// 区分関数で、どのつなぎ目でも両側の式が同じ値になる:
//
//   - `l > 0.5`: l = 0.5 なら max+min = 1 なので 2-max-min も 1。同じ式。
//   - `l < 0.5`(hslToRgb の q): l = 0.5 なら両側とも 0.5 + 0.5s。
//   - `g < b`: g = b なら色相は 0 か 1 で、どちらも同じ色(下で % 1 する)。
//   - hue2rgb の 0 / 1 / 1/6 / 1/2 / 2/3: どの境目でも両側が同じ値を返す
//     (1/6 なら p + (q-p) = q、2/3 なら p + 0 = p、というふうに)。
//
// **捕まえようとすると「この境目でこの値」と書くことになるが、それは
// 値が変わらないことを確かめているだけ**で、テストとして意味がない。
// 代わりに、往復と素通し(変換しない shift)をテストで押さえてある。
function rgbToHsl(n) {
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hue2rgb(p, q, t0) {
  let t = t0;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  let r;
  let g;
  let b;
  if (s === 0) {
    r = l; g = l; b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const to = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (to(r) << 16) | (to(g) << 8) | to(b);
}

// 1色ぶん。shift が無ければそのまま返す(既定の盤は1バイトも変わらない)
export function tintColor(num, shift) {
  if (!shift) return num;
  const [h, s, l] = rgbToHsl(num);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  return hslToRgb(
    (((h + (shift.h ?? 0) / 360) % 1) + 1) % 1,
    clamp01(s * (shift.s ?? 1)),
    clamp01(l * (shift.l ?? 1)),
  );
}

export const hexToNum = (hex) => parseInt(String(hex).replace('#', ''), 16);
export const numToHex = (num) => `#${(num >>> 0).toString(16).padStart(6, '0')}`;

// 2D盤は '#rrggbb' で色を持っているので、そのまま渡せる口も出す
export function tintHex(hex, shift) {
  return shift ? numToHex(tintColor(hexToNum(hex), shift)) : hex;
}

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
  {
    id: 'board',
    icon: '⬡',
    label: '盤',
    note: '地形の色合いが変わります。数字も地形も同じだけ読めます',
    items: BOARDS,
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
