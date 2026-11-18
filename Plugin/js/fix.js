// Spelling fixes for Bangla / Hindi transcripts:
//  1. English words spoken inside Bangla/Hindi (effect, template, comment ...) are written in English.
//  2. Words that are not real words are replaced by the closest common word (dictionary + weighted
//     edit distance that treats easily-confused letters as "almost the same").
// Word lists: dict/bn_50k.txt, dict/hi_full.txt (FrequencyWords, CC BY-SA 4.0, hermitdave).
'use strict';
var fs = require('fs');
var path = require('path');
var tl = require('./translit.js');

// English words that show up in Bangla/Hindi creator talk. Only words of 4+ letters (short ones
// collide with native words); checked against the dictionaries so no common native word maps here.
var ENGLISH = ('video videos effect effects template templates comment comments subscribe channel editing editor premiere ' +
    'after effects animation animations caption captions style styles font fonts color colour download upload link links ' +
    'description follow followers instagram youtube facebook tiktok reels short shorts content creator business marketing money ' +
    'online phone mobile software computer laptop tutorial project plugin preset presets transition transitions music audio sound ' +
    'voice camera light lighting setting settings option options click button timeline layer layers render export import file ' +
    'folder free premium done okay thanks thank hello guys simple easy just second seconds minute minutes manually manual ' +
    'automatic automatically design designer graphic graphics photo photoshop illustrator motion text title titles logo brand ' +
    'client clients order delivery service services price offer discount website page post posts story stories live stream ' +
    'share like likes views viewer viewers trending viral hook hooks script scripts edit edits cut cuts zoom slow fast speed ' +
    'quality resolution frame frames color grading sequence clip clips track tracks keyframe keyframes mask masking blur glow ' +
    'shadow stroke box gradient smooth tracking screen green effect hacks tips tricks trick process step steps example ' +
    'basically actually literally really totally exactly perfect awesome amazing please sorry welcome bro brother sister ' +
    'friend friends family office school college university class course training skill skills career income dollar ' +
    'payment account password problem solution system update version feature features tool tools pack packs bundle ' +
    'select picker place ready ultra blue apply drag drop paste copy right left').split(/\s+/);

// Standard Bangla spelling of English words (used when "English words in English" is off, so a misheard
// "টেম্পলেট" / "কলোর" still comes out as the usual "টেমপ্লেট" / "কালার").
var LOAN_BN = {
    effect: 'ইফেক্ট', effects: 'ইফেক্টস', template: 'টেমপ্লেট', templates: 'টেমপ্লেটস', manually: 'ম্যানুয়ালি', manual: 'ম্যানুয়াল',
    just: 'জাস্ট', video: 'ভিডিও', videos: 'ভিডিও', second: 'সেকেন্ড', seconds: 'সেকেন্ড', minute: 'মিনিট', minutes: 'মিনিট',
    use: 'ইউজ', timeline: 'টাইমলাইন', color: 'কালার', colour: 'কালার', picker: 'পিকার', green: 'গ্রিন', blue: 'ব্লু', select: 'সিলেক্ট',
    track: 'ট্র্যাক', tracks: 'ট্র্যাক', clip: 'ক্লিপ', clips: 'ক্লিপ', place: 'প্লেস', ready: 'রেডি', comment: 'কমেন্ট', comments: 'কমেন্ট',
    subscribe: 'সাবস্ক্রাইব', channel: 'চ্যানেল', editing: 'এডিটিং', editor: 'এডিটর', edit: 'এডিট', premiere: 'প্রিমিয়ার',
    animation: 'অ্যানিমেশন', caption: 'ক্যাপশন', captions: 'ক্যাপশন', style: 'স্টাইল', styles: 'স্টাইল', font: 'ফন্ট', fonts: 'ফন্ট',
    download: 'ডাউনলোড', upload: 'আপলোড', link: 'লিংক', description: 'ডেসক্রিপশন', follow: 'ফলো', instagram: 'ইনস্টাগ্রাম',
    youtube: 'ইউটিউব', facebook: 'ফেসবুক', reels: 'রিলস', content: 'কনটেন্ট', creator: 'ক্রিয়েটর', online: 'অনলাইন', phone: 'ফোন',
    mobile: 'মোবাইল', software: 'সফটওয়্যার', computer: 'কম্পিউটার', laptop: 'ল্যাপটপ', tutorial: 'টিউটোরিয়াল', project: 'প্রজেক্ট',
    plugin: 'প্লাগইন', preset: 'প্রিসেট', presets: 'প্রিসেট', transition: 'ট্রানজিশন', music: 'মিউজিক', audio: 'অডিও', sound: 'সাউন্ড',
    camera: 'ক্যামেরা', setting: 'সেটিং', settings: 'সেটিংস', option: 'অপশন', options: 'অপশন', click: 'ক্লিক', button: 'বাটন',
    layer: 'লেয়ার', layers: 'লেয়ার', render: 'রেন্ডার', export: 'এক্সপোর্ট', import: 'ইমপোর্ট', file: 'ফাইল', folder: 'ফোল্ডার',
    free: 'ফ্রি', premium: 'প্রিমিয়াম', simple: 'সিম্পল', easy: 'ইজি', design: 'ডিজাইন', photo: 'ফটো', motion: 'মোশন', text: 'টেক্সট',
    title: 'টাইটেল', logo: 'লোগো', screen: 'স্ক্রিন', gradient: 'গ্রেডিয়েন্ট', mask: 'মাস্ক', blur: 'ব্লার', glow: 'গ্লো', shadow: 'শ্যাডো',
    keyframe: 'কিফ্রেম', keyframes: 'কিফ্রেম', zoom: 'জুম', speed: 'স্পিড', frame: 'ফ্রেম', frames: 'ফ্রেম', sequence: 'সিকোয়েন্স',
    process: 'প্রসেস', step: 'স্টেপ', steps: 'স্টেপ', perfect: 'পারফেক্ট', awesome: 'অসাম', ultra: 'আল্ট্রা', apply: 'অ্যাপ্লাই',
    and: 'অ্যান্ড', wow: 'ওয়াও', copy: 'কপি', paste: 'পেস্ট', drag: 'ড্র্যাগ', drop: 'ড্রপ', okay: 'ওকে', thanks: 'থ্যাংকস', hello: 'হ্যালো', guys: 'গাইস', bro: 'ব্রো'
};
// heard forms too short for the sound match
var EXACT = { 'ইউস': 'use', 'ইউজ': 'use', 'ইউজড': 'use', 'ওকে': 'okay', 'ব্রো': 'bro', 'আলট্রা': 'ultra', 'আলত্রা': 'ultra', 'এন্ড': 'and', 'অ্যান্ড': 'and' };
// Bangla endings that stick to an English word: "টেমপ্লেটটা", "ক্লিপগুলোকে", "ট্র্যাকে". [heard, Bangla, after an English word]
var SUFFIX = [['গুলোকে', 'গুলোকে', ' গুলোকে'], ['গুলেকে', 'গুলোকে', ' গুলোকে'], ['গুলো', 'গুলো', ' গুলো'], ['গুলি', 'গুলো', ' গুলো'],
    ['টাকে', 'টাকে', ' টাকে'], ['টার', 'টার', ' টার'], ['টাই', 'টাই', ' টাই'], ['টা', 'টা', ' টা'], ['টি', 'টি', ' টি'],
    ['কে', 'কে', ' কে'], ['তে', 'তে', ' তে'], ['ের', 'ের', ' এর'], ['েই', 'েই', ' এই'], ['ে', 'ে', ' এ'], ['র', 'র', ' এর'], ['া', 'টা', ' টা']]
    .map(function (x) { return x.map(function (s) { return s.normalize('NFC'); }); });

function skeleton(s) {
    s = String(s).toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return '';
    s = s.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/c/g, 'k').replace(/v/g, 'b').replace(/w/g, 'b')
        .replace(/([kgcjtdpbs])h/g, '$1').replace(/z/g, 'j');
    var first = /^[aeiouy]/.test(s) ? 'A' : '';
    var cons = s.replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1');
    return first + cons;
}
function sound(s) {
    return String(s).toLowerCase().replace(/[^a-z]/g, '').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/[cq]/g, 'k').replace(/x/g, 'ks')
        .replace(/[vw]/g, 'b').replace(/z/g, 'j').replace(/([kgjtdpbs])h/g, '$1').replace(/[aeiouy]+/g, 'a').replace(/(.)\1+/g, '$1');
}
function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
}

// letters that recognisers mix up cost half a mistake
var CONFUSE = {};
[
    // Bangla: aspirated pairs, sibilants, n, r, y/j, vowel signs and the hasanta
    'কখ', 'গঘ', 'চছ', 'জঝ', 'টঠ', 'ডঢ', 'তথ', 'দধ', 'পফ', 'বভ', 'শষস', 'নণ', 'রড়ঢ়', 'যজ', 'য়য', 'িী', 'ুূ', 'োু', 'েৈ', 'অও', 'ইঈ', 'উঊ', 'ংঙ',
    // Hindi
    'कख', 'गघ', 'चछ', 'जझ', 'टठ', 'डढ', 'तथ', 'दध', 'पफ', 'बभ', 'शषस', 'नण', 'िी', 'ुू', 'ेै', 'ोौ', 'ंँन', 'वब'
].forEach(function (g) {
    var ch = Array.from(g);
    ch.forEach(function (a) { ch.forEach(function (b) { if (a !== b) CONFUSE[a + b] = 1; }); });
});
var CHEAP = { 'া': 1, '্': 1, 'ি': 1, 'ো': 1, 'ে': 1, 'া': 1, 'ा': 1, '्': 1, 'ि': 1, 'े': 1, 'ो': 1, 'ं': 1, '़': 1 };
function wlev(a, b, max) {
    a = Array.from(a); b = Array.from(b);
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j * 1;
    for (i = 1; i <= m; i++) {
        cur = [i];
        var best = cur[0];
        for (j = 1; j <= n; j++) {
            var sub = a[i - 1] === b[j - 1] ? 0 : (CONFUSE[a[i - 1] + b[j - 1]] ? 0.4 : 1);
            var del = CHEAP[a[i - 1]] ? 0.5 : 1, ins = CHEAP[b[j - 1]] ? 0.5 : 1;
            cur[j] = Math.min(prev[j] + del, cur[j - 1] + ins, prev[j - 1] + sub);
            if (cur[j] < best) best = cur[j];
        }
        if (best > max) return 99;
        prev = cur;
    }
    return prev[n];
}

// Regional (ancholik) Bangla -> standard (shuddho) Bangla
var REGIONAL = {
    'কইরা': 'করে', 'কইরে': 'করে', 'কইলাম': 'বললাম', 'কইছি': 'বলেছি', 'কইতাছি': 'বলছি', 'কইতেছি': 'বলছি', 'কইবো': 'বলবো', 'কইলো': 'বললো',
    'কইছে': 'বলেছে', 'খাইছি': 'খেয়েছি', 'খাইতাছি': 'খাচ্ছি', 'খামু': 'খাবো', 'যাইতাছি': 'যাচ্ছি', 'যাইতেছি': 'যাচ্ছি', 'যামু': 'যাবো',
    'গেছিলাম': 'গিয়েছিলাম', 'দিমু': 'দিবো', 'দিতাছি': 'দিচ্ছি', 'দিতেছি': 'দিচ্ছি', 'দিছি': 'দিয়েছি', 'দিছে': 'দিয়েছে', 'দিসি': 'দিয়েছি',
    'করুম': 'করবো', 'করমু': 'করবো', 'করতাছি': 'করছি', 'করতেছি': 'করছি', 'করতাছে': 'করছে', 'করসি': 'করেছি', 'করছিলাম': 'করেছিলাম',
    'হইছে': 'হয়েছে', 'হইসে': 'হয়েছে', 'হইলো': 'হলো', 'হইবো': 'হবে', 'হইবে': 'হবে', 'হইতাছে': 'হচ্ছে', 'হইতেছে': 'হচ্ছে', 'হইয়া': 'হয়ে',
    'হয়া': 'হয়ে', 'আছিল': 'ছিল', 'আছিলো': 'ছিল', 'আছিলাম': 'ছিলাম', 'পারুম': 'পারবো', 'পারমু': 'পারবো', 'পারতাছি': 'পারছি',
    'দেখমু': 'দেখবো', 'দেখতাছি': 'দেখছি', 'দেখতেছি': 'দেখছি', 'দেখাইতাছি': 'দেখাচ্ছি', 'দেখাইমু': 'দেখাবো', 'দেখামু': 'দেখাবো',
    'বানাইতাছি': 'বানাচ্ছি', 'বানামু': 'বানাবো', 'বানাইছি': 'বানিয়েছি', 'বানাইতে': 'বানাতে', 'বানাইয়া': 'বানিয়ে',
    'নিয়া': 'নিয়ে', 'দিয়া': 'দিয়ে', 'গিয়া': 'গিয়ে', 'লইয়া': 'নিয়ে', 'ধইরা': 'ধরে', 'মাইরা': 'মেরে', 'পইড়া': 'পড়ে', 'বইসা': 'বসে',
    'অহন': 'এখন', 'এহন': 'এখন', 'তহন': 'তখন', 'কহন': 'কখন', 'অহনো': 'এখনো', 'এহনো': 'এখনো',
    'হেরা': 'তারা', 'হেগো': 'তাদের', 'হের': 'তার', 'আমগো': 'আমাদের', 'তোমগো': 'তোমাদের', 'আপনেগো': 'আপনাদের', 'আপনে': 'আপনি',
    'ক্যান': 'কেন', 'কেমনে': 'কিভাবে', 'ক্যামনে': 'কিভাবে', 'ক্যামন': 'কেমন', 'কিতা': 'কি', 'এইডা': 'এটা', 'ওইডা': 'ওটা', 'হেইডা': 'সেটা',
    'কোনডা': 'কোনটা', 'এইহানে': 'এখানে', 'হেইহানে': 'সেখানে', 'হেইখানে': 'সেখানে', 'কুনো': 'কোনো', 'কুন': 'কোন',
    'জানস': 'জানিস', 'বুঝছেন': 'বুঝেছেন', 'বুঝছো': 'বুঝেছো', 'শুনছি': 'শুনেছি', 'দেখছিলাম': 'দেখেছিলাম',
    'হচে': 'হচ্ছে', 'হোচ্ছে': 'হচ্ছে', 'হোবে': 'হবে', 'হোয়': 'হয়', 'দেয়ে': 'দিয়ে', 'দেইয়া': 'দিয়ে', 'নাগে': 'লাগে', 'নাগবে': 'লাগবে',
    'নাগবো': 'লাগবো', 'গুলেকে': 'গুলোকে', 'গুলে': 'গুলো', 'কোরে': 'করে', 'কোরা': 'করা', 'কোরবো': 'করবো', 'আপনেরা': 'আপনারা',
    'আপনের': 'আপনার', 'এরপোর': 'এরপর', 'তারপোর': 'তারপর', 'প্রতমে': 'প্রথমে', 'পোরে': 'পরে', 'দেহেন': 'দেখেন', 'দেহি': 'দেখি'
};
// verb endings: only used when the result is a real word in the dictionary
var REGIONAL_ENDINGS = [['তাছি', 'চ্ছি'], ['তাছে', 'চ্ছে'], ['তাছো', 'চ্ছো'], ['তেছি', 'চ্ছি'], ['তেছে', 'চ্ছে'], ['মু', 'বো'], ['ইছি', 'েছি'], ['ইছে', 'েছে']];
// same Unicode form for every word (য় can be one letter or two, which breaks lookups)
Object.keys(REGIONAL).forEach(function (k) { var n = k.normalize('NFC'); if (n !== k) { REGIONAL[n] = REGIONAL[k].normalize('NFC'); delete REGIONAL[k]; } else REGIONAL[k] = REGIONAL[k].normalize('NFC'); });
function standardBangla(w, d) {
    if (REGIONAL[w]) return REGIONAL[w];
    if (d.rank[w]) return w;
    for (var i = 0; i < REGIONAL_ENDINGS.length; i++) {
        var e = REGIONAL_ENDINGS[i];
        if (w.length > e[0].length + 1 && w.slice(-e[0].length) === e[0]) {
            var c = w.slice(0, -e[0].length) + e[1];
            if (d.rank[c]) return c;
        }
    }
    return w;
}

// consonants only, with easily-confused ones merged: two words with the same key differ only in
// vowels / aspiration, which is the kind of mistake the recogniser makes
var CLASS = {};
['কখ', 'গঘ', 'চছ', 'জঝযয়', 'টঠ', 'ডঢ', 'তথৎ', 'দধ', 'পফ', 'বভ', 'শষস', 'নণ', 'রড়ঢ়'].forEach(function (g) {
    var ch = Array.from(g);
    ch.forEach(function (c) { CLASS[c] = ch[0]; });
});
function consKey(w) {
    return Array.from(w).filter(function (ch) { var c = ch.charCodeAt(0); return (c >= 0x0995 && c <= 0x09B9) || (c >= 0x09DC && c <= 0x09DF) || c === 0x09CE; })
        .map(function (ch) { return CLASS[ch] || ch; }).join('');
}

var cache = {};
function loadDict(lang, root) {
    if (cache[lang]) return cache[lang];
    var file = path.join(root, 'dict', lang === 'hi' ? 'hi_full.txt' : 'bn_50k.txt');
    var d = { rank: {}, byLen: {} };
    try {
        var lines = fs.readFileSync(file, 'utf8').split(/\r?\n/), r = 0;
        var re = lang === 'hi' ? /^[ऀ-ॿ]+$/ : /^[ঀ-৿]+$/;
        lines.forEach(function (ln) {
            var w = (ln.split(' ')[0] || '').normalize('NFC');
            if (!w || !re.test(w) || d.rank[w]) return;
            d.rank[w] = ++r;
            var L = Array.from(w).length;
            (d.byLen[L] = d.byLen[L] || []).push(w);
        });
    } catch (e) { /* no dictionary: only the English step runs */ }
    var eng = {}, engAll = {};
    // safe list: English sounds that do not collide with a common native word
    var native = {};
    Object.keys(d.rank).forEach(function (w) { if (d.rank[w] < 8000) native[skeleton(tl.toRoman(w, lang))] = 1; });
    ENGLISH.forEach(function (e) {
        var k = skeleton(e);
        if (k.length < 3) return;
        (engAll[k] = engAll[k] || []).push(e);
        // speakers often drop a final t/d ("komen" for comment)
        if (/[td]$/.test(k) && k.length >= 4) (engAll[k.slice(0, -1)] = engAll[k.slice(0, -1)] || []).push(e);
        if (!native[k]) (eng[k] = eng[k] || []).push(e);
    });
    d.eng = eng;
    d.engAll = engAll;
    cache[lang] = d;
    return d;
}

// Only change a word when we are confident: the replacement has the same consonants (only vowels or
// similar-sounding letters differ), or it is a very small change. Otherwise the word stays as heard.
// Only common words (top 8000) with the same consonants, at most one letter off, and never a
// shortened copy of the heard word (that would drop endings: "ট্রেকে" -> "ট্রেক").
function closestNative(w, d) {
    if (d.rank[w]) return w;
    var L = Array.from(w).length;
    if (L < 3) return w;
    var key = consKey(w), best = w, bestScore = 99;
    for (var n = L - 1; n <= L + 1; n++) {
        (d.byLen[n] || []).forEach(function (c) {
            if (d.rank[c] > 8000 || consKey(c) !== key) return;
            if (w.indexOf(c) === 0 || c.indexOf(w) === 0) return;
            var dist = wlev(w, c, 1);
            if (dist > 1) return;
            var score = dist + Math.log(d.rank[c]) * 0.08;
            if (score < bestScore) { bestScore = score; best = c; }
        });
    }
    return best;
}

// loose: w is the stem of a longer unknown word, so any match may be used
function englishOf(w, lang, d, loose) {
    var r = tl.toRoman(w, lang), k = skeleton(r);
    if (k.length < 3) return '';
    // a real native word only turns English through the safe list; an unknown word may use any match
    var list = (d.rank[w] && !loose ? d.eng : d.engAll)[k];
    if (!list) return '';
    // among words that sound alike, take the closest by sound (vowels count as one class)
    var nr = sound(r), best = '', bd = 99;
    list.forEach(function (e) { var x = lev(nr, sound(e)); if (x < bd || (x === bd && e.length < best.length)) { bd = x; best = e; } });
    return bd <= Math.max(1, Math.floor(nr.length * 0.34)) ? best : '';
}

// English word inside a Bangla/Hindi word, with any Bangla ending kept: {en, sfxEn, sfxBn} or null.
// A common native word (top 3000) is never turned into English.
var LOAN_EN = {};
Object.keys(LOAN_BN).forEach(function (e) { var b = LOAN_BN[e].normalize('NFC'); LOAN_BN[e] = b; if (!LOAN_EN[b]) LOAN_EN[b] = e; });
function loanOf(core, lang, d) {
    // the usual Bangla spelling of an English word ("ম্যানুয়ালি", "কালারটা") is that word for sure
    if (lang === 'bn') {
        if (LOAN_EN[core]) return { en: LOAN_EN[core], sfxEn: '', sfxBn: '' };
        for (var k = 0; k < SUFFIX.length; k++) {
            var x = SUFFIX[k], st = core.slice(0, -x[0].length);
            if (core.slice(-x[0].length) === x[0] && LOAN_EN[st] && x[0] !== 'া') return { en: LOAN_EN[st], sfxEn: x[2], sfxBn: x[1] };
        }
    }
    if (d.rank[core] && d.rank[core] < 3000) return null;
    if (EXACT[core]) return { en: EXACT[core], sfxEn: '', sfxBn: '' };
    // an ending first: the sound match is loose enough to swallow it ("টাইমলেনে" also matches timeline)
    for (var i = 0; lang === 'bn' && i < SUFFIX.length; i++) {
        var s = SUFFIX[i];
        if (core.length <= s[0].length + 2 || core.slice(-s[0].length) !== s[0]) continue;
        var stem = core.slice(0, -s[0].length);
        if ((d.rank[stem] && d.rank[stem] < 3000) || (s[0] === 'া' && stem.slice(-1) !== 'ট')) continue;
        var en = EXACT[stem] || englishOf(stem, lang, d, !d.rank[core]);
        if (en) return { en: en, sfxEn: s[2], sfxBn: s[1] };
    }
    var e = englishOf(core, lang, d);
    return e ? { en: e, sfxEn: '', sfxBn: '' } : null;
}

// words: [{t,...}] in native script. Returns the same list with fixed t (the original kept in t0).
// An English word heard as two ("টাইম লাইনে"): joined when together they are its usual Bangla spelling.
function joinSplit(words) {
    for (var i = 0; i + 1 < words.length; i++) {
        var a = String(words[i].t).normalize('NFC'), b = String(words[i + 1].t).normalize('NFC');
        if (!/^[ঀ-৿]+$/.test(a) || !/^[ঀ-৿]+[।,.!?]*$/.test(b)) continue;
        var core = a + b.replace(/[।,.!?]+$/, ''), hit = !!LOAN_EN[core];
        for (var k = 0; !hit && k < SUFFIX.length; k++) {
            var x = SUFFIX[k];
            if (x[0] !== 'া' && core.slice(-x[0].length) === x[0] && LOAN_EN[core.slice(0, -x[0].length)]) hit = true;
        }
        if (!hit) continue;
        words[i].t = a + b;
        words[i].e = Math.max(words[i].e, words[i + 1].e);
        words.splice(i + 1, 1);
    }
}

function fixWords(words, lang, root, opts) {
    opts = opts || {};
    var d = loadDict(lang, root);
    var scriptRe = lang === 'hi' ? /[ऀ-ॿ]/ : /[ঀ-৿]/;
    if (lang === 'bn') joinSplit(words);
    words.forEach(function (w) {
        w.t = String(w.t).normalize('NFC');
        var m = String(w.t).match(/^([^ऀ-৿\w]*)(.*?)([^ऀ-৿\w]*)$/);
        var pre = m ? m[1] : '', core = m ? m[2] : w.t, post = m ? m[3] : '';
        if (!scriptRe.test(core)) return;
        var out = core;
        // English words: written in English, or in the usual Bangla spelling when that option is off
        var loan = loanOf(core, lang, d);
        if (loan) {
            if (opts.english !== false) out = loan.en + loan.sfxEn;
            else if (lang === 'bn' && LOAN_BN[loan.en]) out = LOAN_BN[loan.en] + loan.sfxBn;
        }
        // the Hindi list is too small to correct spelling safely; Bangla has 50k words
        if (out === core && lang === 'bn' && opts.standard !== false) out = standardBangla(core, d);
        if (out === core && lang === 'bn' && opts.spelling !== false) out = closestNative(core, d);
        if (out !== core) { w.t0 = w.t; w.t = pre + out + post; }
    });
    return words;
}

module.exports = { fixWords: fixWords, skeleton: skeleton, loadDict: loadDict, englishOf: englishOf };
