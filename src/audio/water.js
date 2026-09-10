// 水の音。足音(footsteps.js)と同じ考えで、決めごとだけをここに置く。
// 実際に鳴らすのは sfx.js。Web Audio の無い node --test でも検査できる。
//
// **着水は「1発の音」ではなく、順番に起きる4つの出来事。**
// 前は「ノイズ2発 + 下降する正弦波」で済ませていて、実測すると
// **その正弦波だけで音全体のエネルギーの 74% を占めていた**。
// 73Hz の低い音がひとりで鳴っているので、水ではなく「ボヨン」と
// 聞こえる ── 足音が鉄板に聞こえていたのと同じ壊れ方をしていた。
// しかも叩きのノイズは帯域を 900→3150Hz と**上に**振っていた。
// 水は落ちて沈むので、明るさは下がっていくのが正しい。
//
//   slap  … 水面を叩く。いちばん明るく、いちばん短い。
//   gulp  … 体が作った空洞が潰れる「ドッ」。**帯域が下がっていく**のが肝で、
//           ここが「沈んだ」感じを作る。音の芯はこの層。
//   spray … 跳ね上がった飛沫。粒立ち(音量をギザギザに振る)で散らす。
//   fizz  … 泡が消えていく細かい高音。いちばん長く尾を引く。
//   drops … 水滴。**短く・高く・小さく・ばらばらに**鳴る正弦波。
//
// **鳴り始める時刻(at)も表に持つ。** ここが音の要で、順番が崩れると
// ただの雑音になる。とくに明るい層(飛沫・泡)を早く出しすぎると、
// 沈み込みの暗さを覆ってしまう ── 実測で、飛沫を 30ms から出していた
// ときは着水の 120ms 時点の明るさが 3038→6799Hz と**上がって**いて、
// 「沈んだ」ではなく「弾けた」に聞こえていた。明るい層は遅らせる。
//
// **水の泡だけは音程を持ってよい。** 泡は実際に固有の高さで共鳴するし、
// 「ポチャン」の正体はこれなので、これが無いと水に聞こえない。
// ただし壊れ方を繰り返さないよう、条件を厳しく縛る ──
// 高く(600Hz 以上)・短く(0.08 秒以下)・小さく(芯の層より十分下)・
// 数を散らす。**低く長く大きい音程はどこにも置かない**。
// test/water.test.js がこの縛りを押さえている。

const WATER = {
  // 海に落ちた(体ごと)。いちばん大きく、いちばん低くまで沈む
  dive: {
    slap: { at: 0, freq: 2800, q: 0.6, dur: 0.055, gain: 0.130, sweep: 0.35 },
    gulp: { at: 0.012, freq: 760, q: 0.6, dur: 0.32, gain: 0.185, sweep: 0.22 },
    spray: { at: 0.10, freq: 4600, q: 1.1, dur: 0.42, gain: 0.055, sweep: 0.65, n: 34 },
    fizz: { at: 0.17, freq: 6200, q: 0.5, dur: 0.40, gain: 0.0022, sweep: 0.5, attack: 0.05 },
    drops: { at: 0.13, n: 6, lo: 820, hi: 2200, gain: 0.013, dur: 0.055, spread: 0.45, rise: 5 },
  },
  // 浮きが落ちる「ポチャン」。小さく浅い ── 沈み込みはほとんど無く、
  // 水滴の高さが主役になる(だから「ポチャン」と聞こえる)
  plop: {
    slap: { at: 0, freq: 3400, q: 0.7, dur: 0.03, gain: 0.055, sweep: 0.4 },
    gulp: { at: 0.01, freq: 900, q: 0.6, dur: 0.11, gain: 0.080, sweep: 0.35 },
    spray: { at: 0.04, freq: 5000, q: 1.2, dur: 0.16, gain: 0.028, sweep: 0.7, n: 14 },
    fizz: null,
    drops: { at: 0.05, n: 3, lo: 1100, hi: 2600, gain: 0.014, dur: 0.05, spread: 0.14, rise: 7 },
  },
  // 魚が水面で暴れる。叩きが繰り返す感じを、飛沫を厚くして出す
  thrash: {
    slap: { at: 0, freq: 1800, q: 0.8, dur: 0.05, gain: 0.090, sweep: 0.45 },
    gulp: { at: 0.012, freq: 620, q: 0.6, dur: 0.14, gain: 0.075, sweep: 0.3 },
    spray: { at: 0.05, freq: 3800, q: 1.0, dur: 0.22, gain: 0.060, sweep: 0.6, n: 22 },
    fizz: null,
    drops: { at: 0.07, n: 4, lo: 900, hi: 2000, gain: 0.009, dur: 0.045, spread: 0.2, rise: 4 },
  },
};

export const WATER_KINDS = Object.keys(WATER);

// 水滴が満たすべき条件。ここを緩めると「ボヨン」に逆戻りする。
//   minHz     低い音程はそれだけで「ボヨン」になる。泡は高い。
//   maxDur    長く伸びる音程も同じ。泡は一瞬で消える。
//   maxVsGulp 芯(沈み込み)より大きくしない。前はここが逆転していた。
export const DROP_LIMITS = { minHz: 600, maxDur: 0.08, maxVsGulp: 0.35 };

// 地面と違って水は動きで変わらないので、倍率は大きさだけ(scale)。
export function waterSound(kind = 'dive', scale = 1) {
  const w = WATER[kind] ?? WATER.dive;
  const k = Number.isFinite(scale) ? Math.max(0, Math.min(2, scale)) : 1;
  const lay = (src) => (src ? { ...src, gain: +(src.gain * k).toFixed(4) } : null);
  return {
    slap: lay(w.slap),
    gulp: lay(w.gulp),
    spray: lay(w.spray),
    fizz: lay(w.fizz),
    drops: w.drops ? { ...w.drops, gain: +(w.drops.gain * k).toFixed(4) } : null,
  };
}
