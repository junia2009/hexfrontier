// 落ちたときに、黙って固まらないための共通の口。
//
// 「画面が固まった」「反応しない」という報告だけでは直せない。
// **シードと版**が分かれば手元で同じ島・同じ配り方を作り直せるので、
// 例外を掴んだらその2つを添えて小さく表に出す。
//
// トーストは document.body に直接作る ── HUD の再描画そのものが壊れていても
// 出したいので、ui.toast(render/hud-render.js)には載せない。
// 同じ理由で、ここは THREE も state も import しない(単体で検証できる)。

const MAX_TOASTS = 3;   // 同じ不具合で画面を埋めない
const MAX_REPORTS = 32; // 毎フレーム落ちても、記録と Set を無限に膨らませない
// 文面の上限。長い URL(パーセント符号化された名前など)や、message に
// スタックごと入っている相手がいる。390px 幅で3行を超えると画面を覆うので切る。
// 全文は console.error に出しているので、詳しく見たいときはそちらを読む。
const MAX_LEN = 140;

const shown = new Set();
let reports = 0;
let getInfo = () => ({});

// Error でも文字列でも「message を持つ何か」でも、同じ1行に均す。
// window.onerror は Error を渡さないことがあり、Promise の reject は
// そもそも何でも投げられる ── ここで形を揃えないと表示側が壊れる。
// **全体を try で囲む。** message や stack が「読むと投げる getter」のことが
// あり(Proxy・意図的な罠・壊れた Error の複製)、その例外は描画ループの
// catch の中で起きる ── つまり「エラーを出そうとして落ちる」最悪の場所になる。
// String() も、toString を持たない相手(Object.create(null) など)には投げる。
// ここは絶対に投げない関数にしておく。
export function messageOf(err) {
  try {
    if (err == null) return '原因不明のエラー';
    if (typeof err === 'string') return err.trim() || '原因不明のエラー';
    const msg = typeof err.message === 'string' ? err.message.trim() : '';
    if (msg) return err.name && err.name !== 'Error' ? `${err.name}: ${msg}` : msg;
    const s = String(err).trim();
    return s && s !== '[object Object]' ? s : '原因不明のエラー';
  } catch {
    return '原因不明のエラー';
  }
}

// 長すぎる文面を切る。重複判定は切る前の文面で行う ── 先頭140字が同じで
// 中身が違う別々の不具合を、同じものとして捨ててしまわないように。
export function clip(text, max = MAX_LEN) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// スタックの最初の「ファイル:行」だけ。全部出しても狭い画面では読めないし、
// どのファイルで落ちたかが分かればコードに当たれる。
// messageOf と同じ理由で、ここも投げない。
export function frameOf(err) {
  try {
    const stack = typeof err?.stack === 'string' ? err.stack : '';
    for (const line of stack.split('\n')) {
      const m = line.match(/([\w.-]+\.(?:mjs|js|html)):(\d+)/);
      if (m) return `${m[1]}:${m[2]}`;
    }
  } catch {
    // stack が読めないだけ。文面は出せるので黙って諦める
  }
  return '';
}

// トーストの文面。2行目が再現に必要な情報(シード・モード・版・場所)。
export function crashText({
  where = '', message = '', frame = '', seed = null, mode = '', version = '',
} = {}) {
  const head = `⚠ ${where ? `${where}でエラー` : 'エラー'}: ${message}`;
  const tail = [
    seed === null || seed === undefined || seed === '' ? '' : `シード ${seed}`,
    mode,
    version,
    frame,
  ].filter(Boolean).join(' / ');
  return tail ? `${head}\n${tail}` : head;
}

// index.html の版表示を使い回す(デプロイ時に短縮SHAへ置換される)。
// ローカル開発では置換されていないので、その旨は出さない。
function buildTag() {
  if (typeof document === 'undefined') return '';
  const t = document.getElementById('build-tag')?.textContent?.trim() ?? '';
  return !t || t.includes('BUILD_ID') ? '' : t;
}

function context() {
  let out = {};
  try {
    out = getInfo() ?? {};
  } catch {
    // 情報を取る側が壊れていても、エラー自体は出す
    out = {};
  }
  return { seed: out.seed ?? null, mode: out.mode ?? '', version: out.version ?? buildTag() };
}

function toastHost() {
  let host = document.querySelector('.crashtoasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'crashtoasts';
    document.body.appendChild(host);
  }
  return host;
}

function showToast(text) {
  if (typeof document === 'undefined') return;
  const put = () => {
    if (!document.body) return;
    const el = document.createElement('div');
    el.className = 'crashtoast';
    el.setAttribute('role', 'alert');
    el.textContent = text;
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'タップで閉じる';
    el.appendChild(hint);
    el.addEventListener('click', () => el.remove());
    toastHost().appendChild(el);
  };
  // 読み込み失敗は body が出来る前に飛んでくることがある
  if (document.body) put();
  else document.addEventListener('DOMContentLoaded', put, { once: true });
}

// 例外を1件、記録して表に出す。出したら true。
// 同じ場所・同じ文面は1回だけ ── 描画ループから毎フレーム呼ばれても溢れない。
export function reportCrash(err, where = '') {
  if (reports >= MAX_REPORTS) return false;
  const message = messageOf(err);
  const key = `${where} ${message}`;
  if (shown.has(key)) return false;
  shown.add(key);
  reports += 1;
  try {
    console.error(`[${where || 'エラー'}]`, err);
  } catch {
    // console が使えないなら記録は諦める(トーストは出す)
  }
  if (shown.size <= MAX_TOASTS) {
    showToast(crashText({
      where, message: clip(message), frame: frameOf(err), ...context(),
    }));
  }
  return true;
}

// テスト用。溜めた重複判定を空にする
export function resetCrashReports() {
  shown.clear();
  reports = 0;
}

// window に大域の捕まえ口を差す。info() は { seed, mode } を返す関数
// (呼ぶ時点の値が欲しいので、値ではなく関数で受ける)。
export function installCrashHandler(info) {
  if (typeof info === 'function') getInfo = info;
  if (typeof window === 'undefined' || window.__hexCrashHooked) return;
  window.__hexCrashHooked = true;

  // capture で拾う ── 画像や script の読み込み失敗は bubble しないので、
  // ここを true にしないと「真っ白なまま何も出ない」を取り逃がす。
  window.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t !== window && t.tagName) {
      const src = t.src || t.href || '?';
      reportCrash(`${t.tagName.toLowerCase()} を読み込めません: ${src}`, '読み込み');
      return;
    }
    reportCrash(e.error ?? e.message, 'スクリプト');
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    reportCrash(e.reason, '非同期処理');
  });
}
