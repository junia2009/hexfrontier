// 円卓の演出に要る計算。**THREE を使わない**ので、テストから読める。
//
// 絵を出すのは table.js(卓の上)と remote-view.js(座っている人)で、
// ここは「届いた表から、何をどれだけ見せるか」を決めるだけ。
//
// **通信には何も足さない。** daifugo.js の viewFor が全員に配っている
// counts / turn / passed / out / log だけで、演出は全部組み立てられる ──
// 隠し情報を増やさずに済むし、みんなの画面で同じ演出が出る。

// ---- 届いた記録の差分 ----

// 記録は直近12件の窓(daifugo.js の viewFor が slice(-12))。
// 通し番号が無いので、**前回の末尾と今回の頭の重なり**を探して、
// その後ろを「新しく起きたこと」とする。
//
// 長いほうから試すこと ── 短いほうから見ると、同じ内容の記録
// (別の周回の同じ人のパスなど)にたまたま合って、まだ見ていない
// 出来事を見たことにしてしまう。
const LOG_KEYS = ['t', 'by', 'from', 'to', 'n', 'place', 'on', 'reason', 'forced'];
function sameEntry(a, b) {
  if (!a || !b) return false;
  if (a.t !== b.t) return false;
  for (const k of LOG_KEYS) {
    if (String(a[k] ?? '') !== String(b[k] ?? '')) return false;
  }
  // 出した札の中身まで見る(同じ人が同じ枚数を続けて出すことがある)
  return String(a.cards ?? '') === String(b.cards ?? '');
}

export function newLogEntries(prevLog, log) {
  const b = log ?? [];
  const a = prevLog ?? [];
  if (!a.length) return [...b];
  const max = Math.min(a.length, b.length);
  for (let k = max; k > 0; k -= 1) {
    let same = true;
    for (let i = 0; i < k; i += 1) {
      if (!sameEntry(a[a.length - k + i], b[i])) { same = false; break; }
    }
    if (same) return b.slice(k);
  }
  return [...b];
}

// ---- 手番の印 ----

// 残り時間の弧。n 本のうち何本を光らせるか。
// **切り上げる** ── 切り捨てだと、残っているのに全部消えた瞬間ができて
// 「もう時間切れ?」と見える。0 になるのは本当に 0 のときだけにする。
export function arcSegments(k, n) {
  if (!(k > 0)) return 0;
  return Math.max(1, Math.min(n, Math.ceil(k * n)));
}

// 席 a から席 b を見る向き(walker の facing と同じ atan2(dx, dz))。
export function lookYaw(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

// ---- 手札の扇 ----

// 持たせる札の枚数。実際の手札が多くても、これ以上は増やさない ──
// 20枚を扇にすると顔より大きくなるし、遠目には厚みしか見えない。
export const FAN_MAX = 10;
// 扇の広がり(端から端まで・ラジアン)
const FAN_SPREAD = 0.85;
// 横のずらし。単位は**札の幅**(呼ぶ側が札の幅を掛ける)。
//   X_STEP … 1枚あたりの最大のずれ。少ない枚数はこれで離す
//   X_SPAN … 端から端までの上限。多い枚数はここに収める
//
// **回転だけでは枚数が読めない。** 扇の要は札の下端(札の高さの 0.42 倍)に
// あるので、2枚を 0.15 ラジアン開いても中心は 0.006 しかずれず、札の幅
// (0.072)に対して重なったままになる ── 2枚が1枚に見えた。
const X_STEP = 0.42;
const X_SPAN = 1.15;

// n 枚を扇に並べたときの、1枚ずつの角度と横ずれ。
// 枚数が少ないときは広げず、多いときも FAN_SPREAD / X_SPAN に収める。
export function fanLayout(n) {
  const show = Math.max(0, Math.min(FAN_MAX, Math.round(n)));
  if (!show) return [];
  if (show === 1) return [{ a: 0, x: 0, k: 0 }];
  const spread = Math.min(FAN_SPREAD, 0.14 * (show - 1));
  const step = Math.min(X_STEP, X_SPAN / (show - 1));
  return Array.from({ length: show }, (_, i) => {
    const k = i / (show - 1) - 0.5;      // -0.5 … +0.5
    return { a: k * spread, x: k * step * (show - 1), k };
  });
}

// ---- しぐさ ----

// 出来事から「誰が何をしたか」を1つずつ取り出す。
// 卓の記録はルールの言葉(kakumei / jback / clear …)なので、
// 見た目の担当が知っていればよい形に均す。
//
// play/pass/out だけが「体の動き」で、ほかは場の演出。
export function actsFrom(entries) {
  const out = [];
  for (const e of entries ?? []) {
    if (e.t === 'play') out.push({ kind: 'play', seat: e.by, cards: e.cards ?? [] });
    else if (e.t === 'pass') out.push({ kind: 'pass', seat: e.by });
    else if (e.t === 'out') out.push({ kind: 'win', seat: e.by, place: e.place });
    else if (e.t === 'kakumei') out.push({ kind: 'kakumei', seat: e.by, on: !!e.on });
    else if (e.t === 'jback') out.push({ kind: 'jback', seat: e.by });
    else if (e.t === 'shibari') out.push({ kind: 'shibari' });
    else if (e.t === 'reverse') out.push({ kind: 'reverse', seat: e.by });
    else if (e.t === 'clear') out.push({ kind: 'clear', seat: e.by });
    else if (e.t === 'foul' || e.t === 'retire') out.push({ kind: 'lose', seat: e.by });
  }
  return out;
}

// しぐさの長さ(秒)。pose.js と table-fx.js で同じ数字を使う
export const ACT_MS = { play: 0.85, pass: 0.70, win: 1.60, think: 0 };
