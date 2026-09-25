// 戦績と実績の画面(設計書 §11)
//
// progress.js の集計を描くだけ。state は読まない。
// 実績が20個以上あるので、縦に並べると3画面ぶんスクロールすることになる。
// タブで戦績と分け、実績はバッジのグリッドにして1画面に収める
// (詳細は選んだ1つだけ下に出す)。

import {
  ACHIEVEMENTS, MODE_JP, TIERS, TIER_ICON, TIER_JP,
  achievementById, progressOf, scopeOf,
} from '../achievements.js';
import { MODES, achievementCount, fishbookCount, summarize, winRate } from '../progress.js';
import { FISH, isGated, placeLabel, portLabel } from '../minigame/fish.js';
import { COIN_ICON, COIN_JP } from '../rewards.js';
import {
  ITEMS, SHELVES, bagShelves, buyableCount, cleanBagShelf, cleanShelf, isDecor, isWear, owns,
  shelfItems, shortDesc, soldOut, stockOf, whyCannotBuy,
} from '../shop.js';
import { SKY_TIMES, skyTimeOf } from '../minigame/daynight.js';
import { dayLabel, questWhere } from '../quests.js';
import { bandOf } from '../market.js';
import { SLOTS, gearOf } from '../gear.js';
import { gearSwatch } from './gear-swatch.js';

const MODE_ICON = {
  base: '⬡', cak: '🏰', dragon: '🐉', fish: '🐟', sea: '⛵',
};

// 釣り図鑑。まだ釣っていないものは「?」で伏せる ── 何がいるか全部見えていると、
// 港をめぐって探す楽しみが無くなる。等級だけは色で分かるようにしておく。
const TIER_LABEL = {
  junk: 'ガラクタ', common: 'よくいる', rare: '大物', legend: '港のぬし', myth: 'まぼろし',
};

// まだ釣っていない欄の説明。等級は色でも分かるが、文字でも出す。
// 店の品で開く魚(沖・夜)は、等級より「どこにいるか」のほうが要る
// ── legend をそのまま「港のぬし」と出すと、港に居ないのに港を探すことになる。
function lockedLabel(f) {
  if (!isGated(f)) return TIER_LABEL[f.tier];
  return `${placeLabel(f)}・${f.tier === 'legend' ? 'ぬし' : TIER_LABEL[f.tier]}`;
}

// 漁師の手帳を持っている人の欄。どこで釣れるかと大きさの目安まで出す。
// **釣りやすさは変わらない** ── 探す先が分かるだけ(shop.js の線引き)。
function noteLabel(f) {
  const where = f.at ? portLabel(f.at) : placeLabel(f);
  return `${where} ・ ${f.cm[0]}〜${f.cm[1]}cm`;
}

// 島を歩くモードからも同じものを出すので、外へ出しておく。
// walk: 歩いている最中に開いたか(「島を歩くモードで…」の案内は要らない)
export function fishbookHtml(progress, { walk = false } = {}) {
  const book = progress.fish ?? {};
  // **店の品で開く魚は、品を持っているか釣ったことがある人にだけ見せる。**
  // 持っていない人に空欄を並べると、埋められない欄をずっと突きつけることに
  // なる(店の宣伝が図鑑に居座る)。
  const open = { deep: owns(progress, 'deepRod'), night: owns(progress, 'lantern') };
  const canReach = (f) => (!f.deep || open.deep) && (!f.night || open.night);
  const noted = owns(progress, 'fishNote');
  const shown = FISH.filter((f) => canReach(f) || book[f.id]);
  const c = fishbookCount(progress, shown.length);
  const rows = shown.map((f) => {
    const got = book[f.id];
    const small = got ? `${got.best} cm ・ ${got.n}匹`
      : noted ? noteLabel(f) : lockedLabel(f);
    return `<div class="fbook-a t-${f.tier} ${got ? 'got' : 'locked'}">
      <span class="bicon">${got ? f.icon : '❔'}</span>
      <b>${got ? f.name : '???'}</b>
      <small>${small}</small>
    </div>`;
  }).join('');
  // 散策部屋の集まりの通算。出ていないものは出さない(空の行が増えるだけ)
  const meet = [
    ['fishing', '🏆 釣り大会', (v) => `自己最高 <b>${v}</b> cm`],
    ['dragonhunt', '🐉 ドラゴンから逃げろ', (v) => `最長 <b>${v}</b> 秒`],
    ['logroll', '🪵 丸太乗り', (v) => `最長 <b>${v}</b> 秒`],
    ['raid', '🏹 蛮族を射る(大会)', (v) => `自己最高 <b>${v}</b> 点`],
    ['daifugo', '🃏 大富豪', (v) => `いちばん大きい卓 <b>${v}</b> 人`],
  ].map(([kind, label, best]) => {
    const m = progress.meets?.[kind];
    if (!m?.played) return '';
    return `<p class="fbook-head">${label} 優勝 <b>${m.won}</b>/${m.played} 回
      ・ ${best(m.best)}</p>`;
  }).join('');
  return `<p class="fbook-head">図鑑 <b>${c.got}/${c.total}</b> 種類 ・ ぜんぶで <b>${c.caught}</b> 匹</p>
    ${meet}
    <div class="fbook">${rows}</div>
    <p><small>${walk
      ? '「港のぬし」はその港でしか釣れません。ほかの港もまわってみましょう。'
      : '島を歩くモードで、港のそばに立つと釣れます。「港のぬし」はその港でしか釣れません。'}
      ${open.deep ? '桟橋で「⚓港」と「🌊沖」を投げ分けられます。' : ''}
      ${open.night ? '夜の桟橋には、夜しか来ない魚がいます。' : ''}
    </small></p>`;
}

const dash = '<span class="zero">—</span>';
const num = (v, unit = '') => (v ? `${v}${unit}` : dash);

// ---- 戦績 ----

function statsTable(stats) {
  const rows = MODES.map((mode) => {
    const m = stats.byMode[mode];
    const r = winRate(m);
    return `<tr>
      <td>${MODE_ICON[mode]} ${MODE_JP[mode]}</td>
      <td>${m.played ? `${m.won}/${m.played}` : dash}</td>
      <td>${r == null ? dash : `${r}%`}</td>
      <td>${num(m.bestPoints, '点')}</td>
      <td>${m.bestTurns == null ? dash : `${m.bestTurns}T`}</td>
    </tr>`;
  }).join('');
  const t = stats.total;
  const tr = winRate(t);
  return `<table class="rec-table">
    <thead><tr>
      <th>ルール</th><th>勝/戦</th><th>勝率</th><th>最高点</th><th>最短</th>
    </tr></thead>
    <tbody>${rows}
      <tr class="rec-total">
        <td>合計</td>
        <td>${t.played ? `${t.won}/${t.played}` : dash}</td>
        <td>${tr == null ? dash : `${tr}%`}</td>
        <td>${num(t.bestPoints, '点')}</td>
        <td>${t.bestTurns == null ? dash : `${t.bestTurns}T`}</td>
      </tr>
    </tbody></table>`;
}

// ---- 実績 ----

// 難度ごとの獲得数。「🥇1/4」の並び
function tierSummary(progress) {
  return TIERS.map((tier) => {
    const all = ACHIEVEMENTS.filter((a) => a.tier === tier);
    const got = all.filter((a) => progress.achievements[a.id]).length;
    return `<span class="tchip t-${tier} ${got === all.length ? 'done' : ''}"
      title="${TIER_JP[tier]}">${TIER_ICON[tier]} ${got}/${all.length}</span>`;
  }).join('');
}

// バッジのグリッド。取っていないものもアイコンは出す(何を狙えるか見えるように)
function badgeGrid(progress, stats, selected) {
  // 難度の高い順 → 取得済みが先。取りたいものが上に来る並び
  const order = [...ACHIEVEMENTS].sort((a, b) => {
    const got = (x) => (progress.achievements[x.id] ? 0 : 1);
    if (got(a) !== got(b)) return got(a) - got(b);
    return TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier);
  });
  return `<div class="badges">${order.map((a) => {
    const has = !!progress.achievements[a.id];
    const pr = has ? null : progressOf(a, stats);
    // あと少しのものは進捗を出す。0/13 のような「まだ手つかず」は出さない
    const near = pr && pr.now > 0 ? `<small>${pr.now}/${pr.goal}</small>` : '';
    return `<button class="badge-a t-${a.tier} ${has ? 'got' : 'locked'}
      ${selected === a.id ? 'sel' : ''}" data-act="ach-pick:${a.id}" title="${a.name}">
      <span class="bicon">${a.icon}</span>${near}</button>`;
  }).join('')}</div>`;
}

// 選んだ1つの詳細。ここから称号を名乗る
function badgeDetail(progress, stats, selected) {
  const a = achievementById(selected);
  if (!a) {
    return '<p class="ach-hint">バッジをタップすると、条件と称号が出ます。</p>';
  }
  const has = !!progress.achievements[a.id];
  const pr = progressOf(a, stats);
  const bar = pr && !has
    ? `<div class="pbar"><i style="width:${Math.min(100, (pr.now / pr.goal) * 100)}%"></i></div>
       <small class="pnum">${pr.now}/${pr.goal}${pr.unit}</small>`
    : '';
  const wearing = progress.title === a.id;
  const btn = has
    ? (wearing
      ? '<button data-act="title-set:none">称号を外す</button>'
      : `<button class="primary" data-act="title-set:${a.id}">この称号を名乗る</button>`)
    : '<small class="ach-hint">達成すると称号を名乗れます</small>';
  return `<div class="ach-detail t-${a.tier} ${has ? 'got' : ''}">
    <div class="ach-dhead">
      <span class="bicon">${has ? a.icon : '🔒'}</span>
      <span><b>${a.name}</b>
        <small>${TIER_ICON[a.tier]} ${scopeOf(a)}</small></span>
    </div>
    <p>${a.desc}</p>
    ${bar}
    <div class="ach-title-row">
      <span class="ttag ${wearing ? 'on' : ''}">称号「${a.title}」</span>
      ${btn}
    </div>
  </div>`;
}

// ---- 画面 ----

export function recordsHtml(progress, { tab = 'stats', selected = null, confirmingClear = false } = {}) {
  const stats = summarize(progress);
  const c = achievementCount(progress);
  const empty = stats.total.played === 0;
  const now = progress.title && progress.achievements[progress.title]
    ? achievementById(progress.title)?.title
    : null;

  const tabs = `<div class="rec-tabs">
    <button class="${tab === 'stats' ? 'sel' : ''}" data-act="rec-tab:stats">📊 戦績</button>
    <button class="${tab === 'ach' ? 'sel' : ''}" data-act="rec-tab:ach">🎖 実績 ${c.got}/${c.total}</button>
    <button class="${tab === 'fish' ? 'sel' : ''}" data-act="rec-tab:fish">🎣 釣り</button>
  </div>`;

  const body = tab === 'fish'
    ? fishbookHtml(progress)
    : tab === 'ach'
    ? `<div class="tiers">${tierSummary(progress)}</div>
       ${badgeGrid(progress, stats, selected)}`
    : `${empty ? '<p>まだ対戦の記録がありません。1戦遊ぶとここに残ります。</p>' : ''}
       ${statsTable(stats)}
       <p><small>記録はこの端末にだけ保存されます(サーバーには送りません)。
       オンライン対戦は数えていません。</small></p>`;

  // 選んだバッジの詳細は**流れる場所の外**に出す。
  // 中に置くと43個のバッジの後ろに付くので、上のほうのバッジを押しても
  // 詳細が画面の外にあって、送らないと読めなかった。
  // ここならどのバッジを押しても、出る場所がいつも同じで、すぐ目に入る。
  const dock = tab === 'ach'
    ? `<div class="ach-dock">${badgeDetail(progress, stats, selected)}</div>`
    : '';

  // 見出し・タブとボタンはパネルに直接置き、中身だけを .panel-scroll で流す。
  // こうしておくと「どのタブにいるか」と「タイトルへ戻る」がいつでも見えている。
  // 財布。見出しの隣に常に出す ── 稼いだ実感は「いま何枚あるか」が
  // いつでも見えて初めて続く。通算は括弧で添える(使っても減らない値)。
  const coins = progress.coins ?? 0;
  const earned = progress.coinsEarned ?? 0;
  const purse = `<div class="purse" title="${COIN_JP}">
    <span class="pc-icon">${COIN_ICON}</span><b>${coins}</b>
    ${earned > coins ? `<small>通算 ${earned}</small>` : ''}</div>`;

  return `<h3>${now ? `〈${now}〉` : '戦績と実績'}${purse}</h3>
    ${tabs}
    <div class="panel-scroll">${body}</div>
    ${dock}
    ${confirmingClear
      ? `<p class="ach-head">⚠️ 戦績も実績も称号も全て消えます。元には戻せません。</p>
         <div class="row end rules-close">
           <button data-act="records-clear-do">消す</button>
           <button class="primary" data-act="records-clear-cancel">やめる</button>
         </div>`
      : `<div class="row end rules-close">
           <button data-act="records-clear" ${empty ? 'disabled' : ''}>記録を消す</button>
           <button class="primary" data-act="goto-title">← タイトルへ</button>
         </div>`}`;
}

// ---- 島の店 ----
//
// 買えるもの・値段・持っているかを並べるだけ。買う判断は shop.js が持つので、
// ここは whyCannotBuy が返した理由をそのまま出す(理由を2か所で書かない)。
//
// **並べかたの決めごと**(「何でも屋で見にくい」と言われて作り直した):
//
//   1. **棚は1つずつ。** 13品を1本の列に積むと携帯で 4.64 画面ぶんになる
//      (実測)。棚を選ぶ帯を上に貼り付けて、見ている棚だけを出す。
//   2. **手持ちの銀貨は貼り付ける。** 前は先頭に1行あるだけで、少し
//      スクロールすると「いくら持っているか」が画面から消えていた。
//   3. **札は2行。** 絵・名前・値段が1行目、短い説明が2行目。
//      長い説明と注意書きは、押したときだけ開く ── 全部の品の説明を
//      いつも開いておくと、目当ての品にたどり着くまでが遠い。
//   4. **買い切った品は1行に畳んで下へ送る**(shop.js の shelfItems)。
//      上から順に「いま手が届くもの」が並ぶ。

// 品の顔。**盤まわりの品は見本を出す**(絵文字ではなく現物の色と形)──
// 🌇 と ❄️ と 📜 が並んでいても、どんな盤になるかは分からない。
// 見本を持たない品はこれまでどおり絵文字(gear-swatch.js は空を返す)
function faceHtml(item) {
  const sw = gearSwatch(item.id);
  return sw
    ? `<span class="shop-icon has-sw">${sw}</span>`
    : `<span class="shop-icon">${item.icon}</span>`;
}

// 売り物1つぶん。**開いているものだけ**説明と注意書きを出す
function shopItemHtml(item, progress, open, grid = false) {
  // 飾りは**何個でも買える**ので「✓ 持っています」で終わらせない。
  // いくつ手元にあるかを出して、買う口は出したままにする
  const many = isDecor(item.id);
  const done = soldOut(progress, item.id);
  const why = whyCannotBuy(progress, item.id);
  const n = many ? stockOf(progress, item.id) : 0;
  // 買い切った品は絵と名前だけの1行に畳む(下へ送ってあるので邪魔にならない)
  if (done) {
    return `<div class="shop-item has">
      <div class="shop-line">${faceHtml(item)}
        <span class="shop-name"><b>${item.name}</b></span>
        <span class="shop-has">✓ 持っています</span></div>
    </div>`;
  }
  const lack = why && why.startsWith('あと') ? `<span class="shop-lack">${why}</span>` : '';
  return `<div class="shop-item ${open ? 'open' : ''} ${why ? 'poor' : ''}">
    <div class="shop-line">
      ${faceHtml(item)}
      <button class="shop-name" data-act="shop-more:${item.id}"
        aria-expanded="${open ? 'true' : 'false'}">
        <b>${item.name}${many && n ? ` <span class="shop-n">手持ち ${n}</span>` : ''}</b>
        ${open || grid ? '' : `<small>${shortDesc(item)}</small>`}
      </button>
      <button class="primary shop-pay" data-act="shop-buy:${item.id}" ${why ? 'disabled' : ''}
        title="${why ?? `${item.price}枚で買う`}">${COIN_ICON} ${item.price}</button>
    </div>
    ${lack ? `<div class="shop-line-2">${lack}</div>` : ''}
    ${open ? `<div class="shop-detail"><p>${item.desc}</p>
      ${item.note ? `<p><small>${item.note}</small></p>` : ''}</div>` : ''}
  </div>`;
}

// 棚を選ぶ帯。**買える数を添える** ── どの棚に行けば何か買えるのかが、
// 開かずに分かる(0 のときは何も出さない。「0」を並べても読む手間が増えるだけ)。
//
// **2段にする。** 携帯(390px)で棚3つと手持ちを1行に並べたら、
// 「島の飾り」と「手持ち 300」が重なった(実測)。棚の説明は棚の下 ──
// いま見ている棚が何の棚なのか、スクロールしても消えないようにする。
function shelfTabsHtml(progress, shelf) {
  const coins = progress.coins ?? 0;
  const tabs = SHELVES.map((s) => {
    const n = buyableCount(progress, s.id);
    return `<button class="${s.id === shelf ? 'sel' : ''}" data-act="shop-shelf:${s.id}">
      ${s.icon} ${s.label}${n ? `<i class="shop-cnt">${n}</i>` : ''}</button>`;
  }).join('');
  const note = SHELVES.find((s) => s.id === shelf)?.note ?? '';
  return `<div class="shop-bar">
    <div class="seg shop-tabs">${tabs}</div>
    <p class="shop-purse">手持ち ${COIN_ICON} <b>${coins}</b>
      <span class="shop-what">${note}</span></p>
  </div>`;
}

// 売り場。view は { shelf, open } ── どの棚を見ているか、どの品を開いているか。
// **状態は呼び出し側(main.js)が持つ。** ここで覚えると、描き直すたびに
// 棚が先頭に戻る。
export function shopHtml(progress, view = {}) {
  const shelf = cleanShelf(view.shelf);
  const open = view.open ?? null;
  const list = shelfItems(shelf, progress);
  const grid = !!SHELVES.find((s) => s.id === shelf)?.grid;
  const rows = list
    .map((item) => shopItemHtml(item, progress, item.id === open, grid)).join('');
  const left = list.filter((item) => !soldOut(progress, item.id)).length;
  return `${shelfTabsHtml(progress, shelf)}
    ${grid ? `<div class="shop-grid">${rows}</div>` : rows}
    ${left ? '' : '<p><small>この棚のものは全部そろいました。</small></p>'}
    <p class="shop-foot"><small>札を押すとくわしい説明が出ます。遊ぶと銀貨がたまります。</small></p>`;
}

// ---- 店の中(屋台の前で開く)----
//
// **店は島に建っている**(minigame/store.js)。ここはその中身で、
// 店番のひとことと売り物を並べる。買ったものを使うのは「持ち物」のほう
// (島のどこでも開ける)── 買う場所と使う場所を分けておくと、
// 品が増えても店の前に行かないと何もできない、にならない。
export function storeHtml(progress, view = {}) {
  const mine = ITEMS.filter((i) => owns(progress, i.id)).length;
  const line = mine >= ITEMS.length
    ? '「うちの品はもう全部あんたのもんだ。また仕入れとくよ。」'
    : (progress?.coins ?? 0) < Math.min(...ITEMS.map((i) => i.price))
      ? '「見ていくだけでもいいよ。銀貨がたまったらまたおいで。」'
      : '「いらっしゃい。銀貨と引き換えに、島で使えるものを置いてるよ。」';
  return `<p class="shop-greet"><span class="shop-face">🐻</span>
    <span><b>店主</b><small>${line}</small></span></p>
    ${shopHtml(progress, view)}`;
}

// ---- 島の掲示板(日替わりの依頼)----
//
// **今日の3本と、その進み具合。** 何が出るかは quests.js(日付だけで決まる)、
// どこまで進んだかは progress.js の questBoard。ここは並べるだけ。
//
// 「あと少し」が目で分かるように、数(3/5)と帯の両方を出す ── 数だけだと
// 掲示板の前で読み込まないと残りが分からない。

// きょうの相場(market.js)。**掲示板の主役は依頼**なので、依頼の下に
// 数行だけ添える。値そのもの(何枚になるか)は魚の大きさで変わるから
// 出せない ── 出せるのは「今日はこれが高い」という順番だけ。
//
// 釣れない魚は呼び出し側で落としてある(marketBoard の gates)。
export function marketHtml(rows) {
  if (!rows?.length) return '';
  const list = rows.map((r) => {
    const b = bandOf(r.rate);
    // ぬしは港が決まっている。**どこへ行けばいいかまで出す** ── 名前だけ
    // 出しても、どの桟橋に立てばいいかが分からない(図鑑を開き直すことになる)
    const at = r.at ? `<small class="mk-at">${portLabel(r.at)}</small>` : '';
    // 倍率はそのまま出す(×1.4)。「40%高い」は読むのに一手かかる
    return `<div class="mk-row">
      <span class="shop-icon">${r.icon}</span><b>${r.name}</b>${at}
      <span class="mk-band ${b.up ? 'up' : ''}">${b.icon}<i>${b.label}</i></span>
      <span class="mk-rate">×${r.rate.toFixed(1)}</span>
    </div>`;
  }).join('');
  return `<p class="q-head mk-head">きょうの相場</p>${list}
    <p><small>魚の種類ごとに、今日の買い取り値が上下します。釣った瞬間にこの値で売れます。</small></p>`;
}

export function questsHtml(board, { now = Date.now(), here = null, market = [] } = {}) {
  const left = board.filter((q) => !q.done);
  const paid = board.filter((q) => q.done).reduce((s, q) => s + q.reward, 0);
  const rows = board.map((q) => {
    const where = questWhere(q);
    // いまいる島でできるか。よその島の依頼には行き先を出す
    const away = q.mode && here && q.mode !== here;
    const pct = Math.round((q.at / q.goal) * 100);
    const bar = q.done
      ? '<span class="q-done">✓ 達成</span>'
      : `<span class="q-bar"><i style="width:${pct}%"></i></span>
         <small>${q.at}/${q.goal}${q.unit}</small>`;
    return `<div class="q-row ${q.done ? 'has' : ''}">
      <div class="shop-head"><span class="shop-icon">${q.icon}</span><b>${q.text}</b></div>
      <div class="q-line">${bar}<span class="q-pay">${COIN_ICON} ${q.reward}</span></div>
      ${where ? `<p><small>${away ? '➜ ' : ''}${where}</small></p>` : ''}
    </div>`;
  }).join('');
  const foot = left.length
    ? `<p><small>あと ${left.length} 件。明日 0 時に張り替わります。</small></p>`
    : '<p><small>今日のぶんは全部おわりました。明日 0 時に新しい依頼が出ます。</small></p>';
  return `<p class="q-head">${dayLabel(now)} の依頼
    ${paid ? `<span class="q-got">${COIN_ICON} +${paid}</span>` : ''}</p>
    ${rows}${foot}${marketHtml(market)}`;
}

// 持ち物。使い道のある品は、ここで使う。
//
// **店とまったく同じ並べかたにする**(shopHtml)── 棚で仕切って、
// 見ている棚だけ、札は1行、くわしい説明は押したときだけ。買うときと
// 使うときで見え方が違うと、さっき買ったものがどこにあるか分からない。
//
// 前は品ぜんぶを縦に積んで、1品ごとに説明を丸ごと出していた。携帯で
// **2.83画面ぶん**(実測)。しかも同じ文がくり返されていた ──
// 飾り4品ぜんぶに「半透明の見本が出ます。歩いて場所を…」、かぶりもの
// 4品ぜんぶに「見た目だけの品です。…」。**同じ説明は棚に1回**あればいい。

// 1品ぶん。右はしに「その品で何ができるか」のボタンを置く
// (店の値段と同じ位置)。入りきらない操作は下の段へ。
function bagItemHtml(item, progress, view, open) {
  const { mapOn, skyTime, hat } = view;
  const n = isDecor(item.id) ? stockOf(progress, item.id) : 0;
  // いま着けているか(かぶりものだけ)。
  //
  // **盤まわりはここを通らない。** 盤まわりの棚は枠ごとのタイル
  // (gearPanelHtml)に分けたので、この関数に来るのは道具・かぶりもの・
  // 飾りだけ ── 前はここにも「つかう/もどす」の枝があったが、
  // **誰も通らない道**になっていた(故障注入が2件すり抜けて気づいた。
  // 到達しない行は、どんなテストでも捕まえられない)。
  const worn = isWear(item.id) && hat === item.id;
  // 右はしのボタン。押すとすぐ効く(説明を開かなくても使える)
  const act = item.id === 'islandMap'
    ? `<button class="${mapOn ? '' : 'primary'} bag-do" data-act="walk-map-toggle">${mapOn ? 'しまう' : '出す'}</button>`
    : item.id === 'skyGlass'
      ? `<button class="bag-do" data-act="bag-more:${item.id}">${skyTimeOf(skyTime).icon} ${skyTimeOf(skyTime).label}</button>`
      : isWear(item.id)
        ? `<button class="${worn ? '' : 'primary'} bag-do" data-act="wear-hat:${worn ? 'none' : item.id}">${worn ? 'ぬぐ' : 'かぶる'}</button>`
        : isDecor(item.id)
          ? `<button class="primary bag-do" data-act="decor-place:${item.id}">置く</button>`
          : '';
  // 砂時計だけは操作が5つあって1行に入らない。開いたときに下の段へ出す
  const wide = open && item.id === 'skyGlass' ? skyTimesHtml(skyTime) : '';
  return `<div class="shop-item bag-item ${open ? 'open' : ''} ${worn ? 'worn' : ''}">
    <div class="shop-line">
      ${faceHtml(item)}
      <button class="shop-name" data-act="bag-more:${item.id}"
        aria-expanded="${open ? 'true' : 'false'}">
        <b>${item.name}${n ? ` <span class="shop-n">×${n}</span>` : ''}${worn ? ' <span class="bag-on">✓</span>' : ''}</b>
        ${open ? '' : `<small>${shortDesc(item)}</small>`}
      </button>
      ${act}
    </div>
    ${open ? `<div class="shop-detail"><p>${item.desc}</p>
      ${item.note ? `<p><small>${item.note}</small></p>` : ''}${wide}</div>` : ''}
  </div>`;
}

// ---- 盤まわり(枠ごとに仕切る)----
//
// **12品を1本に積んでいた。** サイコロ4・灯り3・コマ4・盤4が仕切り無しに
// 縦に並び、盤の柄はスクロールの外にいた ── どれが盤の話なのかは名前を
// 読むまで分からず、「分かりにくすぎる」と言われた。枠ごとに仕切って、
// 1枠を1行のタイルに畳む。
//
// **既定も並べる。** 前は「いつもの盤」が一覧に無く、戻すには
// *いま使っている品をもう一度押す*しかなかった ── その戻り道は画面の
// どこにも書いていない。既定をタイルにすれば、いま何を使っているかと
// 戻り道が、同じ場所に同時に出る(隠しトグルは要らなくなる)。
//
// 説明は**選んでいるものの1行だけ**。12品ぶん並べると、また読めなくなる。
function gearGroupHtml(slot, progress) {
  const now = gearOf(progress, slot.id);
  // 持っているものと既定だけ。**買っていない品は出さない**(持ち物は売り場ではない)
  const mine = slot.items.filter((i) => i.price == null || owns(progress, i.id));
  const tiles = mine.map((i) => {
    const sel = i.id === now?.id;
    return `<button class="gear-tile ${sel ? 'sel' : ''}" data-act="use-gear:${i.id}"
      aria-pressed="${sel ? 'true' : 'false'}">
      ${gearSwatch(i.id) || `<span class="gear-emoji">${i.icon}</span>`}
      <span class="gear-cap">${i.name}</span></button>`;
  }).join('');
  // 枠に既定しか無いときだけ、どこで増やせるかを書く
  const none = mine.length < 2
    ? '<p class="gear-none"><small>この枠の品は、島の店で買えます。</small></p>' : '';
  return `<div class="gear-group">
    <p class="gear-head"><b>${slot.icon} ${slot.label}</b><small>${slot.note}</small></p>
    <div class="gear-tiles">${tiles}</div>${none}
    <p class="gear-now">いま: ${now?.desc ?? ''}</p>
  </div>`;
}

// 盤まわりの一式。**持ち物と対戦の支度の両方から、同じものを出す**
// ── 盤が見える場所の近くで選べないと、押しても何が起きたか分からない
export function gearPanelHtml(progress) {
  return SLOTS.map((s) => gearGroupHtml(s, progress)).join('');
}

export function bagHtml(
  progress,
  { mapOn = true, skyTime = 'live', hat = null, shelf = null, open = null } = {},
) {
  const got = bagShelves(progress);
  if (!got.length) return '<p>まだ何も持っていません。</p>';
  const now = cleanBagShelf(progress, shelf);
  const s = got.find((x) => x.id === now);
  const mine = s.items.filter((i) => owns(progress, i.id));
  // 盤まわりだけ組み立てが違う(枠ごとのタイル)。ほかの棚は1品1行のまま
  const gear = now === 'gear';
  const rows = gear
    ? gearPanelHtml(progress)
    : mine.map((i) => bagItemHtml(i, progress, { mapOn, skyTime, hat }, i.id === open)).join('');
  // 棚が1つしか無ければ帯は出さない(選びようが無いものを置かない)
  const tabs = got.length < 2 ? '' : `<div class="seg shop-tabs">${got.map((x) => `<button
    class="${x.id === now ? 'sel' : ''}" data-act="bag-shelf:${x.id}">${x.icon} ${x.label}</button>`).join('')}</div>`;
  return `<div class="shop-bar">${tabs}
    <p class="bag-note"><span class="shop-what">${s.note}</span></p></div>
    ${rows}
    <p class="shop-foot"><small>${gear
      ? '選ぶとすぐ切り替わります。対戦の盤で使う見た目です。'
      : '札を押すとくわしい説明が出ます。'}</small></p>`;
}



// 島の砂時計。選んだ時刻は光らせる(いまどれを選んでいるか分かるように)
export function skyTimesHtml(skyTime = 'live') {
  const now = skyTimeOf(skyTime).id;
  // **「大会の間は島の時刻に戻ります」はここに書かない。** 品の注意書き
  // (shop.js の skyGlass の note)にもう書いてあって、持ち物では2つ並ぶ。
  return `<div class="bag-times">${SKY_TIMES.map((s) => `<button
    class="${s.id === now ? 'sel' : ''}" data-act="walk-sky-set:${s.id}">${s.icon} ${s.label}</button>`).join('')}</div>`;
}

// ---- 島の見取り図(画面に出す地図の入り切り)----
//
// 地図そのものは canvas に描く(render/minimap.js)。ここはその栓だけ。
export function mapSwitchHtml(on) {
  return `<p><small>画面の左上に、島の形と目印(🏪 店・📋 受付・⚓ 桟橋・
    🏹 櫓・🐉 巣)と、いまいる場所が出ます。</small></p>
    <div class="row end"><button class="${on ? '' : 'primary'}"
      data-act="walk-map-toggle">${on ? '🗺 地図をしまう' : '🗺 地図を出す'}</button></div>`;
}
