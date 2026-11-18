// Style presets: built-ins, user presets on disk, conversion to template parameters,
// and a lightweight CSS preview that mirrors what the template renders.
'use strict';
var fs = require('fs');
var path = require('path');

var HL = { off: 1, active: 2, keywords: 3, keywordsSpoken: 4, fill: 5 };
var BOX = { off: 1, caption: 2, word: 3, emphasis: 4, strike: 5 };
var ANIM = { none: 1, pop: 2, fade: 3, slide: 4, bounce: 5, zoom: 6, flicker: 7, slam: 8, type: 9, blurin: 10, glitch: 11, drop: 12 };
function inv(o) { var r = {}; Object.keys(o).forEach(function (k) { r[o[k]] = k; }); return r; }
var GRAD = { linear: 1, radial: 2, angular: 3 };
var TARGET = { all: 1, normal: 2, hl: 3 };
var HL_INV = inv(HL), BOX_INV = inv(BOX), ANIM_INV = inv(ANIM), GRAD_INV = inv(GRAD), TARGET_INV = inv(TARGET);

var DEFAULT = {
    layout: 'single', textCase: 'upper',
    font: 'Montserrat-Black', css: 'Montserrat', weight: 900, italic: false,
    punchFont: '', punchCss: '', punchWeight: 0, punchItalic: false,
    text: '#FFFFFF', emph: '#FFD400', hl: '#FFD400', hlMode: 'active', pop: 12, unspoken: 100,
    stroke: '#000000', strokeW: 8, shadow: 60, glowColor: '#1F6BFF', glow: 0, emphGlow: 0,
    box: 'off', boxColor: '#1F6BFF', boxOpacity: 100, boxPad: 18, boxRound: 14,
    anim: 'pop', speed: 6, fadeOut: false, emphSize: 0, lineGap: 6, tracking: 0,
    posY: 0.74, scale: 100,
    chunk: { maxWords: 3, maxLines: 2, maxChars: 16 },
    // premium look (uses the Pro template)
    // gradStops: 2-5 colours (null = gradTop -> gradBottom); gradType linear | radial | angular; gradAngle 90 = top to bottom
    template: 'lite', gradient: 0, emphGradient: 0, gradTop: '#FFF3B0', gradBottom: '#C9922E', gradStops: null, gradType: 'linear', gradAngle: 90, bevel: 0,
    innerGlow: 0, innerGlowColor: '#FFFFFF', innerShadow: 0, depth: 0, depthColor: '#3A2508', sweep: 0, ghost: 0,
    // fill: solid | gradient (missing = gradient when a gradient amount is set); gradTarget all | normal | hl
    fill: null, gradTarget: 'all',
    innerGlowSize: 20, innerGlowChoke: 0, innerShadowColor: '#000000', innerShadowDist: 6, innerShadowAngle: 120, innerShadowSize: 12,
    sweepColor: '#FFF8F0', sweepWidth: 40, sweepAngle: -25, sweepSpeed: 2.4,
    deepGlow: 0, deepGlowRadius: 40, deepGlowColor: '#1F6BFF',
    // faux styles (both templates); allCaps / smallCaps act on both lines
    fauxBold: false, fauxItalic: false, punchFauxBold: false, punchFauxItalic: false, allCaps: false, smallCaps: false,
    // glow drawn over the letters (the text itself lights up)
    glowOver: 0, glowOverSize: 20, glowOverColor: '#FFFFFF'
};

function S(id, name, tags, o) {
    var s = JSON.parse(JSON.stringify(DEFAULT));
    Object.keys(o).forEach(function (k) { s[k] = o[k]; });
    s.id = id; s.name = name; s.tags = tags; s.builtin = true;
    return s;
}

// Fonts below are free (Google Fonts / bundled with Windows) except where noted in README.
var BUILTIN = [
    // ---- from the reference images ----
    S('bunny-sunset', 'Bunny Sunset', ['brand', 'karaoke', 'glow'], { text: '#FFFFFF', hl: '#FF8A00', stroke: '#08080A', strokeW: 7, glowColor: '#6A2BFF', glow: 35, pop: 14 }),
    S('hormozi', 'Hormozi Yellow', ['karaoke', 'bold'], { font: 'KomikaAxis', css: 'Komika Axis', weight: 400, italic: false, hl: '#FFE600', strokeW: 10, shadow: 80, pop: 10, chunk: { maxWords: 3, maxLines: 2, maxChars: 14 } }),
    S('word-box-green', 'Team Green Box', ['box', 'karaoke', 'clean'], { textCase: 'as', font: 'Inter-SemiBold', css: 'Inter', weight: 600, hl: '#FFFFFF', hlMode: 'active', strokeW: 0, shadow: 45, box: 'word', boxColor: '#2FBF71', boxPad: 10, boxRound: 10, pop: 0, chunk: { maxWords: 6, maxLines: 2, maxChars: 22 } }),
    S('take-the-chance', 'Take The Chance', ['duo', 'bold'], { layout: 'duo', textCase: 'as', font: 'Montserrat-Bold', css: 'Montserrat', weight: 700, punchFont: 'Montserrat-Black', punchCss: 'Montserrat', punchWeight: 900, emph: '#E3151A', hlMode: 'off', strokeW: 0, shadow: 70, emphSize: 35, lineGap: 0 }),
    S('stay-active', 'Ignite Red Glow', ['duo', 'glow'], { layout: 'duo', textCase: 'as', font: 'Montserrat-Bold', css: 'Montserrat', weight: 700, punchFont: 'Montserrat-ExtraBold', punchCss: 'Montserrat', punchWeight: 800, emph: '#FF1F1F', hlMode: 'off', strokeW: 0, shadow: 40, glowColor: '#FF1F1F', emphGlow: 70, emphSize: 30, lineGap: 0 }),
    S('start-with-idea', 'Serif Idea', ['duo', 'serif', 'elegant'], { layout: 'duo', textCase: 'as', font: 'PlayfairDisplay-Regular', css: 'Playfair Display', weight: 400, punchFont: 'PlayfairDisplay-Italic', punchCss: 'Playfair Display', punchWeight: 400, punchItalic: true, emph: '#FFD21F', hlMode: 'off', strokeW: 0, shadow: 55, emphSize: 10, lineGap: -4, anim: 'fade' }),
    S('reach-unlimited', 'Lime Unlimited', ['duo', 'glow'], { layout: 'duo', textCase: 'lower', font: 'Montserrat-SemiBold', css: 'Montserrat', weight: 600, punchFont: 'Montserrat-BlackItalic', punchCss: 'Montserrat', punchWeight: 900, punchItalic: true, emph: '#C8FF2E', hlMode: 'off', strokeW: 0, shadow: 50, glowColor: '#A6FF00', emphGlow: 60, emphSize: 30, lineGap: -6 }),
    S('know-this-tip', 'Cyan Script Tip', ['duo', 'script'], { layout: 'duo', textCase: 'lower', font: 'Sora-Bold', css: 'Sora', weight: 700, punchFont: 'Pacifico-Regular', punchCss: 'Pacifico', punchWeight: 400, emph: '#8FF3FF', hlMode: 'off', strokeW: 0, shadow: 55, glowColor: '#00E0FF', emphGlow: 30, emphSize: 25, lineGap: -10 }),
    S('neon-seize', 'Neon Pink', ['glow', 'karaoke'], { textCase: 'as', font: 'Garet-Heavy', css: 'Garet', weight: 800, hl: '#FFFFFF', text: '#FFE3F6', strokeW: 0, shadow: 20, glowColor: '#FF2BD6', glow: 75, emphGlow: 75, pop: 8, chunk: { maxWords: 5, maxLines: 2, maxChars: 20 } }),
    S('grind-mindset', 'Cyan Grind', ['glow', 'bold'], { font: 'BebasNeue-Regular', css: 'Bebas Neue', weight: 400, text: '#29F0FF', hl: '#FFFFFF', strokeW: 4, stroke: '#003A40', glowColor: '#00E5FF', glow: 70, shadow: 30, tracking: 10, chunk: { maxWords: 2, maxLines: 1, maxChars: 16 } }),
    S('just-sitting', 'Glass Pill', ['box', 'duo'], { layout: 'duo', textCase: 'as', font: 'Montserrat-Medium', css: 'Montserrat', weight: 500, punchFont: 'Montserrat-BlackItalic', punchCss: 'Montserrat', punchWeight: 900, punchItalic: true, emph: '#FFFFFF', hlMode: 'off', strokeW: 0, shadow: 30, box: 'caption', boxColor: '#A9B8D9', boxOpacity: 45, boxPad: 26, boxRound: 30, emphSize: 25, lineGap: 2 }),
    S('only-the-price', 'Mixed Italic', ['duo', 'clean'], { layout: 'duo', textCase: 'as', font: 'Montserrat-Light', css: 'Montserrat', weight: 300, punchFont: 'Montserrat-ExtraBoldItalic', punchCss: 'Montserrat', punchWeight: 800, punchItalic: true, emph: '#FFFFFF', hlMode: 'off', strokeW: 0, shadow: 60, emphSize: 10, lineGap: -6, anim: 'slide' }),
    S('breezy-morning', 'Golden Serif', ['serif', 'elegant'], { textCase: 'as', font: 'PlayfairDisplay-Medium', css: 'Playfair Display', weight: 500, text: '#FFD84D', hl: '#FFFFFF', hlMode: 'off', strokeW: 0, shadow: 70, anim: 'fade', speed: 9, chunk: { maxWords: 5, maxLines: 2, maxChars: 22 } }),
    S('challenge', 'Big Challenge', ['bold', 'minimal'], { font: 'Anton-Regular', css: 'Anton', weight: 400, hlMode: 'off', strokeW: 0, shadow: 85, tracking: 20, anim: 'zoom', chunk: { maxWords: 1, maxLines: 1, maxChars: 14 } }),
    S('boost-business', 'Gold Boost', ['duo', 'bold'], { layout: 'duo', font: 'Montserrat-BlackItalic', css: 'Montserrat', weight: 900, italic: true, punchFont: 'Montserrat-BlackItalic', punchCss: 'Montserrat', punchWeight: 900, punchItalic: true, emph: '#FFD000', hlMode: 'off', strokeW: 9, shadow: 90, emphSize: 30, lineGap: -8, glowColor: '#FFB800', emphGlow: 25 }),
    S('get-more-reach', 'Pink Reach', ['duo', 'script', 'bold'], { layout: 'duo', font: 'BebasNeue-Regular', css: 'Bebas Neue', weight: 400, punchFont: 'BebasNeue-Regular', punchCss: 'Bebas Neue', punchWeight: 400, text: '#FFFFFF', emph: '#FF2E7E', hlMode: 'off', strokeW: 0, shadow: 70, emphSize: 60, lineGap: -14, anim: 'bounce' }),
    S('money-gold', 'Money Gold', ['serif', 'keywords'], { textCase: 'as', font: 'PlayfairDisplay-Black', css: 'Playfair Display', weight: 900, text: '#FFFFFF', hl: '#F5C542', hlMode: 'keywords', pop: 18, strokeW: 0, shadow: 80, glowColor: '#F5B700', emphGlow: 20, chunk: { maxWords: 4, maxLines: 2, maxChars: 18 } }),
    S('italic-impact', 'Italic Impact', ['bold', 'keywords'], { font: 'Montserrat-BlackItalic', css: 'Montserrat', weight: 900, italic: true, hl: '#3D8BFF', hlMode: 'keywords', strokeW: 8, shadow: 90, chunk: { maxWords: 4, maxLines: 2, maxChars: 18 } }),
    S('documentary', 'Documentary Green', ['bold', 'keywords'], { font: 'Montserrat-ExtraBold', css: 'Montserrat', weight: 800, hl: '#39E75F', hlMode: 'keywords', pop: 30, strokeW: 0, shadow: 60, anim: 'slide', chunk: { maxWords: 3, maxLines: 2, maxChars: 16 } }),
    S('soft-glow', 'Soft White Glow', ['glow', 'clean'], { textCase: 'as', font: 'Montserrat-Bold', css: 'Montserrat', weight: 700, hl: '#FFFFFF', hlMode: 'off', strokeW: 0, shadow: 0, glowColor: '#FFFFFF', glow: 55, anim: 'fade', chunk: { maxWords: 3, maxLines: 2, maxChars: 16 } }),
    S('hashtag-script', 'Script Under', ['duo', 'script'], { layout: 'duo', font: 'Montserrat-Black', css: 'Montserrat', weight: 900, punchFont: 'GreatVibes-Regular', punchCss: 'Great Vibes', punchWeight: 400, emph: '#FFFFFF', hlMode: 'off', strokeW: 0, shadow: 70, emphSize: 20, lineGap: -12 }),
    S('mindmap-hand', 'Handwritten', ['script', 'clean'], { textCase: 'as', font: 'Caveat-Bold', css: 'Caveat', weight: 700, hlMode: 'active', hl: '#FFE680', strokeW: 0, shadow: 60, pop: 6, chunk: { maxWords: 4, maxLines: 2, maxChars: 18 } }),
    // ---- trending (2025-2026) ----
    S('karaoke-fill', 'Karaoke Fill', ['karaoke', 'trending'], { hlMode: 'fill', hl: '#FFD400', pop: 0, strokeW: 8, chunk: { maxWords: 5, maxLines: 2, maxChars: 18 } }),
    S('word-by-word', 'One Word Pop', ['trending', 'bold'], { font: 'BebasNeue-Regular', css: 'Bebas Neue', weight: 400, hlMode: 'off', strokeW: 6, shadow: 80, anim: 'pop', speed: 5, emphSize: 0, tracking: 15, chunk: { maxWords: 1, maxLines: 1, maxChars: 14 } }),
    S('red-box', 'Red Word Box', ['box', 'karaoke', 'trending'], { hl: '#FFFFFF', strokeW: 0, shadow: 40, box: 'word', boxColor: '#FF1F56', boxPad: 12, boxRound: 8, pop: 6 }),
    S('violet-pill', 'Violet Pill', ['box', 'karaoke', 'brand'], { textCase: 'as', font: 'Sora-ExtraBold', css: 'Sora', weight: 800, hl: '#FFFFFF', strokeW: 0, shadow: 40, box: 'word', boxColor: '#6A2BFF', boxPad: 12, boxRound: 40, pop: 6, chunk: { maxWords: 4, maxLines: 2, maxChars: 18 } }),
    S('highlighter', 'Yellow Highlighter', ['box', 'karaoke'], { textCase: 'as', font: 'Montserrat-ExtraBold', css: 'Montserrat', weight: 800, hl: '#111111', strokeW: 0, shadow: 30, box: 'word', boxColor: '#FFE600', boxPad: 8, boxRound: 4, pop: 0, chunk: { maxWords: 5, maxLines: 2, maxChars: 20 } }),
    S('minimal-dim', 'Dynamic Minimal', ['minimal', 'trending', 'clean'], { textCase: 'as', font: 'Inter-SemiBold', css: 'Inter', weight: 600, hl: '#FFFFFF', hlMode: 'active', unspoken: 40, strokeW: 0, shadow: 50, pop: 0, anim: 'fade', chunk: { maxWords: 6, maxLines: 2, maxChars: 24 } }),
    S('reveal', 'Word Reveal', ['trending', 'karaoke'], { hlMode: 'active', hl: '#FFFFFF', unspoken: 0, pop: 15, strokeW: 8, chunk: { maxWords: 4, maxLines: 2, maxChars: 16 } }),
    S('bold-comic', 'Bold Comic', ['bold', 'keywords', 'trending'], { font: 'KomikaAxis', css: 'Komika Axis', weight: 400, hl: '#3CFF5A', hlMode: 'keywords', strokeW: 12, shadow: 100, pop: 20, anim: 'bounce', chunk: { maxWords: 3, maxLines: 2, maxChars: 14 } }),
    S('normal-caption', 'Normal Caption', ['minimal', 'clean'], { textCase: 'as', font: 'Inter-SemiBold', css: 'Inter', weight: 600, text: '#FFFFFF', hlMode: 'off', strokeW: 0, shadow: 60, anim: 'fade', speed: 6, posY: 0.8, chunk: { maxWords: 7, maxLines: 2, maxChars: 30 } }),
    S('subtitle-classic', 'Classic Subtitle', ['minimal', 'box'], { textCase: 'as', font: 'Inter-Medium', css: 'Inter', weight: 500, hlMode: 'off', strokeW: 0, shadow: 0, box: 'caption', boxColor: '#000000', boxOpacity: 70, boxPad: 14, boxRound: 6, anim: 'none', posY: 0.86, chunk: { maxWords: 9, maxLines: 2, maxChars: 38 } }),
    S('podcast-duo', 'Podcast Two Tone', ['duo', 'trending'], { layout: 'duo', font: 'Montserrat-Black', css: 'Montserrat', weight: 900, punchFont: 'Montserrat-Black', punchCss: 'Montserrat', punchWeight: 900, emph: '#FF8A00', hl: '#1F6BFF', hlMode: 'active', strokeW: 8, shadow: 70, emphSize: 20, lineGap: -2 }),
    S('electric-blue', 'Electric Blue', ['brand', 'glow', 'keywords'], { hl: '#1F6BFF', hlMode: 'keywordsSpoken', strokeW: 8, glowColor: '#1F6BFF', glow: 30, pop: 16 }),
    // ---- premium (Pro template: gradient, bevel, inner glow/shadow, 3D depth, light sweep) ----
    S('gold-luxe', 'Gold Luxe 3D', ['premium', 'duo'], { template: 'pro', layout: 'duo', font: 'Montserrat-ExtraBold', css: 'Montserrat', weight: 800,
        punchFont: 'Montserrat-Black', punchCss: 'Montserrat', punchWeight: 900, text: '#FFFFFF', emph: '#E8B24A', hlMode: 'keywordsSpoken', hl: '#FFFFFF', pop: 14,
        strokeW: 0, shadow: 85, emphSize: 30, lineGap: -4, gradient: 0, emphGradient: 100, gradTop: '#FFF6C2', gradBottom: '#C68A1E',
        bevel: 55, depth: 16, depthColor: '#3B2406', sweep: 80, anim: 'zoom', speed: 8 }),
    S('chrome-3d', 'Chrome 3D', ['premium', 'bold'], { template: 'pro', font: 'Anton-Regular', css: 'Anton', weight: 400, text: '#E9EDF5', hlMode: 'keywords', pop: 18,
        strokeW: 0, shadow: 90, tracking: 15, gradient: 100, emphGradient: 100, gradTop: '#FFFFFF', gradBottom: '#7D8799', bevel: 70,
        innerShadow: 40, depth: 20, depthColor: '#1B2233', sweep: 90, chunk: { maxWords: 2, maxLines: 2, maxChars: 14 } }),
    S('sunset-fire', 'Sunset Fire 3D', ['premium', 'brand', 'duo'], { template: 'pro', layout: 'duo', punchFont: 'Montserrat-Black', punchCss: 'Montserrat', punchWeight: 900,
        text: '#FFFFFF', emph: '#FF5A2E', hlMode: 'off', strokeW: 0, shadow: 60, emphSize: 35, lineGap: -6, gradient: 0, emphGradient: 100,
        gradTop: '#FF8A00', gradBottom: '#FF1F56', bevel: 25, innerGlow: 45, innerGlowColor: '#FFE2B8', depth: 14, depthColor: '#6A2BFF',
        glowColor: '#FF1F56', emphGlow: 40, sweep: 40, anim: 'bounce' }),
    S('neon-glass', 'Neon Glass', ['premium', 'glow'], { template: 'pro', textCase: 'as', font: 'Sora-ExtraBold', css: 'Sora', weight: 800, text: '#BFF8FF',
        hlMode: 'active', hl: '#FFFFFF', pop: 10, strokeW: 0, shadow: 30, gradient: 100, emphGradient: 100, gradTop: '#E6FDFF', gradBottom: '#6A8BFF',
        innerGlow: 70, innerGlowColor: '#FFFFFF', innerShadow: 30, glowColor: '#00E5FF', glow: 60, emphGlow: 60, sweep: 30,
        chunk: { maxWords: 4, maxLines: 2, maxChars: 18 } }),
    S('ruby-emboss', 'Ruby Emboss', ['premium', 'serif', 'duo'], { template: 'pro', layout: 'duo', textCase: 'as', font: 'PlayfairDisplay-Bold', css: 'Playfair Display', weight: 700,
        punchFont: 'PlayfairDisplay-Black', punchCss: 'Playfair Display', punchWeight: 900, text: '#FFFFFF', emph: '#E0204A', hlMode: 'off', strokeW: 0, shadow: 80,
        emphSize: 30, lineGap: -8, emphGradient: 100, gradTop: '#FF7A98', gradBottom: '#A8002A', bevel: 80, innerShadow: 50, depth: 12,
        depthColor: '#3D0010', sweep: 50, anim: 'fade', speed: 9 }),
    S('diamond-ice', 'Diamond Ice', ['premium', 'glow'], { template: 'pro', text: '#EAF7FF', hlMode: 'keywords', pop: 16, strokeW: 0, shadow: 70,
        gradient: 100, emphGradient: 100, gradTop: '#FFFFFF', gradBottom: '#8FD3FF', bevel: 60, depth: 10, depthColor: '#0B2A4A',
        glowColor: '#4FC3FF', glow: 45, emphGlow: 45, sweep: 100 }),
    // ---- glow hook family (two-line hooks: one glowing gradient line + one white line) ----
    S('hook-red', 'Hook Red Glow', ['premium', 'duo', 'glow', 'trending'], { template: 'pro', layout: 'duo', font: 'Montserrat-Black', css: 'Montserrat', weight: 900,
        punchFont: 'Montserrat-Black', punchCss: 'Montserrat', punchWeight: 900, text: '#FFFFFF', emph: '#FF3B30', hlMode: 'off', strokeW: 0, shadow: 75,
        tracking: 6, emphSize: 12, lineGap: 4, emphGradient: 100, gradTop: '#FF6A5C', gradBottom: '#D9141B', glowColor: '#FF2A2A', emphGlow: 55,
        anim: 'pop', chunk: { maxWords: 6, maxLines: 1, maxChars: 18 } }),
    S('hook-blue', 'Hook Blue Italic', ['premium', 'duo', 'glow', 'brand'], { template: 'pro', layout: 'duo', font: 'Montserrat-Black', css: 'Montserrat', weight: 900,
        punchFont: 'Montserrat-BlackItalic', punchCss: 'Montserrat', punchWeight: 900, punchItalic: true, text: '#FFFFFF', emph: '#4DA3FF', hlMode: 'off',
        strokeW: 0, shadow: 75, tracking: 6, emphSize: 12, lineGap: 4, emphGradient: 100, gradTop: '#A8E2FF', gradBottom: '#1F6BFF',
        glowColor: '#1F8BFF', emphGlow: 55, anim: 'pop', chunk: { maxWords: 6, maxLines: 1, maxChars: 18 } }),
    S('hook-gold', 'Hook Gold Top', ['premium', 'duo', 'glow'], { template: 'pro', layout: 'duoTop', font: 'Montserrat-Black', css: 'Montserrat', weight: 900,
        punchFont: 'Montserrat-Black', punchCss: 'Montserrat', punchWeight: 900, text: '#FFC93C', emph: '#FFFFFF', hlMode: 'off', strokeW: 0, shadow: 75,
        tracking: 6, emphSize: 0, lineGap: 4, gradient: 100, emphGradient: 0, gradTop: '#FFE45C', gradBottom: '#FF9A1F', glowColor: '#FFB000', glow: 50,
        anim: 'pop', chunk: { maxWords: 4, maxLines: 1, maxChars: 14 } }),
    S('hook-green', 'Hook Green Tech', ['premium', 'duo', 'glow'], { template: 'pro', layout: 'duoTop', font: 'Exo-Black', css: 'Exo', weight: 900,
        punchFont: 'Montserrat-Black', punchCss: 'Montserrat', punchWeight: 900, text: '#5CFF6B', emph: '#FFFFFF', hlMode: 'off', strokeW: 0, shadow: 70,
        tracking: 8, emphSize: -30, lineGap: 8, gradient: 100, emphGradient: 0, gradTop: '#C2FF7A', gradBottom: '#22D44A', glowColor: '#35FF5A', glow: 65,
        anim: 'zoom', chunk: { maxWords: 4, maxLines: 1, maxChars: 18 } }),
    // ---- animated lyric styles (letter-level entry animations) ----
    S('lyric-flicker', 'Flicker Stack', ['animated', 'keywords'], { textCase: 'upper', font: 'Montserrat-Black', css: 'Montserrat', weight: 900,
        text: '#EDEDED', hlMode: 'keywords', hl: '#19C3E6', pop: 12, strokeW: 0, shadow: 55, anim: 'flicker', speed: 6,
        chunk: { maxWords: 3, maxLines: 3, maxChars: 7 } }),
    S('lyric-slam', 'Letter Slam', ['animated', 'keywords', 'bold'], { font: 'BebasNeue-Regular', css: 'Bebas Neue', weight: 400, text: '#FFFFFF',
        hlMode: 'keywords', hl: '#FF1A1A', pop: 70, strokeW: 0, shadow: 70, anim: 'slam', speed: 7, chunk: { maxWords: 3, maxLines: 3, maxChars: 10 } }),
    S('lyric-glitch', 'Glitch Red', ['animated', 'keywords'], { font: 'Montserrat-Black', css: 'Montserrat', weight: 900, text: '#FFFFFF',
        hlMode: 'keywords', hl: '#FF2633', pop: 25, strokeW: 0, shadow: 65, anim: 'glitch', speed: 6, chunk: { maxWords: 3, maxLines: 3, maxChars: 8 } }),
    S('lyric-echo', 'Echo Ghost', ['animated', 'premium', 'duo'], { template: 'pro', layout: 'duo', font: 'Montserrat-Black', css: 'Montserrat', weight: 900,
        punchFont: 'Montserrat-Black', punchCss: 'Montserrat', punchWeight: 900, text: '#FFFFFF', emph: '#E8E8E8', hlMode: 'off', strokeW: 0, shadow: 60,
        emphSize: 40, lineGap: -10, emphGradient: 100, gradTop: '#FFFFFF', gradBottom: '#9A9A9A', ghost: 70, anim: 'blurin', speed: 7 }),
    S('lyric-script', 'Bold + Script', ['animated', 'duo', 'script'], { layout: 'duoTop', font: 'Anton-Regular', css: 'Anton', weight: 400,
        punchFont: 'GreatVibes-Regular', punchCss: 'Great Vibes', punchWeight: 400, text: '#FF1A1A', emph: '#FFFFFF', hlMode: 'off', strokeW: 0,
        shadow: 70, emphSize: 0, lineGap: -45, anim: 'slam', speed: 6, chunk: { maxWords: 3, maxLines: 1, maxChars: 14 } }),
    S('lyric-neon-type', 'Neon Typewriter', ['animated', 'glow', 'keywords'], { font: 'BebasNeue-Regular', css: 'Bebas Neue', weight: 400, text: '#FFFFFF',
        hlMode: 'keywords', hl: '#FF2BD6', pop: 0, strokeW: 0, shadow: 40, glowColor: '#FF2BD6', glow: 45, anim: 'type', speed: 6,
        chunk: { maxWords: 3, maxLines: 1, maxChars: 16 } }),
    S('lyric-blue-flicker', 'Blue Flicker', ['animated', 'keywords', 'brand'], { font: 'BebasNeue-Regular', css: 'Bebas Neue', weight: 400, text: '#FFFFFF',
        hlMode: 'keywords', hl: '#2E6BFF', pop: 20, strokeW: 0, shadow: 60, glowColor: '#1F6BFF', glow: 20, anim: 'flicker', speed: 7,
        chunk: { maxWords: 3, maxLines: 3, maxChars: 8 } }),
    S('lyric-strike', 'Strike Line', ['animated', 'box'], { font: 'Montserrat-Black', css: 'Montserrat', weight: 900, text: '#FFFFFF', hlMode: 'keywords',
        hl: '#FF2633', pop: 10, strokeW: 0, shadow: 60, box: 'strike', boxColor: '#FF2633', boxOpacity: 100, boxPad: 18, boxRound: 0, anim: 'blurin', speed: 6,
        chunk: { maxWords: 3, maxLines: 3, maxChars: 8 } }),
    S('lyric-gold-drop', 'Gold Serif Drop', ['animated', 'premium', 'serif', 'duo'], { template: 'pro', layout: 'duo', textCase: 'upper',
        font: 'PlayfairDisplay-Bold', css: 'Playfair Display', weight: 700, punchFont: 'PlayfairDisplay-Black', punchCss: 'Playfair Display', punchWeight: 900,
        text: '#FFFFFF', emph: '#E0A030', hlMode: 'off', strokeW: 0, shadow: 70, emphSize: 35, lineGap: -6, emphGradient: 100, gradTop: '#FFD978',
        gradBottom: '#C47A12', bevel: 30, anim: 'drop', speed: 6 }),
    S('lyric-violet', 'Violet Blur Ghost', ['animated', 'premium', 'keywords', 'brand'], { template: 'pro', font: 'Montserrat-BlackItalic', css: 'Montserrat',
        weight: 900, italic: true, text: '#E6E6E6', hlMode: 'keywords', hl: '#6A2BFF', pop: 25, strokeW: 0, shadow: 60, emph: '#6A2BFF', ghost: 50,
        anim: 'blurin', speed: 8, chunk: { maxWords: 3, maxLines: 3, maxChars: 8 } }),
    S('cinematic', 'Cinematic Serif', ['serif', 'minimal', 'elegant'], { textCase: 'as', font: 'PlayfairDisplay-Italic', css: 'Playfair Display', weight: 400, italic: true, hlMode: 'off', strokeW: 0, shadow: 50, anim: 'fade', speed: 12, tracking: 5, posY: 0.82, chunk: { maxWords: 7, maxLines: 2, maxChars: 30 } })
];

// ---- Bunnys Caption Lyrics styles: native After Effects animations (one MOGRT each) ----
// fields: how many text lines the template has (Line 1 = top). The caption words are split across the lines.
var LYRICS = [
    ['Cyan Light Sweep', 3], ['Red Impact Bounce', 3], ['Red Slide Italic', 3], ['Akira Ghost Stack', 3], ['Red Script Sign', 2],
    ['Akira Neon Blue', 3], ['Red Script Under', 2], ['Serif Neon Script', 2], ['Blue Impact Stack', 3], ['Neon Gradient Ghost', 1],
    ['Red Serif Lyrics', 3], ['Yellow Red Impact', 2], ['Green Impact Stack', 3], ['Green Tilt Glow', 3], ['Serif Red Script', 3],
    ['Orange Script Wrap', 3], ['Blue Script Duo', 3], ['Magenta Impact', 3], ['Red White Stack', 3], ['Red Script Strike', 2],
    ['Blue Italic Pop', 3], ['Inter Ghost Final', 3]
];
LYRICS.forEach(function (t, i) {
    var n = i + 1, nn = n < 10 ? '0' + n : '' + n, lines = [];
    for (var k = 1; k <= t[1]; k++) lines.push('Line ' + k);
    var s = S('lyrics-' + nn, 'Lyrics ' + nn + ' ' + t[0], ['lyrics', 'animated'], {
        textCase: 'as', hlMode: 'off', box: 'off', posY: 0.7,
        chunk: { maxWords: t[1] === 1 ? 2 : 3, maxLines: 1, maxChars: 24 }
    });
    s.type = 'mogrt';
    s.mogrtRel = 'mogrt/Lyrics/Bunnys Caption Lyrics ' + nn + '.mogrt';
    s.thumbRel = 'assets/lyrics/lyrics' + n + '.gif';
    s.mogrtFields = lines.map(function (l) { return { name: l, type: 'text', value: '' }; });
    s.mogrtMain = 'Line 1'; s.mogrtOther = {}; s.mogrtValues = {};
    s.mogrtLines = lines;
    s.mogrtMotion = true;
    BUILTIN.push(s);
});
// Styles saved by version 1.1 point at the old lyric template names: move them to the Bunnys Caption Lyrics names.
// Returns true when the style changed (the caller saves it).
// The old template name is only rebuilt from character codes here, so it is not written anywhere in the plugin.
var OLD_NAME = String.fromCharCode(84, 88, 84, 70, 88), OLD_TAG = OLD_NAME.toLowerCase();
var LEGACY_MOGRT = new RegExp('([\\\\/])' + OLD_NAME + '([\\\\/])' + OLD_NAME + ' (\\d+)\\.mogrt$', 'i');
var LEGACY_THUMB = new RegExp('([\\\\/])' + OLD_TAG + '([\\\\/])', 'i');
var LEGACY_NAME = new RegExp('^' + OLD_NAME + ' ');
var LEGACY_ID = new RegExp('^' + OLD_TAG + '-(\\d+)$');
function migrateLegacy(s) {
    var ch = false;
    ['mogrt', 'mogrtRel'].forEach(function (k) {
        if (s[k] && LEGACY_MOGRT.test(s[k])) { s[k] = s[k].replace(LEGACY_MOGRT, '$1Lyrics$2Bunnys Caption Lyrics $3.mogrt'); ch = true; }
    });
    ['thumb', 'thumbRel'].forEach(function (k) {
        if (s[k] && LEGACY_THUMB.test(s[k])) { s[k] = s[k].replace(LEGACY_THUMB, '$1lyrics$2'); ch = true; }
    });
    if (s.tags && s.tags.indexOf(OLD_TAG) >= 0) { s.tags = s.tags.map(function (t) { return t === OLD_TAG ? 'lyrics' : t; }); ch = true; }
    if (LEGACY_NAME.test(s.name || '')) { s.name = s.name.replace(LEGACY_NAME, 'Lyrics '); ch = true; }
    return ch;
}
function legacyStyleId(id) { return String(id || '').replace(LEGACY_ID, 'lyrics-$1'); }
// builtin MOGRT styles carry paths relative to the panel folder
function resolveBuiltin(root) {
    BUILTIN.forEach(function (s) {
        if (s.mogrtRel) {
            s.mogrt = path.join(root, s.mogrtRel);
            // the template's own controls (colours, speed, glow, light sweep, shadow, opacity), in Essential Graphics order
            try {
                var f = mogrtInfo(s.mogrt).fields.slice().reverse();
                if (f.length) s.mogrtFields = f.filter(function (x) { return x.type === 'text'; }).concat(f.filter(function (x) { return x.type !== 'text'; }));
            } catch (e) { /* keep the line fields */ }
        }
        if (s.thumbRel) s.thumb = path.join(root, s.thumbRel);
    });
}
// caption text -> { 'Line 1': .., 'Line 2': .., ... } for templates with several text lines.
// One word goes to the hero line (the middle one of three, else the first); more words fill the lines in
// order (balanced), unused lines are blanked so the template's sample text never shows.
function splitLines(s, text) {
    var L = s.mogrtLines || [], out = {}, m = L.length;
    var w = String(text || '').replace(/\s+/g, ' ').replace(/^ | $/g, '').split(' ').filter(function (x) { return x; });
    L.forEach(function (l) { out[l] = ' '; });
    if (!m) return out;
    if (m === 1 || !w.length) { out[L[0]] = w.join(' ') || ' '; return out; }
    if (w.length === 1) { out[L[m === 3 ? 1 : 0]] = w[0]; return out; }
    var used = Math.min(m, w.length), at = 0;
    for (var i = 0; i < used; i++) {
        var take = Math.ceil((w.length - at) / (used - i));
        out[L[i]] = w.slice(at, at + take).join(' ');
        at += take;
    }
    return out;
}

function hexToRgb(h) {
    h = String(h || '#FFFFFF').replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    return [parseInt(h.substr(0, 2), 16) || 0, parseInt(h.substr(2, 2), 16) || 0, parseInt(h.substr(4, 2), 16) || 0];
}
function rgbToHex(c) {
    return '#' + c.slice(0, 3).map(function (v) { var s = Math.round(Math.max(0, Math.min(255, v))).toString(16); return s.length < 2 ? '0' + s : s; }).join('').toUpperCase();
}

// style -> template parameter payload understood by host.jsx
// solid fill: the gradient amounts are 0, whatever the sliders say
function fillOf(s) { return s.fill || ((s.gradient || 0) + (s.emphGradient || 0) > 0 ? 'gradient' : 'solid'); }
function gradAmount(s, punch) { return fillOf(s) === 'gradient' ? ((punch ? s.emphGradient : s.gradient) || 0) : 0; }
function toParams(s) {
    // one-block styles: a second line (if someone adds one) looks like the first, not like an emphasis
    if (s.layout === 'single') s = Object.assign({}, s, { emph: s.text, emphGlow: s.glow, emphSize: 0, emphGradient: s.gradient || 0 });
    // two-line styles without a highlight of their own: picked words later look like the emphasis line
    else if (s.hlMode === 'off') s = Object.assign({}, s, { hl: s.emph });
    return {
        'Text Color': { c: hexToRgb(s.text) }, 'Emphasis Color': { c: hexToRgb(s.emph) },
        'Highlight Mode': { d: HL[s.hlMode] || 1 }, 'Highlight Color': { c: hexToRgb(s.hl) },
        'Highlight Pop': { n: s.pop }, 'Unspoken Opacity': { n: s.unspoken },
        'Stroke Color': { c: hexToRgb(s.stroke) }, 'Stroke Width': { n: s.strokeW }, 'Shadow': { n: s.shadow },
        'Glow Color': { c: hexToRgb(s.glowColor) }, 'Glow': { n: s.glow }, 'Emphasis Glow': { n: s.emphGlow },
        'Box Mode': { d: BOX[s.box] || 1 }, 'Box Color': { c: hexToRgb(s.boxColor) }, 'Box Opacity': { n: s.boxOpacity },
        'Box Padding': { n: s.boxPad }, 'Box Roundness': { n: s.boxRound },
        'Animation': { d: ANIM[s.anim] || 1 }, 'Anim Speed': { n: s.speed }, 'Fade Out': { b: !!s.fadeOut },
        'Emphasis Size': { n: s.emphSize }, 'Line Gap': { n: s.lineGap }, 'Letter Spacing': { n: s.tracking },
        'Bold': { b: !!s.fauxBold }, 'Italic': { b: !!s.fauxItalic },
        'Emphasis Bold': { b: !!(s.layout === 'single' ? s.fauxBold : s.punchFauxBold) }, 'Emphasis Italic': { b: !!(s.layout === 'single' ? s.fauxItalic : s.punchFauxItalic) },
        'All Caps': { b: !!s.allCaps }, 'Small Caps': { b: !!s.smallCaps },
        'Glow Over': { n: num(s.glowOver, 0) }, 'Glow Over Size': { n: num(s.glowOverSize, 20) }, 'Glow Over Color': { c: hexToRgb(s.glowOverColor || '#FFFFFF') },
        // only present in the Pro template; the host skips parameters a clip does not have
        'Gradient': { n: gradAmount(s, false) }, 'Emphasis Gradient': { n: gradAmount(s, s.layout !== 'single') },
        'Gradient Top': { c: hexToRgb(gradTones(s)[0]) }, 'Gradient Mid 1': { c: hexToRgb(gradTones(s)[1]) },
        'Gradient Mid 2': { c: hexToRgb(gradTones(s)[2]) }, 'Gradient Mid 3': { c: hexToRgb(gradTones(s)[3]) },
        'Gradient Bottom': { c: hexToRgb(gradTones(s)[4]) },
        'Gradient Type': { d: GRAD[s.gradType] || 1 }, 'Gradient Angle': { n: s.gradAngle === undefined ? 90 : s.gradAngle },
        'Bevel': { n: s.bevel || 0 }, 'Inner Glow': { n: s.innerGlow || 0 }, 'Inner Glow Color': { c: hexToRgb(s.innerGlowColor) },
        'Inner Shadow': { n: s.innerShadow || 0 }, 'Depth': { n: s.depth || 0 }, 'Depth Color': { c: hexToRgb(s.depthColor) },
        'Light Sweep': { n: s.sweep || 0 }, 'Ghost': { n: s.ghost || 0 },
        'Gradient Target': { d: TARGET[s.gradTarget] || 1 },
        'Inner Glow Size': { n: num(s.innerGlowSize, 20) }, 'Inner Glow Choke': { n: num(s.innerGlowChoke, 0) },
        'Inner Shadow Color': { c: hexToRgb(s.innerShadowColor || '#000000') }, 'Inner Shadow Distance': { n: num(s.innerShadowDist, 6) },
        'Inner Shadow Angle': { n: num(s.innerShadowAngle, 120) }, 'Inner Shadow Size': { n: num(s.innerShadowSize, 12) },
        'Sweep Color': { c: hexToRgb(s.sweepColor || '#FFF8F0') }, 'Sweep Width': { n: num(s.sweepWidth, 40) },
        'Sweep Angle': { n: num(s.sweepAngle, -25) }, 'Sweep Speed': { n: num(s.sweepSpeed, 2.4) },
        'Deep Glow': { n: num(s.deepGlow, 0) }, 'Deep Glow Radius': { n: num(s.deepGlowRadius, 40) }, 'Deep Glow Color': { c: hexToRgb(s.deepGlowColor || '#1F6BFF') }
    };
}
function num(v, d) { return v === undefined || v === null || isNaN(v) ? d : Number(v); }
// premium styles need the Pro template; everything else uses the lighter one
function isPro(s) {
    return s.template === 'pro' || gradAmount(s, false) + gradAmount(s, true) + (s.bevel || 0) + (s.innerGlow || 0) +
        (s.innerShadow || 0) + (s.depth || 0) + (s.sweep || 0) + (s.ghost || 0) + (s.deepGlow || 0) > 0;
}

// clip params (from host readSelection) -> style fields
function fromParams(base, prm, motion, seqH) {
    var s = JSON.parse(JSON.stringify(base));
    function n(k, f) { if (prm[k] && prm[k].v !== undefined) s[f] = Math.round(Number(prm[k].v) * 10) / 10; }
    function c(k, f) { if (prm[k] && prm[k].c) s[f] = rgbToHex(prm[k].c); }
    function d(k, f, map) { if (prm[k] && prm[k].d !== undefined && map[prm[k].d]) s[f] = map[prm[k].d]; }
    c('Text Color', 'text'); c('Emphasis Color', 'emph'); c('Highlight Color', 'hl'); c('Stroke Color', 'stroke');
    c('Glow Color', 'glowColor'); c('Box Color', 'boxColor');
    d('Highlight Mode', 'hlMode', HL_INV); d('Box Mode', 'box', BOX_INV); d('Animation', 'anim', ANIM_INV);
    n('Highlight Pop', 'pop'); n('Unspoken Opacity', 'unspoken'); n('Stroke Width', 'strokeW'); n('Shadow', 'shadow');
    n('Glow', 'glow'); n('Emphasis Glow', 'emphGlow'); n('Box Opacity', 'boxOpacity'); n('Box Padding', 'boxPad');
    n('Box Roundness', 'boxRound'); n('Anim Speed', 'speed'); n('Emphasis Size', 'emphSize'); n('Line Gap', 'lineGap');
    n('Letter Spacing', 'tracking');
    function b(k, f) { if (prm[k] && prm[k].v !== undefined) s[f] = !!prm[k].v && prm[k].v !== 'false'; }
    b('Bold', 'fauxBold'); b('Italic', 'fauxItalic'); b('Emphasis Bold', 'punchFauxBold'); b('Emphasis Italic', 'punchFauxItalic');
    b('All Caps', 'allCaps'); b('Small Caps', 'smallCaps');
    n('Glow Over', 'glowOver'); n('Glow Over Size', 'glowOverSize'); c('Glow Over Color', 'glowOverColor');
    if (prm['Depth']) {
        s.template = 'pro';
        c('Gradient Top', 'gradTop'); c('Gradient Bottom', 'gradBottom'); c('Inner Glow Color', 'innerGlowColor'); c('Depth Color', 'depthColor');
        d('Gradient Type', 'gradType', GRAD_INV); n('Gradient Angle', 'gradAngle'); d('Gradient Target', 'gradTarget', TARGET_INV);
        n('Inner Glow Size', 'innerGlowSize'); n('Inner Glow Choke', 'innerGlowChoke'); c('Inner Shadow Color', 'innerShadowColor');
        n('Inner Shadow Distance', 'innerShadowDist'); n('Inner Shadow Angle', 'innerShadowAngle'); n('Inner Shadow Size', 'innerShadowSize');
        c('Sweep Color', 'sweepColor'); n('Sweep Width', 'sweepWidth'); n('Sweep Angle', 'sweepAngle'); n('Sweep Speed', 'sweepSpeed');
        n('Deep Glow', 'deepGlow'); n('Deep Glow Radius', 'deepGlowRadius'); c('Deep Glow Color', 'deepGlowColor');
        s.fill = (s.gradient || 0) + (s.emphGradient || 0) > 0 ? 'gradient' : 'solid';
        if (prm['Gradient Mid 2'] && prm['Gradient Mid 2'].c) {
            var st = ['Gradient Top', 'Gradient Mid 1', 'Gradient Mid 2', 'Gradient Mid 3', 'Gradient Bottom'].map(function (k) { return prm[k] && prm[k].c ? rgbToHex(prm[k].c) : null; });
            if (st.every(Boolean)) s.gradStops = simplifyStops(st);
        }
        n('Gradient', 'gradient'); n('Emphasis Gradient', 'emphGradient'); n('Bevel', 'bevel'); n('Inner Glow', 'innerGlow');
        n('Inner Shadow', 'innerShadow'); n('Depth', 'depth'); n('Light Sweep', 'sweep'); n('Ghost', 'ghost');
    }
    if (prm['Fade Out'] && prm['Fade Out'].v !== undefined) s.fadeOut = !!prm['Fade Out'].v && prm['Fade Out'].v !== 'false';
    var f1 = fontOfText(prm['Caption Text']), f2 = fontOfText(prm['Emphasis Text']);
    if (f1) s.font = f1;
    if (f2) s.punchFont = f2;
    if (motion) {
        if (motion.pos) s.posY = Math.round(motion.pos[1] * 1000) / 1000;
        if (motion.scale && seqH) s.scale = Math.round(Number(motion.scale) / baseScale(seqH.w, seqH.h) * 10) / 10;
    }
    return s;
}
function fontOfText(p) {
    if (!p || typeof p.v !== 'string' || p.v.charAt(0) !== '{') return '';
    try { var o = JSON.parse(p.v); var f = o.fontEditValue; return Array.isArray(f) ? f[0] : (f || ''); } catch (e) { return ''; }
}

// the template is 1920x1080; scale so text keeps the same size relative to the short side
function baseScale(w, h) { return Math.min(w, h) / 1080 * 100; }

// ---------- user presets ----------
function Store(dir, mogrtDir) { this.dir = dir; this.mogrtDir = mogrtDir; }
Store.prototype.list = function () {
    var self = this, out = [];
    try {
        fs.readdirSync(this.dir).forEach(function (f) {
            if (!/\.json$/i.test(f)) return;
            try {
                var s = JSON.parse(fs.readFileSync(path.join(self.dir, f), 'utf8'));
                s.builtin = false;
                s.file = path.join(self.dir, f);
                if (s.tags.indexOf('mine') < 0) s.tags.push('mine');
                out.push(s);
            } catch (e) { /* bad file */ }
        });
    } catch (e) { /* none */ }
    return out.sort(function (a, b) { return (b.saved || 0) - (a.saved || 0); });
};
Store.prototype.slug = function (name) { return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'style'; };
// asNew: always create a new file (used for "Save as new" and for copies of built-ins)
Store.prototype.save = function (style, asNew) {
    var s = JSON.parse(JSON.stringify(style));
    var keep = !asNew && !style.builtin && style.file && /^u-/.test(s.id || '');
    delete s.file; s.builtin = false;
    if (!keep) s.id = 'u-' + this.slug(s.name) + '-' + Date.now().toString(36);
    s.saved = Date.now();
    s.tags = (s.tags || []).filter(function (t) { return t !== 'mine'; });
    var f = path.join(this.dir, s.id + '.json');
    fs.writeFileSync(f, JSON.stringify(s, null, 1));
    s.file = f;
    return s;
};
// ---------- user MOGRTs ----------
// small zip reader (stored / deflate entries), enough for definition.json and thumb.png
function readZip(file) {
    var b = fs.readFileSync(file), out = {};
    var e = b.length - 22;
    while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
    if (e < 0) return out;
    var n = b.readUInt16LE(e + 10), p = b.readUInt32LE(e + 16);
    for (var i = 0; i < n; i++) {
        if (b.readUInt32LE(p) !== 0x02014b50) break;
        var method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), xl = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32);
        var lo = b.readUInt32LE(p + 42), name = b.toString('utf8', p + 46, p + 46 + nl);
        var data = lo + 30 + b.readUInt16LE(lo + 26) + b.readUInt16LE(lo + 28);
        var raw = b.slice(data, data + csize);
        try { out[name] = method === 8 ? require('zlib').inflateRawSync(raw) : raw; } catch (x) { /* skip */ }
        p += 46 + nl + xl + cl;
    }
    return out;
}
// the controls a MOGRT shows in Essential Graphics: text (6), colour (4), slider (2), checkbox (1)
function mogrtInfo(file) {
    var z = readZip(file), info = { fields: [], thumb: z['thumb.png'] || null };
    try {
        var d = JSON.parse(z['definition.json'].toString('utf8').replace(/^﻿/, ''));
        (d.clientControls || []).forEach(function (c) {
            var nm = c.uiName && c.uiName.strDB && c.uiName.strDB[0] ? c.uiName.strDB[0].str : '';
            if (!nm) return;
            var v = c.value;
            if (c.type === 6) info.fields.push({ name: nm, type: 'text', value: v && v.strDB && v.strDB[0] ? v.strDB[0].str : '' });
            else if (c.type === 4 && v && v.length >= 3) info.fields.push({ name: nm, type: 'color', value: rgbToHex([v[0] * 255, v[1] * 255, v[2] * 255]) });
            else if (c.type === 2) info.fields.push({ name: nm, type: 'slider', value: Number(v) || 0, min: c.min !== undefined ? c.min : 0, max: c.max !== undefined ? c.max : 100 });
            else if (c.type === 1) info.fields.push({ name: nm, type: 'check', value: v === true || v === 'true' || v === 1 });
        });
    } catch (e) { /* not a readable template */ }
    return info;
}
// fill in what a MOGRT style needs (also for styles imported before this existed); returns true when changed
function prepareMogrt(s) {
    if (s.type !== 'mogrt' || s.mogrtFields) return false;
    var info = { fields: [], thumb: null };
    try { info = mogrtInfo(s.mogrt); } catch (e) { /* missing file */ }
    s.mogrtFields = info.fields;
    var texts = info.fields.filter(function (f) { return f.type === 'text'; });
    // captions go into the first text field; the other text fields are emptied (a name / subtitle box would show its sample text)
    s.mogrtMain = texts.length ? texts[0].name : '';
    s.mogrtOther = {};
    texts.slice(1).forEach(function (f) { s.mogrtOther[f.name] = 'empty'; });
    s.mogrtValues = {};
    if (info.thumb) {
        var tf = s.mogrt.replace(/\.mogrt$/i, '') + '.png';
        try { fs.writeFileSync(tf, info.thumb); s.thumb = tf; } catch (e) { /* no thumbnail */ }
    }
    return true;
}
// template parameters for a MOGRT style; text: the caption text (omitted when only the look changes)
function mogrtParams(s, text) {
    var p = {};
    if (s.mogrtLines && text !== undefined) { var sp = splitLines(s, text); Object.keys(sp).forEach(function (k) { p[k] = { t: sp[k] }; }); }
    (s.mogrtFields || []).forEach(function (f) {
        if (s.mogrtLines && f.type === 'text') return;
        var v = s.mogrtValues && s.mogrtValues[f.name];
        if (f.type === 'text') {
            if (f.name === s.mogrtMain) { if (text !== undefined) p[f.name] = { t: text }; }
            else {
                var how = (s.mogrtOther || {})[f.name] || 'keep';
                if (how === 'empty') p[f.name] = { t: ' ' };
                else if (how === 'same' && text !== undefined) p[f.name] = { t: text };
                else if (how === 'custom' && v !== undefined) p[f.name] = { t: String(v) };
            }
            return;
        }
        if (v === undefined) return;
        if (f.type === 'color') p[f.name] = { c: hexToRgb(v) };
        else if (f.type === 'slider') p[f.name] = { n: Number(v) };
        else if (f.type === 'check') p[f.name] = { b: !!v };
    });
    return p;
}
// A user's own .mogrt becomes a style (text is put in its first text field).
Store.prototype.addMogrt = function (src, name) {
    var dest = path.join(this.mogrtDir, this.slug(name) + '-' + Date.now().toString(36) + '.mogrt');
    fs.copyFileSync(src, dest);
    var s = JSON.parse(JSON.stringify(DEFAULT));
    s.name = name; s.type = 'mogrt'; s.mogrt = dest; s.tags = ['custom'];
    s.hlMode = 'off'; s.box = 'off'; s.strokeW = 4;
    prepareMogrt(s);
    return this.save(s, true);
};
Store.prototype.remove = function (style) {
    if (style.file) try { fs.unlinkSync(style.file); } catch (e) { /* gone */ }
    if (style.mogrt && style.mogrt.indexOf(this.mogrtDir) === 0) try { fs.unlinkSync(style.mogrt); } catch (e) { /* gone */ }
    if (style.thumb && style.thumb.indexOf(this.mogrtDir) === 0) try { fs.unlinkSync(style.thumb); } catch (e) { /* gone */ }
};

// ---------- preview ----------
function strokeShadow(w, color) {
    if (w <= 0) return [];
    var out = [], steps = 12;
    for (var i = 0; i < steps; i++) {
        var a = i / steps * Math.PI * 2;
        out.push((Math.cos(a) * w).toFixed(1) + 'px ' + (Math.sin(a) * w).toFixed(1) + 'px 0 ' + color);
    }
    return out;
}
function fontCss(s, punch) {
    var fam = punch && s.punchCss ? s.punchCss : s.css;
    var w = punch && s.punchCss ? (s.punchWeight || 400) : s.weight;
    var it = punch && s.punchCss ? s.punchItalic : s.italic;
    var single = s.layout === 'single';
    var fb = punch && !single ? s.punchFauxBold : s.fauxBold, fi = punch && !single ? s.punchFauxItalic : s.fauxItalic;
    // faux bold: a thin outline in the text colour; faux italic: a slant
    return "font-family:'" + fam + "',sans-serif;font-weight:" + w + ';font-style:' + (it || fi ? 'italic' : 'normal') + ';' +
        (fb ? '-webkit-text-stroke-width:0.035em;' : '') + (s.allCaps ? 'text-transform:uppercase;' : (s.smallCaps ? 'font-variant:small-caps;' : ''));
}
function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

// sample: {main:[words], punch:[words], keys:{index:true}}, active: word index in reading order
function previewHTML(s, sample, active, size) {
    size = size || 22;
    var k = size / 80;   // template text is 80 px
    var cs = function (t) {
        if (s.textCase === 'upper') return t.toUpperCase();
        if (s.textCase === 'lower') return t.toLowerCase();
        return t;
    };
    var main = sample.main, punch = sample.punch;
    if (s.layout === 'duoTop') { var all = main.concat(punch); main = all.slice(0, 1); punch = all.slice(1); }
    else if (s.layout !== 'duo') { main = main.concat(punch); punch = []; }
    function word(t, i, isPunch) {
        var key = !!sample.keys[i];
        var on = false;
        if (s.hlMode === 'active') on = i === active;
        else if (s.hlMode === 'keywords') on = key;
        else if (s.hlMode === 'keywordsSpoken') on = key && i <= active;
        else if (s.hlMode === 'fill') on = i <= active;
        var col = on ? s.hl : (isPunch ? s.emph : s.text);
        var glow = isPunch ? s.emphGlow : s.glow;
        var grad = gradAmount(s, isPunch);
        // "use gradient on": all words, normal words only, highlighted words only (like the template)
        if ((s.gradTarget === 'hl' && !on) || (s.gradTarget === 'normal' && on)) grad = 0;
        var ig = s.innerGlow || 0, ish = s.innerShadow || 0, bev = s.bevel || 0, sw = s.sweep || 0;
        var dg = s.deepGlow || 0, dgr = num(s.deepGlowRadius, 40) * k, dgc = s.deepGlowColor || '#1F6BFF';
        // premium look (Pro template): the fill is drawn as a clipped background, effects as filters
        if (grad > 0 || ig > 0 || ish > 0 || bev > 0 || sw > 0) {
            var g = grad / 100;
            var stops = gradStops(s).map(function (c) { return mix(col, c, g); });
            // inner glow / shadow: tint the fill towards the effect colour (bigger size = further in)
            var igs = num(s.innerGlowSize, 20) / 100, iss = num(s.innerShadowSize, 12) / 100;
            if (ig > 0) stops = stops.map(function (c, j) { return mix(c, s.innerGlowColor || '#ffffff', ig / 100 * (0.25 + 0.4 * igs) * (1 - 0.5 * j / (stops.length - 1))); });
            if (ish > 0) stops = stops.map(function (c, j) { return mix(c, s.innerShadowColor || '#000000', ish / 100 * (0.2 + 0.5 * iss) * (j / (stops.length - 1))); });
            var f = [];
            if (bev > 0) {
                var bk = Math.max(0.6, bev / 100 * 2.4 * k * 3).toFixed(1);
                f.push('drop-shadow(-' + bk + 'px -' + bk + 'px 0 rgba(255,255,255,' + (bev / 100 * 0.55).toFixed(2) + '))', 'drop-shadow(' + bk + 'px ' + bk + 'px 0 rgba(0,0,0,' + (bev / 100 * 0.6).toFixed(2) + '))');
            }
            var dk = (s.depth || 0) * k * 0.9;
            for (var q = 1; q <= 4 && dk > 0; q++) f.push('drop-shadow(' + (dk / 4 * 0.27).toFixed(1) + 'px ' + (dk / 4).toFixed(1) + 'px 0 ' + s.depthColor + ')');
            if (glow > 0) f.push('drop-shadow(0 0 ' + ((4 + glow * 0.25) * k * 2).toFixed(1) + 'px ' + s.glowColor + ')');
            if (dg > 0) f.push('drop-shadow(0 0 ' + (dgr * 0.6).toFixed(1) + 'px ' + hexA(dgc, Math.min(100, dg * 1.2)) + ')', 'drop-shadow(0 0 ' + (dgr * 1.6).toFixed(1) + 'px ' + hexA(dgc, dg * 0.8) + ')');
            if (s.shadow > 0) f.push('drop-shadow(' + 2 * k * 2 + 'px ' + 2 * k * 2 + 'px ' + 6 * k * 2 + 'px rgba(0,0,0,' + (s.shadow / 100).toFixed(2) + '))');
            var bg = gradCss(s, stops), bsz = '100% 100%';
            if (sw > 0) {
                var half = 3 + num(s.sweepWidth, 40) / 100 * 14, swc = hexToRgb(s.sweepColor || '#FFF8F0').join(',');
                bg = 'linear-gradient(' + (90 + num(s.sweepAngle, -25)) + 'deg,transparent ' + (50 - half) + '%,rgba(' + swc + ',' + (sw / 100 * 0.95).toFixed(2) + ') 50%,transparent ' + (50 + half) + '%),' + bg;
                bsz = '300% 100%,100% 100%';
            }
            var gst = 'background:' + bg + ';background-size:' + bsz + ';-webkit-background-clip:text;background-clip:text;color:transparent;' +
                (sw > 0 ? 'animation:bcSweep ' + num(s.sweepSpeed, 2.4) + 's linear infinite;' : '') +
                (s.strokeW > 0 ? '-webkit-text-stroke:' + Math.max(0.5, s.strokeW * k * 0.55).toFixed(1) + 'px ' + s.stroke + ';' : '') +
                (f.length ? 'filter:' + f.join(' ') + ';' : '');
            if (on && s.pop) gst += 'transform:scale(' + (1 + s.pop / 100) + ');';
            if (s.unspoken < 100 && i > active) gst += 'opacity:' + (s.unspoken / 100) + ';';
            return '<span class="pw" style="' + gst + '">' + esc(cs(t)) + '</span>';
        }
        var sh = strokeShadow(Math.max(0, s.strokeW * k * 0.55), s.stroke);
        if (glow > 0) sh.push('0 0 ' + (4 + glow * 0.25) * k * 3 + 'px ' + s.glowColor, '0 0 ' + (2 + glow * 0.1) * k * 3 + 'px ' + s.glowColor);
        if (dg > 0) sh.push('0 0 ' + (dgr * 0.8).toFixed(1) + 'px ' + hexA(dgc, Math.min(100, dg * 1.2)), '0 0 ' + (dgr * 2).toFixed(1) + 'px ' + hexA(dgc, dg * 0.8));
        // 3D depth: stacked hard shadows, like the template
        var dd = (s.depth || 0) * k * 0.9;
        for (var z = 1; z <= 6 && dd > 0; z++) sh.push((dd * z / 6 * 0.27).toFixed(1) + 'px ' + (dd * z / 6).toFixed(1) + 'px 0 ' + s.depthColor);
        if (s.shadow > 0) sh.push(2 * k * 2 + 'px ' + 2 * k * 2 + 'px ' + 6 * k * 2 + 'px rgba(0,0,0,' + (s.shadow / 100).toFixed(2) + ')');
        var go = num(s.glowOver, 0);
        if (go > 0) {
            var gr = (2 + num(s.glowOverSize, 20) * 0.35) * k * 2;
            sh.unshift('0 0 ' + gr.toFixed(1) + 'px ' + hexA(s.glowOverColor || '#FFFFFF', Math.min(100, go * 1.4)), '0 0 ' + (gr * 0.4).toFixed(1) + 'px ' + hexA(s.glowOverColor || '#FFFFFF', go));
            col = mix(col, s.glowOverColor || '#FFFFFF', Math.min(0.6, go / 160));
        }
        var st = 'color:' + col + ';text-shadow:' + (sh.join(',') || 'none') + ';';
        if (on && s.pop) st += 'transform:scale(' + (1 + s.pop / 100) + ');';
        if (s.unspoken < 100 && i > active) st += 'opacity:' + (s.unspoken / 100) + ';';
        var boxWord = s.box === 'word' && ((s.hlMode === 'keywords' && key) || (s.hlMode === 'keywordsSpoken' && key && i === active) || ((s.hlMode === 'active' || s.hlMode === 'fill' || s.hlMode === 'off') && i === active));
        if (boxWord) st += 'background:' + s.boxColor + ';border-radius:' + s.boxRound * k + 'px;padding:0 ' + s.boxPad * k + 'px;margin:0 ' + (-s.boxPad * k + 2) + 'px;opacity:1;';
        return '<span class="pw" style="' + st + '">' + esc(cs(t)) + '</span>';
    }
    var html = '', i = 0;
    var lineStyle = 'letter-spacing:' + (s.tracking / 1000).toFixed(3) + 'em;';
    if (main.length) {
        // wrap like the real captions do (characters per line from the style's rules)
        var maxC = (s.chunk && s.chunk.maxChars) || 16, lines = [], cur = [];
        main.forEach(function (t) {
            var len = cur.join(' ').length;
            if (cur.length && len + 1 + t.length > maxC) { lines.push(cur); cur = []; }
            cur.push(t);
        });
        if (cur.length) lines.push(cur);
        html += lines.map(function (ln) {
            return '<div class="pl" style="' + fontCss(s, false) + lineStyle + '">' + ln.map(function (t) { return word(t, i++, false); }).join(' ') + '</div>';
        }).join('');
    }
    if (punch.length) {
        var ps = 1 + s.emphSize * 1.5 / 100;
        var pBox = s.box === 'emphasis' ? 'background:' + hexA(s.boxColor, s.boxOpacity) + ';border-radius:' + s.boxRound * k + 'px;padding:0 ' + s.boxPad * k + 'px;display:inline-block;' : '';
        html += '<div class="pl" style="' + fontCss(s, true) + lineStyle + 'font-size:' + ps + 'em;margin-top:' + (s.lineGap * k) + 'px;"><span style="' + pBox + '">' + punch.map(function (t) { return word(t, i++, true); }).join(' ') + '</span></div>';
    }
    // ghost word: a big faded copy of the spoken word behind the caption
    if (s.ghost > 0) {
        var all = main.concat(punch), gw = all[Math.max(0, Math.min(all.length - 1, active))] || '';
        html = '<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:2.3em;white-space:nowrap;' + fontCss(s, false) +
            'color:' + s.text + ';opacity:' + (s.ghost / 100 * 0.28).toFixed(2) + ';pointer-events:none;z-index:0;">' + esc(cs(gw)) + '</div>' +
            '<div style="position:relative;z-index:1;">' + html + '</div>';
    }
    var wrapSt = 'font-size:' + size + 'px;position:relative;';
    if (s.box === 'caption') wrapSt += 'background:' + hexA(s.boxColor, s.boxOpacity) + ';border-radius:' + s.boxRound * k + 'px;padding:' + s.boxPad * k * 0.6 + 'px ' + s.boxPad * k + 'px;';
    return '<div class="pv" style="' + wrapSt + '">' + html + '</div>';
}
// ---------- multi-colour gradient ----------
function gradStops(s) {
    var st = s.gradStops && s.gradStops.length >= 2 ? s.gradStops : [s.gradTop || '#FFFFFF', s.gradBottom || '#000000'];
    return st.slice(0, 5);
}
// colour at t (0..1) along evenly spaced stops
function stopAt(st, t) {
    var x = t * (st.length - 1), i = Math.min(st.length - 2, Math.floor(x));
    return mix(st[i], st[i + 1], x - i);
}
// the template has five tones at 0, 25, 50, 75 and 100 %
function gradTones(s) {
    var st = gradStops(s);
    return [0, 0.25, 0.5, 0.75, 1].map(function (t) { return stopAt(st, t); });
}
// five tones read back from a clip: drop the ones that are just in between their neighbours
function simplifyStops(t) {
    function near(a, b) { var x = hexToRgb(a), y = hexToRgb(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 12; }
    if (near(t[1], mix(t[0], t[4], 0.25)) && near(t[2], mix(t[0], t[4], 0.5)) && near(t[3], mix(t[0], t[4], 0.75))) return [t[0], t[4]];
    if (near(t[1], mix(t[0], t[2], 0.5)) && near(t[3], mix(t[2], t[4], 0.5))) return [t[0], t[2], t[4]];
    return t;
}
// CSS for the preview: same geometry as the template (angle 90 = top to bottom)
function gradCss(s, stops) {
    var list = stops.join(',');
    if (s.gradType === 'radial') return 'radial-gradient(circle at 50% 50%,' + list + ')';
    // the template's cone starts at 12 o'clock and runs anticlockwise; Gradient Angle turns it clockwise
    if (s.gradType === 'angular') return 'conic-gradient(from ' + (s.gradAngle || 0) + 'deg at 50% 50%,' + stops.slice().reverse().join(',') + ')';
    return 'linear-gradient(' + ((s.gradAngle === undefined ? 90 : s.gradAngle) + 90) + 'deg,' + list + ')';
}

// blend two #rrggbb colours, t = 0..1 towards b
function mix(a, b, t) {
    var x = hexToRgb(a), y = hexToRgb(b);
    return rgbToHex([0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }));
}
function hexA(h, op) { var c = hexToRgb(h); return 'rgba(' + c.join(',') + ',' + (op / 100).toFixed(2) + ')'; }

// shrink a rendered preview so it never overflows its box
function fit(box) {
    var pv = box && box.firstElementChild;
    if (!pv) return;
    pv.style.transform = '';
    var sx = (box.clientWidth - 8) / pv.scrollWidth, sy = (box.clientHeight - 6) / pv.scrollHeight;
    var k = Math.min(1, sx, sy);
    if (k < 1) pv.style.transform = 'scale(' + k.toFixed(3) + ')';
}
// fit many boxes with one layout pass: reset all, measure all, then scale (no read/write ping-pong)
function fitAll(boxes) {
    var list = Array.prototype.filter.call(boxes, function (b) { return b && b.firstElementChild; });
    list.forEach(function (b) { b.firstElementChild.style.transform = ''; });
    var ks = list.map(function (b) {
        var pv = b.firstElementChild;
        return Math.min(1, (b.clientWidth - 8) / pv.scrollWidth, (b.clientHeight - 6) / pv.scrollHeight);
    });
    list.forEach(function (b, i) { if (ks[i] < 1) b.firstElementChild.style.transform = 'scale(' + ks[i].toFixed(3) + ')'; });
}

module.exports = {
    fit: fit, fitAll: fitAll, isPro: isPro, mix: mix, fillOf: fillOf, TARGET: TARGET, gradStops: gradStops, gradTones: gradTones, gradCss: gradCss, GRAD: GRAD,
    BUILTIN: BUILTIN, resolveBuiltin: resolveBuiltin, splitLines: splitLines, DEFAULT: DEFAULT, HL: HL, BOX: BOX, ANIM: ANIM, toParams: toParams, fromParams: fromParams,
    baseScale: baseScale, Store: Store, previewHTML: previewHTML, hexToRgb: hexToRgb, rgbToHex: rgbToHex,
    prepareMogrt: prepareMogrt, mogrtParams: mogrtParams, mogrtInfo: mogrtInfo, migrateLegacy: migrateLegacy, legacyStyleId: legacyStyleId
};
