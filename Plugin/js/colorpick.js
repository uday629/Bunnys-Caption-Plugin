// Colour picker for every <input type="color"> in the panel. Premiere's built-in browser opens the
// Windows colour dialog, which has no eyedropper. This popover has a colour field, hue bar, hex box,
// brand / recent swatches and "Pick from screen", which freezes the screen and samples any pixel
// (Program Monitor, other apps) through bin/eyedropper.ps1.
'use strict';
var path = require('path');
var cp = require('child_process');

var EYE_SVG = '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M20.7 5.6l-2.3-2.3a1 1 0 0 0-1.4 0l-3.1 3.1-1.4-1.4-1.4 1.4 1.4 1.4-8.2 8.2V20h4l8.2-8.2 1.4 1.4 1.4-1.4-1.4-1.4 3.1-3.1a1 1 0 0 0 0-1.4zM6.9 18H6v-.9l8.1-8.1.9.9L6.9 18z"/></svg>';
var BRAND = ['#FFFFFF', '#000000', '#1F6BFF', '#6A2BFF', '#FF1F56', '#FF8A00', '#FFD400', '#00E5A0'];
var pop = null, cur = null, recentGet = function () { return []; }, recentSet = function () { }, root = '', picking = null;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function hexOk(h) { return /^#[0-9a-f]{6}$/i.test(h); }
function toHsv(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: ((h * 60) + 360) % 360, s: mx ? d / mx : 0, v: mx };
}
function toHex(h, s, v) {
    var f = function (n) { var k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return '#' + [f(5), f(3), f(1)].map(function (x) { return ('0' + Math.round(x * 255).toString(16)).slice(-2); }).join('').toUpperCase();
}

function build() {
    pop = document.createElement('div');
    pop.className = 'cp-pop hidden';
    pop.innerHTML = '<div class="cp-sv"><div class="cp-sv-w"></div><div class="cp-sv-b"></div><i class="cp-dot"></i></div>' +
        '<div class="cp-hue"><i class="cp-hdot"></i></div>' +
        '<div class="cp-row"><span class="cp-now"></span><input class="cp-hex" maxlength="7" spellcheck="false">' +
        '<button class="cp-eye" title="Pick a colour anywhere on screen (Esc cancels)">' +
        '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M20.7 5.6l-2.3-2.3a1 1 0 0 0-1.4 0l-3.1 3.1-1.4-1.4-1.4 1.4 1.4 1.4-8.2 8.2V20h4l8.2-8.2 1.4 1.4 1.4-1.4-1.4-1.4 3.1-3.1a1 1 0 0 0 0-1.4zM6.9 18H6v-.9l8.1-8.1.9.9L6.9 18z"/></svg> Pick</button></div>' +
        '<div class="cp-sw cp-brand"></div><div class="cp-lbl">Recent</div><div class="cp-sw cp-recent"></div>';
    document.body.appendChild(pop);
    var sv = pop.querySelector('.cp-sv'), hue = pop.querySelector('.cp-hue'), hexIn = pop.querySelector('.cp-hex');
    function drag(el, fn) {
        el.addEventListener('mousedown', function (e) {
            e.preventDefault();
            var move = function (ev) { var r = el.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); };
            var up = function () { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); commit(true); };
            document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
            move(e);
        });
    }
    drag(sv, function (x, y) { cur.hsv.s = x; cur.hsv.v = 1 - y; set(toHex(cur.hsv.h, cur.hsv.s, cur.hsv.v), true); });
    drag(hue, function (x) { cur.hsv.h = x * 359.9; set(toHex(cur.hsv.h, cur.hsv.s, cur.hsv.v), true); });
    hexIn.addEventListener('input', function () {
        var v = hexIn.value.trim(); if (v[0] !== '#') v = '#' + v;
        if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
        if (hexOk(v)) { cur.hsv = toHsv(v); set(v.toUpperCase(), false, true); }
    });
    hexIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { commit(true); close(); } });
    pop.addEventListener('click', function (e) {
        var b = e.target.closest('[data-c]');
        if (b) { cur.hsv = toHsv(b.dataset.c); set(b.dataset.c, false); commit(true); }
        if (e.target.closest('.cp-eye')) eyedrop();
    });
    document.addEventListener('mousedown', function (e) {
        if (pop.classList.contains('hidden') || pop.contains(e.target) || (cur && e.target === cur.input)) return;
        close();
    }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.classList.contains('hidden')) close(); });
}

function swatches(el, list) {
    el.innerHTML = list.map(function (c) { return '<b data-c="' + c + '" style="background:' + c + '" title="' + c + '"></b>'; }).join('');
}
// draw the popover for the current colour; live = the input fires 'input' (preview), not 'change'
function set(hex, live, fromHex) {
    cur.hex = hex;
    var h = cur.hsv;
    pop.querySelector('.cp-sv').style.background = toHex(h.h, 1, 1);
    var dot = pop.querySelector('.cp-dot');
    dot.style.left = (h.s * 100) + '%'; dot.style.top = ((1 - h.v) * 100) + '%';
    pop.querySelector('.cp-hdot').style.left = (h.h / 360 * 100) + '%';
    pop.querySelector('.cp-now').style.background = hex;
    if (!fromHex) pop.querySelector('.cp-hex').value = hex;
    if (cur.input.value.toUpperCase() !== hex) {
        cur.input.value = hex;
        cur.input.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
function commit(remember) {
    if (!cur) return;
    cur.input.dispatchEvent(new Event('change', { bubbles: true }));
    if (remember) {
        var r = recentGet().filter(function (c) { return c !== cur.hex; });
        r.unshift(cur.hex);
        recentSet(r.slice(0, 16));
        swatches(pop.querySelector('.cp-recent'), recentGet());
    }
}
function close() {
    if (picking) { try { picking.kill(); } catch (e) { /* gone */ } picking = null; }
    if (pop) pop.classList.add('hidden');
    cur = null;
}

function open(input) {
    if (!pop) build();
    var hex = hexOk(input.value) ? input.value.toUpperCase() : '#FFFFFF';
    cur = { input: input, hex: hex, hsv: toHsv(hex) };
    swatches(pop.querySelector('.cp-brand'), BRAND);
    swatches(pop.querySelector('.cp-recent'), recentGet());
    pop.querySelector('.cp-recent').previousSibling.style.display = recentGet().length ? '' : 'none';
    pop.classList.remove('hidden');
    set(hex, false);
    // below the swatch, kept inside the panel
    var r = input.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 4) top = Math.max(4, r.top - h - 6);
    pop.style.top = top + 'px';
    pop.style.left = clamp(r.left, 4, window.innerWidth - w - 4) + 'px';
}

// Screen eyedropper: a frozen full-screen copy of the desktop; moving shows the colour live here,
// a left click picks it, right click / Esc cancels.
function eyedrop() {
    if (picking || !cur) return;
    var target = cur, before = cur.hex, done = false;
    var btn = pop.querySelector('.cp-eye');
    btn.classList.add('on');
    if (process.platform !== 'win32') {
        if (!window.EyeDropper) { btn.classList.remove('on'); return; }
        picking = true;
        new window.EyeDropper().open().then(function (r) {
            var hex = String(r.sRGBHex || '').toUpperCase();
            if (/^#[0-9A-F]{6}$/.test(hex) && cur === target) { cur.hsv = toHsv(hex); set(hex, true); }
        }, function () { /* cancelled */ }).then(function () { picking = null; btn.classList.remove('on'); });
        return;
    }
    var ps = path.join(root, 'bin', 'eyedropper.ps1');
    try { picking = cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', ps], { windowsHide: true }); }
    catch (e) { picking = null; }
    if (!picking || !picking.stdout) { picking = null; btn.classList.remove('on'); return; }
    var buf = '';
    picking.stdout.on('data', function (d) {
        buf += d.toString();
        var lines = buf.split(/\r?\n/); buf = lines.pop();
        lines.forEach(function (ln) {
            var m = ln.match(/^(move|pick) (#[0-9A-F]{6})$/i);
            if (!m || cur !== target) return;
            cur.hsv = toHsv(m[2]); set(m[2].toUpperCase(), true);
            if (m[1] === 'pick') { done = true; commit(true); }
        });
    });
    picking.on('close', function () {
        picking = null;
        btn.classList.remove('on');
        // cancelled: put the colour back
        if (!done && cur === target) { cur.hsv = toHsv(before); set(before, true); }
    });
    picking.on('error', function () { picking = null; btn.classList.remove('on'); });
}

// a pick button on every colour box (also for boxes added later): any pixel on any screen can be picked
function decorate(root) {
    Array.prototype.forEach.call(root.querySelectorAll('input[type=color]'), function (inp) {
        if (inp.nextSibling && inp.nextSibling.classList && inp.nextSibling.classList.contains('cp-mini')) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cp-mini';
        b.title = 'Pick a colour anywhere on screen (Esc cancels, arrows move 1 pixel)';
        b.innerHTML = EYE_SVG;
        b.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            if (picking) return;
            if (!cur || cur.input !== inp) open(inp);
            eyedrop();
        });
        inp.parentNode.insertBefore(b, inp.nextSibling);
        if (inp.parentNode.classList) inp.parentNode.classList.add('cp-host');
    });
}

// opts: {root (extension folder), recent: [get, set]}
function init(opts) {
    root = opts.root;
    if (opts.recent) { recentGet = opts.recent[0]; recentSet = opts.recent[1]; }
    decorate(document);

    document.addEventListener('click', function (e) {
        var el = e.target;
        if (!el || el.tagName !== 'INPUT' || el.type !== 'color') return;
        e.preventDefault();
        if (cur && cur.input === el) close(); else open(el);
    }, true);
}

module.exports = { init: init, decorate: decorate, close: close, toHex: toHex, toHsv: toHsv };
