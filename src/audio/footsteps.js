// 足音。「地面の性質 × 体の動き」で音を組み立てる。
//
// 音を鳴らすのは sfx.js だが、どんな音にするかの決めごとはここに置く
// (Web Audio を持たない node --test で、表の抜けや強弱の関係を検査できる)。
//
// **足音に音程を持たせない。** これがいちばん大事。
// 以前は体重の音を正弦波(単一の高さの音)で鳴らしていて、実測すると
// **その正弦波だけで音全体のエネルギーの 81〜98% を占めていた**。
// つまりどの地面を歩いても、ほぼ同じ高さの「ポーン」が鳴っていたわけで、
// 「どこを歩いても鉄の上を歩いてるみたい」という状態になっていた。
// 地面の素材を表しているノイズは、残りの 2〜19% しか聞こえていなかった。
// いまは3層とも**ノイズ由来**で、音程を持つ部品はひとつも無い。
//
// 足音は3つの重ね合わせでできている:
//   scuff … 靴が地面をこする音。帯域と長さで「何を踏んだか」が決まる。
//   body  … 体重が乗る鈍い音。**ローパスしたノイズ**で、正弦波は使わない。
//           硬い地面ほど大きく、砂や落ち葉では鳴らさない。
//   grit  … 粒立ち。落ち葉のカサカサ、砂利のジャリ、水しぶきの粒。
//           音量を細かくギザギザに振って、小さな粒の連なりを作る。
//
// **素材の違いは「どの層があるか」で出す。** 帯域の中心をずらすだけでは
// 落ち葉と砂の区別は付かない。落ち葉は粒が主役、砂は粒がひとつも無い
// なめらかな摩擦音、岩は鋭い当たり、というふうに構造から変える。

const GROUND = {
  // 森: 落ち葉。粒(カサカサ)が主役。落ち葉は衝撃を吸うので体重の音はしない
  forest: {
    scuff: { freq: 2600, q: 0.7, dur: 0.10, gain: 0.030, sweep: 0.5 },
    grit: { freq: 2900, q: 0.9, dur: 0.14, gain: 0.090, sweep: 0.45, n: 28 },
    body: null,
  },
  // 牧草地: 草を擦るサッ。粒は控えめ、下に柔らかい土
  pasture: {
    scuff: { freq: 2350, q: 0.75, dur: 0.10, gain: 0.048, sweep: 0.5 },
    grit: { freq: 2400, q: 0.9, dur: 0.08, gain: 0.020, sweep: 0.55, n: 14 },
    body: { freq: 260, q: 0.5, dur: 0.055, gain: 0.055, sweep: 0.55 },
  },
  // 畑: 耕したての土。**ほぐれて崩れる**ので、粒が立ち、体重は吸われる。
  // 隣の丘(締まった粘土)と紛らわしくならないよう、こちらは粒で寄せる
  field: {
    scuff: { freq: 1100, q: 0.7, dur: 0.055, gain: 0.040, sweep: 0.5 },
    grit: { freq: 1750, q: 0.8, dur: 0.08, gain: 0.052, sweep: 0.5, n: 18 },
    body: { freq: 230, q: 0.5, dur: 0.05, gain: 0.048, sweep: 0.5 },
  },
  // 丘: 締まった粘土のドッ。**崩れないので粒が無い**。畑と逆に、
  // 短く硬い当たりと深い体重の音だけで作る
  hill: {
    scuff: { freq: 560, q: 0.5, dur: 0.04, gain: 0.070, sweep: 0.55 },
    grit: null,
    body: { freq: 165, q: 0.5, dur: 0.055, gain: 0.090, sweep: 0.5 },
  },
  // 山: 岩を叩くコツッ。当たりが鋭く短い。小石が少し散る
  mountain: {
    scuff: { freq: 3000, q: 1.4, dur: 0.035, gain: 0.055, sweep: 0.5 },
    grit: { freq: 3500, q: 1.2, dur: 0.06, gain: 0.040, sweep: 0.5, n: 10 },
    body: { freq: 320, q: 0.5, dur: 0.04, gain: 0.055, sweep: 0.45 },
  },
  // 砂漠: 砂に沈むシュゥ。**粒がひとつも無い**なめらかな摩擦音。
  // 立ち上がりも遅い(砂は「当たる」のではなく「潜る」)
  desert: {
    scuff: { freq: 5200, q: 0.5, dur: 0.14, gain: 0.055, sweep: 0.4, attack: 0.02 },
    grit: null,
    body: null,
  },
  // 湖のふち: 水を跳ねるピチャッ。帯域を大きく下げ(sweep が小さい)、
  // まばらな粒を water の飛沫として散らす
  lake: {
    scuff: { freq: 2600, q: 0.8, dur: 0.11, gain: 0.060, sweep: 0.22 },
    grit: { freq: 5000, q: 1.5, dur: 0.13, gain: 0.030, sweep: 0.7, n: 9 },
    body: { freq: 300, q: 0.5, dur: 0.05, gain: 0.045, sweep: 0.5 },
  },
  // 金鉱: 硬い鉱脈のカツッ。いちばん明るく鋭い。
  // **それでも音程は持たせない** ── Q を上げて色付けするだけに留める
  gold: {
    scuff: { freq: 3800, q: 2.2, dur: 0.055, gain: 0.060, sweep: 0.75 },
    grit: { freq: 5200, q: 1.6, dur: 0.07, gain: 0.032, sweep: 0.6, n: 12 },
    body: { freq: 340, q: 0.5, dur: 0.045, gain: 0.052, sweep: 0.5 },
  },
};

// 知らない地形が来ても黙らないように(モードが増えたときの保険)
const DEFAULT_GROUND = GROUND.field;

// 動きごとの倍率。踏み切りと着地は、歩きより大きく・低く・長く。
// 着地がいちばん重い ── 高さのぶんが体重に乗るので。
const MOTION = {
  walk: { gain: 1, dur: 1, body: 1, pitch: 1 },
  jump: { gain: 1.3, dur: 1.2, body: 2.0, pitch: 0.9 },
  land: { gain: 1.75, dur: 1.45, body: 2.6, pitch: 0.8 },
};

export const GROUND_KINDS = Object.keys(GROUND);
export const MOTION_KINDS = Object.keys(MOTION);

// 層ひとつぶんを、動きの倍率と揺らぎで加工する。
// gk は音量の倍率(body だけ動きで別枠に重くなる)。
function layer(src, m, k, gk, gait) {
  if (!src) return null;
  const o = {
    freq: Math.round(src.freq * m.pitch * (1 + k * 0.12)),
    q: src.q,
    dur: +(src.dur * m.dur).toFixed(4),
    gain: +(src.gain * gk * gait * (1 + k * 0.15)).toFixed(4),
    sweep: src.sweep,
  };
  if (src.n != null) o.n = src.n;
  if (src.attack != null) o.attack = src.attack;
  return o;
}

// 地面と動きから、鳴らす音の中身を作る。
// vary は -1〜1 の揺らぎ(同じ音が続くと機械的に聞こえるので、呼ぶ側で振る)。
// gait は歩く速さ 0〜1。ゆっくり歩けば小さい音になる ── ただし
// **踏み切りと着地は速さに関係なく出す**(跳んだ手ごたえが消えるので)。
export function stepSound(terrain, motion = 'walk', vary = 0, gait = 1) {
  const g = GROUND[terrain] ?? DEFAULT_GROUND;
  const m = MOTION[motion] ?? MOTION.walk;
  // NaN が来ても黙らないように(音が消えるより、揺らぎ無しで鳴るほうがよい)
  const k = Number.isFinite(vary) ? Math.max(-1, Math.min(1, vary)) : 0;
  const w = Number.isFinite(gait) ? Math.max(0, Math.min(1, gait)) : 1;
  const soft = m === MOTION.walk ? 0.45 + w * 0.55 : 1;
  return {
    scuff: layer(g.scuff, m, k, m.gain, soft),
    grit: layer(g.grit, m, k, m.gain, soft),
    body: layer(g.body, m, k, m.body, soft),
  };
}
