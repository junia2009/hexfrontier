// 釣れるものの一覧。
//
// THREE を使わない純粋なデータと抽選だけ(node --test で検証できるように)。
//
// 「引きの強さ」は fishing.js が使う。数字の意味はそちらのコメントを見ること。
//   pull    張りの上がりやすさ(巻いている間、1秒あたり)
//   stamina 取り込みにかかる手間。いちばん大きい個体を上手に上げたときの
//           勝負の長さ(秒)から逆算してある(scratchpad の tune-fish.mjs)
//   burst   暴れる間隔(秒)の範囲。短いほど休む隙がない
//   burstK  暴れている間、張りが何倍になるか
//
// 港の種類ごとに「ぬし」を1匹だけ置いてある。港をめぐって釣る動機になるので、
// ここを増やすときも「どの港にいるか」を必ず決めること。

import { rngNext } from '../rng.js';
import { RES_JP_SHORT } from '../state.js';

// tier: junk(ガラクタ)/ common / rare / legend(港のぬし)/ myth
export const FISH = [
  // ---- ガラクタ。釣れるとがっかりするが、図鑑には載る ----
  { id: 'boot', name: '長ぐつ', icon: '👢', tier: 'junk', w: 6, cm: [24, 30], pull: 0.3, stamina: 0.43, burst: [3, 5], burstK: 1.2 },
  { id: 'weed', name: '海そう', icon: '🌿', tier: 'junk', w: 8, cm: [30, 90], pull: 0.26, stamina: 0.46, burst: [3, 5], burstK: 1.1 },
  { id: 'bottle', name: '空きびん', icon: '🍾', tier: 'junk', w: 5, cm: [20, 28], pull: 0.28, stamina: 0.39, burst: [3, 5], burstK: 1.2 },

  // ---- どこの港でも釣れる ----
  { id: 'iwashi', name: 'イワシ', icon: '🐟', tier: 'common', w: 22, cm: [9, 18], pull: 0.42, stamina: 1.07, burst: [1.6, 2.6], burstK: 1.5 },
  { id: 'aji', name: 'アジ', icon: '🐟', tier: 'common', w: 20, cm: [14, 30], pull: 0.48, stamina: 1.25, burst: [1.4, 2.4], burstK: 1.6 },
  { id: 'saba', name: 'サバ', icon: '🐟', tier: 'common', w: 16, cm: [25, 45], pull: 0.55, stamina: 1.48, burst: [1.2, 2.2], burstK: 1.8 },
  { id: 'kasago', name: 'カサゴ', icon: '🐡', tier: 'common', w: 14, cm: [15, 32], pull: 0.52, stamina: 1.4, burst: [1.8, 3], burstK: 2 },
  { id: 'fugu', name: 'フグ', icon: '🐡', tier: 'common', w: 10, cm: [18, 40], pull: 0.5, stamina: 1.49, burst: [1.5, 2.5], burstK: 1.7 },
  { id: 'karei', name: 'カレイ', icon: '🐠', tier: 'common', w: 10, cm: [22, 50], pull: 0.58, stamina: 1.65, burst: [2, 3.2], burstK: 1.6 },
  { id: 'tako', name: 'タコ', icon: '🐙', tier: 'common', w: 8, cm: [30, 70], pull: 0.6, stamina: 1.76, burst: [1.6, 2.4], burstK: 1.9 },

  // ---- たまに来る大物 ----
  { id: 'tai', name: 'マダイ', icon: '🐠', tier: 'rare', w: 7, cm: [35, 75], pull: 0.68, stamina: 1.88, burst: [1.2, 2], burstK: 2.1 },
  { id: 'buri', name: 'ブリ', icon: '🐟', tier: 'rare', w: 6, cm: [60, 105], pull: 0.76, stamina: 2.01, burst: [1.1, 1.9], burstK: 2.2 },
  { id: 'maguro', name: 'マグロ', icon: '🐟', tier: 'rare', w: 4, cm: [90, 190], pull: 0.86, stamina: 1.91, burst: [1, 1.7], burstK: 2.4 },
  { id: 'kajiki', name: 'カジキ', icon: '🗡', tier: 'rare', w: 2, cm: [150, 320], pull: 0.95, stamina: 1.86, burst: [0.9, 1.5], burstK: 2.6 },

  // ---- 港のぬし。その港でしか出ない ----
  { id: 'manbou', name: 'マンボウ', icon: '🌝', tier: 'legend', at: '3:1', w: 4, cm: [120, 280], pull: 0.72, stamina: 2.62, burst: [1.4, 2.2], burstK: 2 },
  { id: 'matsukasa', name: 'マツカサウオ', icon: '🪵', tier: 'legend', at: 'wood', w: 4, cm: [12, 22], pull: 0.8, stamina: 1.68, burst: [0.8, 1.4], burstK: 2.7 },
  { id: 'akaei', name: 'アカエイ', icon: '🧱', tier: 'legend', at: 'brick', w: 4, cm: [80, 200], pull: 0.84, stamina: 2.17, burst: [1.2, 2], burstK: 2.3 },
  { id: 'mendako', name: 'メンダコ', icon: '🐑', tier: 'legend', at: 'sheep', w: 4, cm: [10, 20], pull: 0.62, stamina: 2.31, burst: [1.6, 2.6], burstK: 1.8 },
  { id: 'kinmedai', name: 'キンメダイ', icon: '🌾', tier: 'legend', at: 'wheat', w: 4, cm: [30, 60], pull: 0.78, stamina: 2.04, burst: [1.1, 1.8], burstK: 2.4 },
  { id: 'ginzame', name: 'ギンザメ', icon: '⛏', tier: 'legend', at: 'ore', w: 4, cm: [60, 140], pull: 0.88, stamina: 2, burst: [1, 1.6], burstK: 2.5 },

  // ---- ぜんぶの港にいる、めったに来ないやつ ----
  { id: 'daiouika', name: 'ダイオウイカ', icon: '🦑', tier: 'myth', w: 0.6, cm: [280, 700], pull: 1.05, stamina: 2.19, burst: [0.8, 1.3], burstK: 2.8 },

  // ---- 沖(深場)。深場の竿を買うと、同じ桟橋から沖へ投げられるようになる ----
  //
  // **どれも港には出ない。** 深場は「強くなる」ための場所ではなく
  // 「行ったことのない場所」なので、既存の魚を釣りやすくはしない。
  // そのぶん引きは全体に強めにしてある ── 深いところのものは手強い、を
  // 数字でも出す(stamina は港のぬしと同じか少し上)。
  { id: 'demenigisu', name: 'デメニギス', icon: '👁', tier: 'common', deep: true, w: 14, cm: [12, 25], pull: 0.58, stamina: 1.52, burst: [1.5, 2.4], burstK: 1.8 },
  { id: 'chouchin', name: 'チョウチンアンコウ', icon: '🏮', tier: 'rare', deep: true, w: 8, cm: [20, 60], pull: 0.74, stamina: 1.96, burst: [1.2, 2], burstK: 2.2 },
  { id: 'takaashi', name: 'タカアシガニ', icon: '🦀', tier: 'rare', deep: true, w: 6, cm: [200, 380], pull: 0.8, stamina: 2.1, burst: [1.4, 2.2], burstK: 2 },
  { id: 'mitsukuri', name: 'ミツクリザメ', icon: '🦈', tier: 'legend', deep: true, w: 3.5, cm: [300, 550], pull: 0.92, stamina: 2.34, burst: [1, 1.7], burstK: 2.5 },
  { id: 'ryuuguu', name: 'リュウグウノツカイ', icon: '🎏', tier: 'legend', deep: true, w: 3, cm: [300, 800], pull: 0.9, stamina: 2.55, burst: [1.1, 1.8], burstK: 2.3 },
  { id: 'coelacanth', name: 'シーラカンス', icon: '🐟', tier: 'myth', deep: true, w: 0.7, cm: [130, 200], pull: 1.02, stamina: 2.72, burst: [0.9, 1.4], burstK: 2.7 },

  // ---- 夜。夜釣りのランタンを買うと、夜の港で出るようになる ----
  //
  // **昼の表は変えない。** 夜だけの追加なので、昼に釣っている人には何も
  // 起きない。夜は夜の魚が混ざるぶん、港のぬしの出る割合が少し下がる
  // (足した重みは昼の表の 2 割ほど)── 夜に釣るか昼に釣るかを選べるので、
  // ぬしを狙うときは昼に投げればいい。
  { id: 'hotaruika', name: 'ホタルイカ', icon: '✨', tier: 'common', night: true, w: 8, cm: [5, 8], pull: 0.36, stamina: 0.92, burst: [2, 3.2], burstK: 1.3 },
  { id: 'anago', name: 'アナゴ', icon: '🐍', tier: 'common', night: true, w: 7, cm: [40, 100], pull: 0.62, stamina: 1.61, burst: [1.4, 2.2], burstK: 1.9 },
  { id: 'tachiuo', name: 'タチウオ', icon: '⚔️', tier: 'rare', night: true, w: 5, cm: [60, 150], pull: 0.72, stamina: 1.9, burst: [1.1, 1.9], burstK: 2.2 },
  { id: 'iseebi', name: 'イセエビ', icon: '🦞', tier: 'rare', night: true, w: 4, cm: [20, 45], pull: 0.66, stamina: 1.84, burst: [1.6, 2.6], burstK: 1.9 },
  { id: 'utsubo', name: 'ウツボ', icon: '🦎', tier: 'rare', night: true, w: 4, cm: [60, 140], pull: 0.82, stamina: 2.05, burst: [1, 1.6], burstK: 2.4 },
  { id: 'mizuuo', name: 'ミズウオ', icon: '🌙', tier: 'legend', night: true, w: 1.6, cm: [100, 220], pull: 0.86, stamina: 2.42, burst: [1.1, 1.8], burstK: 2.4 },

  // ---- 夜の沖。竿とランタンの**両方**を持っている人にだけ出る ----
  //
  // 2つ買った人へのごほうび。どちらか1つでは出ない ── 深いところの夜は、
  // この島でいちばん遠い場所という扱いにしてある。
  { id: 'gusokumushi', name: 'オオグソクムシ', icon: '🪲', tier: 'rare', deep: true, night: true, w: 6, cm: [20, 45], pull: 0.7, stamina: 1.98, burst: [1.8, 2.8], burstK: 1.8 },
  { id: 'yokozuna', name: 'ヨコヅナイワシ', icon: '🥋', tier: 'legend', deep: true, night: true, w: 2.5, cm: [100, 250], pull: 0.94, stamina: 2.48, burst: [1, 1.6], burstK: 2.5 },
  { id: 'houzukiika', name: 'ダイオウホウズキイカ', icon: '🌌', tier: 'myth', deep: true, night: true, w: 0.5, cm: [300, 1000], pull: 1.08, stamina: 2.78, burst: [0.8, 1.3], burstK: 2.9 },
];

export const FISH_BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]));

// **店の品が要る魚。** 深場(沖)と夜がこれにあたる。
//
// 実績と図鑑の「全種類」には数えない ── 買わないと達成できない実績を
// 作らない、というのが店の決めごと(shop.js のいちばん上を参照)。
export function isGated(f) {
  return !!(f?.deep || f?.night);
}

// 買わなくても釣れる魚。実績の勘定はこちらを見る
export const SHORE_FISH = FISH.filter((f) => !isGated(f));

// 港の呼び名。図鑑の欄にも見取り図にも同じ言い方で出す
// (欄が狭いので短く。看板と同じ「3:1」で通じる)
export function portLabel(type) {
  return `${type === '3:1' ? '3:1' : RES_JP_SHORT[type] ?? type}の港`;
}

// どこで・いつ出るか。まだ釣っていない欄の説明に使う
export function placeLabel(f) {
  if (f?.deep && f?.night) return '夜の沖';
  if (f?.deep) return '沖';
  if (f?.night) return '夜';
  return '港';
}

// 港の種類は 3:1 と資源5種。ぬしはこのどれか1つにしか付かない。
export const PORT_TYPES = ['3:1', 'wood', 'brick', 'sheep', 'wheat', 'ore'];

// その港・その時刻で釣れるものだけを返す(ぬしは自分の港でだけ混ざる)。
//
// gates は「いま何が開いているか」── { deep: 沖へ投げた, night: 夜 }。
// **開いていない場所の魚は出ない。** 店の品は既存の魚を釣りやすくする
// ものではなく、別の場所と別の時刻を開くもの。
// ガラクタだけはどこでもいつでも引っかかる(何も無いと手応えが平坦になる)。
export function tableFor(portType, gates = {}) {
  const deep = !!gates.deep;
  const night = !!gates.night;
  return FISH.filter((f) => {
    if (f.tier === 'junk') return true;
    if (!!f.deep !== deep) return false;         // 沖の魚は沖だけ、港の魚は港だけ
    if (f.night && !night) return false;         // 夜の魚は夜だけ
    return f.at == null || f.at === portType;    // ぬしは自分の港だけ
  });
}

// いま何が開いているか。**大会のあいだは港の昼の表に戻す。**
//
// 大会は港で開かれる対称な勝負なので、払った人だけが大きい魚を申告できる
// 形にはしない(shop.js の禁じ手の2番目)。ここ1か所で落としておけば、
// 投げ先の切り替えも夜も、大会の最中は効かない。
export function fishGates({
  deepRod = false, lantern = false, castDeep = false, night = false, contest = false,
} = {}) {
  if (contest) return { deep: false, night: false };
  return { deep: !!(deepRod && castDeep), night: !!(lantern && night) };
}

// 大会に申告する長さ。ガラクタは 0(得点にならない)。
// **店の品で開く魚も 0。** 上の fishGates で出ないようにしてあるが、
// 大会が始まる直前に掛けた1匹が取り込み中に残ることがあるので、
// 申告のほうでも落としておく(二重の歯止め)。
export function contestCm(fish, cm) {
  if (!fish || fish.tier === 'junk' || isGated(fish)) return 0;
  const v = typeof cm === 'number' && Number.isFinite(cm) && cm > 0 ? cm : 0;
  return Math.round(v);
}

// 重み付き抽選。rng は数値1つ(rng.js)で、[新しい rng, 選ばれたもの] を返す。
export function pickFish(rng, portType, gates = {}) {
  const table = tableFor(portType, gates);
  const total = table.reduce((s, f) => s + f.w, 0);
  let v;
  [rng, v] = rngNext(rng);
  let acc = v * total;
  for (const f of table) {
    acc -= f.w;
    if (acc < 0) return [rng, f];
  }
  return [rng, table[table.length - 1]];
}

// 大きさ。小さいほうがよく出るように、乱数を3乗して下へ寄せる
// (毎回まんなかの大きさが出ると、記録更新の楽しみが無くなる)。
export function rollSize(rng, fish) {
  let v;
  [rng, v] = rngNext(rng);
  const k = v * v * v;
  const cm = fish.cm[0] + (fish.cm[1] - fish.cm[0]) * k;
  return [rng, Math.round(cm * 10) / 10];
}

// 0(その魚の最小)〜1(最大)。引きの強さと表示に使う。
export function sizeRatio(fish, cm) {
  const [lo, hi] = fish.cm;
  if (hi <= lo) return 0;
  return Math.max(0, Math.min(1, (cm - lo) / (hi - lo)));
}
