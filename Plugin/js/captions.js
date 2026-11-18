// Words -> captions: chunking, keyword detection, text layout and the timing string
// read by the template's expressions ("flags#duration#s,e|s,e|...").
'use strict';
var translit = require('./translit.js');

var STOP = ('a an the and or but if then so of to in on at by for with from as is am are was were be been being it its ' +
    "it's i me my we our you your he him his she her they them their this that these those there here what which who whom " +
    'do does did done have has had having not no yes just very really also too can could would should will shall may might must ' +
    "about into over under up down out off than then once again all any both each few more most other some such only own same " +
    "i'm you're we're they're i've you've we've don't doesn't didn't isn't aren't wasn't weren't won't can't couldn't " +
    "shouldn't wouldn't let's that's what's there's how why when where like get got go going gonna wanna kind sort thing things " +
    'um uh oh okay ok yeah well right because cause while through during before after above below between ' +
    // Banglish / Hinglish (Bangla and Hindi words are compared in their Latin form)
    'ami tumi apni amra tomra ora se ki na ar ei oi je jodi to o r ta ti take ke ka er re e ache chilo hobe kore korbo kono ' +
    'main mai hum tum aap ye yeh wo woh hai hain tha thi the ho ka ki ke ko se me men mein par pe aur bhi to toh na nahi ' +
    'kya kyu kyon jo ek bahut bohot sab kuch abhi phir fir').split(/\s+/);
var STOPSET = {};
STOP.forEach(function (w) { STOPSET[w] = 1; });

var POWER = ('free secret never always best worst million billion thousand money cash rich broke viral growth grow ' +
    'mistake mistakes truth lie lies stop start now today fast faster easy hard simple insane crazy huge massive ' +
    'love hate fear win wins winning lose losing fail failure success successful results proven guaranteed ' +
    'instantly secretly exactly everything nothing everyone nobody important biggest number first last only').split(/\s+/);
var POWERSET = {};
POWER.forEach(function (w) { POWERSET[w] = 1; });

var FILLERS = { um: 1, uh: 1, umm: 1, uhh: 1, er: 1, ah: 1, hmm: 1, mm: 1, mhm: 1, accha: 1, matlab: 1, mane: 1 };

// lower-case Latin form of a word; Bangla / Hindi words are transliterated first
function bare(t) {
    t = String(t);
    var sc = translit.scriptOf(t);
    if (sc !== 'latin') t = translit.toRoman(t, sc === 'bengali' ? 'bn' : 'hi');
    return t.toLowerCase().replace(/^[^a-z0-9$#@]+|[^a-z0-9%]+$/gi, '');
}

function keywordScore(w, i, words) {
    var b = bare(w.t);
    if (!b || STOPSET[b]) return 0;
    var s = 0;
    if (b.length >= 7) s += 2; else if (b.length >= 5) s += 1;
    if (/[0-9$%]/.test(b) || /[$%৳₹]/.test(w.t)) s += 3;
    if (POWERSET[b]) s += 3;
    if (/!$/.test(w.t)) s += 2;
    if (/^[A-Z]/.test(w.t) && i > 0 && !/[.!?]$/.test(words[i - 1].t)) s += 1;
    return s;
}

// density: 'off' | 'low' | 'normal' | 'high'  (per caption)
function autoKeywords(words, caps, density) {
    words.forEach(function (w) { w.k = false; });
    if (density === 'off') return;
    var min = density === 'low' ? 4 : 3, per = density === 'high' ? 2 : 1;
    caps.forEach(function (c) {
        var sc = c.w.map(function (wi) { return { i: wi, s: keywordScore(words[wi], wi, words) }; })
            .filter(function (x) { return x.s >= min; })
            .sort(function (a, b) { return b.s - a.s; });
        sc.slice(0, per).forEach(function (x) { words[x.i].k = true; });
    });
}

function cleanWords(words, opt) {
    return words.filter(function (w) { return !(opt.removeFillers && FILLERS[bare(w.t)]); });
}

function caseText(t, mode) {
    if (mode === 'upper') return t.toUpperCase();
    if (mode === 'lower') return t.toLowerCase();
    if (mode === 'title') return t.charAt(0).toUpperCase() + t.slice(1);
    return t;
}
function punctText(t, mode) {
    if (mode === 'all') return t.replace(/[.,!?;:"“”]+/g, '');
    if (mode === 'soft') return t.replace(/[.,;:]+$/g, '');
    return t;
}
function displayWord(w, opt) {
    var t = punctText(w.t, opt.punct);
    return caseText(t, opt.textCase) || w.t;
}

// greedy wrap into at most maxLines lines of maxChars
function wrap(tokens, maxChars) {
    var lines = [], cur = '';
    tokens.forEach(function (t) {
        if (cur && (cur + ' ' + t).length > maxChars) { lines.push(cur); cur = t; }
        else cur = cur ? cur + ' ' + t : t;
    });
    if (cur) lines.push(cur);
    return lines;
}

// opt: {maxWords, maxChars, maxLines, minDur, maxDur, gap, linger, breakPunct}
function chunk(words, opt) {
    var caps = [], cur = [];
    function flush() {
        if (!cur.length) return;
        caps.push({ w: cur.slice() });
        cur = [];
    }
    for (var i = 0; i < words.length; i++) {
        var w = words[i];
        // captions the user typed in the Review list stay exactly as typed (same grp = one caption)
        if (cur.length && (w.grp || words[cur[cur.length - 1]].grp)) {
            if (w.grp !== words[cur[cur.length - 1]].grp) flush();
            cur.push(i);
            continue;
        }
        if (cur.length) {
            var first = words[cur[0]], prev = words[cur[cur.length - 1]];
            var tokens = cur.map(function (x) { return words[x].t; }).concat([w.t]);
            var tooMany = cur.length >= opt.maxWords;
            var tooLong = wrap(tokens, opt.maxChars).length > opt.maxLines;
            var pause = w.s - prev.e > opt.gap;
            var tooSlow = w.e - first.s > opt.maxDur;
            if (tooMany || tooLong || pause || tooSlow) flush();
        }
        cur.push(i);
        if (opt.breakPunct) {
            if (/[.!?]["”']?$/.test(w.t)) flush();
            else if (/[,;:]$/.test(w.t) && cur.length >= Math.max(2, Math.ceil(opt.maxWords / 2))) flush();
        }
    }
    flush();
    // timing: hold each caption until the next one (small gaps) and enforce a minimum length
    caps.forEach(function (c, k) {
        c.s = words[c.w[0]].s;
        c.e = words[c.w[c.w.length - 1]].e;
    });
    caps.forEach(function (c, k) {
        var next = caps[k + 1];
        var limit = next ? next.s : c.e + 10;
        var end = c.e + opt.linger;
        if (next && next.s - c.e <= opt.gap) end = next.s;
        if (end - c.s < opt.minDur) end = c.s + opt.minDur;
        c.e = Math.max(c.e, Math.min(end, limit));
    });
    return caps;
}

// Split a caption's words into main lines + emphasis line, per style layout.
// Returns {main, punch, order:[word indexes in reading order], text}
function layout(c, words, style, opt) {
    var idx = c.w.slice();
    var disp = function (i) { return displayWord(words[i], opt); };
    var mainIdx = idx, punchIdx = [];
    if (style.layout === 'duoTop') {
        // emphasis first: the opening word(s) go on the top line, the rest below.
        // The template's top line is "Caption Text", so the emphasis look is set on it by the style.
        if (idx.length > 1) {
            var n0 = idx.length >= 5 ? 2 : 1;
            for (var t = 0; t < Math.min(2, idx.length - 1); t++) if (words[idx[t]].k) n0 = t + 1;
            mainIdx = idx.slice(0, n0);
            punchIdx = idx.slice(n0);
        }
    } else if (style.layout === 'duo') {
        if (idx.length === 1) { mainIdx = []; punchIdx = idx; }
        else {
            var n = idx.length >= 5 ? 2 : 1;
            var kw = -1;
            for (var j = 0; j < idx.length; j++) if (words[idx[j]].k) { kw = j; break; }
            if (kw < 0) {
                // no keyword: emphasise the strongest word near the end instead of a stop word
                var best = -1, bs = -1;
                for (var q = Math.max(1, idx.length - 3); q < idx.length; q++) {
                    var b = bare(words[idx[q]].t);
                    var sc = STOPSET[b] ? -1 : keywordScore(words[idx[q]], idx[q], words) * 10 + b.length;
                    if (sc > bs) { bs = sc; best = q; }
                }
                if (bs >= 0) kw = best;
                // without a real keyword keep at least n words on the emphasis line
                if (kw > idx.length - n) kw = idx.length - n;
            }
            var cut = idx.length - n;
            if (kw > 0 && idx.length - kw <= 3) cut = kw;
            mainIdx = idx.slice(0, cut);
            punchIdx = idx.slice(cut);
        }
    }
    var mainLines = wrap(mainIdx.map(disp), opt.maxChars);
    var punchLines = wrap(punchIdx.map(disp), Math.max(opt.maxChars, 12));
    return {
        main: mainLines.join('\r'),
        punch: punchLines.join('\r'),
        order: mainIdx.concat(punchIdx),
        text: mainIdx.concat(punchIdx).map(disp).join(' ')
    };
}

function dataString(c, order, words) {
    var flags = order.map(function (i) { return words[i].k ? '1' : '0'; }).join('');
    var times = order.map(function (i) {
        return Math.max(0, words[i].s - c.s).toFixed(2) + ',' + Math.max(0, words[i].e - c.s).toFixed(2);
    }).join('|');
    return flags + '#' + (c.e - c.s).toFixed(2) + '#' + times;
}

// Rebuild words from a caption clip already on the timeline (for re-styling / keyword edits).
function wordsFromClip(main, punch, data, clipStart) {
    var toks = (String(main || '') + ' ' + String(punch || '')).split(/\s+/).filter(Boolean);
    var p = String(data || '').split('#');
    var fl = p[0] || '', times = (p[2] || '').split('|');
    return toks.map(function (t, i) {
        var q = (times[i] || '').split(',');
        var s = parseFloat(q[0]), e = parseFloat(q[1]);
        return { t: t, s: clipStart + (isNaN(s) ? 0 : s), e: clipStart + (isNaN(e) ? 0 : e), k: fl.charAt(i) === '1' };
    });
}

function fmtTime(s, sep) {
    var ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
    function p(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }
    return p(h, 2) + ':' + p(m, 2) + ':' + p(sec, 2) + (sep || ',') + p(ms % 1000, 3);
}

function toSRT(caps, words, style, opt) {
    return caps.map(function (c, i) {
        var l = layout(c, words, style, opt);
        var body = [l.main, l.punch].filter(Boolean).join('\n').replace(/\r/g, '\n');
        return (i + 1) + '\n' + fmtTime(c.s) + ' --> ' + fmtTime(c.e) + '\n' + body + '\n';
    }).join('\n');
}

// SRT/VTT -> words with timings spread by character length inside each cue.
function parseSubtitles(text) {
    var words = [];
    var blocks = String(text).replace(/\r/g, '').split(/\n\s*\n/);
    var tm = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/;
    function sec(a, b, c, d) { return (+a) * 3600 + (+b) * 60 + (+c) + (+d) / 1000; }
    blocks.forEach(function (b) {
        var lines = b.split('\n'), m = null, k = 0;
        for (; k < lines.length; k++) { m = lines[k].match(tm); if (m) break; }
        if (!m) return;
        var s = sec(m[1], m[2], m[3], m[4]), e = sec(m[5], m[6], m[7], m[8]);
        var toks = lines.slice(k + 1).join(' ').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean);
        var total = toks.reduce(function (n, t) { return n + t.length + 1; }, 0) || 1, acc = 0;
        toks.forEach(function (t) {
            var ws = s + (e - s) * acc / total;
            acc += t.length + 1;
            words.push({ t: t, s: ws, e: s + (e - s) * acc / total });
        });
    });
    return words;
}

module.exports = {
    chunk: chunk, autoKeywords: autoKeywords, cleanWords: cleanWords, layout: layout, dataString: dataString,
    wordsFromClip: wordsFromClip, toSRT: toSRT, parseSubtitles: parseSubtitles, displayWord: displayWord, fmtTime: fmtTime
};
