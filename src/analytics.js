// 匿名のアクセス集計(GoatCounter)。
//
// 知りたいのは「何人来て、どれだけ遊んだか」だけ。送るのは
//   - ページを開いた(GoatCounter のスクリプトが自動で数える。リンク元もここで分かる)
//   - イベント名(例: game-start/cak)
// の2つに限る。プレイヤー名・合言葉・盤面・戦績は送らない。Cookie も使わない
// (GoatCounter は個人を追わない作り)。集計画面は ENDPOINT のドメイン。
//
// 数えないとき:
//   - 手元の開発(localhost)
//   - E2E(navigator.webdriver が立つ)
//   - ?seed= / ?server= 付き(再現・検証用の URL。人が遊んでいる数に混ぜない)
// あそびかたデモ中の出来事も数えないが、それは呼び出し側で止める
// (デモはここからは見えない)。
//
// オフラインでもゲームは止めない。スクリプトの読み込みが失敗しても
// 何も起きないだけで、track は捨てられる。sw.js は別オリジンを扱わない
// ので、計測のリクエストを横取りすることもない。

const ENDPOINT = 'https://hexfrontier.goatcounter.com/count';
const SCRIPT = 'https://gc.zgo.at/count.js';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', ''];

// 数えてよい環境か。純粋関数(テストから直接呼べる)
export function shouldCount({ hostname = '', search = '', webdriver = false } = {}) {
  if (webdriver) return false;
  if (LOCAL_HOSTS.includes(hostname)) return false;
  const q = new URLSearchParams(search);
  if (q.has('seed') || q.has('server')) return false;
  return true;
}

// イベント名。英数字とハイフンだけを '/' でつなぐ ── 呼び出し側が
// うっかり名前や合言葉を混ぜても、集計に意味のある形でしか出ていかない。
export function eventPath(...parts) {
  return parts
    .map((p) => String(p ?? '').toLowerCase().replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean)
    .join('/');
}

let enabled = false;
const queue = [];

// 起動時に1回。数えてよい環境ならスクリプトを差し込む(ページを開いた数はこれで入る)
export function initAnalytics(win = globalThis.window) {
  if (!win?.document || enabled) return enabled;
  enabled = shouldCount({
    hostname: win.location?.hostname,
    search: win.location?.search,
    webdriver: !!win.navigator?.webdriver,
  });
  if (!enabled) return false;
  const s = win.document.createElement('script');
  s.async = true;
  s.src = SCRIPT;
  s.dataset.goatcounter = ENDPOINT;
  // 読み込み前に起きた出来事(起動直後の PWA 起動など)は溜めておいて、ここで送る
  s.onload = () => flush(win);
  win.document.head.appendChild(s);
  return true;
}

// 出来事を1つ数える。数えない環境では何もしない
export function track(...parts) {
  if (!enabled) return;
  const path = eventPath(...parts);
  if (!path) return;
  queue.push(path);
  flush(globalThis.window);
}

function flush(win) {
  const gc = win?.goatcounter;
  if (!gc?.count) return;
  while (queue.length) {
    const path = queue.shift();
    try {
      gc.count({ path, title: path, event: true });
    } catch {
      // 集計の失敗でゲームを止めない
    }
  }
}
