// インタラクティブミュージックの「譜面」。**音は鳴らさない。**
//
// ここは「いまどの場面で、どれだけ張り詰めているか」から
// 「どの和音を・どのくらいの速さで・どのパートをどの音量で鳴らすか」を
// 決めるだけ。Web Audio も DOM も触らないので `node --test` で検証できる
// (このリポジトリの決まり: 計算はレンダリングから切り離す)。
// 実際に鳴らすのは bgm.js。
//
// 作りは 3 つ:
//   1. **縦の重ね(レイヤー)** … ドローン/パッド/ハープ/笛/拍 の音量を
//      場面と高まりで足し引きする。曲を切らずに濃さだけ変えられる。
//   2. **横の差し替え** … 場面ごとに音階・和音・速さを入れ替える。
//      切り替えは**次の和音の頭**で効かせる(bgm.js)ので、途中で切れない。
//   3. **高まり(intensity 0〜1)** … 勝利への近さから作る。誰かが上がりに
//      近づくほど、速く・厚く・高くなる。
//
// 音階は MIDI 番号で持つ。D を主音にそろえてあるので、場面が変わっても
// 転調したようには聞こえず、旋法(明るさ)だけが変わる。

// 旋法。主音 D(62) からの音度で書く ── 場面の「色」はここでほぼ決まる。
const MODES = {
  // 中世風。いまのタイトル曲と同じ色
  dorian: [0, 2, 3, 5, 7, 9, 10],
  // 明るく牧歌的(4度が高い)。島の散策
  lydian: [0, 2, 4, 6, 7, 9, 11],
  // 素朴。ゆらぎが少なく、凪いだ感じ
  major: [0, 2, 4, 5, 7, 9, 11],
  // 不穏(2度が低い)。竜から逃げろ
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  // 短調寄り(6度が低い)。張り詰めた終盤
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  // 素朴で懐かしい。5音しかないので何を弾いても濁らない
  pentatonic: [0, 2, 4, 7, 9],
};

const ROOT = 62;   // D4

// 和音は「主音からの度数」で持つ。旋法に当てはめて実音にする。
//
// **4つで1周する輪として書く。** 途中に主和音へ戻る形(I-V-IV-I)を書くと、
// 輪の継ぎ目で主和音が2小節続き、対戦の場面なら 11 秒ものあいだ
// パッドが動かない ── 生成し続ける BGM ではここが「止まって」聞こえる。
// 最後の和音は主和音以外にして、次の周の頭へ引き渡す。
const CADENCES = {
  calm: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]],
  grand: [[0, 2, 4], [4, 6, 1], [3, 5, 0], [1, 3, 5]],
  drift: [[0, 2, 4], [1, 3, 5], [5, 0, 2], [3, 5, 0]],
  drive: [[0, 2, 4], [6, 1, 3], [5, 0, 2], [4, 6, 1]],
};

// パートの音量。base は高まり 0 のとき、add は高まり 1 で足されるぶん。
// **0 のパートは鳴らさない** ── 場面ごとの編成の違いがここに出る。
const L = (base, add = 0) => ({ base, add });

// 場面の一覧。**ここが「場面ごとに別の曲想」の全て。**
//
// dur は和音1つの長さ(秒)。短いほど急いた感じになる。
// rush は高まり 1 のときに何割まで詰めるか(0.7 なら 3割速くなる)。
export const SCENES = {
  // タイトル・メニュー。いまの中世風をそのまま残す(このゲームの顔)
  title: {
    mode: 'dorian', cadence: 'grand', dur: 5.6, rush: 1, octave: 0,
    layers: { drone: L(1), pad: L(1), harp: L(0.9), flute: L(0.8), pulse: L(0) },
    melody: 0.75,
  },
  // 対戦の本筋。**勝利への近さで3段階に切り替わる**(下の RACE を見よ)。
  // 平常。荘厳に構える
  game: {
    mode: 'dorian', cadence: 'grand', dur: 5.6, rush: 0.88, octave: 0,
    layers: {
      drone: L(0.85, 0.1), pad: L(0.8, 0.1), harp: L(0.45, 0.15),
      flute: L(0.35, 0.1), pulse: L(0),
    },
    melody: 0.6,
  },
  // 接近。誰かの手が上がりに届く。刻みが入り、和音進行が押し出す側へ変わる。
  //
  // **持続音は平常より薄くする。** ここは「拍が入ってくる」段なので、
  // 持続音を厚いままにすると刻みが埋もれて、平常との差が実測でほぼ
  // 消えていた(重心も揺れも動かなかった)。刻みに場所を空ける。
  // **旋律を引っこめるのが効く。** 笛が歌うのをやめて刻みが出てくると、
  // 「曲の濃さが変わった」ではなく「曲が変わった」と聞こえる。
  'game-close': {
    mode: 'dorian', cadence: 'drive', dur: 3.9, rush: 0.85, octave: 0,
    layers: {
      drone: L(0.7), pad: L(0.5), harp: L(0.75, 0.1),
      flute: L(0.2), pulse: L(0.9, 0.1),
    },
    melody: 0.2,
  },
  // 王手。次の手番で決まる。低く・速く・短調寄りへ倒して張り詰めさせる。
  //
  // **持続音はむしろ減らす。** 全部を最大にすると低音が刻みを覆って、
  // 実測では接近の段より拍が聞こえなくなった。張り詰めた感じは
  // 音の量ではなく「粒立ち(刻みと撥弦)」から出る。
  'game-final': {
    mode: 'aeolian', cadence: 'drive', dur: 3.2, rush: 0.85, octave: -12,
    layers: {
      drone: L(0.65), pad: L(0.55), harp: L(0.75), flute: L(0.15), pulse: L(1),
    },
    melody: 0.1,
  },
  // 島の散策。明るく、まばらに。歩くのが気持ちいい側へ
  walk: {
    mode: 'lydian', cadence: 'calm', dur: 7.2, rush: 1, octave: 0,
    layers: { drone: L(0.5), pad: L(0.7), harp: L(1), flute: L(0.55), pulse: L(0) },
    melody: 0.5,
  },
  // 釣り大会。凪いだ水面。動くものを減らして間を空ける
  fishing: {
    mode: 'major', cadence: 'drift', dur: 8.4, rush: 1, octave: 0,
    layers: { drone: L(0.6), pad: L(0.9), harp: L(0.55), flute: L(0.7), pulse: L(0) },
    melody: 0.45,
  },
  // ドラゴンから逃げろ。不穏に、速く、低く
  dragonhunt: {
    mode: 'phrygian', cadence: 'drive', dur: 3.6, rush: 1, octave: -12,
    layers: { drone: L(1), pad: L(0.8), harp: L(0.3), flute: L(0.2), pulse: L(0.85) },
    melody: 0.3,
  },
  // 蛮族を射る。行進曲の側。拍をはっきり出す
  raid: {
    mode: 'dorian', cadence: 'drive', dur: 3.2, rush: 1, octave: 0,
    layers: { drone: L(0.7), pad: L(0.6), harp: L(0.5), flute: L(0.5), pulse: L(1) },
    melody: 0.5,
  },
  // 丸太乗り。いちばん速く、跳ねる。笛は引っ込める
  logroll: {
    mode: 'pentatonic', cadence: 'drive', dur: 2.8, rush: 1, octave: 0,
    layers: { drone: L(0.4), pad: L(0.4), harp: L(1), flute: L(0.25), pulse: L(0.9) },
    melody: 0.35,
  },
  // 大富豪。円卓で軽く。刻みは出さず、ハープ主体
  daifugo: {
    mode: 'pentatonic', cadence: 'calm', dur: 4.4, rush: 1, octave: 0,
    layers: { drone: L(0.5), pad: L(0.6), harp: L(1), flute: L(0.6), pulse: L(0) },
    melody: 0.6,
  },
};

export const DEFAULT_SCENE = 'title';

export function sceneOf(name) {
  return SCENES[name] ?? SCENES[DEFAULT_SCENE];
}

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

// 旋法の度数 → MIDI。度数は 7 を超えたらオクターブ上へ回す
function noteOf(mode, degree, octave = 0) {
  const steps = MODES[mode] ?? MODES.dorian;
  const n = steps.length;
  const oct = Math.floor(degree / n);
  return ROOT + steps[((degree % n) + n) % n] + oct * 12 + octave;
}

// その場面の i 番目の和音。**同じ場面・同じ番号なら必ず同じ和音**
// (誰の端末でも、鳴らし直しても同じ ── 進行が飛んで聞こえない)。
export function chordAt(name, index) {
  const s = sceneOf(name);
  const cad = CADENCES[s.cadence] ?? CADENCES.calm;
  const degrees = cad[((index % cad.length) + cad.length) % cad.length];
  const notes = degrees.map((d) => noteOf(s.mode, d, s.octave));
  return {
    notes,
    // ドローンは和音の根音の 2 オクターブ下
    drone: notes[0] - 24,
    // 旋律に使える音(和音の上に 2 オクターブぶん)
    scale: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((d) => noteOf(s.mode, d, s.octave) + 12),
  };
}

// 和音1つの長さ。高まるほど詰まる
export function chordDur(name, intensity = 0) {
  const s = sceneOf(name);
  return s.dur * (1 - (1 - s.rush) * clamp01(intensity));
}

// パートの音量。**0 のパートは鳴らさない**
export function layerGains(name, intensity = 0) {
  const s = sceneOf(name);
  const k = clamp01(intensity);
  const out = {};
  for (const [part, { base, add }] of Object.entries(s.layers)) {
    out[part] = Math.max(0, Math.min(1, base + add * k));
  }
  return out;
}

// 旋律を鳴らす確率。高まると出番が増える(急かされている感じ)
export function melodyChance(name, intensity = 0) {
  return Math.min(1, sceneOf(name).melody + 0.2 * clamp01(intensity));
}

// ---- 勝利への近さ ----

// いちばん進んでいる人が上がりに何点まで迫ったか。
//
// 「自分が近い」ではなく「誰かが近い」で見る ── 追う側にとっても
// 張り詰める場面なので、卓ぜんたいの緊張を音にする。
//
// **段で切り替える。濃さを連続に動かすだけでは耳に届かない。**
// はじめは音量と速さだけを 0〜1 で滑らかに動かしていたが、それだと
// 「どの音が鳴るか」が最後まで変わらないので、実際に遊んでも気づけなかった。
// いまは段ごとに旋法・和音進行・音域・速さ・編成を丸ごと入れ替える
// (場面の切り替えと同じ仕組みに乗せてある = 次の和音の頭で変わる)。
const RACE = [
  // [ここから下の残り点で, 場面名]
  [1, 'game-final'],   // 王手。次の手番で上がられる
  [3, 'game-close'],   // 接近。上がりに手が届く
];

export function raceScene(best, goal) {
  if (!Number.isFinite(best) || !Number.isFinite(goal) || goal <= 0) return 'game';
  const left = goal - best;
  for (const [at, name] of RACE) if (left <= at) return name;
  return 'game';
}

// 段のなかでの細かい濃さ。段が上がるほど下地も濃くしておく
// (段の切り替えが主役で、こちらは味つけ)。
export function raceIntensity(best, goal) {
  if (!Number.isFinite(best) || !Number.isFinite(goal) || goal <= 0) return 0;
  const left = goal - best;
  if (left <= 1) return 1;
  if (left >= RACE[RACE.length - 1][0] + 1) return 0;
  return 0.5;
}
