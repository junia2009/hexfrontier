// 水の音。足音(footsteps.js)と同じ考えで、決めごとだけをここに置く。
// 実際に鳴らすのは sfx.js。Web Audio の無い node --test でも検査できる。
//
// **水の音の正体は「泡」。** ここを取り違えると何をやっても水にならない。
// 水がたてる音は、ほとんどが気泡の共鳴でできている。泡はひとつひとつが
// 固有の高さで鳴る減衰した正弦波で、縮みながら鳴るので**音が上がる**
// (「ポチャン」の「ャン」が上がるのはこれ)。大きい泡ほど低い。
// そして本物の飛沫では、それが**数百個いっぺんに生まれる**。
//
// 最初の版は「ノイズ2発 + 下降する 73Hz の正弦波」で、実測すると
// その正弦波だけで音全体の 74% を占めていた ── 水ではなく「ボヨン」。
// 次の版はノイズを4層に分けて音程を追い出したが、**泡を6粒しか
// 置かなかった**。音程は消えても、残ったのは「ノイズがシュッと鳴る音」で、
// やはり水には聞こえなかった。しかもそのとき
// 「泡は芯のノイズより小さく保て」という歯止めをテストに書いてしまい、
// **物としては逆(水は泡そのもの)の決まりを固定してしまっていた**。
// いまは泡を主役に据え、ノイズは水面が割れる一撃と空洞の唸りだけに絞る。
//
//   impact  … 水面が割れる一撃。短くて明るいノイズ。
//   cavity  … 体が作った空洞が潰れる低い唸り。ローパスしたノイズ。
//   bubbles … 泡の群れ。**主役**。数・大きさの範囲・湧き方を指定する。

const WATER = {
  // 海に落ちた(体ごと)。泡がいちばん多く、いちばん長く尾を引く
  dive: {
    impact: { at: 0, freq: 1800, q: 0.6, dur: 0.05, gain: 0.560, sweep: 0.3 },
    cavity: { at: 0.01, freq: 300, q: 0.5, dur: 0.22, gain: 0.420, sweep: 0.35 },
    bubbles: {
      at: 0.004, n: 280, fLo: 230, fHi: 6500,
      spread: 0.55, decay: 3.0, rise: 0.40, gain: 0.360, dur: 1.1,
    },
  },
  // 浮きが落ちる「ポチャン」。泡は少なく、高く、すぐ収まる
  plop: {
    impact: { at: 0, freq: 2600, q: 0.7, dur: 0.025, gain: 0.150, sweep: 0.35 },
    cavity: { at: 0.008, freq: 520, q: 0.5, dur: 0.07, gain: 0.100, sweep: 0.4 },
    bubbles: {
      at: 0.003, n: 45, fLo: 700, fHi: 5200,
      spread: 0.16, decay: 6.0, rise: 0.40, gain: 0.150, dur: 0.4,
    },
  },
  // 魚が水面で暴れる。叩きが強く、泡はその中間
  thrash: {
    impact: { at: 0, freq: 1400, q: 0.7, dur: 0.045, gain: 0.330, sweep: 0.4 },
    cavity: { at: 0.01, freq: 340, q: 0.5, dur: 0.10, gain: 0.150, sweep: 0.4 },
    bubbles: {
      at: 0.004, n: 120, fLo: 450, fHi: 5500,
      spread: 0.28, decay: 4.5, rise: 0.40, gain: 0.210, dur: 0.55,
    },
  },
};

export const WATER_KINDS = Object.keys(WATER);

// 泡が満たすべき条件。**水らしさはここで決まる。**
//   minN     少ないと粒が数えられてしまい、水ではなく「ピチョン」の集まりに
//            聞こえる。本物の飛沫では数百個が一度に生まれる。
//   minHz    泡の高さは大きさで決まる(ミンナールト: f ≒ 3.28/半径[m])。
//            150Hz は半径 2.2cm ── 人が落ちてできる空洞としては、これが
//            まず上限。これより下は物として泡ではなく、ただの低い音程で、
//            最初の版の「ボヨン」(73Hz)がまさにそれだった。
//   maxLoHz  逆に、いちばん大きい泡がここより高いと軽い音しか出ない。
export const BUBBLE_LIMITS = { minN: 40, minHz: 150, maxLoHz: 900 };

// 地面と違って水は動きで変わらないので、倍率は大きさだけ(scale)。
export function waterSound(kind = 'dive', scale = 1) {
  const w = WATER[kind] ?? WATER.dive;
  const k = Number.isFinite(scale) ? Math.max(0, Math.min(2, scale)) : 1;
  const lay = (src) => (src ? { ...src, gain: +(src.gain * k).toFixed(4) } : null);
  return { impact: lay(w.impact), cavity: lay(w.cavity), bubbles: lay(w.bubbles) };
}
