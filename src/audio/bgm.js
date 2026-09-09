// ジェネレーティブBGM(Web Audio)。**場面に反応して変わる。**
//
// 何を鳴らすかは score.js が決める(旋法・和音・速さ・パートの音量)。
// ここはそれを音にするだけ ── 音源ファイルは使わない(オフラインPWA・
// ビルドなしのため全て合成)。
//
// 反応のさせかたは2つ:
//   setScene(name)     … 場面(タイトル/対戦/散策/ミニゲーム)
//   setIntensity(0〜1) … 張り詰めぐあい(いまは「勝利への近さ」)
//
// **場面の切り替えは次の和音の頭で効かせる。** 途中で差し替えると
// 音が切れて「曲が止まった」と聞こえるので、鳴っている和音は鳴らしきる。
// 音量(レイヤー)のほうは常に滑らかに追いかけるので、高まりは即座に効く。

import { lsGet, lsSet } from '../storage.js';
import { audioCtx, wantsKeepAlive } from './ctx.js';
import {
  DEFAULT_SCENE, beatDur, chordAt, chordDur, layerGains, melodyChance, pulseDur,
} from './score.js';

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// レイヤーの音量が追いつく速さ(秒)。速すぎると段差が聞こえる
const LAYER_GLIDE = 1.6;

// 刻みの最低音。**スマホのスピーカーで出ない高さまで下げない。**
// 素直に「和音の根音の1オクターブ下」にすると、音域を下げた場面
// (王手・竜)では 92Hz から 55Hz へ落ちる音になり、実測で刻みが
// 消えていた ── いちばん刻んでほしい場面で拍が聞こえなくなる。
const PULSE_FLOOR = 45;   // 110Hz。0.6倍まで落ちても 66Hz で残る
const pulseNote = (root) => Math.max(PULSE_FLOOR, root - 12);


export class Bgm {
  constructor() {
    this.ctx = null;
    this.enabled = lsGet('bgm') !== 'off';
    this.running = false;
    this.timer = null;
    this.nextTime = 0;
    this.queue = [];
    this.lastMelodyNote = 69;
    // いま鳴らしている場面と、次の和音から切り替える場面
    this.scene = DEFAULT_SCENE;
    this.wantScene = DEFAULT_SCENE;
    this.intensity = 0;
    this.bar = 0;
  }

  // 場面を変える。**効くのは次の和音から**(いま鳴っている和音は鳴らしきる)。
  setScene(name) {
    if (!name || name === this.wantScene) return;
    this.wantScene = name;
  }

  // 張り詰めぐあい(0〜1)。音量は滑らかに追いかけるので、いつ変えてもよい
  setIntensity(v) {
    const k = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    if (Math.abs(k - this.intensity) < 0.01) return;
    this.intensity = k;
    this._applyLayers();
  }

  setEnabled(on) {
    this.enabled = on;
    lsSet('bgm', on ? 'on' : 'off');
    if (on) this.start();
    else this.stop();
  }

  // 初回はユーザー操作(タップ)から呼ぶこと(iOSの自動再生制限)
  start() {
    if (!this.enabled || this.running) return;
    try {
      this._init();
    } catch (e) {
      console.warn('BGM init failed:', e);
      return;
    }
    this.running = true;
    this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.22, t + 2.5);
    this.nextTime = t + 0.15;
    this.timer = setInterval(() => this._pump(), 250);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    setTimeout(() => {
      // 効果音が使っているなら context は落とさない(共有しているため)
      if (!this.running && this.ctx && !wantsKeepAlive()) this.ctx.suspend();
    }, 1000);
  }

  _init() {
    if (this.ctx) return;
    this.ctx = audioCtx();
    if (!this.ctx) throw new Error('AudioContext を作れません');

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // 大聖堂風の残響: ノイズを指数減衰させたインパルス応答を合成
    const conv = this.ctx.createConvolver();
    conv.buffer = this._makeReverbIR(3.2);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.5;
    conv.connect(wet);
    wet.connect(this.master);

    // 楽器はドライ+リバーブ送りの両方へ
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.master);
    this.bus.connect(conv);

    // **刻みだけは残響をほとんど通さない。**
    // 3.2秒の大聖堂リバーブに 260ms の打音を入れると、拍ではなく
    // 響きの一部になってしまう ── 実測でも、刻みを 0 から 0.7 まで上げた
    // 段で音の性格がほとんど変わっていなかった。拍は近くで鳴ってこそ拍。
    this.dry = this.ctx.createGain();
    this.dry.gain.value = 1;
    this.dry.connect(this.master);
    const send = this.ctx.createGain();
    send.gain.value = 0.12;      // ほんの少しだけ響かせて場から浮かせない
    this.dry.connect(send);
    send.connect(conv);

    // **パートごとの音量つまみ。** score.js がここの値を決める。
    // 音を止めるのではなく音量を落とすので、抜き差ししても継ぎ目が出ない。
    this.layers = {};
    for (const part of ['drone', 'pad', 'harp', 'flute', 'pulse']) {
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.connect(part === 'pulse' ? this.dry : this.bus);
      this.layers[part] = g;
    }
    this._applyLayers(0);

    // オルガンのドローン(常時鳴りっぱなし、コードの根音へグライド)
    this.droneOscs = [1, 2, 3].map((mult, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = midiHz(38) * mult;
      const g = this.ctx.createGain();
      g.gain.value = [0.05, 0.022, 0.008][i];
      osc.connect(g);
      g.connect(this.layers.drone);
      osc.start();
      return osc;
    });
  }

  // パートの音量を、いまの場面と高まりへ寄せる
  _applyLayers(glide = LAYER_GLIDE) {
    if (!this.layers) return;
    const want = layerGains(this.scene, this.intensity);
    const t = this.ctx.currentTime;
    for (const [part, g] of Object.entries(this.layers)) {
      const v = want[part] ?? 0;
      if (glide <= 0) g.gain.setValueAtTime(v, t);
      else g.gain.setTargetAtTime(v, t, glide / 3);
    }
  }

  _makeReverbIR(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    return buf;
  }

  // スケジューラ: 先読みしながら和音単位でイベントを積む。
  // **和音の頭でだけ場面を切り替える**ので、切り替えても音が切れない。
  _pump() {
    if (!this.running) return;
    while (this.nextTime < this.ctx.currentTime + 2.0) {
      if (this.wantScene !== this.scene) {
        this.scene = this.wantScene;
        this.bar = 0;           // 新しい場面は進行の頭から
        this._applyLayers();
      }
      const dur = chordDur(this.scene, this.intensity);
      this._scheduleChord(chordAt(this.scene, this.bar), this.nextTime, this.bar, dur);
      this.bar++;
      this.nextTime += dur;
    }
  }

  _scheduleChord(chord, t0, beatIndex, dur) {
    // ドローンを根音へゆっくりグライド
    for (let i = 0; i < this.droneOscs.length; i++) {
      this.droneOscs[i].frequency.setTargetAtTime(
        midiHz(chord.drone) * (i + 1), t0, 1.2,
      );
    }

    // 弦楽パッド(ゆっくり立ち上がる持続和音)
    for (const m of chord.notes) this._pad(m, t0, dur + 1.6);

    // 刻み。**score.js の拍に乗せる** ── ここを 0.7 秒に固定していたせいで、
    // 場面をいくら速くしても拍だけは 86BPM のまま動いていなかった。
    const beat = beatDur(this.scene, this.intensity);
    const step0 = pulseDur(this.scene, this.intensity);
    for (let i = 0; i * step0 < dur - 1e-6; i++) {
      // 表拍(拍の頭)だけ強く打つ。裏拍は軽く
      const strong = Math.abs((i * step0) % beat) < 1e-6;
      this._pulse(pulseNote(chord.notes[0]), t0 + i * step0, strong, step0);
    }

    // ハープの分散和音(低→高、ときどき休符)。**これも拍に乗せる**ので、
    // テンポが上がると音の粒も一緒に速くなる
    const tones = [...chord.notes.slice(1), chord.notes[1] + 12, chord.notes[2] + 12];
    const step = Math.max(0.16, beat / 2);
    for (let i = 0; i < Math.round(dur / step) - 2; i++) {
      if (Math.random() < 0.3) continue;
      const note = tones[i % tones.length] + (Math.random() < 0.12 ? 12 : 0);
      this._pluck(note, t0 + 0.3 + i * step);
    }

    // 笛の旋律(2コードに1回くらい、順次進行の短いフレーズ)
    if (beatIndex % 2 === 0 && Math.random() < melodyChance(this.scene, this.intensity)) {
      let note = this._nearestScale(chord.scale, this.lastMelodyNote);
      let t = t0 + 0.6 + Math.random() * 0.8;
      const phraseLen = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < phraseLen && t < t0 + dur - 1; i++) {
        const dur = 0.9 + Math.random() * 1.1;
        this._flute(note, t, dur);
        t += dur + 0.12;
        const stepDir = Math.random() < 0.5 ? -1 : 1;
        const sc = chord.scale;
        const idx = sc.indexOf(note);
        note = sc[Math.max(0, Math.min(sc.length - 1, idx + stepDir * (1 + (Math.random() < 0.2 ? 1 : 0))))];
      }
      this.lastMelodyNote = note;
    }
  }

  _nearestScale(scale, m) {
    return scale.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
  }

  _pad(midi, t0, dur) {
    const freq = midiHz(midi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.045, t0 + 2.4);
    g.gain.setValueAtTime(0.045, t0 + dur - 2.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(freq * 4, 1400);
    lp.connect(g);
    g.connect(this.layers.pad);
    for (const [type, det, vol] of [['triangle', -4, 1], ['sawtooth', 4, 0.22]]) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = det;
      const og = this.ctx.createGain();
      og.gain.value = vol;
      osc.connect(og);
      og.connect(lp);
      osc.start(t0);
      osc.stop(t0 + dur + 0.1);
    }
  }

  _pluck(midi, t0) {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = midiHz(midi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.075, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.layers.harp);
    osc.start(t0);
    osc.stop(t0 + 1.5);
  }

  // 刻み。低い短音で拍を出す ── 速い場面(丸太乗り・蛮族・竜)の芯になる。
  // strong は表拍(気持ち強く・低く)
  // **打音は自分の間隔に収める。** 減衰を 0.26 秒に固定していたら、
  // 速い場面(王手の 0.178 秒間隔)では前の打音の尾に次が重なって
  // 一続きの低音になり、実測でその周期の相関がほぼ 0 になっていた
  // ── いちばん刻んでほしい場面で拍が消えるという逆の結果。
  _pulse(midi, t0, strong, gap = 0.7) {
    const fall = Math.min(0.26, gap * 0.7);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(midiHz(midi) * (strong ? 1 : 1.5), t0);
    osc.frequency.exponentialRampToValueAtTime(midiHz(midi) * 0.6, t0 + fall * 0.46);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(strong ? 0.16 : 0.075, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + fall);
    osc.connect(g);
    g.connect(this.layers.pulse);
    osc.start(t0);
    osc.stop(t0 + fall + 0.04);
  }

  _flute(midi, t0, dur) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiHz(midi);
    // ビブラート(ゆっくり深くなる)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0, t0);
    lfoGain.gain.linearRampToValueAtTime(4, t0 + dur * 0.7);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.detune);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.055, t0 + 0.28);
    g.gain.setValueAtTime(0.055, t0 + dur - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.layers.flute);
    osc.start(t0);
    osc.stop(t0 + dur + 0.1);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.1);
  }
}
