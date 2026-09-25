// 長い説明を「畳める章」にする。
//
// **説明書が縦に長すぎた。** 390×844 の画面で実測すると、
//
//   🎪 集まり     7769px = 画面 18 枚ぶん(見出し23個)
//   ⚙️ 設定       1870px = 4.4 枚
//   🃏 進歩カード  2283px = 5.3 枚
//   🏙 都市と騎士  1588px = 3.7 枚
//
// ── 「丸太乗りの操作」を読みたいだけの人が、そこへ着くまでに
// 何画面も巻かないといけない。畳めば、まず**目次**が出る。
//
// ここは文字列を受け取って文字列を返すだけ(DOM も state も見ない)ので、
// node のテストから中身を直に測れる ── 実際、章の切り出しは
// 「`<h4 class="sub">` まで章にしてしまう」で一度壊した。
//
// **開け閉ては `<details>` に任せる。** 自前で state を持つと、
// タブを切り替えるたびに開き具合が飛ぶし、キーボードや読み上げの
// 対応を書き直すことになる。

// 章の見出し。**`class="sub"` の付いた見出しは章にしない** ──
// 「🎮 やりかた」「💡 コツ」のような小見出しは集まりの説明に5回ずつ出るので、
// これを章にすると目次が同じ字で埋まって、かえって探せなくなる。
const HEAD = /<h4(?![^>]*\bclass="[^"]*\bsub\b)[^>]*>([\s\S]*?)<\/h4>/g;

// 章の境目に残る区切り線。箱で仕切るので要らなくなる
const EDGE_HR = /^(?:\s*<hr[^>]*>)+|(?:<hr[^>]*>\s*)+$/g;

// 章の中身から、前後の区切り線と空白を落とす
const trim = (s) => s.trim().replace(EDGE_HR, '').trim();

// 見出しごとに `<details>` で包む。
//
// open … はじめから開けておく章の番号。**既定はどれも開かない** ──
//        実測で、🎪集まり は畳むと 7769px が 388px(目次7行)になり、
//        画面に全部おさまる。1つ開けておくと、その中身で残りの目次が
//        画面の外へ押し出されて、探せるようにした意味が半分消える。
//        all なら全部開く
//
// 見出しが1つも無ければ、そのまま返す(畳むところが無い)。
export function collapsible(html, { open = 'none' } = {}) {
  const heads = [...html.matchAll(HEAD)];
  if (!heads.length) return html;
  // 最初の見出しより前は**章に入れない**。導入の一文と動画への導線が
  // ここにあるので、畳むと入口が消える
  const intro = trim(html.slice(0, heads[0].index));
  const secs = heads.map((m, i) => {
    const from = m.index + m[0].length;
    const to = i + 1 < heads.length ? heads[i + 1].index : html.length;
    const on = open === 'all' || (open !== 'none' && i === open);
    return `<details class="rsec"${on ? ' open' : ''}>`
      + `<summary>${m[1]}</summary>`
      + `<div class="rsec-body">${trim(html.slice(from, to))}</div></details>`;
  }).join('');
  return `${intro ? `<div class="rsec-intro">${intro}</div>` : ''}${secs}`;
}

// 章がいくつあるか(「ぜんぶ開く」の横に出す数)
export function sectionCount(html) {
  return [...html.matchAll(HEAD)].length;
}
