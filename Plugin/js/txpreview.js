// Live preview for the Lyrics styles: plays a transparent sprite of the animation and shows the template controls
// (speed, line colours, glow, light sweep, shadow, opacity) the way the After Effects template applies them.
'use strict';
var fs = require('fs');
var path = require('path');

var COLS = 8, FW = 240, FH = 135;
var meta = null;
function loadMeta(root) {
    if (meta) return meta;
    try { meta = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'lyrics', 'sprites', 'meta.json'), 'utf8')); } catch (e) { meta = {}; }
    return meta;
}
function fileUrl(f) {
    if (/^(https?|file):/.test(f)) return f;
    var parts = String(f).split(/[\\/]/);
    return 'file:///' + parts.map(function (p, i) { return i === 0 && /^[A-Za-z]:$/.test(p) ? p : encodeURIComponent(p); }).join('/');
}
function rgba(hex, a) {
    var h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    var n = parseInt(h, 16) || 0;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
// value of a template control: the style's own setting, else the template default
function val(s, name, def) {
    if (s.mogrtValues && s.mogrtValues[name] !== undefined) return s.mogrtValues[name];
    var f = (s.mogrtFields || []).filter(function (x) { return x.name === name; })[0];
    return f ? f.value : def;
}
// line bands (top to bottom) for 1-3 line templates
var SPLITS = { 1: [], 2: [52], 3: [44, 58] };

function Preview(el, root) {
    this.el = el; this.root = root; this.key = ''; this.timer = 0; this.frame = 0;
}
Preview.prototype.stop = function () { clearTimeout(this.timer); this.timer = 0; };
// s: a Lyrics style (type mogrt, mogrtLines, mogrtRel like mogrt/Lyrics/Bunnys Caption Lyrics 07.mogrt)
Preview.prototype.show = function (s) {
    var m = /Bunnys Caption Lyrics (\d+)\.mogrt$/i.exec(s.mogrtRel || s.mogrt || '');
    if (!m) return false;
    var n = String(+m[1]), info = loadMeta(this.root)[n];
    var sprite = path.join(this.root, 'assets', 'lyrics', 'sprites', n + '.webp');
    if (!info || !fs.existsSync(sprite)) return false;
    var key = n;
    if (key !== this.key || !this.el.querySelector('.txpv')) {
        this.stop();
        this.key = key; this.info = info; this.frame = 0;
        this.rows = Math.ceil(info.frames / COLS);
        var url = "url('" + fileUrl(sprite).replace(/'/g, '%27') + "')";
        var size = (COLS * 100) + '% ' + (this.rows * 100) + '%';
        this.el.innerHTML = '<div class="txpv"><div class="txfx">' +
            '<div class="txl txbase" style="background-image:' + url + ';background-size:' + size + '"></div>' +
            '<div class="txl txcol" style="-webkit-mask-image:' + url + ';-webkit-mask-size:' + size + '"></div>' +
            '<div class="txl txsw" style="-webkit-mask-image:' + url + ';-webkit-mask-size:' + size + '"></div>' +
            '</div></div>';
        this.box = this.el.querySelector('.txpv');
        this.fx = this.el.querySelector('.txfx');
        this.layers = Array.prototype.slice.call(this.el.querySelectorAll('.txl'));
        this.base = this.el.querySelector('.txbase');
        this.col = this.el.querySelector('.txcol');
        this.sw = this.el.querySelector('.txsw');
        this.t0 = Date.now();
    }
    this.update(s);
    if (!this.timer) this.tick();
    return true;
};
Preview.prototype.update = function (s) {
    var lines = (s.mogrtLines || ['Line 1']).length;
    this.speed = Math.pow(2, (Number(val(s, 'Speed', 50)) - 50) / 25);
    // colours: same as the template's Tint (every pixel of the line becomes the colour)
    var custom = !!val(s, 'Custom Colors', false);
    var cs = [], cuts = SPLITS[lines] || [];
    for (var i = 1; i <= lines; i++) cs.push(val(s, 'Line ' + i + ' Color', '#FFFFFF'));
    var stops = [], from = 0;
    cs.forEach(function (c, i) { var to = i < cuts.length ? cuts[i] : 100; stops.push(c + ' ' + from + '%', c + ' ' + to + '%'); from = to; });
    this.col.style.background = 'linear-gradient(to bottom,' + stops.join(',') + ')';
    this.col.style.display = custom ? '' : 'none';
    this.base.style.display = custom ? 'none' : '';
    // glow, shadow, opacity, scaled from the 1920 px template to the preview width
    var w = this.box.clientWidth || 320, k = w / 1920;
    var glow = Number(val(s, 'Glow', 0)), shadow = Number(val(s, 'Shadow', 0)), f = [];
    if (glow > 0) {
        var r = Math.max(1, (10 + glow * 0.4) * k * 2), gc = val(s, 'Glow Color', '#FFFFFF');
        f.push('drop-shadow(0 0 ' + r.toFixed(1) + 'px ' + rgba(gc, Math.min(1, glow / 60)) + ')');
        if (glow > 50) f.push('drop-shadow(0 0 ' + (r * 2).toFixed(1) + 'px ' + rgba(gc, (glow - 50) / 60) + ')');
    }
    if (shadow > 0) {
        var d = Math.max(1, 10 * k * 2);
        f.push('drop-shadow(' + (d * 0.7).toFixed(1) + 'px ' + (d * 0.7).toFixed(1) + 'px ' + Math.max(1, 25 * k).toFixed(1) + 'px ' + rgba(val(s, 'Shadow Color', '#000000'), shadow / 100) + ')');
    }
    this.fx.style.filter = f.join(' ');
    this.fx.style.opacity = Number(val(s, 'Opacity', 100)) / 100;
    // light sweep: a bright band moving across the letters
    var sweep = Number(val(s, 'Light Sweep', 0));
    this.sw.style.background = 'linear-gradient(105deg, transparent 42%, ' + rgba(val(s, 'Sweep Color', '#FFFFFF'), 1) + ' 50%, transparent 58%)';
    this.sw.style.backgroundSize = '300% 100%';
    this.sw.style.opacity = Math.min(1, sweep / 70);
    this.sw.style.display = sweep > 0 ? '' : 'none';
};
Preview.prototype.tick = function () {
    var self = this;
    if (!this.el.isConnected || !this.box || !this.el.contains(this.box)) { this.stop(); this.key = ''; return; }
    var info = this.info, i = this.frame % info.frames, col = i % COLS, row = Math.floor(i / COLS);
    var pos = (COLS > 1 ? col / (COLS - 1) * 100 : 0) + '% ' + (this.rows > 1 ? row / (this.rows - 1) * 100 : 0) + '%';
    this.base.style.backgroundPosition = pos;
    this.col.style.webkitMaskPosition = pos;
    this.sw.style.webkitMaskPosition = pos;
    // sweep: one pass every 1.6 s, like the template
    var p = ((Date.now() - this.t0) / 1600) % 1;
    this.sw.style.backgroundPosition = (100 - p * 100).toFixed(1) + '% 0';
    // hold the last frame a moment before looping
    var wait = info.delay * 10 / this.speed;
    if (i === info.frames - 1) wait += 700;
    this.frame = i + 1;
    this.timer = setTimeout(function () { self.tick(); }, wait);
};

module.exports = { Preview: Preview, FW: FW, FH: FH };
