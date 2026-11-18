// Font picker: a button that opens a searchable list of every installed font, grouped by family,
// each style drawn in its own font. Mouse wheel over the closed button steps to the next/previous font.
// Only the visible rows are drawn, so thousands of fonts stay fast.
'use strict';

var ROW = 28;
var fonts = [];          // [{family, style, ps}] sorted
var pop = null, popList = null, popSearch = null, active = null, rows = [], tab = 'all';
// favourites: stored by the panel (settings), here only read and toggled
var favGet = function () { return []; }, favSet = function () {};
function setFavStore(get, set) { favGet = get; favSet = set; }
function isFav(ps) { return favGet().indexOf(ps) >= 0; }
function toggleFav(ps) {
    var f = favGet().slice(), i = f.indexOf(ps);
    if (i >= 0) f.splice(i, 1); else f.push(ps);
    favSet(f);
}

function weightOf(style) {
    var c = String(style).toLowerCase().replace(/[\s-]/g, '');
    var map = [['thin', 100], ['hairline', 100], ['extralight', 200], ['ultralight', 200], ['light', 300], ['medium', 500], ['semibold', 600], ['demibold', 600],
        ['extrabold', 800], ['ultrabold', 800], ['heavy', 900], ['black', 900], ['bold', 700]];
    for (var i = 0; i < map.length; i++) if (c.indexOf(map[i][0]) >= 0) return map[i][1];
    return 400;
}
function css(f) {
    return "font-family:'" + f.family.replace(/'/g, '') + "';font-weight:" + weightOf(f.style) + ';font-style:' + (/italic|oblique/i.test(f.style) ? 'italic' : 'normal');
}
function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function byPs(ps) { for (var i = 0; i < fonts.length; i++) if (fonts[i].ps === ps) return fonts[i]; return null; }

function setFonts(list) {
    fonts = list || [];
    all.forEach(function (p) { p.refresh(); });
}

function buildPop() {
    pop = document.createElement('div');
    pop.className = 'fp-pop hidden';
    pop.innerHTML = '<div class="fp-tabs"><button type="button" data-t="all" class="on">All fonts</button><button type="button" data-t="fav">&#9733; Favourites</button></div>' +
        '<input type="search" class="fp-search" placeholder="Search fonts"><div class="fp-list"><div class="fp-space"></div><div class="fp-rows"></div></div>';
    Array.prototype.forEach.call(pop.querySelectorAll('.fp-tabs button'), function (b) {
        b.onclick = function () {
            tab = b.dataset.t;
            Array.prototype.forEach.call(pop.querySelectorAll('.fp-tabs button'), function (x) { x.classList.toggle('on', x === b); });
            fill();
        };
    });
    document.body.appendChild(pop);
    popSearch = pop.querySelector('.fp-search');
    popList = pop.querySelector('.fp-list');
    popSearch.oninput = function () { fill(); };
    popSearch.onkeydown = function (e) {
        if (e.key === 'Escape') close();
        if (e.key === 'Enter') { var r = rows.filter(function (x) { return x.f; })[0]; if (r) choose(r.f); }
    };
    popList.onscroll = draw;
    popList.onclick = function (e) {
        var el = e.target.closest('.fp-row');
        if (!el || el.dataset.i === undefined) return;
        var r = rows[+el.dataset.i];
        // the star toggles a favourite without picking the font
        if (e.target.classList.contains('fp-star') && r.f) { var top = popList.scrollTop; toggleFav(r.f.ps); fill(true); popList.scrollTop = top; draw(); return; }
        choose(r.f);
    };
    document.addEventListener('mousedown', function (e) {
        if (!pop.classList.contains('hidden') && !pop.contains(e.target) && !(active && active.el.contains(e.target))) close();
    });
}
// rows: family headers + one row per style
function fill(keepScroll) {
    var q = (popSearch.value || '').toLowerCase();
    var match = function (f) { return !q || (f.family + ' ' + f.style + ' ' + f.ps).toLowerCase().indexOf(q) >= 0; };
    rows = [];
    if (active && active.opts.allowEmpty && tab === 'all') rows.push({ empty: true, label: active.opts.emptyLabel || 'Style default' });
    var favs = favGet().map(byPs).filter(function (f) { return f && match(f); });
    if (tab === 'fav') {
        if (!favs.length) rows.push({ head: 'No favourites yet. Click the star next to a font.' });
        favs.forEach(function (f) { rows.push({ f: f }); });
    } else {
        // favourites pinned on top of the full list
        if (favs.length) { rows.push({ head: '\u2605 Favourites' }); favs.forEach(function (f) { rows.push({ f: f }); }); }
        var last = '';
        fonts.forEach(function (f) {
            if (!match(f)) return;
            if (f.family !== last) { rows.push({ head: f.family }); last = f.family; }
            rows.push({ f: f });
        });
    }
    pop.querySelector('.fp-space').style.height = rows.length * ROW + 'px';
    if (keepScroll) { draw(); return; }
    popList.scrollTop = 0;
    // start at the current font
    var cur = active && active.value;
    for (var i = 0; i < rows.length; i++) if (rows[i].f && rows[i].f.ps === cur) { popList.scrollTop = Math.max(0, (i - 3) * ROW); break; }
    draw();
}
function draw() {
    var first = Math.max(0, Math.floor(popList.scrollTop / ROW) - 2), n = Math.ceil(popList.clientHeight / ROW) + 5, html = '';
    var cur = active && active.value;
    for (var i = first; i < Math.min(rows.length, first + n); i++) {
        var r = rows[i], top = 'top:' + i * ROW + 'px;';
        if (r.head) html += '<div class="fp-head" style="' + top + '">' + esc(r.head) + '</div>';
        else if (r.empty) html += '<div class="fp-row' + (!cur ? ' on' : '') + '" data-i="' + i + '" style="' + top + '"><span>' + esc(r.label) + '</span></div>';
        else html += '<div class="fp-row' + (r.f.ps === cur ? ' on' : '') + '" data-i="' + i + '" style="' + top + '"><span style="' + css(r.f) + '">' +
            esc(r.f.style) + '</span><small>' + esc(r.f.family) + '</small><b class="fp-star' + (isFav(r.f.ps) ? ' on' : '') + '" title="Favourite">' +
            (isFav(r.f.ps) ? '&#9733;' : '&#9734;') + '</b></div>';
    }
    pop.querySelector('.fp-rows').innerHTML = html;
}
function open(p) {
    if (!pop) buildPop();
    active = p;
    var b = p.el.getBoundingClientRect();
    var h = Math.min(340, Math.max(200, window.innerHeight - b.bottom - 12));
    var top = b.bottom + 4;
    if (window.innerHeight - b.bottom < 210) { h = Math.min(340, b.top - 12); top = b.top - h - 4; }
    pop.style.left = Math.max(6, Math.min(b.left, window.innerWidth - 300)) + 'px';
    pop.style.top = top + 'px';
    pop.style.width = Math.max(260, b.width) + 'px';
    pop.style.height = h + 'px';
    pop.classList.remove('hidden');
    popSearch.value = '';
    fill();
    setTimeout(function () { popSearch.focus(); }, 10);
}
function close() { if (pop) pop.classList.add('hidden'); active = null; }
function choose(f) {
    var p = active;
    close();
    if (p) p.set(f ? f.ps : '', true);
}

var all = [];
// el: container element. opts: {allowEmpty, emptyLabel, onChange(ps)}
function create(el, opts) {
    opts = opts || {};
    el.classList.add('fp');
    el.innerHTML = '<button type="button" class="fp-btn"><span class="fp-name"></span><span class="fp-arrow">&#9662;</span></button>';
    var p = {
        el: el, opts: opts, value: '',
        set: function (ps, fire) {
            p.value = ps || '';
            p.refresh();
            if (fire && opts.onChange) opts.onChange(p.value, byPs(p.value));
        },
        refresh: function () {
            var f = byPs(p.value), name = el.querySelector('.fp-name');
            if (f) { name.textContent = f.family + ' ' + f.style; name.setAttribute('style', css(f)); }
            else { name.textContent = p.value || opts.emptyLabel || 'Style default'; name.removeAttribute('style'); }
        }
    };
    el.querySelector('.fp-btn').onclick = function () { if (active === p) close(); else open(p); };
    // wheel on the closed picker: next / previous installed font, applied right away
    el.addEventListener('wheel', function (e) {
        if (!fonts.length) return;
        e.preventDefault();
        // on a favourite, the wheel steps through favourites; otherwise through all fonts
        var favs = favGet().map(byPs).filter(Boolean);
        var list = favs.length > 1 && isFav(p.value) ? favs : fonts;
        var i = -1;
        for (var k = 0; k < list.length; k++) if (list[k].ps === p.value) { i = k; break; }
        i = Math.max(0, Math.min(list.length - 1, i + (e.deltaY > 0 ? 1 : -1)));
        p.set(list[i].ps, true);
    }, { passive: false });
    all.push(p);
    p.refresh();
    return p;
}

module.exports = { create: create, setFonts: setFonts, weightOf: weightOf, byPs: byPs, setFavStore: setFavStore };
