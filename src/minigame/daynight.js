// 島の時刻。昼 → 夕暮れ → 星夜 → 朝 をゆっくり巡る。
//
// 空の絵そのものは render3d/board3d.js が描くが、**「いま夜か」は遊びの判定に
// 使う**(夜釣りのランタン)。THREE を読まない計算をここに置いて、board3d も
// ここを読む ── 周期としきい値を2か所に書くと、空は夜なのに夜の魚が出ない、
// という直しにくいずれ方をする。
//
// 全て純粋関数。時刻は引数で受ける(テストから任意の時刻を渡せるように)。

export const SKY_CYCLE_SEC = 300; // 空が1周する秒数

// 夜の濃さ(0=昼、1=真夜中)の折れ線。t は board3d の空のパレットと同じ位置。
// **ここを動かしたら board3d の SKY_PHASES の t も一緒に動かす**
// (色は board3d、濃さはここ、という分担で同じ t を共有している)。
export const NIGHT_KEYS = [
  { t: 0, night: 0 },
  { t: 0.35, night: 0 },
  { t: 0.5, night: 1 },
  { t: 0.65, night: 0.15 },
  { t: 1, night: 0 },
];

// いまサイクルのどこにいるか(0〜1)
export function skyPhase(now = Date.now()) {
  const t = (now / 1000 / SKY_CYCLE_SEC) % 1;
  return t < 0 ? t + 1 : t;
}

// 夜の濃さ。両端で変化が 0 になる補間(smoothstep)── board3d の skyAt と
// 同じ式にしてある。夕暮れから夜へ、段差なく濃くなる。
export function nightAt(phase) {
  const p = Math.max(0, Math.min(1, typeof phase === 'number' && Number.isFinite(phase) ? phase : 0));
  let a = NIGHT_KEYS[0];
  let b = NIGHT_KEYS[NIGHT_KEYS.length - 1];
  for (let i = 0; i < NIGHT_KEYS.length - 1; i += 1) {
    if (p >= NIGHT_KEYS[i].t && p <= NIGHT_KEYS[i + 1].t) {
      a = NIGHT_KEYS[i];
      b = NIGHT_KEYS[i + 1];
      break;
    }
  }
  const k = (p - a.t) / Math.max(b.t - a.t, 1e-6);
  const e = k * k * (3 - 2 * k);
  return a.night + (b.night - a.night) * e;
}

// 「夜」と呼ぶしきい値。**空の見た目と揃えること** ── ここを下げると、
// まだ夕焼けが残っている空で夜の魚が出る。0.5 は月明かりだけになる手前。
export const NIGHT_MIN = 0.5;

export function isNight(night) {
  return (typeof night === 'number' ? night : 0) >= NIGHT_MIN;
}

// いま夜か(時刻から直に)。空を止めている場合は board3d 側の値を使うので、
// walk-mode.js はこれではなく board3d.nightNow() を見る。
export function isNightAt(now = Date.now()) {
  return isNight(nightAt(skyPhase(now)));
}

// ---- 砂時計で選べる時刻 ----
//
// 島の時刻は5分で1周するので、夜を待つのは最大で4分ほど。それでも
// 「いま夜にしたい」は起きる(ランタンを買った直後がまさにそれ)。
// phase が null は「島の時にもどす」。
export const SKY_TIMES = [
  { id: 'live', label: '島の時', icon: '🕰', phase: null },
  { id: 'noon', label: '昼', icon: '☀️', phase: 0 },
  { id: 'dusk', label: '夕暮れ', icon: '🌇', phase: 0.4 },
  { id: 'night', label: '夜', icon: '🌙', phase: 0.5 },
  { id: 'dawn', label: '朝', icon: '🌅', phase: 0.7 },
];

export const SKY_TIME_BY_ID = Object.fromEntries(SKY_TIMES.map((t) => [t.id, t]));

// 知らない id は「島の時」に倒す(保存に壊れた値が入っていても止まらない)
export function skyTimeOf(id) {
  return SKY_TIME_BY_ID[id] ?? SKY_TIMES[0];
}
