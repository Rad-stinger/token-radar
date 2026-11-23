// Launch Radar's dashboard. It reads window.RADAR — the dataset main.ts writes beside dashboard/ from
// the same board.json — and renders the ranked board, filter and sort controls, and a per-protocol
// detail view with the value derivation and that protocol's farm plan. No fetch, no framework, no
// network: every byte on the page is in data.js.
(function () {
  'use strict';

  var D = window.RADAR;
  if (!D) return;

  var state = {
    tab: 'radar',
    q: '',
    category: 'all',
    chain: 'all',
    sort: 'rank',
    dir: 1,
    sel: null
  };

  // ---- formatting ------------------------------------------------------

  var whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + whole.format(Math.round(n));
  }

  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function age(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + ' yr';
    if (days >= 60) return Math.round(days / 30) + ' mo';
    return Math.max(1, Math.round(days)) + ' d';
  }

  function mult(n) { return '×' + n.toFixed(2); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---- model strip -----------------------------------------------------

  var fit = D.fit || { intercept: 0, slope: 1, n: 0, r2: 0 };

  function renderModelStrip() {
    var strip = document.getElementById('modelStrip');
    clear(strip);
    var lead = el('span');
    lead.appendChild(document.createTextNode('Value model: '));
    lead.appendChild(el('b', null, 'a power law fitted to the ' + fit.n + ' protocols whose token already trades'));
    lead.appendChild(document.createTextNode(' — '));
    var code = el('code', null, 'implied ≈ e^' + fit.intercept.toFixed(2) + ' · TVL^' + fit.slope.toFixed(2));
    lead.appendChild(code);
    strip.appendChild(lead);
    strip.appendChild(el('span', null, 'R² ' + fit.r2.toFixed(2) + ' · each category tilted by the median residual of its own peers · then 7-day growth and time tokenless adjust the rank'));

    var details = el('span');
    details.appendChild(document.createTextNode('Watchlist = '));
    details.appendChild(el('b', null, D.watchlist_size + ' protocols'));
    details.appendChild(document.createTextNode(' at or above ' + usd(D.floor_usd) + ' TVL that record no token and are not a wrapped or staked product of one that trades. The board goes past it: '));
    details.appendChild(el('b', null, (D.board_size - D.watchlist_size) + ' more'));
    details.appendChild(document.createTextNode(' pre-token protocols below the floor, and the ' + D.live_size + ' trading protocols the fit is measured on are kept in their own tab.'));
    strip.appendChild(details);
  }

  // ---- stats -----------------------------------------------------------

  function renderStats() {
    var box = document.getElementById('stats');
    clear(box);
    var rows = D.rows;
    var top = rows[0];
    var total = D.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    var medRatio = median(rows.map(function (r) { return r.implied_value_usd / r.tvl_usd; }));
    var cats = {};
    rows.forEach(function (r) { cats[r.category || 'Uncategorised'] = (cats[r.category || 'Uncategorised'] || 0) + 1; });
    var lead = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; })[0];

    var cards = [
      { k: 'Top implied value', v: top ? usd(top.implied_value_usd) : '—', s: top ? top.name : '', accent: true },
      { k: 'Aggregate implied value', v: usd(total), s: 'across ' + rows.length + ' pre-token protocols' },
      { k: 'Median implied ÷ TVL', v: (medRatio * 100).toFixed(1) + '%', s: 'half the board sits above this multiple of TVL' },
      { k: 'Most represented', v: lead || '—', s: (cats[lead] || 0) + ' of ' + rows.length + ' rows' },
      { k: 'Snapshot', v: D.as_of, s: 'sealed; every run reads the same bytes' }
    ];
    cards.forEach(function (c) {
      var card = el('div', 'stat' + (c.accent ? ' accent' : ''));
      card.appendChild(el('div', 'k', c.k));
      card.appendChild(el('div', 'v', c.v));
      card.appendChild(el('div', 's', c.s));
      box.appendChild(card);
    });
  }

  function median(list) {
    if (!list.length) return 0;
    var s = list.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // ---- filters ---------------------------------------------------------

  function fillSelect(id, values, all) {
    var sel = document.getElementById(id);
    clear(sel);
    var o = el('option', null, all);
    o.value = 'all';
    sel.appendChild(o);
    values.forEach(function (v) {
      var opt = el('option', null, v);
      opt.value = v;
      sel.appendChild(opt);
    });
  }

  function initFilters() {
    var cats = unique(D.rows.map(function (r) { return r.category; }));
    var chains = unique([].concat.apply([], D.rows.map(function (r) { return r.chains; })));
    fillSelect('category', cats, 'All categories');
    fillSelect('chain', chains, 'All chains');
  }

  function unique(list) {
    var seen = {};
    return list.filter(function (v) {
      if (v === null || v === undefined || seen[v]) return false;
      seen[v] = 1;
      return true;
    }).sort(function (a, b) { return String(a).localeCompare(String(b)); });
  }

  function matches(rec) {
    if (state.category !== 'all' && (rec.category || 'Uncategorised') !== state.category) return false;
    if (state.chain !== 'all' && rec.chains.indexOf(state.chain) === -1) return false;
    if (state.q) {
      var hay = (rec.name + ' ' + (rec.category || '') + ' ' + rec.chains.join(' ') + ' ' + rec.slug).toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function sortValue(rec) {
    switch (state.sort) {
      case 'tvl': return rec.tvl_usd;
      case 'growth': return rec.change_7d === null || rec.change_7d === undefined ? -1e9 : rec.change_7d;
      case 'age': return rec.age_days === null || rec.age_days === undefined ? -1 : rec.age_days;
      case 'name': return rec.name.toLowerCase();
      case 'beta': return rec.implied_value_usd / rec.tvl_usd;
      default: return state.tab === 'live' ? rec.mcap_usd : rec.rank;
    }
  }

  function currentRows() {
    var base = (state.tab === 'live' ? D.live : D.rows).filter(matches);
    var dir = state.dir;
    return base.slice().sort(function (a, b) {
      var x = sortValue(a);
      var y = sortValue(b);
      if (typeof x === 'string' || typeof y === 'string') return dir * String(x).localeCompare(String(y));
      return dir * (x - y) || 0;
    });
  }

  // ---- table -----------------------------------------------------------

  var COLUMNS = {
    radar: [
      { id: 'rank', label: '#', cls: 'rank', sort: 'rank' },
      { id: 'name', label: 'Protocol', cls: '', sort: 'name' },
      { id: 'category', label: 'Category', cls: '', sort: null },
      { id: 'chains', label: 'Chains', cls: '', sort: null },
      { id: 'tvl', label: 'TVL', cls: 'num', sort: 'tvl' },
      { id: 'growth', label: '7d', cls: 'num', sort: 'growth' },
      { id: 'age', label: 'Tokenless', cls: 'num', sort: 'age' },
      { id: 'beta', label: 'Implied ÷ TVL', cls: 'num', sort: 'beta' },
      { id: 'value', label: 'Implied value', cls: 'num', sort: 'rank' }
    ],
    live: [
      { id: 'name', label: 'Protocol', cls: '', sort: 'name' },
      { id: 'category', label: 'Category', cls: '', sort: null },
      { id: 'chains', label: 'Chains', cls: '', sort: null },
      { id: 'tvl', label: 'TVL', cls: 'num', sort: 'tvl' },
      { id: 'growth', label: '7d', cls: 'num', sort: 'growth' },
      { id: 'ratio', label: 'Market cap ÷ TVL', cls: 'num', sort: 'beta' },
      { id: 'mcap', label: 'Market cap', cls: 'num', sort: 'rank' }
    ]
  };

  function renderHead() {
    var tr = document.getElementById('head');
    clear(tr);
    COLUMNS[state.tab].forEach(function (col) {
      var th = el('th', col.cls);
      th.className = col.cls;
      if (col.sort) {
        var b = el('button', null, col.label);
        b.type = 'button';
        b.addEventListener('click', function () {
          if (state.sort === col.sort) state.dir = -state.dir;
          else { state.sort = col.sort; state.dir = col.sort === 'name' ? 1 : (col.sort === 'rank' ? 1 : -1); }
          if (state.tab === 'live' && state.sort === 'rank') { state.sort = 'rank'; state.dir = -1; }
          render();
        });
        th.appendChild(b);
        var active = state.sort === col.sort;
        th.setAttribute('aria-sort', active ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
      } else {
        th.appendChild(el('span', null, col.label));
        th.firstChild.style.cssText = 'display:block;padding:10px 12px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint)';
      }
      tr.appendChild(th);
    });
  }

  function nameCell(rec) {
    var cell = el('td');
    var wrap = el('div', 'name-cell');
    wrap.appendChild(el('span', 'nm', rec.name));
    var sub = el('span', 'sub', rec.slug);
    wrap.appendChild(sub);
    cell.appendChild(wrap);
    return cell;
  }

  function renderRows() {
    var body = document.getElementById('rows');
    clear(body);
    var rows = currentRows();
    var maxValue = 0;
    rows.forEach(function (r) { if (state.tab === 'radar') maxValue = Math.max(maxValue, r.implied_value_usd); });

    document.getElementById('empty').hidden = rows.length > 0;

    rows.forEach(function (rec) {
      var tr = el('tr');
      tr.tabIndex = 0;
      if (state.sel === rec.slug) tr.className = 'is-sel';

      if (state.tab === 'radar') {
        var rank = el('td', 'rank');
        rank.appendChild(el('b', null, rec.rank));
        tr.appendChild(rank);
      }

      tr.appendChild(nameCell(rec));

      var cat = el('td');
      var chip = el('span', 'chip' + (state.tab === 'radar' ? ' watch' : ' live'), rec.category || 'Uncategorised');
      cat.appendChild(chip);
      tr.appendChild(cat);

      tr.appendChild(el('td', null, rec.chains.slice(0, 2).join(', ') + (rec.chains.length > 2 ? ' +' + (rec.chains.length - 2) : '')));

      tr.appendChild(el('td', 'num', usd(rec.tvl_usd)));

      var g = el('td', 'num ' + (rec.change_7d > 0 ? 'up' : rec.change_7d < 0 ? 'down' : 'mute'), pct(rec.change_7d));
      tr.appendChild(g);

      if (state.tab === 'radar') {
        tr.appendChild(el('td', 'num', age(rec.age_days)));
        tr.appendChild(el('td', 'num', ((rec.implied_value_usd / rec.tvl_usd) * 100).toFixed(1) + '%'));
        var val = el('td', 'num');
        var vc = el('div', 'value-cell');
        vc.appendChild(el('span', 'num', usd(rec.implied_value_usd)));
        var bar = el('div', 'bar');
        var fill = el('i');
        fill.style.width = Math.max(2, Math.round((rec.implied_value_usd / maxValue) * 100)) + '%';
        bar.appendChild(fill);
        vc.appendChild(bar);
        val.appendChild(vc);
        tr.appendChild(val);
      } else {
        tr.appendChild(el('td', 'num', rec.ratio.toFixed(2) + '×'));
        tr.appendChild(el('td', 'num', usd(rec.mcap_usd)));
      }

      tr.addEventListener('click', function () { select(rec.slug); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(rec.slug); }
      });
      body.appendChild(tr);
    });

    var line = document.getElementById('resultLine');
    clear(line);
    line.appendChild(el('b', null, String(rows.length)));
    line.appendChild(document.createTextNode(rows.length === 1 ? ' protocol' : ' protocols'));
    if (state.tab === 'radar') line.appendChild(document.createTextNode(' ranked by implied launch value'));
    else line.appendChild(document.createTextNode(' whose token already trades, the comparison set behind the fit'));
    if (state.category !== 'all') line.appendChild(document.createTextNode(' · category ' + state.category));
    if (state.chain !== 'all') line.appendChild(document.createTextNode(' · on ' + state.chain));
    if (state.q) line.appendChild(document.createTextNode(' · matching “' + state.q + '”'));
  }

  // ---- detail ----------------------------------------------------------

  function select(slug) {
    state.sel = slug;
    var rec = find(slug);
    if (!rec) return;
    var panel = document.getElementById('detail');
    clear(panel);

    var close = el('button', 'detail-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close detail');
    close.addEventListener('click', function () { select(null); });
    panel.appendChild(close);

    panel.appendChild(el('h2', null, rec.name));

    var isLive = state.tab === 'live' || rec.mcap_usd !== null;
    var lede = el('p', 'lede');
    lede.textContent = (rec.category || 'Uncategorised') + ' · ' + rec.chains.join(', ') +
      (isLive ? ' · its token already trades, so the board shows the market’s own value' : ' · records no token yet');
    panel.appendChild(lede);

    var figs = el('div', 'figures');
    function fig(k, v) {
      var d = el('div');
      d.appendChild(el('div', 'k', k));
      d.appendChild(el('div', 'v', v));
      figs.appendChild(d);
    }
    fig('TVL', usd(rec.tvl_usd));
    fig(isLive ? 'Market cap' : 'Implied value', usd(isLive ? rec.mcap_usd : rec.implied_value_usd));
    fig('7-day change', pct(rec.change_7d));
    fig(isLive ? 'Market cap ÷ TVL' : 'Time with no token', isLive ? rec.ratio.toFixed(2) + '×' : age(rec.age_days));
    panel.appendChild(figs);

    if (!isLive) {
      panel.appendChild(el('h3', null, 'How the value follows from the snapshot'));
      var dv = el('div', 'derivation');
      var eq = el('div', 'eq');
      eq.appendChild(el('strong', null, usd(rec.implied_value_usd)));
      eq.appendChild(document.createTextNode(' = '));
      eq.appendChild(el('em', null, usd(rec.fitted_value_usd)));
      eq.appendChild(document.createTextNode(' (fitted) '));
      eq.appendChild(el('em', null, mult(rec.category_factor)));
      eq.appendChild(document.createTextNode(' (category) '));
      eq.appendChild(el('em', null, mult(rec.growth_multiplier)));
      eq.appendChild(document.createTextNode(' (7d) '));
      eq.appendChild(el('em', null, mult(rec.maturity_multiplier)));
      eq.appendChild(document.createTextNode(' (maturity)'));
      dv.appendChild(eq);
      var note = el('span', 'note', 'The fitted figure is the peers’ line, e^' + D.fit.intercept.toFixed(2) + ' · TVL^' + D.fit.slope.toFixed(2) +
        ', at this protocol’s ' + usd(rec.tvl_usd) + ' TVL. The category factor is the median residual of its trading peers, shrunk toward 1 when the category is thin. ' +
        'Growth is clamped to −60%…+120% and weighted by ' + D.model.growth_weight + '; maturity rises from ' + D.model.maturity_floor + ' to ' +
        (D.model.maturity_floor + D.model.maturity_range) + ' over ' + D.model.maturity_days + ' days. Unknown age is read as ' + D.model.unknown_age_days + ' days.');
      dv.appendChild(note);
      panel.appendChild(dv);
    }

    panel.appendChild(el('h3', null, isLive ? 'Why it is in the comparison set' : 'Farm it before the launch'));
    if (isLive) {
      var p = el('p', 'lede');
      p.textContent = 'A token already trades here, so a launch value cannot be implied. Its market cap ÷ TVL ratio is one of the observations the fitted line is measured on: peers in the same category tilt the line by the median of their residuals.';
      panel.appendChild(p);
    } else {
      var ol = el('ol', 'steps');
      (rec.farm_steps || []).forEach(function (step) {
        var li = el('li');
        // A step is "action. Cost: … . Time: … ." — split the cost and time back out for the meta line.
        var m = /^(.*?)\s*Cost:\s*(.*?)\.\s*Time:\s*(.*?)\.\s*$/.exec(step);
        if (m) {
          li.appendChild(el('div', 'txt', m[1]));
          li.appendChild(el('div', 'meta', 'Cost: ' + m[2] + ' · Time: ' + m[3]));
        } else {
          li.appendChild(el('div', 'txt', step));
        }
        ol.appendChild(li);
      });
      panel.appendChild(ol);
    }

    panel.setAttribute('aria-hidden', 'false');
    renderRows();
  }

  function find(slug) {
    var all = D.rows.concat(D.live.map(function (r) {
      return { slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, mcap_usd: r.mcap_usd, ratio: r.ratio };
    }));
    for (var i = 0; i < all.length; i++) if (all[i].slug === slug) return all[i];
    return null;
  }

  // ---- hash state (so a filtered or detail view is a link) --------------

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      if (k && v) state[k] = v;
    });
    if (state.sort === 'rank') state.dir = 1;
  }

  function writeHash() {
    var parts = [];
    ['tab', 'q', 'category', 'chain', 'sort', 'sel'].forEach(function (k) {
      if (state[k] && state[k] !== 'all' && state[k] !== 'radar') parts.push(k + '=' + encodeURIComponent(state[k]));
    });
    var next = parts.length ? '#' + parts.join('&') : '';
    if (next === location.hash) return;
    try {
      history.replaceState(null, '', next || location.pathname);
    } catch (e) {
      // A file:// page may refuse replaceState; the view still works, only the address bar is stale.
      if (next) location.hash = next;
    }
  }

  // ---- wiring ----------------------------------------------------------

  function render() {
    document.getElementById('tab-radar').setAttribute('aria-selected', String(state.tab === 'radar'));
    document.getElementById('tab-live').setAttribute('aria-selected', String(state.tab === 'live'));
    document.getElementById('category').value = state.category;
    document.getElementById('chain').value = state.chain;
    document.getElementById('sort').value = state.sort;
    document.getElementById('q').value = state.q;
    renderHead();
    renderRows();
    if (state.sel) select(state.sel);
    writeHash();
  }

  function boot() {
    document.getElementById('asOf').textContent = D.as_of;
    document.getElementById('watchCount').textContent = D.watchlist_size + ' protocols';
    document.getElementById('modelId').textContent = D.model_version;
    renderModelStrip();
    renderStats();
    initFilters();
    readHash();

    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderRows(); writeHash(); });
    document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; renderRows(); writeHash(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; renderRows(); writeHash(); });
    document.getElementById('sort').addEventListener('change', function (e) {
      state.sort = e.target.value;
      state.dir = e.target.value === 'name' || e.target.value === 'rank' ? 1 : -1;
      renderRows(); writeHash();
    });
    document.getElementById('tab-radar').addEventListener('click', function () { state.tab = 'radar'; state.sel = null; closeDetail(); render(); });
    document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; state.sel = null; closeDetail(); render(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { select(null); }
    });

    render();
  }

  function closeDetail() {
    document.getElementById('detail').setAttribute('aria-hidden', 'true');
  }

  boot();
})();
