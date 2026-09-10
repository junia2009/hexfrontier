// 効果音(Web Audio の合成音)。
//
// BGM と同じく音源ファイルは持たない ── オフライン PWA でビルド工程もないので、
// 全部その場で合成する。AudioContext は BGM と共有する(ctx.js)。
//
// 音色は BGM(D ドリア・大聖堂の残響)と喧嘩しないように、
// 音階は D ドリアに寄せ、短く・小さく・残響なしで鳴らす。

import { lsGet, lsSet } from '../storage.js';
import { audioCtx, existingCtx, setKeepAlive } from './ctx.js';
import { waterSound } from './water.js';

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// D ドリアの音度(BGM の SCALE と同じ並び)
const D = { d: 62, e: 64, f: 65, g: 67, a: 69, b: 71, c: 72, d2: 74, f2: 77, a2: 81 };

export class Sfx {
  constructor() {
    this.enabled = lsGet('sfx') !== 'off';
    this.ctx = null;
    this.bus = null;
    this.noiseBuf = null;
    // 同じ音が一瞬に重なって割れるのを防ぐ(資源分配など複数回呼ばれる場面)
    this.lastAt = new Map();
    setKeepAlive(this.enabled);
  }

  setEnabled(on) {
    this.enabled = on;
    lsSet('sfx', on ? 'on' : 'off');
    setKeepAlive(on);
    if (on) this.play('ui');
  }

  // 初回はユーザー操作(タップ)の中から呼ぶこと(iOS の自動再生制限)
  _ensure() {
    if (this.bus) return true;
    const ctx = audioCtx();
    if (!ctx) return false;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.bus.connect(comp);
    comp.connect(ctx.destination);

    // ホワイトノイズ(1秒ぶん使い回す)
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  play(name, opts = {}) {
    if (!this.enabled) return;
    const fn = VOICES[name];
    if (!fn) return;
    if (!this._ensure()) return;
    // タブが隠れている間に溜まった音を復帰時に一斉に鳴らさない
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // 連打の抑制(同じ音は 60ms 以内に重ねない)
    const now = this.ctx.currentTime;
    if (now - (this.lastAt.get(name) ?? -1) < 0.06) return;
    this.lastAt.set(name, now);

    try {
      fn(this, now + 0.01, opts);
    } catch (e) {
      console.warn('SFX failed:', name, e);
    }
  }

  // ---- 素材 ----

  // 単音。type/減衰/音量を変えて打楽器にも旋律にもする。
  tone(midi, t0, dur, { type = 'triangle', gain = 0.16, glide = 0, lp = 0 } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    const f = midiHz(midi);
    osc.frequency.setValueAtTime(f, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(midiHz(midi + glide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let tail = g;
    if (lp) {
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lp;
      osc.connect(filt);
      filt.connect(g);
    } else {
      osc.connect(g);
    }
    tail.connect(this.bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // ノイズ源をひとつ用意して、帯域フィルタに通すところまで。
  // **毎回ちがう場所から鳴らす。** 1秒のノイズを毎回頭から再生すると、
  // 出てくる波形が一字一句同じになる ── 実測で連続する2歩の相関が
  // 1.0000(完全に同じ音)だった。人の耳は、寸分たがわず繰り返す音を
  // 「機械の音」と受け取るので、足音がいかにも作り物に聞こえる。
  _noiseSrc(t0, dur, freq, q, type, sweep) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t0);
    if (sweep) filt.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t0 + dur);
    filt.Q.value = q;
    src.connect(filt);
    // 演出だけの乱数なので Math.random でよい(対戦の乱数には触れない)
    const span = Math.max(0, this.noiseBuf.duration - dur - 0.05);
    src.start(t0, Math.random() * span);
    src.stop(t0 + dur + 0.05);
    return filt;
  }

  // ノイズ一発。木を叩く音・水しぶき・紙の音などの素。
  // attack は立ち上がりの秒数。砂のように「当たる」のではなく
  // 「潜る」音は、ここを長くすると当たりが取れて柔らかくなる。
  noise(t0, dur, {
    gain = 0.12, freq = 1800, q = 1, type = 'bandpass', sweep = 0, attack = 0.006,
  } = {}) {
    const filt = this._noiseSrc(t0, dur, freq, q, type, sweep);
    const g = this.ctx.createGain();
    const atk = Math.min(attack, dur * 0.5);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    filt.connect(g);
    g.connect(this.bus);
  }

  // 泡の群れ。**水の音の正体はこれ。**
  //
  // 水がたてる音は、ほとんどが「気泡の共鳴」でできている。泡はひとつ
  // ひとつが固有の高さで鳴る減衰した正弦波で、縮みながら鳴るので
  // **音が上がっていく**(ポチャンの「ャン」が上がるのはこれ)。
  // 大きい泡ほど低い(ミンナールトの関係。半径 1cm でおよそ 330Hz)。
  //
  // **数がすべて。** 本物の飛沫は泡が数百個いっぺんに生まれる。
  // 前は6粒しか置いておらず、残りをフィルタしたノイズで埋めていたので、
  // 水ではなく「ノイズがシュッと鳴る」音にしかならなかった。
  //
  // 数百個をオシレータで鳴らすと重いので、**その場で波形を作って
  // 1つの音源として鳴らす**(毎回作り直すので、同じ音にはならない)。
  bubbles(t0, {
    n = 200, fLo = 400, fHi = 6000, spread = 0.5, decay = 3,
    rise = 0.4, gain = 0.15, dur = 1.0, sizePow = 7 / 3,
  } = {}) {
    const ctx = this.ctx;
    const SR = ctx.sampleRate;
    const len = Math.max(1, Math.ceil(SR * dur));
    const buf = ctx.createBuffer(1, len, SR);
    const d = buf.getChannelData(0);
    // **小さい泡ほど、桁違いに数が多い。**
    // 泡ひとつが出すエネルギーは振幅²×時定数 ∝ (1/f)²×(1/f) = f^-3 なので、
    // 数を素直に配ると低い泡だけで音ができてしまう(実際そうなって、
    // 250-600Hz に 71% が集まり「ゴボッ」としか鳴らなくなった)。
    // 海の砕波で測られている粒度分布から、1オクターブあたりの泡の数は
    // f^(7/3) ── これで帯域あたりのエネルギーが f^(-2/3)、つまり
    // 1オクターブごとに約 -4dB という、飛沫らしい配りかたになる。
    const a = Math.min(60, sizePow * Math.log(fHi / fLo));
    const eA = Math.exp(a) - 1;
    for (let i = 0; i < n; i++) {
      // 泡の大きさ = 高さ。上の分布から引く(逆関数法)。
      // x は 0 が最も大きい泡、1 が最も小さい泡。
      // (演出だけの乱数なので Math.random でよい)
      const x = a > 1e-6 ? Math.log(1 + Math.random() * eA) / a : Math.random();
      const f0 = fLo * (fHi / fLo) ** x;
      // 生まれる時刻。指数分布なので、はじめにどっと生まれて尾を引く。
      // **大きい泡は着水の瞬間にしか生まれない。** 体が作る大きな空洞は
      // ぶつかった瞬間に潰れるもので、あとから湧いてはこない。
      // 大きさと時刻を無関係にしていたときは、まれに大きい泡が 0.5 秒
      // 後ろに落ちて、飛沫が収まったあとに「ボコッ」と鳴っていた
      // (実測でも音の山が頭ではなく 300ms 以降に来ていた)。
      const bornSpread = spread * (0.12 + 0.88 * x);
      const born = (-Math.log(1 - Math.random() * 0.999) / decay) * bornSpread;
      const s0 = Math.floor(born * SR);
      if (s0 >= len) continue;
      // **減衰は Q で決まる。** ミンナールトの関係で f·r が一定になるため、
      // 放射減衰による Q は泡の大きさによらず 17 前後で揃う。
      // 時定数 τ = Q/(πf) なので **高い泡ほど一気に消える**
      // (328Hz で 16ms、6.6kHz では 0.8ms)。ここを取り違えて
      // 「高い泡も長く鳴る」形にしていたときは、6kHz の泡が 82 周期も
      // 続いて、水ではなく高い持続音(シューという雑音)になっていた。
      const q = 14 + Math.random() * 8;
      const tau = q / (Math.PI * f0);
      const life = Math.min(0.15, tau * 4);
      // **放射する音の大きさは泡の半径に比例する。** 半径は 1/f なので、
      // 大きい(低い)泡ほど大きく鳴る ── 飛沫の「ゴボッ」はこれ。
      // 0.35 乗にしていたときは低い泡が埋もれて、高い泡ばかりが目立っていた。
      const amp = (fLo / f0) * (0.4 + Math.random() * 0.6);
      const ns = Math.min(len - s0, Math.ceil(life * SR));
      // **位相は 0 から始める。** 途中の位相から始めると、最初の1標本で
      // 波形が段差になって「プチッ」と鳴る。泡を数百個も置くので、
      // その段差が数百個ぶん重なって、ざらざらした濁りになっていた。
      let ph = 0;
      for (let k = 0; k < ns; k++) {
        const tt = k / SR;
        ph += (2 * Math.PI * f0 * (1 + rise * (tt / life))) / SR;
        d[s0 + k] += Math.sin(ph) * amp * Math.exp(-tt / tau);
      }
    }
    // 高さを gain に合わせる(何百個も足しているので、そのままだと割れる)。
    // **いちばん高いところに合わせてはいけない。** 低い泡は 1/f で
    // 飛び抜けて大きいうえ、数百個のうち1個あるかどうかしかない。
    // その1個に合わせると、そいつだけが残って他が全部縮み、
    // 「低い音がひとつブリッと鳴るだけ」の音になっていた。
    // 上位 0.5% を外した高さに合わせて、群れのほうを基準にする。
    const mag = Float64Array.from(d, Math.abs).sort();
    const ref = mag[Math.floor(mag.length * 0.995)] || mag[mag.length - 1];
    if (ref > 0) {
      const k = gain / ref;
      // それでも飛び出す1個は、耳につかないところまで抑える。
      // **角で切らずに丸める** ── 角で切るとそこに倍音が立って、
      // 濁りを消すつもりが別の濁りを足すことになる。
      const cap = gain * 1.6;
      for (let i = 0; i < len; i++) d[i] = cap * Math.tanh((d[i] * k) / cap);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.bus);
    src.start(t0);
  }

  // 粒立ちのある音(落ち葉のカサカサ、砂利のジャリ、水の飛沫)。
  // ノイズの音量を細かくギザギザに振ると、小さな粒がばらばらと
  // 続けて鳴っているように聞こえる。**粒を1つずつ鳴らすより遥かに軽い**
  // (音源1つで済むので、1歩あたりのノード数が増えない)。
  grit(t0, dur, { gain = 0.06, freq = 3000, q = 0.9, sweep = 0.5, n = 20 } = {}) {
    const filt = this._noiseSrc(t0, dur, freq, q, 'bandpass', sweep);
    const g = this.ctx.createGain();
    // ほとんど沈黙のなかに、たまに粒が立つ形。全体としては減衰していく。
    // 3乗しているのは「大きい粒はまれ」にするため ── 一様に振ると
    // ただのざらざらした持続音になって、粒に聞こえない。
    const pts = Math.max(4, Math.round(n));
    const curve = new Float32Array(pts);
    for (let i = 0; i < pts; i++) {
      const fade = 1 - i / (pts - 1);
      curve[i] = gain * Math.random() ** 3 * fade * fade;
    }
    curve[0] = 0.0001;
    curve[pts - 1] = 0.0001;
    g.gain.setValueCurveAtTime(curve, t0, dur);
    filt.connect(g);
    g.connect(this.bus);
  }

  // 分散和音(獲得・勝利など「良いこと」の合図)
  arp(midis, t0, { step = 0.075, dur = 0.4, gain = 0.13, type = 'triangle' } = {}) {
    midis.forEach((m, i) => this.tone(m, t0 + i * step, dur, { type, gain, lp: 3200 }));
  }
}

// 水の音を鳴らす。中身は water.js が決める。
// **主役は泡。** ノイズは水面が割れる一撃と、空洞が潰れる唸りだけ。
function water(s, t, w) {
  if (w.impact) s.noise(t + w.impact.at, w.impact.dur, w.impact);
  // 空洞の唸りはローパスで、帯域が下がっていく(沈む)
  if (w.cavity) s.noise(t + w.cavity.at, w.cavity.dur, { ...w.cavity, type: 'lowpass' });
  if (w.bubbles) s.bubbles(t + w.bubbles.at, w.bubbles);
}

// ---- 音の定義 ----
//
// それぞれ「何の音に聞こえてほしいか」をコメントに書いてある。
// 鳴らす場面は sfxForAction() 側で決める。

const VOICES = {
  // ボタンを押した感触(設定のオン/オフ確認にも使う)
  ui: (s, t) => s.tone(D.a, t, 0.09, { type: 'sine', gain: 0.09 }),

  // ダイス: 木の器の中で転がって止まる
  roll: (s, t) => {
    for (let i = 0; i < 7; i++) {
      const d = t + i * 0.055 + Math.random() * 0.02;
      s.noise(d, 0.05, { gain: 0.1 - i * 0.008, freq: 2600 - i * 220, q: 2.5 });
    }
    s.noise(t + 0.46, 0.12, { gain: 0.13, freq: 700, q: 1.2, sweep: 0.5 });
  },

  // 道・船: 木材を置く鈍い音
  road: (s, t) => {
    s.noise(t, 0.07, { gain: 0.13, freq: 900, q: 1.4, sweep: 0.4 });
    s.tone(D.d - 24, t, 0.13, { type: 'sine', gain: 0.14 });
  },
  ship: (s, t) => {
    s.noise(t, 0.09, { gain: 0.1, freq: 800, q: 1.2, sweep: 0.5 });
    // 水を切る音(高域が抜けていく)
    s.noise(t + 0.05, 0.3, { gain: 0.075, freq: 5200, q: 0.7, sweep: 0.14, type: 'highpass' });
  },

  // 開拓地: 槌で打って建てる
  settlement: (s, t) => {
    s.noise(t, 0.06, { gain: 0.15, freq: 1500, q: 1.6, sweep: 0.3 });
    s.tone(D.d - 12, t + 0.02, 0.2, { type: 'triangle', gain: 0.15, lp: 2000 });
    s.tone(D.a, t + 0.06, 0.3, { type: 'sine', gain: 0.09 });
  },
  // 都市: もっと重く、和音で「格が上がった」感じ
  city: (s, t) => {
    s.noise(t, 0.09, { gain: 0.16, freq: 1100, q: 1.4, sweep: 0.25 });
    s.tone(D.d - 24, t, 0.35, { type: 'sine', gain: 0.17 });
    s.arp([D.d, D.f, D.a], t + 0.05, { step: 0.055, dur: 0.5, gain: 0.1 });
  },

  // 資源が入った: 短い上昇形
  gain: (s, t) => s.arp([D.d, D.f, D.a], t, { step: 0.06, dur: 0.32, gain: 0.11 }),
  // 商品(都市と騎士)はひとつ上の響きで
  commodity: (s, t) => s.arp([D.f, D.a, D.d2], t, { step: 0.06, dur: 0.34, gain: 0.1 }),

  // 交易成立: 握手のような2音
  trade: (s, t) => {
    s.tone(D.a, t, 0.22, { type: 'sine', gain: 0.13 });
    s.tone(D.d2, t + 0.11, 0.32, { type: 'sine', gain: 0.12 });
  },
  // 断られた: 下降する2音
  reject: (s, t) => {
    s.tone(D.f, t, 0.14, { type: 'triangle', gain: 0.1, lp: 1600 });
    s.tone(D.d - 2, t + 0.1, 0.24, { type: 'triangle', gain: 0.1, lp: 1200 });
  },

  // 発展カードを買う/引く: 紙を擦る音
  card: (s, t) => {
    s.noise(t, 0.16, { gain: 0.07, freq: 4200, q: 0.6, sweep: 0.5, type: 'highpass' });
    s.tone(D.a, t + 0.05, 0.16, { type: 'sine', gain: 0.07 });
  },
  // カードを使う: きらめき
  cardPlay: (s, t) => s.arp([D.a, D.d2, D.f2, D.a2], t, { step: 0.05, dur: 0.45, gain: 0.09, type: 'sine' }),

  // 7・盗賊: 低いうねり(不穏)
  robber: (s, t) => {
    s.tone(D.d - 26, t, 0.7, { type: 'sawtooth', gain: 0.1, glide: -3, lp: 320 });
    s.noise(t + 0.05, 0.5, { gain: 0.06, freq: 420, q: 0.8, sweep: 0.4 });
  },
  // 奪われた/捨てた: 短い下降
  steal: (s, t) => s.tone(D.a, t, 0.28, { type: 'triangle', gain: 0.13, glide: -12, lp: 2400 }),

  // 騎士(都市と騎士): 金属の当たる音
  knight: (s, t) => {
    s.noise(t, 0.07, { gain: 0.1, freq: 3400, q: 3 });
    s.tone(D.d2, t, 0.26, { type: 'square', gain: 0.06, lp: 2600 });
  },
  // 蛮族の襲来: 太鼓と低い角笛
  barbarian: (s, t) => {
    for (let i = 0; i < 3; i++) {
      s.noise(t + i * 0.22, 0.16, { gain: 0.16, freq: 160, q: 1.1, type: 'lowpass' });
    }
    s.tone(D.d - 24, t + 0.1, 0.9, { type: 'sawtooth', gain: 0.11, lp: 500 });
    s.tone(D.a - 24, t + 0.1, 0.9, { type: 'sawtooth', gain: 0.08, lp: 500 });
  },
  // ドラゴンの暴走
  dragon: (s, t) => {
    s.tone(D.d - 26, t, 1.0, { type: 'sawtooth', gain: 0.13, glide: 5, lp: 420 });
    s.noise(t, 0.8, { gain: 0.09, freq: 900, q: 0.5, sweep: 0.25 });
  },

  // 自分の手番が来た: 澄んだ鐘
  turn: (s, t) => {
    s.tone(D.d2, t, 0.7, { type: 'sine', gain: 0.12 });
    s.tone(D.a, t, 0.9, { type: 'sine', gain: 0.07 });
  },
  // 自分に返事を求められた(交易の提案・捨て札・盗賊の移動など): 呼びかけの2音
  ask: (s, t) => {
    s.tone(D.a, t, 0.16, { type: 'sine', gain: 0.11 });
    s.tone(D.d2, t + 0.13, 0.3, { type: 'sine', gain: 0.11 });
  },

  // 勝利: ファンファーレ
  win: (s, t) => {
    s.arp([D.d, D.f, D.a, D.d2], t, { step: 0.11, dur: 0.6, gain: 0.15 });
    s.tone(D.d2, t + 0.5, 1.4, { type: 'triangle', gain: 0.14, lp: 3000 });
    s.tone(D.a, t + 0.5, 1.4, { type: 'triangle', gain: 0.1, lp: 3000 });
    s.tone(D.d - 12, t + 0.5, 1.6, { type: 'sine', gain: 0.12 });
  },
  // 足音。どんな音にするかは footsteps.js が決める。
  // ここは受け取った中身を鳴らすだけ(地面や動きの区別は持たない)。
  step: (s, t, o = {}) => {
    const { scuff, body, grit } = o.sound ?? {};
    if (scuff) s.noise(t, scuff.dur, scuff);
    // 体重が乗る鈍い音。**ローパスしたノイズで、正弦波は使わない** ──
    // 正弦波にすると音程が立って、どの地面でも同じ「ポーン」になる。
    if (body) s.noise(t + 0.004, body.dur, { ...body, type: 'lowpass' });
    // 粒立ちはこすれ音より少し遅らせる(踏んでから崩れるので)
    if (grit) s.grit(t + 0.008, grit.dur, grit);
  },

  // 水の音。どんな音にするかは water.js が決める。
  // ここは受け取った中身を、起きる順に並べるだけ。
  splash: (s, t, o = {}) => water(s, t, o.sound ?? waterSound('dive')),

  // ---- 釣り(ミニゲーム)----
  // 投げる: 糸が出ていく「シュッ」と、浮きが落ちる「ポチャン」
  cast: (s, t) => {
    s.noise(t, 0.22, { gain: 0.07, freq: 3200, q: 0.8, sweep: -0.5 });
    water(s, t + 0.42, waterSound('plop'));
  },
  // アタリ: 浮きが沈む合図。気づいてほしいので短く高く2回
  bite: (s, t) => {
    s.tone(D.d2, t, 0.07, { type: 'square', gain: 0.09 });
    s.tone(D.d2 + 4, t + 0.1, 0.09, { type: 'square', gain: 0.09 });
  },
  // 魚が暴れる: 水を叩く音
  thrash: (s, t) => water(s, t, waterSound('thrash')),
  // 釣れた
  catchFish: (s, t) => s.arp([D.d, D.f, D.a, D.d2], t, { step: 0.07, dur: 0.4, gain: 0.13 }),
  // 逃げられた・糸が切れた
  escape: (s, t) => {
    s.tone(D.a, t, 0.16, { type: 'triangle', gain: 0.11, glide: -9 });
    s.noise(t, 0.1, { gain: 0.07, freq: 1400, q: 1.5, sweep: -0.4 });
  },

  // 敗北(誰かが勝った)
  lose: (s, t) => {
    s.tone(D.a, t, 0.5, { type: 'triangle', gain: 0.1, lp: 1800 });
    s.tone(D.f, t + 0.22, 0.6, { type: 'triangle', gain: 0.1, lp: 1500 });
    s.tone(D.d - 12, t + 0.46, 1.1, { type: 'sine', gain: 0.11 });
  },
};

export const SFX_NAMES = Object.keys(VOICES);

// ---- どの場面でどれを鳴らすか ----
//
// アクション1つにつき最大2音(手ごたえの音 + その結果の音)。
// me は自分の席番号。自分に起きたことだけ鳴らす音がある(獲得・被害)。
// 戻り値は [{ name, delay }] で、delay は秒。

const BUILD_VOICE = {
  BUILD_ROAD: 'road',
  BUILD_SHIP: 'ship',
  MOVE_SHIP: 'ship',
  BUILD_SETTLEMENT: 'settlement',
  BUILD_CITY: 'city',
  BUILD_WALL: 'settlement',
  BUILD_TOWER: 'settlement',
  BUILD_KNIGHT: 'knight',
  ACTIVATE_KNIGHT: 'knight',
  PROMOTE_KNIGHT: 'knight',
  MOVE_KNIGHT: 'knight',
  BUY_DEV_CARD: 'card',
  SPEND_FISH: 'card',
  PLAY_DEV_CARD: 'cardPlay',
  PLAY_PROGRESS_CARD: 'cardPlay',
  BUY_IMPROVEMENT: 'commodity',
  TRADE_BANK: 'trade',
  CHOOSE_TRADE: 'trade',
  DISCARD: 'steal',
  PICK_MERCHANT: 'steal',
  PICK_SPY: 'steal',
  RAZE_CITY: 'barbarian',
  PASS_SHOE: 'ui',
  PICK_GOLD: 'gain',
  PICK_AQUEDUCT: 'gain',
};

const handOf = (p) =>
  Object.values(p.resources).reduce((a, b) => a + b, 0) +
  (p.commodities ? Object.values(p.commodities).reduce((a, b) => a + b, 0) : 0);

export function sfxForAction(action, prev, next, me) {
  if (!action || !prev || !next) return [];
  const out = [];
  const add = (name, delay = 0) => { if (name) out.push({ name, delay }); };

  // 自分に返事が回ってきたら呼びかける。手番中ずっと画面を見ているとは限らないので、
  // 「今あなたが答える番」という割り込みは、その行動そのものの音とは別に鳴らす。
  const asksMe = (s) => me != null && !!s.awaiting?.players?.includes(me);
  const newlyAsked = asksMe(next) && !asksMe(prev);
  // 行動そのものの音を先に鳴らし、呼びかけを少し遅らせて重ならないようにする
  const done = () => {
    if (newlyAsked) out.push({ name: 'ask', delay: out.length ? 0.9 : 0 });
    return out;
  };

  if (action.type === 'ROLL_DICE') {
    add('roll');
    const total = (next.dice?.[0] ?? 0) + (next.dice?.[1] ?? 0);
    // 蛮族の進軍が0に戻った = 襲来が起きた
    const attacked = (prev.barbarians?.position ?? 0) > (next.barbarians?.position ?? 0);
    // ドラゴンの暴走は巣(盗賊コマ)が動くので、それを合図にする
    const rampaged = next.mode === 'dragon' && prev.board.robber !== next.board.robber;
    if (attacked) add('barbarian', 0.7);
    else if (rampaged) add('dragon', 0.7);
    else if (total === 7) add('robber', 0.7);
    else if (me != null && handOf(next.players[me]) > handOf(prev.players[me])) add('gain', 0.7);
    return done();
  }

  if (action.type === 'MOVE_ROBBER') {
    add('robber');
    // 自分が奪われたときだけ被害の音を足す
    if (me != null && handOf(next.players[me]) < handOf(prev.players[me])) add('steal', 0.35);
    return done();
  }

  if (action.type === 'RESPOND_TRADE') {
    // 提案が締め切られたときだけ(まだ返事待ちが残っていれば鳴らさない)
    if (next.awaiting?.type === 'tradeOffer') return done();
    const replies = prev.awaiting?.context?.replies ?? {};
    const anyYes = action.accept || Object.values(replies).some(Boolean);
    add(anyYes ? 'ui' : 'reject');
    return done();
  }

  if (action.type === 'PLACE_INITIAL') {
    add(next.ships?.[action.edgeId] ? 'ship' : 'settlement');
    return done();
  }

  if (action.type === 'END_TURN') {
    // 手番が自分に回ってきた合図(割り込み待ちのときは鳴らさない)
    if (me != null && next.currentPlayer === me && !next.awaiting) add('turn');
    return done();
  }

  add(BUILD_VOICE[action.type]);
  return done();
}

// 決着の音。勝者が自分かどうかで変える。
export function sfxForEnd(state, me) {
  if (state.phase !== 'ended') return null;
  return state.winner === me ? 'win' : 'lose';
}

// タブが隠れたら止める / 戻ったら鳴らせるようにする。
export function suspendAudio() {
  const ctx = existingCtx();
  if (ctx && ctx.state === 'running') ctx.suspend();
}
