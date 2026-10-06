/* ══════════════════════════════════════════════════════════════════════
   Exam Bank v3 — 四層分類 + MC／長題 + 互動答題 + 關鍵詞搜索 + 原題圖
   ──────────────────────────────────────────────────────────────────────
   BANK 物件欄位：
     id kind src yr pp qn part marks
     sect t grp sub l freq freqEv cross
     stem q fig img o ci note
     first kw rs ms tr st
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var TOPIC_COLOR = {
    'Projectile Motion':         '#b8860b',
    'Circular Motion':           '#a8821f',
    'Mechanics':                 '#c2a34a',
    'Waves':                     '#9c7a12',
    'Electricity and Magnetism': '#cbb26a',
    'Heat and Gases':            '#8b6914',
    'Radioactivity':             '#a3760a',
    'Astronomy':                 '#9c7a12'
  };
  var LV_LABEL  = { b: '基礎', d: 'DSE 標準', c: '挑戰' };
  var LV_NAME   = { b: 'Foundation', d: 'DSE Standard', c: 'Challenge' };
  var KIND_NAME = { mc: 'MC', long: '長題' };
  var LETTERS   = 'ABCD';

  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

  /* ── HTML 轉義（官方 MS 有 <accept 203 J> 之類角括號） ── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── 分類索引 ── */
  var SECTS  = uniq(BANK.map(function (x) { return x.sect; }).filter(Boolean));
  var TOPICS = uniq(BANK.map(function (x) { return x.t; }));
  var KINDS  = ['mc', 'long'].filter(function (k) {
    return BANK.some(function (x) { return x.kind === k; });
  });
  var LVS = ['b', 'd', 'c'].filter(function (k) {
    return BANK.some(function (x) { return x.l === k; });
  });

  function groupsFor(topics) {
    return uniq(BANK.filter(function (x) { return topics.indexOf(x.t) >= 0; })
      .map(function (x) { return x.grp; }).filter(Boolean));
  }
  function subsFor(topics, grps) {
    return uniq(BANK.filter(function (x) {
      return topics.indexOf(x.t) >= 0 && grps.indexOf(x.grp) >= 0;
    }).map(function (x) { return x.sub; }).filter(Boolean));
  }

  var GRP_TOPIC = {}, SUB_TOPIC = {}, TOPIC_TAG = {
    'Projectile Motion': 'PM', 'Circular Motion': 'CM'
  };
  BANK.forEach(function (x) {
    if (x.grp && !GRP_TOPIC[x.grp]) GRP_TOPIC[x.grp] = x.t;
    if (x.sub && !SUB_TOPIC[x.sub]) SUB_TOPIC[x.sub] = x.t;
  });
  function tagOf(t) {
    if (TOPIC_TAG[t]) return TOPIC_TAG[t];
    return String(t || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  }

  /* ── 關鍵詞索引：由 kw 嘅「…」引號詞 + 分類名自動抽取 ── */
  var KEYWORDS = (function () {
    var m = {};
    function add(k) {
      k = String(k == null ? '' : k).trim();
      if (k.length < 2 || k.length > 42) return;
      m[k] = (m[k] || 0) + 1;
    }
    BANK.forEach(function (x) {
      String(x.kw || '').replace(/「([^」]{2,40})」/g, function (_, k) { add(k); return ''; });
      add(x.sub);
      add(x.grp);
      add(x.t);
      (x.cross || []).forEach(add);
    });
    return Object.keys(m).map(function (k) { return { k: k, n: m[k] }; })
      .sort(function (a, b) { return b.n - a.n || a.k.localeCompare(b.k); });
  })();

  /* 預先為每題建立可搜尋文字（避免每次篩選都重新串接） */
  var HAY = {};
  BANK.forEach(function (x) {
    HAY[x.id] = [
      x.q, x.stem, x.kw, x.first, x.tr, x.note, x.sub, x.grp, x.t, x.fig,
      x.src, x.yr, x.pp, 'Q' + x.qn, x.part, x.l, x.freq, x.freqEv,
      (x.cross || []).join(' '),
      (x.o || []).join(' '),
      (x.rs || []).join(' '), (x.ms || []).join(' '), (x.st || []).join(' ')
    ].filter(Boolean).join(' ').toLowerCase();
  });

  var state = {
    sects:  SECTS.slice(),
    topics: TOPICS.slice(),
    grps:   groupsFor(TOPICS),
    subs:   subsFor(TOPICS, groupsFor(TOPICS)),
    kinds:  KINDS.slice(),
    lvs:    LVS.slice(),
    q: '',
    n: 8,
    drawn: {},
    cards: [],
    answered: {},
    right: 0,
    wrong: 0,
    showAll: false
  };

  var elList  = document.getElementById('qlist');
  var elCnt   = document.getElementById('cnt');
  var elPool  = document.getElementById('pool');
  var elDrawn = document.getElementById('drawn');
  var elScore = null;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function searchTerms() {
    return state.q.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function matchesSearch(x) {
    var terms = searchTerms();
    if (!terms.length) return true;
    var h = HAY[x.id] || '';
    return terms.every(function (t) { return h.indexOf(t) >= 0; });
  }

  function filtered() {
    return BANK.filter(function (x) {
      return state.sects.indexOf(x.sect) >= 0 &&
             state.topics.indexOf(x.t) >= 0 &&
             state.grps.indexOf(x.grp) >= 0 &&
             state.subs.indexOf(x.sub) >= 0 &&
             state.kinds.indexOf(x.kind) >= 0 &&
             state.lvs.indexOf(x.l) >= 0 &&
             matchesSearch(x);
    });
  }

  function pick(pool, n) {
    var sh = shuffle(pool.slice());
    var out = sh.filter(function (x) {
      if (state.drawn[x.id]) return false;
      state.drawn[x.id] = 1; return true;
    });
    if (out.length < n) out = sh.slice();
    return out.slice(0, Math.min(n, out.length));
  }

  function scramble(item) {
    if (item.kind !== 'mc' || !item.o) return { src: item, opts: [], ci: -1 };
    var idx = shuffle(item.o.map(function (_, i) { return i; }));
    return {
      src: item,
      opts: idx.map(function (i) { return item.o[i]; }),
      ci: idx.indexOf(item.ci)
    };
  }

  /* ══════════ 篩選 UI ══════════ */
  function addRow(label, id) {
    var box = document.querySelector('.console .filters');
    var row = document.createElement('div');
    row.className = 'frow';
    row.innerHTML = '<span class="fl">' + label + '</span><span id="' + id + '"></span>';
    box.appendChild(row);
    return document.getElementById(id);
  }

  function chipRow(container, values, getSel, onChange, labels, kindMap) {
    container.innerHTML = '';
    var sel = getSel() || [];
    var multi = state.topics.length > 1;
    values.forEach(function (v) {
      var on = sel.indexOf(v) >= 0;
      var lab = document.createElement('label');
      lab.className = 'chk' + (on ? ' on' : '');
      var txt = labels && labels[v] ? labels[v]
        : (kindMap && multi && kindMap[v] ? tagOf(kindMap[v]) + '·' + v : v);
      lab.innerHTML = '<input type="checkbox"' + (on ? ' checked' : '') +
        ' value="' + esc(v) + '">' + esc(txt);
      lab.querySelector('input').addEventListener('change', function (e) {
        var next = (getSel() || []).slice();
        if (e.target.checked) { if (next.indexOf(v) < 0) next.push(v); }
        else { next = next.filter(function (x) { return x !== v; }); }
        lab.classList.toggle('on', e.target.checked);
        onChange(next);
      });
      container.appendChild(lab);
    });
    return container;
  }

  var boxSect, boxTopic, boxGrp, boxSub, boxKind, boxLv, boxNum, boxSearch;

  function rebuildTaxonomy(keep) {
    var grps = groupsFor(state.topics);
    state.grps = keep ? state.grps.filter(function (g) { return grps.indexOf(g) >= 0; }) : grps;
    if (!state.grps.length) state.grps = grps;
    state.subs = subsFor(state.topics, state.grps);
    chipRow(boxGrp, state.grps, function () { return state.grps; }, onGrpChange, null, GRP_TOPIC);
    chipRow(boxSub, state.subs, function () { return state.subs; }, onSubChange, null, SUB_TOPIC);
  }
  function onGrpChange(sel) {
    state.grps = sel;
    state.subs = subsFor(state.topics, state.grps);
    chipRow(boxSub, state.subs, function () { return state.subs; }, onSubChange, null, SUB_TOPIC);
    refreshPool();
  }
  function onSubChange(sel) { state.subs = sel; refreshPool(); }

  /* ── 搜索框 + 關鍵詞彈出 ── */
  function buildSearch() {
    boxSearch = addRow('搜索', 'searchBox');
    var wrap = document.createElement('div');
    wrap.className = 'searchwrap';
    wrap.innerHTML =
      '<input type="search" id="kwInput" class="kwinput" autocomplete="off" ' +
        'placeholder="打關鍵詞…例如 projected horizontally、banked、 momentum、頻閃">' +
      '<button type="button" id="kwClear" class="kwclear" title="清除搜索">✕</button>' +
      '<div class="kwdrop" id="kwDrop" hidden></div>';
    boxSearch.appendChild(wrap);

    var input = document.getElementById('kwInput');
    var drop  = document.getElementById('kwDrop');
    var clear = document.getElementById('kwClear');

    function renderDrop() {
      var q = input.value.trim().toLowerCase();
      if (!q) { drop.hidden = true; drop.innerHTML = ''; return; }
      var hits = KEYWORDS.filter(function (o) {
        return o.k.indexOf(q) >= 0;
      }).slice(0, 10);
      if (!hits.length) { drop.hidden = true; drop.innerHTML = ''; return; }
      drop.innerHTML = hits.map(function (o) {
        return '<button type="button" class="kwitem" data-kw="' + esc(o.k) + '">' +
          esc(o.k) + '<em>' + o.n + '</em></button>';
      }).join('');
      drop.hidden = false;
    }

    function commit() {
      state.q = input.value.trim();
      drop.hidden = true;
      refreshPool();
    }

    input.addEventListener('input', renderDrop);
    input.addEventListener('focus', renderDrop);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); input.blur(); }
      if (e.key === 'Escape') { drop.hidden = true; }
    });
    input.addEventListener('blur', function () { setTimeout(function () { drop.hidden = true; }, 180); });
    drop.addEventListener('click', function (e) {
      var b = e.target.closest('.kwitem');
      if (!b) return;
      e.preventDefault();
      input.value = b.dataset.kw;
      commit();
    });
    clear.addEventListener('click', function () {
      input.value = ''; state.q = ''; drop.hidden = true; refreshPool(); input.focus();
    });
  }

  function buildControls() {
    boxSect  = addRow('Section',  'sectBox');
    boxTopic = addRow('Topic',    'topicBox');
    boxGrp   = addRow('分類',     'grpBox');
    boxSub   = addRow('子Topic',  'subBox');
    boxKind  = addRow('題型',     'kindBox');
    boxLv    = addRow('難度',     'lvBox');
    boxNum   = addRow('抽題數',   'numBox');
    buildSearch();

    boxSub.classList.add('chipbox');
    boxGrp.classList.add('chipbox');

    chipRow(boxSect, SECTS, function () { return state.sects; }, function (sel) {
      state.sects = sel; refreshPool();
    });
    chipRow(boxTopic, TOPICS, function () { return state.topics; }, function (sel) {
      state.topics = sel; rebuildTaxonomy(false); refreshPool();
    });
    rebuildTaxonomy(false);
    chipRow(boxKind, KINDS, function () { return state.kinds; }, function (sel) {
      state.kinds = sel; refreshPool();
    }, KIND_NAME);
    chipRow(boxLv, LVS, function () { return state.lvs; }, function (sel) {
      state.lvs = sel; refreshPool();
    }, LV_LABEL);

    boxNum.innerHTML = '';
    [5, 8, 12, 20].forEach(function (n) {
      var lab = document.createElement('label');
      lab.className = 'chk' + (n === state.n ? ' on' : '');
      lab.innerHTML = '<input type="radio" name="qnum" value="' + n + '"' +
        (n === state.n ? ' checked' : '') + '>' + n + ' 題';
      lab.querySelector('input').addEventListener('change', function () {
        state.n = n;
        Array.prototype.forEach.call(boxNum.children, function (c) {
          c.classList.toggle('on', +c.querySelector('input').value === n);
        });
        newSet();
      });
      boxNum.appendChild(lab);
    });

    /* 計分板 */
    var stat = document.querySelector('.console .stat');
    if (stat) {
      elScore = document.createElement('span');
      elScore.className = 'scorebox';
      stat.appendChild(elScore);
    }
  }

  function updateScore() {
    if (!elScore) return;
    var done = state.right + state.wrong;
    elScore.innerHTML = done
      ? '｜答對 <b>' + state.right + '</b>／已答 <b>' + done + '</b>'
      : '';
  }

  function refreshPool() {
    elPool.textContent = filtered().length;
    newSet();
  }

  function newSet() {
    var pool = filtered();
    state.answered = {};
    if (!pool.length) {
      elList.innerHTML = '<div class="empty">目前篩選條件下冇題目。試下減少篩選，或者清除搜索字。</div>';
      elCnt.textContent = 0; elPool.textContent = 0; elDrawn.textContent = 0;
      return;
    }
    if (Object.keys(state.drawn).length > pool.length * 0.7) state.drawn = {};
    state.cards = pick(pool, state.n).map(scramble);
    render();
  }

  /* ══════════ 渲染 ══════════ */
  function originRaw(x) {
    var b = [];
    if (x.src) b.push(x.src);
    if (x.yr && x.yr !== '') b.push(x.yr);
    if (x.pp) b.push(x.pp);
    if (x.qn) b.push('Q' + x.qn);
    if (x.part) b.push(x.part);
    return b.join(' ');
  }
  function chip(cls, text, title) {
    return '<span class="' + cls + '"' + (title ? ' title="' + esc(title) + '"' : '') +
      '>' + esc(text) + '</span>';
  }
  function headMeta(x) {
    var h = '<div class="qmeta"><span class="idx"></span>';
    h += chip('chip-kind ' + (x.kind === 'mc' ? 'k-mc' : 'k-long'), KIND_NAME[x.kind] || x.kind);
    h += chip('chip-lv ' + x.l, LV_NAME[x.l] || x.l);
    h += chip('chip-src', originRaw(x));
    h += chip('chip-topic', x.t);
    if (x.sub) h += chip('chip-sub', x.sub, x.grp || '');
    if (x.freq && x.freq.indexOf('N/A') !== 0) h += chip('chip-freq', '頻率 ' + x.freq, x.freqEv || '');
    return h + '</div>';
  }
  function stamp(html, n) {
    return html.replace('<span class="idx"></span>', '<span class="idx">Q' + n + '</span>');
  }
  function crossChips(x) {
    if (!x.cross || !x.cross.length) return '';
    return '<p class="crossline">跨章：' + x.cross.map(function (c) {
      return '<span class="chip-cross">' + esc(c) + '</span>';
    }).join('') + '</p>';
  }
  function figBox(x) {
    var out = '';
    if (x.img) {
      var isLong = x.kind === 'long';
      out += '<div class="figwrap' + (isLong ? ' open' : '') + '">' +
        '<button type="button" class="figtoggle">📷 原題掃描圖' +
          (isLong ? '（本題）' : '（題目所在欄位）') +
          '<span class="figarrow">›</span></button>' +
        '<figure class="qfig">' +
          '<a href="' + esc(x.img) + '" target="_blank" rel="noopener">' +
          '<img src="' + esc(x.img) + '" alt="原題掃描圖" loading="lazy"></a>' +
          '<figcaption>撳圖可另開放大</figcaption>' +
        '</figure></div>';
    }
    if (x.fig && x.fig !== '無圖（純文字）' && x.fig !== '無圖') {
      out += '<p class="figline"><b>圖說：</b>' + esc(x.fig) + '</p>';
    }
    return out;
  }
  function listBlock(title, arr, cls) {
    if (!arr || !arr.length) return '';
    return '<div class="blk ' + cls + '"><span class="ttl">' + title + '</span>' +
      arr.map(function (s) { return '<span class="line">• ' + esc(s) + '</span>'; }).join('') +
      '</div>';
  }
  function revealBlock(x) {
    var h = '';
    if (x.kind === 'mc' && x.ci >= 0 && x.o) {
      h += '<div class="ansline">答案：' + LETTERS[x.ci] + '　' + esc(x.o[x.ci]) + '</div>';
    } else {
      h += '<div class="ansline longans">本小題 ' + esc(x.marks || '?') + ' 分' +
           (x.part ? '　（' + esc(x.part) + '）' : '') + '</div>';
    }
    if (x.first) h += '<p class="blk firstblk"><span class="ttl">第一眼切入</span>' + esc(x.first) + '</p>';
    if (x.kw)    h += '<p class="kw"><b>關鍵字 → 公式：</b>' + esc(x.kw) + '</p>';
    h += listBlock('推理路徑', x.rs, 'rsblk');
    h += listBlock('MS 拿分點', x.ms, 'msblk');
    h += listBlock('最終解答步驟', x.st, 'stblk');
    if (x.tr)   h += '<div class="trap"><b>常見失分陷阱：</b>' + esc(x.tr) + '</div>';
    if (x.note) h += '<div class="noteline"><b>備註：</b>' + esc(x.note) + '</div>';
    return h;
  }

  function render() {
    elCnt.textContent = state.cards.length;
    elPool.textContent = filtered().length;
    elDrawn.textContent = Object.keys(state.drawn).length;

    elList.innerHTML = state.cards.map(function (card, i) {
      var x = card.src;
      var acc = TOPIC_COLOR[x.t] || '#b8860b';
      var isMc = x.kind === 'mc';

      var body = '';
      if (x.stem) body += '<p class="qbody qstem">' + esc(x.stem) + '</p>';
      body += '<p class="qbody' + (x.stem ? ' qask' : '') + '">' +
              (x.part && !isMc ? '<b class="qpart">' + esc(x.part) + '</b> ' : '') +
              esc(x.q) + '</p>';
      body += figBox(x);

      var opts = '';
      if (isMc && card.opts.length) {
        opts = '<ul class="opts" data-card="' + i + '">' + card.opts.map(function (o, oi) {
          return '<li class="opt" data-card="' + i + '" data-opt="' + oi + '" role="button" tabindex="0">' +
            '<span class="k">' + LETTERS[oi] + '</span><span>' + esc(o) + '</span></li>';
        }).join('') + '</ul><p class="hint">↑ 撳選項作答，或者直接撳「看答案」</p>';
      }

      return '<article class="qcard" style="--acc:' + acc + '">' +
        stamp(headMeta(x), i + 1) +
        body + opts + crossChips(x) +
        '<div class="qacts">' +
          (isMc ? '<button class="aBtn" data-act="ans" data-i="' + i + '">看答案</button>' : '') +
          '<button class="sBtn" data-act="sol" data-i="' + i + '">' +
            (isMc ? '解題步驟與應試技巧' : '完整解析（推理路徑 + MS 拿分點）') + '</button>' +
        '</div>' +
        '<div class="reveal" data-rev="' + i + '">' + revealBlock(x) + '</div>' +
      '</article>';
    }).join('');

    updateScore();
  }

  /* ── 作答 ── */
  function answer(i, oi) {
    if (state.answered[i]) return;
    var card = state.cards[i];
    if (!card || card.src.kind !== 'mc' || !card.opts.length) return;
    state.answered[i] = 1;

    var ul = elList.querySelector('.opts[data-card="' + i + '"]');
    if (ul) {
      var right = (oi === card.ci);
      var picked = ul.querySelector('.opt[data-opt="' + oi + '"]');
      if (picked) picked.classList.add(right ? 'right' : 'wrong');
      if (!right) {
        var ans = ul.querySelector('.opt[data-opt="' + card.ci + '"]');
        if (ans) ans.classList.add('right');
      }
      Array.prototype.forEach.call(ul.querySelectorAll('.opt'), function (li) {
        li.classList.add('locked');
      });
      var hint = ul.parentNode.querySelector('.hint');
      if (hint) hint.textContent = right ? '✓ 答對！' : '✗ 答錯，正確答案已標綠。';
    }
    if (oi === card.ci) state.right++; else state.wrong++;

    var rev = elList.querySelector('.reveal[data-rev="' + i + '"]');
    if (rev) rev.classList.add('show');
    var sol = elList.querySelector('button[data-act="sol"][data-i="' + i + '"]');
    if (sol) sol.textContent = '收起步驟';
    var an = elList.querySelector('button[data-act="ans"][data-i="' + i + '"]');
    if (an) an.textContent = '隱藏答案';
    updateScore();
  }

  elList.addEventListener('click', function (e) {
    var figBtn = e.target.closest('.figtoggle');
    if (figBtn) {
      var w = figBtn.closest('.figwrap');
      var opened = w.classList.toggle('open');
      figBtn.querySelector('.figarrow').textContent = opened ? '⌄' : '›';
      return;
    }

    var opt = e.target.closest('.opt');
    if (opt) { answer(+opt.dataset.card, +opt.dataset.opt); return; }

    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var i = b.dataset.i;
    var rev = elList.querySelector('.reveal[data-rev="' + i + '"]');
    if (!rev) return;
    var x = state.cards[i] ? state.cards[i].src : null;
    var isMc = x && x.kind === 'mc';

    if (b.dataset.act === 'ans') {
      /* ← 修好：真正 toggle */
      var open = rev.classList.toggle('show');
      b.textContent = open ? '隱藏答案' : '看答案';
      var sol2 = elList.querySelector('button[data-act="sol"][data-i="' + i + '"]');
      if (sol2) sol2.textContent = open ? '收起步驟'
        : (isMc ? '解題步驟與應試技巧' : '完整解析（推理路徑 + MS 拿分點）');
    } else {
      var open2 = rev.classList.toggle('show');
      b.textContent = open2 ? '收起步驟'
        : (isMc ? '解題步驟與應試技巧' : '完整解析（推理路徑 + MS 拿分點）');
      var an2 = elList.querySelector('button[data-act="ans"][data-i="' + i + '"]');
      if (an2) an2.textContent = open2 ? '隱藏答案' : '看答案';
    }
  });

  document.getElementById('newset').addEventListener('click', newSet);
  document.getElementById('revealAll').addEventListener('click', function () {
    elList.querySelectorAll('.reveal').forEach(function (r) { r.classList.add('show'); });
    elList.querySelectorAll('.aBtn').forEach(function (b) { b.textContent = '隱藏答案'; });
    elList.querySelectorAll('.sBtn').forEach(function (b) { b.textContent = '收起步驟'; });
  });
  document.getElementById('hideAll').addEventListener('click', function () {
    elList.querySelectorAll('.reveal').forEach(function (r) { r.classList.remove('show'); });
    elList.querySelectorAll('.aBtn').forEach(function (b) { b.textContent = '看答案'; });
    elList.querySelectorAll('.sBtn').forEach(function (b, i) {
      var c = state.cards[i];
      var mc = c && c.src.kind === 'mc';
      b.textContent = mc ? '解題步驟與應試技巧' : '完整解析（推理路徑 + MS 拿分點）';
    });
  });

  buildControls();
  elPool.textContent = filtered().length;
  updateScore();
  newSet();
})();
