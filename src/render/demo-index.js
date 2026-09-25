// あそびかたの一覧(短編を選ぶ画面)。
//
// **前は入口がボタン3つしか無かった。** タイトルの「あそびかた」と、
// ルールの2タブに埋め込んだ導線だけで、しかも1本が最長3分 ──
// 「交易だけ見たい」人が交易にたどり着けなかった。
//
// ここは**データを受け取って並べるだけ**。台本(demo/script.js)を
// import しない ── あれはルールエンジンごと引き連れてくるので、
// 一覧のために最初の読み込みを重くしたくない(呼ぶ側が動的に読んで渡す)。

// 秒を「約◯秒」に。**1分を超えたら分で言う** ── 「約75秒」は読みにくい。
//
// **丸めたぶんを繰り上げる。** 110秒を「1分」と「50秒→60秒」に分けて
// 出したら **「約1分60秒」** になった(実機の一覧で見つけた)。
// 先に15秒単位へ丸めてから、分と秒に割る。
export function lengthLabel(sec) {
  const n = Math.max(5, Math.round(Math.max(0, sec) / 5) * 5);
  if (n < 60) return `約${n}秒`;
  const r15 = Math.round(n / 15) * 15;
  const m = Math.floor(r15 / 60);
  const r = r15 % 60;
  return r ? `約${m}分${r}秒` : `約${m}分`;
}

function rowHtml(ch, i) {
  return `<button class="demo-row" data-act="demo:${ch.id}">
    <span class="demo-no">${i + 1}</span>
    <span class="demo-text"><b>${ch.title}</b><small>${ch.lead}</small></span>
    <span class="demo-len">${lengthLabel(ch.seconds)}</span>
  </button>`;
}

// sections: [{ id, icon, title, lead }]
// chapters: [{ id, section, title, lead, seconds }]
// open: はじめから開けておく節の id(既定はどれも開かない。'all' なら全部)
//
// **節ごとに畳む。** 40本を平らに並べると画面 4.3 枚ぶんあって、
// 「島のことだけ見たい」人が島まで巻かないといけない。畳めば
// まず7行の目次になり、節の長さ(本数と時間)もその1行で分かる。
export function demoIndexHtml(sections, chapters, { open = null } = {}) {
  const body = sections.map((sec) => {
    const list = chapters.filter((c) => c.section === sec.id);
    if (!list.length) return '';
    const total = list.reduce((a, c) => a + c.seconds, 0);
    const on = open === 'all' || open === sec.id;
    return `<details class="demo-sec"${on ? ' open' : ''}>
      <summary><span class="demo-sec-head"><b>${sec.icon} ${sec.title}</b><small>${sec.lead}</small></span>
        <span class="demo-sec-len">${list.length}本<small>${lengthLabel(total)}</small></span></summary>
      ${list.map(rowHtml).join('')}
      <button class="demo-all" data-act="demo:${list[0].id}">
        ▶ ${list.length}本を続けて見る<small>${lengthLabel(total)}</small></button>
    </details>`;
  }).join('');
  const n = sections.filter((s) => chapters.some((c) => c.section === s.id)).length;
  return `<h3>▶ あそびかた</h3>
    <div class="panel-scroll">
      <div class="net-note">本物の画面がそのまま動きます。途中でやめられます。</div>
      ${n > 1 ? `<button class="rsec-all" data-act="demos-openall">${
        open === 'all' ? '⊖ ぜんぶ閉じる' : `⊕ ぜんぶ開く（${n}節・${chapters.length}本）`}</button>` : ''}
      ${body}
    </div>
    <div class="row end rules-close">
      <button class="primary" data-act="goto-title">← タイトル</button>
    </div>`;
}
