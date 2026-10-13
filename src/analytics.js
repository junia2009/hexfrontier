// 匿名のアクセス集計(GoatCounter)。
//
// 知りたいのは「何人来て、どれだけ遊んだか」だけ。送るのは
//   - ゲームを開いた(リンク元つき。Qiita などから何人来たかはここで分かる)
//   - 出来事(対戦を始めた・最後まで遊んだ・部屋を作った…)
// の2つに限る。プレイヤー名・合言葉・盤面・戦績は送らない。Cookie も使わない
// (GoatCounter は個人を追わない作り)。集計画面は ENDPOINT のドメイン。
//
// **集計画面で読める名前で送る。** 画面に大きく出るのはパス(path)なので、
// そこを「🎲 CPU戦を始めた ― 基本」のような日本語にして、横に出るタイトル
// (title)に補足を入れる。どちらも下の EVENTS の表からしか作らない ──
// 表に無い出来事・表に無いルール名は送らないので、呼び出し側が名前や合言葉を
// 渡してしまっても外には出ていかない。
// 先頭の絵文字は分類(🎲 CPU戦 / 🌐 オンライン / 🚶 島 / ▶ デモ)。
// 集計画面は件数順に並ぶので、名前の並びではまとまらない。目で拾うための印。
//
// **名前を変えると、集計画面では別の行になる**(過去の数とはつながらない)。
// 気軽に言い換えないこと。
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

// ゲームを開いた(ページの表示)。スクリプトが読み込まれたときに自動で数える
export const PAGEVIEW = { path: '🏝 ゲームを開いた', title: 'トップページの表示。リンク元(Qiita など)はこの行で見る' };

// ルールの呼び名(state.js の MODES と同じ id)
const MODE_JP = {
  base: '基本',
  cak: '都市と騎士',
  dragon: 'ドラゴンの島',
  fish: '漁師たち',
  sea: '航海者たち',
};
const mode = (m) => MODE_JP[m] ?? null;
// 島の呼び名(「ドラゴンの島の島」にしない)
const island = (m) => mode(m) && (mode(m).endsWith('島') ? mode(m) : `${mode(m)}の島`);

// 出来事の表。detail はルールの id(またはデモの章名)。
// 返す null は「送らない」(知らない値が来たとき)。
const EVENTS = {
  'game-start': (m) => mode(m) && {
    path: `🎲 CPU戦を始めた ― ${mode(m)}`, title: 'CPU 相手の対戦を開始した',
  },
  'game-end-cpu': (m) => mode(m) && {
    path: `🏁 CPU戦を最後まで遊んだ ― ${mode(m)}`, title: '勝敗がつくまで遊んだ(途中でやめていない)',
  },
  'online-start': (m) => mode(m) && {
    path: `🌐 オンライン対戦が始まった ― ${mode(m)}`, title: '合言葉の部屋で対戦が始まった(部屋ごとに1回)',
  },
  'game-end-online': (m) => mode(m) && {
    path: `🏁 オンライン対戦を最後まで遊んだ ― ${mode(m)}`, title: '勝敗がつくまで遊んだ',
  },
  'room-create-game': () => ({ path: '🌐 対戦の部屋を作った', title: '合言葉を発行した(友達を誘う側)' }),
  'room-create-walk': () => ({ path: '🚶 散策の部屋を作った', title: 'みんなで島を歩く部屋を作った' }),
  'room-join': () => ({ path: '🌐 合言葉で部屋に入った', title: '誘われた側' }),
  walk: (m) => mode(m) && {
    path: `🚶 島を歩いた ― ${island(m)}`, title: 'ミニゲーム「島を歩く」に入った',
  },
  demo: (chapter) => typeof chapter === 'string' && chapter.length > 0 && chapter.length <= 30 && {
    path: `▶ あそびかたデモを見た ― ${chapter}`, title: '自動再生のデモを開いた',
  },
  'pwa-launch': () => ({ path: '📱 ホーム画面から起動した', title: 'アプリとして追加して使っている' }),
};

// 出来事を集計画面の名前にする。知らない出来事・知らない値なら null(送らない)。
// 純粋関数(テストから直接呼べる)。
export function describe(key, detail) {
  const make = EVENTS[key];
  if (!make) return null;
  return make(detail) || null;
}

// 数えてよい環境か。純粋関数
export function shouldCount({ hostname = '', search = '', webdriver = false } = {}) {
  if (webdriver) return false;
  if (LOCAL_HOSTS.includes(hostname)) return false;
  const q = new URLSearchParams(search);
  if (q.has('seed') || q.has('server')) return false;
  return true;
}

let enabled = false;
const queue = [];

// 起動時に1回。数えてよい環境ならスクリプトを差し込む(ゲームを開いた数はこれで入る)
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
  // ページの表示も読める名前で数える(既定ではパス /hexfrontier と
  // ページのタイトルになり、何の行か分かりにくい)。出来事は count() で
  // path と title を毎回渡すので、ここの値は表示の1回にしか効かない。
  s.dataset.goatcounterSettings = JSON.stringify(PAGEVIEW);
  // 読み込み前に起きた出来事(起動直後の PWA 起動など)は溜めておいて、ここで送る
  s.onload = () => flush(win);
  win.document.head.appendChild(s);
  return true;
}

// 出来事を1つ数える。数えない環境・知らない出来事では何もしない
export function track(key, detail) {
  if (!enabled) return;
  const ev = describe(key, detail);
  if (!ev) return;
  queue.push(ev);
  flush(globalThis.window);
}

function flush(win) {
  const gc = win?.goatcounter;
  if (!gc?.count) return;
  while (queue.length) {
    const { path, title } = queue.shift();
    try {
      gc.count({ path, title, event: true });
    } catch {
      // 集計の失敗でゲームを止めない
    }
  }
}
