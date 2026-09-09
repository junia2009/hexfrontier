// 実績と称号の定義(設計書 §11)
//
// 判定材料は「終局時の state から取った到達値(marks)」と「この対戦の記録」と
// 「累計の戦績」だけ。ゲーム中に別途カウンタを持たせるとルールエンジンに
// 手を入れることになり、既存の挙動(回帰ハッシュ)を揺らすので、そこには触らない。
//
// 実績の書き方は2通り:
//   数値もの   { mark, goal, needsWin? }  … marks[mark] >= goal で解除。進捗も出せる
//   それ以外   { check(ctx) }             … 真偽だけ。進捗は出ない
//
// 数値ものを marks 経由にしているのは、**戦績画面で「3/4」と進捗を出すため**。
// 進捗には過去の最高到達値が要るので、marks を対戦記録に焼き付けて集計する。
//
// tier は「取ったときの手応え」。実測(CPU 同士を各モード30戦)の出現率で決めた。
//   bronze … 普通に遊んでいれば取れる
//   silver … 狙わないと取れない
//   gold   … かなり狙って、かつ噛み合わないと取れない

import { longestRoadLength } from './rules/victory.js';
import { hasOldShoe } from './rules/fish.js';
import { FISH } from './minigame/fish.js';

export const MODE_JP = {
  base: '基本',
  cak: '都市と騎士',
  dragon: 'ドラゴンの島',
  fish: '漁師たち',
  sea: '航海者たち',
};

export const TIERS = ['gold', 'silver', 'bronze'];
export const TIER_JP = { gold: '金', silver: '銀', bronze: '銅' };
export const TIER_ICON = { gold: '🥇', silver: '🥈', bronze: '🥉' };

// ---- 到達値(marks)----
// 終局時の state から、実績の判定と進捗に使う数値だけを取り出す。
// state を読むのはここだけ。以降は marks しか見ない。
export function marksOf(state, me) {
  const mine = (obj, key) => Object.values(obj ?? {}).filter((x) => x[key ?? 'player'] === me);
  const p = state.players?.[me];
  if (!p) return {};
  const metropolis = Object.values(state.metropolis ?? {})
    .filter((vid) => vid != null && state.buildings?.[vid]?.player === me).length;
  return {
    cities: mine(state.buildings).filter((b) => b.type === 'city').length,
    roadLen: safe(() => longestRoadLength(state, me), 0),
    knights: mine(state.knights).length,
    ships: mine(state.ships).length,
    metropolis,
    defender: p.defenderPoints ?? 0,
    maxTrack: Math.max(0, ...Object.values(p.improvements ?? {})),
    treasures: p.treasures ?? 0,
    islands: (p.islands ?? []).filter((i) => i !== 0).length,
    largestArmy: state.largestArmy?.player === me ? 1 : 0,
    oldShoe: safe(() => (hasOldShoe(p) ? 1 : 0), 0),
  };
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// 進捗を出すときの単位(「3/4体」の「体」)
const UNIT = {
  cities: 'つ', roadLen: '', knights: '体', ships: '隻',
  metropolis: 'つ', defender: '回', maxTrack: 'Lv', treasures: 'つ', islands: 'つ',
  raidScore: '点', raidWave: '波', raidAcc: '%',
  daifugoPlayed: '回', daifugoBest: '人', rollBest: '秒',
  fishSpecies: '種類', fishBiggest: 'cm', fishingBest: 'cm',
  huntWon: '回', raidMeetBest: '点',
};

// そのモードで勝った実績(5モードぶん自動で作る)
const modeWins = Object.entries(MODE_JP).map(([mode, jp]) => ({
  id: `win-${mode}`,
  name: `${jp}を制す`,
  desc: `${jp}で勝利する`,
  title: `${jp}の覇者`,
  icon: '🏆',
  tier: 'bronze',
  mode,
  check: ({ result }) => result.won && result.mode === mode,
}));

export const ACHIEVEMENTS = [
  ...modeWins,

  {
    id: 'win-all-modes',
    name: '全ルール制覇',
    desc: '5つのルール全てで勝利する',
    title: '大開拓者',
    icon: '👑', tier: 'gold',
    check: ({ stats }) => Object.values(stats.byMode).every((m) => m.won > 0),
    // 「5モード中いくつ勝ったか」を進捗として出す
    progress: ({ stats }) => ({
      now: Object.values(stats.byMode).filter((m) => m.won > 0).length, goal: 5, unit: 'ルール',
    }),
  },
  {
    id: 'win-hard',
    name: '強敵を退ける',
    desc: 'CPU の強さ「強い」で勝利する',
    title: '猛者',
    icon: '🔥', tier: 'bronze',
    check: ({ result }) => result.won && result.difficulty === 'hard',
  },
  {
    id: 'win-4p-hard',
    name: '四面楚歌',
    desc: 'CPU3体・強さ「強い」で勝利する',
    title: '孤高',
    icon: '⚔️', tier: 'silver',
    check: ({ result }) => result.won && result.difficulty === 'hard' && result.players >= 4,
  },
  {
    id: 'win-fast',
    name: '電光石火',
    desc: '60ターン以内に勝利する',
    title: '疾風',
    icon: '⚡', tier: 'silver',
    // **ここは自分では短くできない実績**。決着の速さは4人ぜんぶのペースで
    // 決まるので、狙って寄せられる(船を並べる・騎士を出す)ものとは違う。
    // だから届く割合は、そのまま「運がどれだけ要るか」になる。
    //
    // 自己対戦 600 戦の実測(勝つまでのターン数。turn は手番の回数):
    //   基本 中央 75 / 都市と騎士 95 / ドラゴン 77 / 漁師 69 / 航海者 95
    //   50ターン以内 …… 全体 3%。**都市と騎士と航海者では 0%**(最短 58/64)
    //   60ターン以内 …… 全体 12%、いちばん速い漁師たちの島なら 27%
    // 50 のままだと、銀にしては金(騎士団 3% / 島から島へ 1%)より珍しく、
    // しかも島によっては不可能だった。60 なら島を選んで急げば手が届く。
    check: ({ result }) => result.won && result.turns <= 60,
  },
  {
    id: 'longest-road',
    name: '街道王',
    desc: '長さ10以上の交易路をつないで勝利する',
    title: '街道王',
    icon: '🛤️', tier: 'silver',
    mark: 'roadLen', goal: 10, needsWin: true,
  },
  {
    id: 'all-cities',
    name: '都市国家',
    desc: '都市4つを全て建てて勝利する',
    title: '都市の主',
    icon: '🏰', tier: 'bronze',
    mark: 'cities', goal: 4, needsWin: true,
  },
  {
    id: 'largest-army',
    name: '常勝軍',
    desc: '最大騎士力を持ったまま勝利する(都市と騎士以外)',
    title: '将軍',
    icon: '🎖', tier: 'silver',
    check: ({ marks, result }) => result.won && marks.largestArmy === 1,
  },
  {
    id: 'games-10',
    name: '常連',
    desc: '10回遊ぶ',
    title: '常連',
    icon: '📘', tier: 'bronze',
    check: ({ stats }) => stats.total.played >= 10,
    progress: ({ stats }) => ({ now: stats.total.played, goal: 10, unit: '回' }),
  },
  {
    id: 'games-50',
    name: '開拓者の鑑',
    desc: '50回遊ぶ',
    title: '生涯開拓者',
    icon: '📚', tier: 'silver',
    check: ({ stats }) => stats.total.played >= 50,
    progress: ({ stats }) => ({ now: stats.total.played, goal: 50, unit: '回' }),
  },

  // ---- 都市と騎士 ----
  {
    id: 'cak-two-metropolis',
    name: '二大都市',
    desc: 'メトロポリスを2つ持って勝利する',
    title: '大都市の主',
    icon: '🏙', tier: 'silver', mode: 'cak',
    mark: 'metropolis', goal: 2, needsWin: true,
  },
  {
    id: 'cak-defender',
    name: '島の守護者',
    desc: '蛮族の襲来を3度しのいで最大の功を挙げる',
    title: '守護者',
    icon: '🛡', tier: 'silver', mode: 'cak',
    mark: 'defender', goal: 3,
  },
  {
    id: 'cak-knights',
    name: '騎士団',
    desc: '騎士を4体そろえる',
    title: '騎士団長',
    icon: '🐴', tier: 'gold', mode: 'cak',
    mark: 'knights', goal: 4,
  },
  {
    id: 'cak-max-track',
    name: '極めし者',
    desc: '都市改良をひとつの系統で Lv5 まで上げる',
    title: '賢者',
    icon: '🔬', tier: 'silver', mode: 'cak',
    mark: 'maxTrack', goal: 5,
  },

  // ---- ドラゴンの島 ----
  {
    id: 'dragon-treasure',
    name: '竜の宝',
    desc: '財宝を3つ集める',
    title: '宝物庫',
    icon: '💎', tier: 'bronze', mode: 'dragon',
    mark: 'treasures', goal: 3,
  },

  // ---- 漁師たち ----
  {
    id: 'fish-shoe-win',
    name: '泥沼の勝利',
    desc: '古い靴を抱えたまま勝利する',
    title: '泥中の蓮',
    icon: '👟', tier: 'silver', mode: 'fish',
    check: ({ marks, result }) => result.won && result.mode === 'fish' && marks.oldShoe === 1,
  },

  // ---- 航海者たち ----
  {
    id: 'sea-islands',
    name: '島から島へ',
    desc: '小島3つに入植する',
    title: '島の王',
    icon: '🏝', tier: 'gold', mode: 'sea',
    mark: 'islands', goal: 3,
  },
  {
    id: 'sea-fleet',
    name: '大船団',
    desc: '船を13隻ならべる',
    title: '提督',
    icon: '⛵', tier: 'gold', mode: 'sea',
    mark: 'ships', goal: 13,
  },

  // ---- 散策部屋(釣り大会)----
  //
  // 対戦の実績と違って、解除の合図は終局ではなく大会の結果発表。判定材料も
  // marks ではないので、checkMeet を持たせて別の入口(unlockedByMeet)で見る。
  // ここに check も mark も書かないので、対戦の締めでは passes() が false に
  // なって外れる ── 対戦を1戦終えたら釣り大会の実績が付いた、を防ぐ。
  {
    id: 'meet-win',
    name: '大会を制す',
    desc: '散策部屋の釣り大会で優勝する',
    title: '釣り名人',
    icon: '🎣', tier: 'silver', scope: '散策部屋',
    checkMeet: ({ meets }) => (meets.fishing?.won ?? 0) > 0,
  },
  {
    id: 'meet-fish-haul',
    name: '大漁',
    desc: '釣り大会の1回で 合計 700cm 釣り上げる',
    title: '大漁旗',
    icon: '🐳', tier: 'gold', scope: '散策部屋',
    // CPU を6人で回して測ると 428〜663cm(中央 580)。上位を超える線。
    mark: 'fishingBest', goal: 700,
    checkMeet: ({ meets }) => (meets.fishing?.best ?? 0) >= 700,
  },
  {
    id: 'hunt-survive',
    name: '竜をかわす',
    desc: '「ドラゴンから逃げろ」で最後まで逃げきる',
    title: '韋駄天',
    icon: '🐉', tier: 'silver', scope: '散策部屋',
    checkMeet: ({ meets }) => (meets.dragonhunt?.won ?? 0) > 0,
  },

  {
    id: 'hunt-thrice',
    name: '竜を出し抜く',
    desc: '「ドラゴンから逃げろ」で3回逃げきる',
    title: '逃げ足',
    icon: '🦎', tier: 'gold', scope: '散策部屋',
    // 逃げきれば必ず制限時間ぶん残るので、秒ではなく回数で厚みを出す
    mark: 'huntWon', goal: 3,
    checkMeet: ({ meets }) => (meets.dragonhunt?.won ?? 0) >= 3,
  },
  {
    id: 'daifugo-win',
    name: '卓を制す',
    desc: '散策部屋の大富豪で1番に上がる',
    title: '大富豪',
    icon: '🃏', tier: 'silver', scope: '散策部屋',
    checkMeet: ({ meets }) => (meets.daifugo?.won ?? 0) > 0,
  },
  {
    id: 'daifugo-regular',
    name: '卓の常連',
    desc: '散策部屋の大富豪を10回遊ぶ',
    title: '常連客',
    icon: '🪑', tier: 'bronze', scope: '散策部屋',
    mark: 'daifugoPlayed', goal: 10,
    checkMeet: ({ meets }) => (meets.daifugo?.played ?? 0) >= 10,
  },
  {
    id: 'daifugo-table4',
    name: '大卓を制す',
    desc: '4人以上の卓で大富豪になる',
    title: '札さばき',
    icon: '🎩', tier: 'gold', scope: '散策部屋',
    mark: 'daifugoBest', goal: 4,
    checkMeet: ({ meets }) => (meets.daifugo?.best ?? 0) >= 4,
  },
  {
    id: 'raid-meet-score',
    name: '浜を守りきる',
    desc: '「蛮族を射る」大会の1回で 150点とる',
    title: '浜の守り',
    icon: '🛟', tier: 'gold', scope: '散策部屋',
    // CPU を6人で回して測ると 98〜141点(中央 132)。上位を超える線。
    mark: 'raidMeetBest', goal: 150,
    checkMeet: ({ meets }) => (meets.raid?.best ?? 0) >= 150,
  },
  {
    id: 'roll-win',
    name: '丸太を制す',
    desc: '散策部屋の丸太乗りで最後まで残る',
    title: '丸太乗り',
    icon: '🪵', tier: 'silver', scope: '散策部屋',
    checkMeet: ({ meets }) => (meets.logroll?.won ?? 0) > 0,
  },
  {
    id: 'roll-minute',
    name: '流れに逆らう',
    desc: '丸太乗りで 60 秒以上落ちずに乗り続ける',
    title: '川渡り',
    icon: '🌀', tier: 'gold', scope: '散策部屋',
    // 丸太は終盤に歩きより速くなるので、60 秒は「押し負けるところまで
    // 粘った」の線(実測: 達人でおよそ 65 秒)。
    mark: 'rollBest', goal: 60,
    checkMeet: ({ meets }) => (meets.logroll?.best ?? 0) >= 60,
  },
  {
    id: 'raid-meet-win',
    name: '射手の頂点',
    desc: '散策部屋の「蛮族を射る」大会で優勝する',
    title: '射手頭',
    icon: '🏅', tier: 'silver', scope: '散策部屋',
    checkMeet: ({ meets }) => (meets.raid?.won ?? 0) > 0,
  },

  // ---- 港での釣り(図鑑)----
  //
  // 大会とは別の入口(checkFish)で見る ── ひとりで港に立って釣っただけでも
  // 付く。判定材料は progress.fish(釣った魚の表)。
  {
    id: 'fish-ten',
    name: '釣り好き',
    desc: '図鑑を10種類うめる',
    title: '釣り好き',
    icon: '🎏', tier: 'bronze', scope: '港',
    mark: 'fishSpecies', goal: 10,
    checkFish: ({ fish }) => fishCounts(fish).species >= 10,
  },
  {
    id: 'fish-lord',
    name: '港のぬし',
    desc: 'どこかの港で「ぬし」を釣り上げる',
    title: 'ぬし釣り',
    icon: '🌝', tier: 'silver', scope: '港',
    // ぬしは港ごとに1種類しか出ない。どれか1匹で付く
    checkFish: ({ fish }) => fishCounts(fish).lords >= 1,
  },
  {
    id: 'fish-big',
    name: '大物',
    desc: '2メートルを超える魚を釣り上げる',
    title: '大物釣り',
    icon: '📏', tier: 'silver', scope: '港',
    mark: 'fishBiggest', goal: 200,
    checkFish: ({ fish }) => fishCounts(fish).biggest >= 200,
  },
  {
    id: 'fish-kraken',
    name: '幻を釣る',
    desc: 'ダイオウイカを釣り上げる',
    title: '深海の主',
    icon: '🦑', tier: 'gold', scope: '港',
    // いちばん出にくい1種。狙って釣れるものではないので通しの目標にする
    checkFish: ({ fish }) => fishCounts(fish).myth,
  },
  {
    id: 'fish-book',
    name: '図鑑を埋める',
    desc: '図鑑を全種類うめる',
    title: '博物学者',
    icon: '📖', tier: 'gold', scope: '港',
    mark: 'fishSpecies', goal: FISH.length,
    checkFish: ({ fish }) => {
      const c = fishCounts(fish);
      return c.species >= c.total;
    },
  },

  // ---- 散策部屋(蛮族を射る・ひとりの記録)----
  //
  // 大会と違って、ひとりで櫓に立った回でも付く。判定材料は「その端末の
  // 自己最高」なので、checkRaid を持たせて別の入口(unlockedByRaid)で見る。
  // mark / goal は**戦績画面の進捗を出すためだけ**に書いてある ── 判定は
  // checkRaid のほうで、対戦の締めでは passes() が外す(下のコメント参照)。
  {
    id: 'raid-wave-3',
    name: '浜の守り手',
    desc: '「蛮族を射る」で3波まで凌ぐ',
    title: '浜の守り手',
    icon: '🏹', tier: 'bronze', scope: '散策部屋',
    mark: 'raidWave', goal: 3,
    checkRaid: ({ raid }) => raid.wave >= 3,
  },
  {
    id: 'raid-score-100',
    name: '撃退百',
    desc: '「蛮族を射る」で撃退 100 点を挙げる',
    title: '弓の名手',
    icon: '🌊', tier: 'silver', scope: '散策部屋',
    mark: 'raidScore', goal: 100,
    checkRaid: ({ raid }) => raid.best >= 100,
  },
  {
    id: 'raid-accuracy',
    name: '一矢入魂',
    desc: '20射以上を放った回で、命中率7割を出す',
    title: '狙撃手',
    icon: '🎯', tier: 'silver', scope: '散策部屋',
    mark: 'raidAcc', goal: 70,
    checkRaid: ({ raid }) => raid.acc >= 70,
  },
  {
    id: 'raid-wave-6',
    name: '不落の櫓',
    desc: '「蛮族を射る」で6波まで凌ぐ',
    title: '櫓の主',
    icon: '🗼', tier: 'gold', scope: '散策部屋',
    mark: 'raidWave', goal: 6,
    checkRaid: ({ raid }) => raid.wave >= 6,
  },

  // ---- 散策部屋(島で見つけたもの)----
  //
  // 勝ち負けではなく「そこへ行った」で付く。大会の結果とも別の入口なので
  // checkSeen を持たせて unlockedBySeen で見る(checkMeet と同じ考え方)。
  {
    id: 'nest-visit',
    name: '竜の巣',
    desc: '眠っている竜のそばまで登る',
    title: '竜の見張り',
    icon: '🏔', tier: 'bronze', scope: '散策部屋',
    checkSeen: ({ seen }) => !!seen.nest,
  },
];

// 対戦以外の入口(散策部屋)を持つ実績の目印。
// **この印が付いているものは、対戦の締めでは絶対に付かない。** 進捗を出す
// ために mark を持たせることがあるので、mark の有無では見分けられない
// ── 対戦を1戦終えたら散策部屋の実績が付いた、を防ぐのはここ。
// 対戦の締め(unlockedBy)以外の入口。**足したらここにも足すこと** ──
// 入口を持つ実績は「対戦を1戦終えたら付く」に混ぜてはいけない。
// test/progress.test.js もこの一覧を読む(二重に書くと片方だけ古くなる)。
export const OTHER_GATES = ['checkMeet', 'checkSeen', 'checkRaid', 'checkFish'];

// 数値ものの判定は共通(check を書かなくてよい)
function passes(a, ctx) {
  if (OTHER_GATES.some((k) => a[k])) return false;
  if (a.check) return !!a.check(ctx);
  if (a.mark == null) return false;
  if (a.needsWin && !ctx.result.won) return false;
  if (a.mode && ctx.result.mode !== a.mode) return false;
  return (ctx.marks?.[a.mark] ?? 0) >= a.goal;
}

// 判定が例外で落ちても対戦の締めを止めない(実績はおまけなので黙って見送る)
export function unlockedBy(ctx) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    try {
      if (passes(a, ctx)) out.push(a.id);
    } catch {
      // この実績だけ見送る
    }
  }
  return out;
}

// 散策部屋の入口。gate に書いた判定を持つ実績だけを見る。
function unlockedVia(gate, ctx) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (!a[gate]) continue;
    try {
      if (a[gate](ctx)) out.push(a.id);
    } catch {
      // この実績だけ見送る
    }
  }
  return out;
}

// 大会のほうの判定。対戦の締めとは別の入口にしてある(上のコメント参照)。
// ctx は { meets } ── 遊びごとの累計( played / won / best )。
export function unlockedByMeet(ctx) {
  return unlockedVia('checkMeet', ctx);
}

// 島で見つけたもののほう。ctx は { seen } ── 行った場所の一覧。
export function unlockedBySeen(ctx) {
  return unlockedVia('checkSeen', ctx);
}

// 蛮族を射る(ひとりの記録)のほう。ctx は { raid } ── 自己最高の一式。
export function unlockedByRaid(ctx) {
  return unlockedVia('checkRaid', ctx);
}

// 釣りの図鑑のほう。ctx は { fish } ── { 魚の id: { n, best } } の表。
// 大会とは別の入口にしてある ── 港でひとり釣っただけでも付く。
export function unlockedByFish(ctx) {
  return unlockedVia('checkFish', ctx);
}

// 図鑑の数えかた。実績の判定と戦績の進捗で同じ式を通す。
export function fishCounts(book) {
  const got = Object.keys(book ?? {});
  const kinds = new Set(got);
  const tierOf = (id) => FISH.find((f) => f.id === id)?.tier ?? null;
  return {
    species: kinds.size,
    total: FISH.length,
    lords: got.filter((id) => tierOf(id) === 'legend').length,
    myth: got.some((id) => tierOf(id) === 'myth'),
    biggest: got.reduce((m, id) => Math.max(m, book[id]?.best ?? 0), 0),
  };
}

// 実績の「どこで取るものか」。モードに紐づかないものは scope に書く。
export function scopeOf(a) {
  if (a.scope) return a.scope;
  return a.mode ? MODE_JP[a.mode] : 'すべてのルール';
}

// 戦績画面で出す進捗。{ now, goal, unit } | null
// 数値ものは「これまでの最高到達値」、それ以外は progress() を持つものだけ。
export function progressOf(a, stats) {
  try {
    if (a.progress) return { unit: '', ...a.progress({ stats }) };
    if (a.mark == null) return null;
    return { now: stats.bests?.[a.mark] ?? 0, goal: a.goal, unit: UNIT[a.mark] ?? '' };
  } catch {
    return null;
  }
}

export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) ?? null;
}

export function achievementsByTier(tier) {
  return ACHIEVEMENTS.filter((a) => a.tier === tier);
}

// 称号は実績と1対1。持っている実績の称号だけ名乗れる。
export function titleOf(id) {
  return achievementById(id)?.title ?? null;
}
