// Bangla -> Banglish and Hindi -> Hinglish (Latin letters), the way people type them in chats.
// Rule based: letter maps + inherent-vowel (schwa) dropping. Code points are used as keys so the
// file stays plain ASCII.
'use strict';

function table(pairs) { var t = {}; for (var i = 0; i < pairs.length; i += 2) t[pairs[i]] = pairs[i + 1]; return t; }

var BN = {
    inherent: 'o',
    vowel: table([0x0985, 'o', 0x0986, 'a', 0x0987, 'i', 0x0988, 'i', 0x0989, 'u', 0x098A, 'u', 0x098B, 'ri', 0x098F, 'e', 0x0990, 'oi', 0x0993, 'o', 0x0994, 'ou']),
    sign: table([0x09BE, 'a', 0x09BF, 'i', 0x09C0, 'i', 0x09C1, 'u', 0x09C2, 'u', 0x09C3, 'ri', 0x09C7, 'e', 0x09C8, 'oi', 0x09CB, 'o', 0x09CC, 'ou']),
    cons: table([0x0995, 'k', 0x0996, 'kh', 0x0997, 'g', 0x0998, 'gh', 0x0999, 'ng', 0x099A, 'ch', 0x099B, 'ch', 0x099C, 'j', 0x099D, 'jh', 0x099E, 'n',
        0x099F, 't', 0x09A0, 'th', 0x09A1, 'd', 0x09A2, 'dh', 0x09A3, 'n', 0x09A4, 't', 0x09A5, 'th', 0x09A6, 'd', 0x09A7, 'dh', 0x09A8, 'n',
        0x09AA, 'p', 0x09AB, 'f', 0x09AC, 'b', 0x09AD, 'bh', 0x09AE, 'm', 0x09AF, 'j', 0x09B0, 'r', 0x09B2, 'l', 0x09B6, 'sh', 0x09B7, 'sh',
        0x09B8, 's', 0x09B9, 'h', 0x09B5, 'b', 0x09DC, 'r', 0x09DD, 'rh', 0x09DF, 'y', 0x09CE, 't']),
    nukta: table([0x09A1, 'r', 0x09A2, 'rh', 0x09AF, 'y']),
    virama: 0x09CD, nuktaMark: 0x09BC,
    marks: table([0x0982, 'ng', 0x0983, 'h', 0x0981, '']),
    digit0: 0x09E6,
    // after a virama (conjunct) some letters read differently
    afterVirama: table([0x09AF, 'y', 0x09AC, '']),
    special: function (prevCp, cp) { return prevCp === 0x099A && cp === 0x099B ? 'ch' : null; },
    beforeVirama: function (cp, nextCp) { return cp === 0x099A && nextCp === 0x099B ? 'c' : null; }
};

var HI = {
    inherent: 'a',
    vowel: table([0x0905, 'a', 0x0906, 'aa', 0x0907, 'i', 0x0908, 'ee', 0x0909, 'u', 0x090A, 'oo', 0x090B, 'ri', 0x090D, 'e', 0x090F, 'e', 0x0910, 'ai',
        0x0911, 'o', 0x0913, 'o', 0x0914, 'au']),
    sign: table([0x093E, 'a', 0x093F, 'i', 0x0940, 'i', 0x0941, 'u', 0x0942, 'u', 0x0943, 'ri', 0x0945, 'e', 0x0947, 'e', 0x0948, 'ai', 0x0949, 'o',
        0x094B, 'o', 0x094C, 'au']),
    cons: table([0x0915, 'k', 0x0916, 'kh', 0x0917, 'g', 0x0918, 'gh', 0x0919, 'n', 0x091A, 'ch', 0x091B, 'chh', 0x091C, 'j', 0x091D, 'jh', 0x091E, 'n',
        0x091F, 't', 0x0920, 'th', 0x0921, 'd', 0x0922, 'dh', 0x0923, 'n', 0x0924, 't', 0x0925, 'th', 0x0926, 'd', 0x0927, 'dh', 0x0928, 'n', 0x0929, 'n',
        0x092A, 'p', 0x092B, 'ph', 0x092C, 'b', 0x092D, 'bh', 0x092E, 'm', 0x092F, 'y', 0x0930, 'r', 0x0931, 'r', 0x0932, 'l', 0x0933, 'l', 0x0935, 'v',
        0x0936, 'sh', 0x0937, 'sh', 0x0938, 's', 0x0939, 'h', 0x0958, 'q', 0x0959, 'kh', 0x095A, 'gh', 0x095B, 'z', 0x095C, 'r', 0x095D, 'rh',
        0x095E, 'f', 0x095F, 'y']),
    nukta: table([0x0915, 'q', 0x0916, 'kh', 0x0917, 'gh', 0x091C, 'z', 0x0921, 'r', 0x0922, 'rh', 0x092B, 'f']),
    virama: 0x094D, nuktaMark: 0x093C,
    marks: table([0x0902, 'n', 0x0903, 'h', 0x0901, 'n']),
    digit0: 0x0966,
    afterVirama: table([0x091E, 'y']),
    special: function () { return null; },
    beforeVirama: function (cp, nextCp) { return cp === 0x091C && nextCp === 0x091E ? 'g' : null; }
};

function translitWord(word, L) {
    var cps = [];
    for (var i = 0; i < word.length; i++) cps.push(word.charCodeAt(i));
    // units: {c: consonant/letters, v: vowel ('' none, null = inherent candidate), raw: passthrough}
    var u = [];
    for (var k = 0; k < cps.length; k++) {
        var cp = cps[k], next = cps[k + 1];
        if (L.cons[cp] !== undefined) {
            var c = L.cons[cp];
            if (next === L.nuktaMark && L.nukta[cp] !== undefined) { c = L.nukta[cp]; k++; next = cps[k + 1]; }
            var prev = u[u.length - 1];
            if (prev && prev.v === '' && prev.viramaCp !== undefined) {
                var sp = L.special(prev.viramaCp, cp);
                if (sp !== null) c = sp;
                else if (L.afterVirama[cp] !== undefined) c = L.afterVirama[cp];
            }
            if (next === L.virama) {
                var bv = L.beforeVirama(cp, cps[k + 2]);
                u.push({ c: bv !== null ? bv : c, v: '', viramaCp: cp });
                k++;
            } else if (L.sign[next] !== undefined) {
                u.push({ c: c, v: L.sign[next] });
                k++;
            } else {
                u.push({ c: c, v: null });
            }
        } else if (L.vowel[cp] !== undefined) {
            u.push({ c: '', v: L.vowel[cp] });
        } else if (L.marks[cp] !== undefined) {
            var m = L.marks[cp];
            // anusvara before p/b/m sounds like m
            if (m === 'n' && /^(p|b|bh|m)/.test(L.cons[next] || '')) m = 'm';
            u.push({ c: m, v: '', mark: true });
        } else if (cp >= L.digit0 && cp <= L.digit0 + 9) {
            u.push({ raw: String(cp - L.digit0) });
        } else if (cp === 0x0964 || cp === 0x0965) {
            u.push({ raw: '.' });
        } else if (cp === 0x200C || cp === 0x200D) {
            // zero-width joiners: drop
        } else {
            u.push({ raw: String.fromCharCode(cp) });
        }
    }
    // inherent vowel: drop at word end, and between a vowel and a consonant that carries its own vowel
    var letters = u.filter(function (x) { return x.raw === undefined; });
    for (var j = 0; j < letters.length; j++) {
        var x = letters[j];
        if (x.v !== null) continue;
        var after = letters[j + 1], before = letters[j - 1];
        var last = !after || after.mark && !letters[j + 2];
        if (last && j > 0) { x.v = ''; continue; }
        if (j === 0 || !after) { x.v = L.inherent; continue; }
        var prevHasVowel = before && !before.mark && (before.v === null ? true : before.v !== '');
        var nextHasVowel = after.v !== null && after.v !== '' && !after.mark;
        x.v = prevHasVowel && nextHasVowel ? '' : L.inherent;
    }
    var out = u.map(function (x) { return x.raw !== undefined ? x.raw : x.c + (x.v || ''); }).join('');
    // any Bangla/Hindi sign without a Latin form (rare marks) is dropped instead of showing as a box
    out = out.replace(/[ऀ-৿]/g, '');
    if (L === HI) out = out.replace(/un$/, 'oon');
    return out;
}

// lang: 'bn' | 'hi'. Works word by word and leaves Latin text, numbers and punctuation alone.
function toRoman(text, lang) {
    var L = lang === 'hi' ? HI : BN;
    return String(text).split(/(\s+)/).map(function (w) { return /\S/.test(w) ? translitWord(w, L) : w; }).join('');
}

// Which script a piece of text is in ('bengali' | 'devanagari' | 'latin').
function scriptOf(text) {
    var s = String(text);
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c >= 0x0980 && c <= 0x09FF) return 'bengali';
        if (c >= 0x0900 && c <= 0x097F) return 'devanagari';
    }
    return 'latin';
}

module.exports = { toRoman: toRoman, scriptOf: scriptOf };
