// Bunnys Caption panel - UI and workflow.
// Created by Bunnys Framelab - instagram.com/bunnysframelab
(function () {
    'use strict';
    var path = require('path');
    var fs = require('fs');
    var os = require('os');
    var ROOT = (function () {
        var p = decodeURI(window.location.pathname);
        if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
        return path.dirname(p);
    })();
    function mod(n) { return require(path.join(ROOT, 'js', n)); }
    var cep = mod('cep.js'), cap = mod('captions.js'), sty = mod('styles.js'), eng = mod('engine.js'), tl = mod('translit.js'), fp = mod('fontpicker.js'), fixer = mod('fix.js'), projtext = mod('projtext.js');
    var DIRS = cep.DIRS;
    var TEMPLATE = path.join(ROOT, 'mogrt', 'Bunnys Caption.mogrt');
    var TEMPLATE_PRO = path.join(ROOT, 'mogrt', 'Bunnys Caption Pro.mogrt');
    // caption language: what whisper listens for, whether it translates, and the output script
    var LANGS = {
        'en': { lang: 'en', note: '' },
        'bn': { lang: 'bn', script: 'native', note: 'Bangla script. Uses the Bangla/Hindi font from Settings.' },
        'bn-roman': { lang: 'bn', roman: 'bn', note: 'Bangla speech written in English letters (Banglish).' },
        // mt: written down in Bangla / Hindi first, then translated offline by the translator (much better than whisper's)
        'bn-en': { lang: 'bn', translate: true, mt: true, note: 'Bangla speech, English captions (written in Bangla, then translated offline).' },
        'hi': { lang: 'hi', script: 'native', note: 'Hindi script. Uses the Bangla/Hindi font from Settings.' },
        'hi-roman': { lang: 'hi', roman: 'hi', note: 'Hindi speech written in English letters (Hinglish).' },
        'hi-en': { lang: 'hi', translate: true, mt: true, note: 'Hindi speech, English captions (written in Hindi, then translated offline).' },
        'auto-en': { lang: 'auto', translate: true, note: 'Any language, English captions.' }
    };
    var SAMPLE = { main: ['Make', 'every', 'word'], punch: ['count'], keys: { 3: true } };

    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

    // ---------------- settings ----------------
    var SETTINGS_FILE = path.join(DIRS.root, 'settings.json');
    var cores = (os.cpus() || []).length || 4;
    var settings = Object.assign({
        model: 'base.en-q5_1', threads: Math.max(2, Math.min(8, cores - 1)), prompt: '', batch: 6,
        range: 'all', lang: 'en', processor: 'auto', gpuVariant: 'cuda12', indicFont: 'NirmalaUI-Bold', track: -1, replace: false, styleId: 'bunny-sunset', useStyleRules: true,
        rules: { maxWords: 3, maxChars: 16, maxLines: 2, textCase: 'style', punct: 'soft', keys: 'normal', removeFillers: true,
            breakPunct: true, minDur: 0.6, maxDur: 4, gap: 0.6, linger: 0.2, offset: 0 }
    }, cep.readJSON(SETTINGS_FILE, {}));
    if (!settings.libDir) {
        // the folder the files were downloaded to on this PC, when it exists
        ['E:\\Bunnys Caption Files', path.join(os.homedir(), 'Bunnys Caption Files')].some(function (d) {
            if (fs.existsSync(d)) { settings.libDir = d; return true; }
            return false;
        });
    }
    var saveTimer = 0;
    function saveSettings() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { try { cep.writeJSON(SETTINGS_FILE, settings); } catch (e) { /* read only */ } }, 300);
    }

    // ---------------- state ----------------
    var cpick = mod('colorpick.js');
    cpick.init({ root: ROOT, recent: [function () { return settings.recentColors || []; }, function (l) { settings.recentColors = l; saveSettings(); }] });
    var engine = new eng.Engine(DIRS);
    engine.lib = settings.libDir || '';
    var store = new sty.Store(DIRS.styles, DIRS.mogrts);
    var styles = [];
    var seq = null;
    var words = [], caps = [];
    var editStyle = null;
    var cancelFlag = { t: false, i: false };
    var fontsList = null;

    // ---------------- ui helpers ----------------
    var toastTimer = 0;
    function toast(msg, err) {
        var t = $('#toast');
        t.textContent = msg;
        t.className = 'toast show' + (err ? ' err' : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.className = 'toast'; }, err ? 6000 : 3200);
    }
    function ask(msg, withInput, def) {
        return new Promise(function (resolve) {
            var m = $('#modal'), inp = $('.inp', m);
            $('.msg', m).textContent = msg;
            inp.classList.toggle('hidden', !withInput);
            inp.value = def || '';
            m.classList.remove('hidden');
            if (withInput) setTimeout(function () { inp.focus(); inp.select(); }, 30);
            function done(v) {
                m.classList.add('hidden');
                $$('button', m).forEach(function (b) { b.onclick = null; });
                inp.onkeydown = null;
                resolve(v);
            }
            $$('button', m).forEach(function (b) {
                b.onclick = function () { done(b.dataset.r === '1' ? (withInput ? inp.value.trim() : true) : (withInput ? null : false)); };
            });
            inp.onkeydown = function (e) { if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(null); };
        });
    }
    function progress(id, frac, text) {
        var p = $(id);
        p.classList.remove('hidden');
        p.classList.toggle('ind', frac < 0);
        if (frac >= 0) $('.bar i', p).style.width = Math.round(frac * 100) + '%';
        if (text !== undefined) $('.ptxt', p).textContent = text;
    }
    function hideProgress(id) { $(id).classList.add('hidden'); }
    function busy(btn, on) { if (btn) btn.disabled = !!on; }
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // tabs
    $$('#tabs button').forEach(function (b) {
        b.onclick = function () {
            $$('#tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
            $$('.tab').forEach(function (t) { t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab); });
            // Customize keeps its preview and buttons in place and scrolls only the settings
            $('main').classList.toggle('fixed', b.dataset.tab === 'custom');
            if (b.dataset.tab === 'custom') openEditor();
            if (b.dataset.tab === 'styles') renderGrid();
            if (b.dataset.tab === 'settings') { refreshEngine(); loadFonts(); showLib(); }
            if (b.dataset.tab === 'edit') loadFonts();
        };
    });
    function gotoTab(name) { $('#tabs button[data-tab="' + name + '"]').click(); }
    $$('[data-url]').forEach(function (b) { b.onclick = function () { cep.openURL(b.dataset.url); }; });

    // segmented controls
    function seg(id, value, onChange) {
        var el = $(id);
        function set(v) { $$('button', el).forEach(function (b) { b.classList.toggle('on', b.dataset.v === String(v)); }); }
        set(value);
        $$('button', el).forEach(function (b) { b.onclick = function () { set(b.dataset.v); onChange(b.dataset.v); }; });
        return set;
    }

    // range + output binding
    // commit: only call set when the slider is let go (for changes that go to Premiere, which are slow)
    function bindRange(input, get, set, fmt, commit) {
        var out = input.nextElementSibling;
        function show() { if (out && out.tagName === 'OUTPUT') out.textContent = fmt ? fmt(+input.value) : input.value; }
        input.value = get();
        show();
        if (commit) { input.oninput = show; input.onchange = function () { show(); set(+input.value); }; }
        else { input.oninput = function () { show(); set(+input.value); }; input.onchange = null; }
    }

    // ---------------- undo / redo ----------------
    // Premiere records every parameter write as its own undo step, so the panel keeps its own history:
    // one Ctrl+Z puts back everything one action changed. With nothing left here, Premiere's undo is used.
    var undoStack = [], redoStack = [];
    // entry: {label, undo: [{track,ticks,node,params,motion,end}] } or {label, made: [{track,ticks,node}]}
    function pushUndo(entry) {
        if (!entry) return;
        // clips where nothing really changed (value was already right) are left out
        if (entry.undo) entry.undo = entry.undo.filter(function (c) { return c.swap || Object.keys(c.params || {}).length || c.motion || c.end; });
        if (!(entry.undo && entry.undo.length) && !(entry.made && entry.made.length)) return;
        undoStack.push(entry);
        if (undoStack.length > 40) undoStack.shift();
        redoStack = [];
        urButtons();
    }
    var urBusy = false;
    // buttons stay clickable with an empty panel history (then Premiere's own undo / redo is used)
    function urButtons() {
        var u = $('#btnUndo'), r = $('#btnRedo');
        if (u) { u.disabled = urBusy; u.title = undoStack.length ? 'Undo: ' + undoStack[undoStack.length - 1].label + ' (Ctrl+Z)' : 'Undo (Ctrl+Z)'; }
        if (r) { r.disabled = urBusy; r.title = redoStack.length ? 'Redo: ' + redoStack[redoStack.length - 1].label + ' (Ctrl+Y)' : 'Redo (Ctrl+Y)'; }
    }
    // fromKey: Ctrl+Z / Ctrl+Y. A keyboard undo never removes added captions (that needs the button and a yes).
    function undoRedo(redo, fromKey) {
        if (urBusy) return Promise.resolve();
        var from = redo ? redoStack : undoStack, to = redo ? undoStack : redoStack;
        var top = from[from.length - 1];
        if (!top) return premiereStep(redo);
        if (top.made) {
            if (fromKey) { toast('Ctrl+Z does not remove added captions. Use the Undo button for that.'); return Promise.resolve(); }
            return ask('Remove the ' + top.made.length + ' captions that "' + top.label + '" added?').then(function (yes) { if (yes) return runUndo(redo, from, to); });
        }
        return runUndo(redo, from, to);
    }
    function premiereStep(redo) {
        return cep.host('premiereUndo', { redo: !!redo }).then(function () { toast(redo ? 'Redo (Premiere)' : 'Undo (Premiere)'); },
            function () { toast('Nothing to ' + (redo ? 'redo' : 'undo'), true); });
    }
    function runUndo(redo, from, to) {
        var e = from.pop();
        if (!e) {
            // nothing of ours: Premiere's own undo (one Premiere step)
            return cep.host('premiereUndo', { redo: !!redo }).then(function () { toast(redo ? 'Redo (Premiere)' : 'Undo (Premiere)'); },
                function () { toast('Nothing to ' + (redo ? 'redo' : 'undo'), true); });
        }
        urBusy = true;
        var job;
        if (e.made) {
            // "Add captions": undo removes the clips; that one cannot be redone from here
            job = cep.host('removeClips', { clips: e.made }).then(function (r) { toast('Undone: ' + e.label + ' (' + r.removed + ' removed)'); });
        } else {
            job = restore(e.undo).then(function (back) {
                var n = { label: e.label, undo: back };
                if (back.length) to.push(n);
                toast((redo ? 'Redone: ' : 'Undone: ') + e.label);
            });
        }
        return job.catch(function (x) { from.push(e); toast(x.message, true); }).then(function () { urBusy = false; urButtons(); });
    }
    $('#btnUndo').onclick = function () { undoRedo(false); };
    $('#btnRedo').onclick = function () { undoRedo(true); };
    // Premiere keeps Ctrl+Z / Ctrl+Y for itself unless the panel asks for them (Windows virtual key codes)
    try {
        window.__adobe_cep__.registerKeyEventsInterest(JSON.stringify([
            { keyCode: 90, ctrlKey: true }, { keyCode: 90, ctrlKey: true, shiftKey: true }, { keyCode: 89, ctrlKey: true },
            { keyCode: 90, metaKey: true }, { keyCode: 90, metaKey: true, shiftKey: true }
        ]));
    } catch (e) { /* outside Premiere */ }
    document.addEventListener('keydown', function (e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        var k = (e.key || '').toLowerCase();
        if (k !== 'z' && k !== 'y') return;
        // text boxes keep their own undo
        var t = e.target;
        if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search|number)$/.test(t.type)) || t.isContentEditable)) return;
        e.preventDefault();
        undoRedo(k === 'y' || (k === 'z' && e.shiftKey), true);
    });

    // ---------------- sequence info ----------------
    function refreshSeq() {
        return cep.host('info').then(function (r) {
            seq = r;
            var el = $('#seqInfo');
            el.textContent = r.name + '  ' + r.w + 'x' + r.h;
            el.classList.add('ok');
            renderTracks();
            return r;
        }, function (e) {
            seq = null;
            $('#seqInfo').textContent = cep.APP === 'AEFT' ? 'No composition' : 'No sequence';
            $('#seqInfo').classList.remove('ok');
            throw e;
        });
    }
    var selectedAudio = null;
    function renderTracks() {
        var at = $('#audioTracks');
        if (!seq) return;
        if (!selectedAudio || selectedAudio.seq !== seq.id) {
            selectedAudio = { seq: seq.id, on: {} };
            seq.audio.forEach(function (a) { if (a.clips > 0 && !a.muted) selectedAudio.on[a.i] = true; });
        }
        at.innerHTML = seq.audio.map(function (a) {
            return '<span class="chip' + (selectedAudio.on[a.i] ? ' on' : '') + '" data-i="' + a.i + '" title="' + esc(a.name) + ' - ' + a.clips + ' clips">A' + (a.i + 1) + '</span>';
        }).join('') || '<span class="muted">No audio tracks</span>';
        $$('.chip', at).forEach(function (c) {
            c.onclick = function () { var i = +c.dataset.i; selectedAudio.on[i] = !selectedAudio.on[i]; c.classList.toggle('on'); };
        });
        var ts = $('#trackSel'), cur = settings.track;
        ts.innerHTML = '<option value="-1">Auto (empty track)</option>' + seq.video.map(function (v) {
            return '<option value="' + v.i + '">V' + (v.i + 1) + (v.clips ? ' (' + v.clips + ' clips)' : ' (empty)') + '</option>';
        }).join('');
        if (cur >= seq.video.length) { settings.track = cur = -1; saveSettings(); }
        ts.value = String(cur);
    }
    window.addEventListener('focus', function () { refreshSeq().catch(function () { /* no sequence */ }); });

    // ---------------- styles ----------------
    function loadStyles() {
        var mine = store.list();
        // MOGRT styles imported before thumbnails / field setup existed: fill them in once
        mine.forEach(function (s) { var moved = sty.migrateLegacy(s); if (sty.prepareMogrt(s) || moved) { try { var f = s.file; var o = clone(s); delete o.file; fs.writeFileSync(f, JSON.stringify(o, null, 1)); } catch (e) { /* read-only */ } } });
        sty.resolveBuiltin(ROOT);
        styles = mine.concat(sty.BUILTIN);
        var sid = sty.legacyStyleId(settings.styleId);
        if (sid !== settings.styleId) { settings.styleId = sid; saveSettings(); }
        if (!currentStyle()) settings.styleId = sty.BUILTIN[0].id;
    }
    function currentStyle() {
        for (var i = 0; i < styles.length; i++) if (styles[i].id === settings.styleId) return styles[i];
        // the remembered style is gone (deleted preset, unsaved style after a restart): use the first one
        if (styles.length) { settings.styleId = styles[0].id; return styles[0]; }
        return clone(sty.DEFAULT);
    }
    function selectStyle(id) {
        settings.styleId = id;
        saveSettings();
        renderCurStyle();
        syncGen();
        $$('.sc').forEach(function (c) { c.classList.toggle('on', c.dataset.id === id); });
        if (settings.useStyleRules) { applyStyleRules(); rebuild(false); }
    }
    function renderCurStyle() {
        var s = currentStyle();
        s = effectiveStyle();
        $('#curStyle').innerHTML = '<div class="mini">' + (s.type === 'mogrt' ? mogrtThumb(s) : sty.previewHTML(s, SAMPLE, 1, 15)) + '</div>' +
            '<div><div class="nm">' + esc(s.name) + '</div><button class="link" id="chgStyle">Change style</button></div>';
        $('#chgStyle').onclick = function () { gotoTab('styles'); };
        sty.fit($('#curStyle .mini'));
    }

    var tagFilter = 'all';
    function renderTags() {
        var tags = { all: 1 };
        styles.forEach(function (s) { (s.tags || []).forEach(function (t) { tags[t] = 1; }); });
        var order = ['all', 'mine', 'lyrics', 'animated', 'premium', 'karaoke', 'keywords', 'box', 'duo', 'glow', 'bold', 'minimal', 'serif', 'script', 'trending', 'brand', 'custom'];
        var list = order.filter(function (t) { return tags[t]; });
        $('#styleTags').innerHTML = list.map(function (t) { return '<span class="chip' + (t === tagFilter ? ' on' : '') + '" data-t="' + t + '">' + t + '</span>'; }).join('');
        $$('#styleTags .chip').forEach(function (c) { c.onclick = function () { tagFilter = c.dataset.t; renderTags(); renderGrid(); }; });
    }
    var animTimer = 0;
    function renderGrid() {
        var q = ($('#styleSearch').value || '').toLowerCase();
        var list = styles.filter(function (s) {
            return (tagFilter === 'all' || (s.tags || []).indexOf(tagFilter) >= 0) && (!q || s.name.toLowerCase().indexOf(q) >= 0);
        });
        var g = $('#styleGrid');
        g.innerHTML = list.map(function (s) {
            var menu = '<div class="menu"><button data-a="edit">Edit</button>' + (s.builtin ? '' : '<button data-a="export">Export</button><button data-a="del">Delete</button>') + '</div>';
            var pv = s.type === 'mogrt' ? mogrtThumb(s) : sty.previewHTML(s, SAMPLE, 1, 17);
            return '<div class="sc' + (s.id === settings.styleId ? ' on' : '') + '" data-id="' + esc(s.id) + '">' + menu +
                '<div class="pvbox">' + pv + '</div><div class="meta"><span class="nm">' + esc(s.name) + '</span><span class="tag">' + esc((s.tags || [])[0] || '') + '</span></div></div>';
        }).join('') || '<div class="muted">No styles match.</div>';
        sty.fitAll($$('.pvbox', g));
        $$('.sc', g).forEach(function (card) {
            var s = styleById(card.dataset.id);
            card.onclick = function (e) {
                var a = e.target.dataset && e.target.dataset.a;
                if (a === 'edit') { editStyle = clone(s); keepOnce = true; gotoTab('custom'); return; }
                if (a === 'del') { deleteStyle(s); return; }
                if (a === 'export') { exportStyle(s); return; }
                selectStyle(s.id);
                toast(s.name + ' selected');
            };
            // animate only the hovered card (keeps the panel light)
            card.onmouseenter = function () {
                if (s.type === 'mogrt') return;
                var i = 0, box = $('.pvbox', card);
                clearInterval(animTimer);
                animTimer = setInterval(function () { i = (i + 1) % 4; box.innerHTML = sty.previewHTML(s, SAMPLE, i, 17); sty.fit(box); }, 420);
            };
            card.onmouseleave = function () { clearInterval(animTimer); };
        });
    }
    $('#styleSearch').oninput = renderGrid;
    function fileUrl(f) {
        var parts = String(f).split(/[\\/]/);
        return 'file:///' + parts.map(function (p, i) { return i === 0 && /^[A-Za-z]:$/.test(p) ? p : encodeURIComponent(p); }).join('/');
    }
    function mogrtThumb(s) {
        return s.thumb && fs.existsSync(s.thumb) ? '<img class="mthumb" src="' + fileUrl(s.thumb) + '" alt="">' : '<div class="muted small">Your MOGRT</div>';
    }
    // other text fields that get the caption text too
    function mogrtSame(s) { var o = s.mogrtOther || {}; return Object.keys(o).filter(function (k) { return o[k] === 'same'; }); }
    function styleById(id) { for (var i = 0; i < styles.length; i++) if (styles[i].id === id) return styles[i]; return null; }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    function deleteStyle(s) {
        ask('Delete preset "' + s.name + '"?').then(function (yes) {
            if (!yes) return;
            store.remove(s);
            loadStyles(); renderTags(); renderGrid(); renderCurStyle();
            toast('Deleted');
        });
    }
    function exportStyle(s) {
        var f = cep.saveDialog('Export preset', s.name + '.json', ['json']);
        if (!f) return;
        var o = clone(s); delete o.file;
        fs.writeFileSync(/\.json$/i.test(f) ? f : f + '.json', JSON.stringify(o, null, 1));
        toast('Exported');
    }
    $('#btnImportStyle').onclick = function () {
        var f = cep.pickFile('Import preset (.json) or your own MOGRT', ['json', 'mogrt']);
        if (!f) return;
        if (/\.mogrt$/i.test(f)) {
            ask('Name for this MOGRT style', true, path.basename(f, '.mogrt')).then(function (name) {
                if (!name) return;
                var s = store.addMogrt(f, name);
                loadStyles(); renderTags(); renderGrid(); selectStyle(s.id);
                toast('Added. Captions will go into its first text field.');
            });
            return;
        }
        try {
            var o = JSON.parse(fs.readFileSync(f, 'utf8'));
            var s = store.save(Object.assign(clone(sty.DEFAULT), o), true);
            loadStyles(); renderTags(); renderGrid(); selectStyle(s.id);
            toast('Imported ' + s.name);
        } catch (e) { toast('Not a valid preset file', true); }
    };

    // ---------------- caption rules ----------------
    function rules() {
        var r = clone(settings.rules);
        var s = currentStyle();
        r.textCase = r.textCase === 'style' ? (s.textCase || 'as') : r.textCase;
        return r;
    }
    function applyStyleRules() {
        var s = currentStyle();
        if (!s || !s.chunk) return;
        settings.rules.maxWords = s.chunk.maxWords;
        settings.rules.maxChars = s.chunk.maxChars;
        settings.rules.maxLines = s.chunk.maxLines;
        syncRuleInputs();
    }
    var setLines;
    function syncRuleInputs() {
        var r = settings.rules;
        bindRange($('#rWords'), function () { return r.maxWords; }, function (v) { r.maxWords = v; ruleChanged(); });
        bindRange($('#rChars'), function () { return r.maxChars; }, function (v) { r.maxChars = v; ruleChanged(); });
        if (setLines) setLines(r.maxLines);
    }
    function ruleChanged(autoKw) {
        if (settings.useStyleRules) { settings.useStyleRules = false; $('#useStyleRules').checked = false; }
        saveSettings();
        rebuild(!!autoKw);
    }
    function initRules() {
        var r = settings.rules;
        $('#useStyleRules').checked = settings.useStyleRules;
        $('#useStyleRules').onchange = function () {
            settings.useStyleRules = this.checked;
            if (this.checked) applyStyleRules();
            saveSettings(); rebuild(false);
        };
        syncRuleInputs();
        setLines = seg('#rLines', r.maxLines, function (v) { r.maxLines = +v; ruleChanged(); });
        $('#rCase').value = r.textCase; $('#rCase').onchange = function () { r.textCase = this.value; saveSettings(); rebuild(false); };
        $('#rPunct').value = r.punct; $('#rPunct').onchange = function () { r.punct = this.value; saveSettings(); rebuild(false); };
        $('#rKeys').value = r.keys; $('#rKeys').onchange = function () { r.keys = this.value; saveSettings(); rebuild(true); };
        $('#rFillers').checked = r.removeFillers; $('#rFillers').onchange = function () { r.removeFillers = this.checked; saveSettings(); rebuild(false); };
        $('#rBreak').checked = r.breakPunct; $('#rBreak').onchange = function () { r.breakPunct = this.checked; saveSettings(); rebuild(false); };
        var f1 = function (v) { return v.toFixed(1); }, f2 = function (v) { return v.toFixed(2); };
        bindRange($('#rMin'), function () { return r.minDur; }, function (v) { r.minDur = v; saveSettings(); rebuild(false); }, f1);
        bindRange($('#rMax'), function () { return r.maxDur; }, function (v) { r.maxDur = v; saveSettings(); rebuild(false); }, f1);
        bindRange($('#rGap'), function () { return r.gap; }, function (v) { r.gap = v; saveSettings(); rebuild(false); }, f1);
        bindRange($('#rLinger'), function () { return r.linger; }, function (v) { r.linger = v; saveSettings(); rebuild(false); }, f2);
        bindRange($('#rOffset'), function () { return r.offset; }, function (v) { r.offset = v; saveSettings(); }, f2);
        seg('#rangeSeg', settings.range, function (v) { settings.range = v; saveSettings(); });
        if (!LANGS[settings.lang]) settings.lang = 'en';
        $('#langSel').value = settings.lang;
        $('#langHint').textContent = LANGS[settings.lang].note;
        $('#langFix').classList.toggle('hidden', !(LANGS[settings.lang].lang === 'bn' || LANGS[settings.lang].lang === 'hi') || !!LANGS[settings.lang].translate);
        $('#fixSpell').checked = settings.fixSpelling !== false;
        $('#fixEng').checked = settings.englishWords !== false;
        $('#fixSpell').onchange = function () { settings.fixSpelling = this.checked; saveSettings(); };
        $('#fixEng').onchange = function () { settings.englishWords = this.checked; saveSettings(); };
        $('#fixStd').checked = settings.standardBangla !== false;
        $('#fixStd').onchange = function () { settings.standardBangla = this.checked; saveSettings(); };
        $('#langSel').onchange = function () {
            var prev = LANGS[settings.lang];
            settings.lang = this.value;
            var L = LANGS[settings.lang];
            $('#langHint').textContent = L.note;
            $('#langFix').classList.toggle('hidden', !(L.lang === 'bn' || L.lang === 'hi') || !!L.translate);
            // non-English speech needs a multilingual model; Small is the sensible minimum for Bangla/Hindi
            // Bangla needs the full Large v3 model; Hindi and auto work well with Large v3 Turbo
            if (L.lang !== 'en') {
                settings.model = bestModel(L, settings.model);
            }
            if (L.lang === 'en' && !/\.en-/.test(settings.model)) settings.model = 'base.en-q5_1';
            // switching between Bangla script and Banglish (same for Hindi) only re-writes the text
            if (prev && prev.lang === L.lang && !prev.translate && !L.translate && words.length && words[0].n !== undefined) {
                applyScript(words);
                rebuild(false);
            }
            saveSettings(); refreshEngine();
        };
        $('#trackSel').onchange = function () { settings.track = +this.value; saveSettings(); };
        $('#replaceOld').checked = settings.replace;
        $('#replaceOld').onchange = function () { settings.replace = this.checked; saveSettings(); };
    }

    // words -> caps
    var activeWords = [];
    var rebuildTimer = 0;
    function rebuild(autoKw) {
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(function () {
            if (!words.length) { caps = []; renderCaps(); return; }
            var r = rules();
            activeWords = cap.cleanWords(words, r);
            caps = cap.chunk(activeWords, r);
            if (autoKw) cap.autoKeywords(activeWords, caps, r.keys);
            renderCaps();
        }, 60);
    }

    var reviewMode = 'hl';
    seg('#reviewMode', 'hl', function (v) {
        reviewMode = v;
        $('#reviewHint').textContent = v === 'edit' ? 'Type to fix the text of any caption. Enter or clicking elsewhere saves it. Word timing is kept or spread over the caption.'
            : 'Click a word to highlight it (color / box). Click again to remove.';
        renderCaps();
    });
    // a caption's text was edited in the Review list: replace its words, keeping timing
    function editCaption(ci, text) {
        var c = caps[ci];
        if (!c) return;
        var objs = c.w.map(function (i) { return activeWords[i]; });
        var toks = String(text).split(/\s+/).filter(Boolean);
        var s0 = objs[0].s, e0 = objs[objs.length - 1].e;
        var first = words.indexOf(objs[0]), last = words.indexOf(objs[objs.length - 1]);
        if (first < 0 || last < 0) return;
        var fresh, grp = 'g' + Date.now().toString(36) + ci;
        if (toks.length === objs.length) {
            fresh = objs.map(function (w, i) { var n = Object.assign({}, w, { t: toks[i], grp: grp }); n.n = toks[i]; return n; });
        } else {
            fresh = toks.map(function (t, i) {
                var old = objs[i];
                return { t: t, n: t, grp: grp, s: s0 + (e0 - s0) * i / toks.length, e: s0 + (e0 - s0) * (i + 1) / toks.length, k: !!(old && old.t === t && old.k) };
            });
        }
        words.splice.apply(words, [first, last - first + 1].concat(fresh));
        try { cep.writeJSON(transcriptFile(), { saved: Date.now(), words: words }); } catch (e) { /* ignore */ }
        rebuild(false);
    }
    function renderCaps() {
        var list = $('#capList');
        $('#capCount').textContent = caps.length ? caps.length + ' captions' : '';
        if (!caps.length) { list.innerHTML = '<div class="empty">Transcribe or import to see captions here.</div>'; return; }
        var r = rules();
        var html = [];
        if (reviewMode === 'edit') {
            for (var j = 0; j < caps.length; j++) {
                var txt = caps[j].w.map(function (wi) { return activeWords[wi].t; }).join(' ');
                html.push('<div class="cap"><span class="tm">' + cap.fmtTime(caps[j].s, '.').slice(3, 10) + '</span><div class="capedit" contenteditable="true" spellcheck="false" data-c="' + j + '">' + esc(txt) + '</div></div>');
            }
            list.innerHTML = html.join('');
            return;
        }
        for (var i = 0; i < caps.length; i++) {
            var c = caps[i];
            var ws = c.w.map(function (wi) {
                var w = activeWords[wi];
                return '<span class="w' + (w.k ? ' k' : '') + '" data-w="' + wi + '">' + esc(cap.displayWord(w, r)) + '</span>';
            }).join('');
            html.push('<div class="cap"><span class="tm">' + cap.fmtTime(c.s, '.').slice(3, 10) + '</span><div class="ws">' + ws + '</div></div>');
        }
        list.innerHTML = html.join('');
    }
    function wordListHandlers(list, getWord, onChange) {
        var clickTimer = 0;
        list.addEventListener('click', function (e) {
            var el = e.target.closest('.w');
            if (!el || el.isContentEditable) return;
            clearTimeout(clickTimer);
            clickTimer = setTimeout(function () {
                var w = getWord(el);
                w.k = !w.k;
                el.classList.toggle('k', w.k);
            }, 220);
        });
        list.addEventListener('dblclick', function (e) {
            var el = e.target.closest('.w');
            if (!el) return;
            clearTimeout(clickTimer);
            var w = getWord(el);
            el.textContent = w.t;
            el.contentEditable = 'true';
            el.focus();
            document.execCommand('selectAll', false, null);
            function commit() {
                el.contentEditable = 'false';
                el.onblur = el.onkeydown = null;
                var v = el.textContent.trim();
                onChange(w, v, el);
            }
            el.onblur = commit;
            el.onkeydown = function (k) { if (k.key === 'Enter') { k.preventDefault(); el.blur(); } if (k.key === 'Escape') { el.textContent = w.t; el.blur(); } };
        });
    }
    $('#capList').addEventListener('keydown', function (e) {
        if (e.target.classList.contains('capedit') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
    $('#capList').addEventListener('focusout', function (e) {
        var el = e.target;
        if (!el.classList || !el.classList.contains('capedit')) return;
        var ci = +el.dataset.c, before = caps[ci] ? caps[ci].w.map(function (wi) { return activeWords[wi].t; }).join(' ') : '';
        var now = el.textContent.replace(/\s+/g, ' ').trim();
        if (now && now !== before) editCaption(ci, now);
    });
    wordListHandlers($('#capList'), function (el) { return activeWords[+el.dataset.w]; }, function (w, v) {
        if (!v) { var i = words.indexOf(w); if (i >= 0) words.splice(i, 1); rebuild(false); return; }
        w.t = v; renderCaps();
    });
    $('#btnResplit').onclick = function () { rebuild(true); toast('Main words detected again'); };
    $('#btnSrt').onclick = function () {
        if (!caps.length) { toast('Nothing to export yet', true); return; }
        var f = cep.saveDialog('Export SRT', (seq ? seq.name : 'captions') + '.srt', ['srt']);
        if (!f) return;
        fs.writeFileSync(/\.srt$/i.test(f) ? f : f + '.srt', cap.toSRT(caps, activeWords, currentStyle(), rules()));
        toast('SRT saved');
    };

    // ---------------- transcription ----------------
    function transcriptFile() { return path.join(DIRS.transcripts, (seq ? String(seq.id).replace(/[^\w-]/g, '_') : 'last') + '.json'); }
    function setWords(list, autoKw) {
        words = list;
        try { cep.writeJSON(transcriptFile(), { saved: Date.now(), words: words }); } catch (e) { /* ignore */ }
        rebuild(autoKw !== false);
    }

    // Banglish / Hinglish: rebuild each word's text from the native-script original
    function applyScript(list) {
        var L = LANGS[settings.lang];
        list.forEach(function (w) {
            if (w.n === undefined) return;
            w.t = L.roman ? tl.toRoman(w.n, L.roman) : w.n;
        });
    }
    // font for Bangla / Hindi script captions (Latin fonts have no glyphs for them)
    function fontsFor(s) {
        var sample = (words[0] && words[0].t) || '';
        if (tl.scriptOf(sample) === 'latin') return { main: s.font, punch: s.punchFont || s.font };
        return { main: genOpt.font || settings.indicFont, punch: genOpt.punchFont || genOpt.font || settings.indicFont };
    }

    // Bangla: the Bangla-trained model (it only writes Bangla, so not for translating), else Large v3.
    // Hindi / auto: Large v3 Turbo. A model the user picked that suits the language is kept.
    function bestModel(L, cur) {
        var list = L.lang === 'bn' && (!L.translate || L.mt) ? ['bangla-medium-q5_0', 'large-v3-q5_0', 'large-v3-turbo-q5_0']
            : L.lang === 'bn' ? ['large-v3-q5_0', 'large-v3-turbo-q5_0'] : ['large-v3-turbo-q5_0', 'large-v3-q5_0'];
        var have = list.filter(function (m) { return engine.hasModel(m); });
        var info = eng.MODELS.filter(function (m) { return m.id === cur; })[0] || {};
        var weak = /\.en-/.test(cur) || /^(base|small)-/.test(cur) || (info.bn && (L.lang !== 'bn' || (L.translate && !L.mt)));
        // for Bangla always move up to the best one installed
        if (L.lang === 'bn' && (!L.translate || L.mt) && have.length) return have[0];
        return weak ? (have[0] || list[0]) : cur;
    }
    // ---------- offline translator (Bangla / Hindi -> English) ----------
    // loaded on first use: a problem in the translator must never stop the panel from opening
    var translatorObj = null;
    var translator = {
        get: function () { if (!translatorObj) translatorObj = new (mod('translate.js').Translator)(DIRS, settings.libDir || ''); return translatorObj; },
        missing: function (g) { return this.get().missing(g); },
        install: function (g, d, f) { return this.get().install(g, d, f); },
        translate: function (l, o, f) { return this.get().translate(l, o, f); },
        cancel: function () { if (translatorObj) translatorObj.cancel(); }
    };
    function translateWords(list, lang) {
        var gpu = settings.processor !== 'cpu' && (engine.has('cuda12') || engine.has('cuda11'));
        var need = translator.missing(gpu);
        var p = Promise.resolve();
        if (need.length) {
            var mb = need.reduce(function (a, n) { return a + (n.fromLib ? 0 : n.mb); }, 0);
            p = (mb ? ask('English captions need the offline translator (' + (mb >= 1000 ? (mb / 1000).toFixed(1) + ' GB' : mb + ' MB') +
                ', once). It runs on this PC, nothing is sent anywhere.\n\nOK: download now (github.com / huggingface.co).') : Promise.resolve(true)).then(function (yes) {
                if (!yes) throw new Error('Translation needs the translator. The Bangla text was kept: choose "Bangla" to use it.');
                return translator.install(gpu, eng.download, function (what, f) { progress('#progT', f, what + (f >= 0 ? ' ' + Math.round(f * 100) + '%' : '')); });
            });
        }
        return p.then(function () {
            progress('#progT', 0, 'Translating to English');
            var t0 = Date.now();
            return translator.translate(list, { lang: lang, gpu: gpu, threads: settings.threads }, function (f) {
                var el = (Date.now() - t0) / 1000, eta = f > 0.05 ? Math.round(el / f - el) : 0;
                progress('#progT', f, 'Translating ' + Math.round(f * 100) + '%' + (eta ? ' - about ' + eta + ' s left' : ''));
            });
        }).then(function (en) { hideProgress('#progT'); return en; }, function (e) { hideProgress('#progT'); throw e; });
    }

    function ensureEngine() {
        var need = [], mb = 0;
        var wantGpu = settings.processor === 'gpu';
        var v = settings.gpuVariant;
        if (wantGpu && !engine.has(v)) { need.push('GPU speech engine (' + eng.VARIANTS[v].mb + ' MB)'); mb += eng.VARIANTS[v].mb; }
        else if (!wantGpu && !engine.ready()) { need.push('speech engine (9 MB)'); mb += 9; }
        var model = eng.MODELS.filter(function (m) { return m.id === settings.model; })[0];
        if (!engine.hasModel(settings.model)) { need.push(model.label.split(' - ')[0].split(',')[0] + ' model (' + model.mb + ' MB)'); mb += model.mb; }
        if (!need.length) return Promise.resolve();
        // files already in the offline folder: install them without asking
        var fromLib = !!(wantGpu ? engine.libZip(v) : engine.libZip('cpu'));
        if (fromLib && engine.hasModel(settings.model)) {
            progress('#progT', -1, 'Installing the speech engine from ' + settings.libDir);
            return engine.installEngine(wantGpu ? v : 'cpu');
        }
        return ask('Missing: ' + need.join(', ') + '.\n\nOK: download now (github.com / huggingface.co).\nCancel: pick the files yourself in Settings > Offline files.').then(function (yes) {
            if (!yes) { gotoTab('settings'); throw new Error('Choose the files folder or install the files in Settings.'); }
            var p = Promise.resolve();
            if (wantGpu && !engine.has(v)) p = p.then(function () {
                return engine.installEngine(v, function (f) { progress('#progT', f, 'Downloading GPU engine ' + Math.round(f * 100) + '%'); });
            });
            else if (!wantGpu && !engine.ready()) p = p.then(function () {
                return engine.installEngine('cpu', function (f) { progress('#progT', f, 'Downloading speech engine ' + Math.round(f * 100) + '%'); });
            });
            if (!engine.hasModel(settings.model)) p = p.then(function () {
                return engine.installModel(settings.model, function (f) { progress('#progT', f, 'Downloading model ' + Math.round(f * 100) + '%'); });
            });
            return p;
        });
    }

    $('#btnTranscribe').onclick = function () {
        var btn = this;
        cancelFlag.t = false;
        busy(btn, true);
        var wav = path.join(DIRS.temp, 'bc_audio_' + Date.now() + '.wav');
        var offset = 0;
        refreshSeq().then(function () {
            var tracks = Object.keys(selectedAudio.on).filter(function (k) { return selectedAudio.on[k]; }).map(Number);
            if (!tracks.length) throw new Error('Pick at least one audio track.');
            return ensureEngine().then(function () {
                // voice detector (0.9 MB) for clean cuts; without it the audio is cut by loudness
                if (!engine.hasVad()) { progress('#progT', -1, 'Getting the voice detector (0.9 MB)'); return engine.installVad(); }
            }).then(function () {
                if (cancelFlag.t) throw new Error('Cancelled');
                progress('#progT', -1, cep.APP === 'AEFT' ? 'Rendering audio from the composition' : 'Exporting audio from the sequence');
                return cep.host('exportAudio', { out: wav, inOut: settings.range === 'inout', tracks: tracks });
            });
        }).then(function (r) {
            offset = r.offset || 0;
            if (cancelFlag.t) throw new Error('Cancelled');
            progress('#progT', 0, 'Listening');
            var t0 = Date.now();
            var L = LANGS[settings.lang];
            var pick = bestModel(L, settings.model);
            if (pick !== settings.model && engine.hasModel(pick)) {
                settings.model = pick; saveSettings();
                toast('Using ' + eng.MODELS.filter(function (m) { return m.id === pick; })[0].label.split(' - ')[0] + ' for this language');
            }
            return engine.transcribe({
                wav: r.path, model: settings.model, lang: L.lang, translate: !!L.translate && !L.mt, threads: settings.threads,
                prompt: settings.prompt, processor: settings.processor
            }, function (f) {
                var el = (Date.now() - t0) / 1000;
                var eta = f > 0.03 ? Math.round(el / f - el) : 0;
                progress('#progT', f, 'Transcribing ' + Math.round(f * 100) + '%' + (eta ? ' - about ' + eta + ' s left' : ''));
            });
        }).then(function (res) {
            var list = res.words;
            list.forEach(function (w) { w.s += offset; w.e += offset; });
            hideProgress('#progT');
            if (!list.length) { toast('No speech found in the selected tracks.', true); return; }
            var Lr = LANGS[settings.lang];
            // Bangla/Hindi: real-word spelling (in their own script, also before translating)
            if ((!Lr.translate || Lr.mt) && (Lr.lang === 'bn' || Lr.lang === 'hi') && (settings.fixSpelling !== false || settings.englishWords !== false)) {
                try { fixer.fixWords(list, Lr.lang, ROOT, { english: Lr.mt ? false : settings.englishWords !== false, spelling: settings.fixSpelling !== false, standard: settings.standardBangla !== false }); } catch (e) { console.warn(e); }
            }
            var done = function (words, extra) {
                if (!Lr.translate || Lr.mt) words.forEach(function (w) { w.n = w.t; });
                applyScript(words);
                setWords(words);
                toast(words.length + ' words ' + (extra || 'transcribed') + ' on ' + res.device + (res.fellBack ? ' (GPU failed, used CPU)' : ''));
            };
            if (!Lr.mt) { done(list); return; }
            return translateWords(list, Lr.lang).then(function (en) { done(en, 'translated'); });
        }).catch(function (e) {
            hideProgress('#progT');
            toast(e.message, true);
        }).then(function () {
            busy(btn, false);
            try { fs.unlinkSync(wav); } catch (e) { /* not created */ }
        });
    };
    $$('[data-cancel]').forEach(function (b) {
        b.onclick = function () {
            cancelFlag[b.dataset.cancel] = true;
            if (b.dataset.cancel === 't') { engine.cancel(); translator.cancel(); }
            toast('Stopping');
        };
    });
    $('#btnImportSrt').onclick = function () {
        var f = cep.pickFile('Import subtitles', ['srt', 'vtt']);
        if (!f) return;
        var list = cap.parseSubtitles(fs.readFileSync(f, 'utf8'));
        if (!list.length) { toast('No captions found in that file', true); return; }
        setWords(list);
        toast('Imported ' + list.length + ' words. Word timing is estimated from the subtitle timing.');
    };
    $('#btnLoadLast').onclick = function () {
        refreshSeq().catch(function () {}).then(function () {
            var o = cep.readJSON(transcriptFile(), null);
            if (!o || !o.words || !o.words.length) { toast('No saved transcript for this sequence', true); return; }
            words = o.words;
            rebuild(false);
            toast('Loaded ' + words.length + ' words');
        });
    };

    // ---------------- insert ----------------
    function motionFor(s) {
        var base = sty.baseScale(seq.w, seq.h);
        // Lyrics templates are laid out for a 1920 x 1080 frame: in narrow (vertical) frames they are fitted to the width
        if (s.mogrtLines) base = Math.min(base, Math.min(seq.w / 1920, seq.h / 1080) * 140);
        return { pos: [0.5, s.posY], scale: Math.round(base * s.scale / 100 * 10) / 10 };
    }
    function capPayload(c, s, r) {
        var l = cap.layout(c, activeWords, s, r);
        return { s: Math.max(0, c.s + r.offset), e: c.e + r.offset, main: l.main, punch: l.punch, text: l.text, data: cap.dataString(c, l.order, activeWords), name: l.text.slice(0, 40),
            lines: s.type === 'mogrt' && s.mogrtLines ? sty.splitLines(s, l.text) : undefined };
    }
    $('#btnInsert').onclick = function () {
        var btn = this;
        if (!caps.length) { toast('Transcribe first (step 1).', true); return; }
        var s = effectiveStyle(), r = rules();
        cancelFlag.i = false;
        busy(btn, true);
        var track;
        refreshSeq().then(function () {
            var first = caps[0].s + r.offset, last = caps[caps.length - 1].e + r.offset;
            var pre = Promise.resolve();
            var want = +$('#trackSel').value;
            if (!(want < seq.video.length)) want = -1;
            settings.track = want;
            if (settings.replace && want >= 0) pre = cep.host('removeCaptions', { track: want });
            return pre.then(function () { return cep.host('pickTrack', { from: first, to: last, track: want, force: false }); });
        }).then(function (t) {
            track = t.track;
            var fonts = fontsFor(s);
            var base = {
                mogrt: s.type === 'mogrt' ? s.mogrt : (sty.isPro(s) ? TEMPLATE_PRO : TEMPLATE), track: track, custom: s.type === 'mogrt',
                params: s.type === 'mogrt' ? sty.mogrtParams(s) : sty.toParams(s), mainFont: fonts.main, punchFont: fonts.punch,
                textParam: s.type === 'mogrt' ? (s.mogrtMain || '') : '', sameParams: s.type === 'mogrt' ? mogrtSame(s) : null,
                motion: s.type === 'mogrt' && !s.mogrtMotion ? null : motionFor(s)
            };
            var all = caps.map(function (c) { return capPayload(c, s, r); });
            var i = 0, done = 0, errs = [], made = [];
            var t0 = Date.now();
            function step() {
                if (cancelFlag.i) return Promise.resolve();
                if (i >= all.length) return Promise.resolve();
                var batch = all.slice(i, i + settings.batch);
                i += batch.length;
                return cep.host('insert', Object.assign({ caps: batch }, base)).then(function (res) {
                    done += res.done;
                    made = made.concat(res.made || []);
                    errs = errs.concat(res.errs || []);
                    var el = (Date.now() - t0) / 1000, eta = Math.round(el / i * (all.length - i));
                    progress('#progI', i / all.length, 'Added ' + done + ' of ' + all.length + (eta > 1 ? ' - about ' + eta + ' s left' : ''));
                    // yield so Premiere can redraw between batches
                    return new Promise(function (ok) { setTimeout(ok, 15); }).then(step);
                });
            }
            progress('#progI', 0, 'Adding captions to V' + (track + 1));
            return step().then(function () {
                pushUndo({ label: 'Add ' + done + ' captions', made: made });
                hideProgress('#progI');
                if (errs.length) console.warn('Bunnys Caption:', errs);
                toast((cancelFlag.i ? 'Stopped. ' : '') + done + ' captions added to V' + (track + 1) + (errs.length ? ' (' + errs.length + ' warnings)' : ''), !!errs.length && !done);
                refreshSeq().catch(function () {});
            });
        }).catch(function (e) {
            hideProgress('#progI');
            toast(e.message, true);
        }).then(function () { busy(btn, false); });
    };

    // ---------------- timeline selection: restyle / edit ----------------
    function textOf(p) {
        if (!p) return '';
        var v = p.v;
        if (typeof v === 'string' && v.charAt(0) === '{') { try { return JSON.parse(v).textEditValue || ''; } catch (e) { return v; } }
        return v == null ? '' : String(v);
    }
    function readSel(only) {
        return cep.host('readSelection', only ? { only: only } : {}).then(function (r) {
            if (!r.clips.length) throw new Error(r.texts && r.texts.length ? 'This needs Bunnys captions. Use "Apply to selected clips" to turn text layers into captions first.' : 'Select caption or text clips in the timeline first.');
            return r.clips;
        });
    }
    function batchUpdate(clips, label) {
        var i = 0, done = 0, undo = [];
        function step() {
            if (i >= clips.length) { pushUndo({ label: label, undo: undo }); return Promise.resolve(done); }
            var b = clips.slice(i, i + settings.batch);
            i += b.length;
            return cep.host('updateClips', { clips: b, proMogrt: TEMPLATE_PRO, liteMogrt: TEMPLATE }).then(function (r) {
                done += r.done;
                undo = undo.concat(r.undo || []);
                toast(label + ' ' + done + '/' + clips.length);
                // yield so Premiere can redraw between batches
                return new Promise(function (ok) { setTimeout(ok, 15); }).then(step);
            });
        }
        return step();
    }
    // Premiere does not always hand out a text layer's text in readable form. Use it when it looks like
    // real text, otherwise ask (pre-filled with the clip name), so captions never show random symbols.
    function readableText(t) {
        t = String(t || '').trim();
        if (t.length < 2 || /[\u0000-\u0008\u000E-\u001F\uFFFD]/.test(t)) return false;
        var good = (t.match(/[A-Za-z0-9\u00C0-\u024F\u0900-\u097F\u0980-\u09FF\s.,!?'"\-:;%$&()]/g) || []).length;
        return good / t.length > 0.9;
    }
    function generic(name) { return !name || /^(graphic|text|title|shape|new text layer|group)\s*\d*$/i.test(name); }
    function usable(c) { return readableText(c.text) && (generic(c.name) || c.text.trim().length > 3 || c.text.trim() === String(c.name).trim()); }
    // Text layers whose text the API could not give: read them from the project file (saving it first if needed)
    function textsFromProject(texts, projectPath) {
        var need = texts.filter(function (c) { return !usable(c) && (generic(c.name) || !readableText(c.name)); });
        if (!need.length || !projectPath) return Promise.resolve(texts);
        function apply(found) {
            texts.forEach(function (c) { if (found[c.node]) { c.text = found[c.node]; c.fromProject = true; } });
        }
        apply(projtext.lookup(projectPath, need.map(function (c) { return c.node; })));
        if (need.every(function (c) { return c.fromProject; })) return Promise.resolve(texts);
        // the text layer is newer than the last save
        return cep.host('saveProject').then(function (r) {
            apply(projtext.lookup(r.path || projectPath, need.filter(function (c) { return !c.fromProject; }).map(function (c) { return c.node; })));
            return texts;
        }, function () { return texts; });
    }
    function confirmTexts(texts, projectPath) {
        return textsFromProject(texts, projectPath).then(function (list) { return confirmTextsAsk(list); });
    }
    function confirmTextsAsk(texts) {
        return texts.reduce(function (p, c) {
            return p.then(function (list) {
                // one click: text from Premiere or the project file, otherwise the clip name (Premiere names a text clip after its text)
                if (c.fromProject || usable(c)) { list.push(c); return list; }
                if (!generic(c.name) && readableText(c.name)) { list.push(Object.assign({}, c, { text: c.name })); return list; }
                // keep what Premiere returned, so the reader can be improved
                try { fs.writeFileSync(path.join(DIRS.root, 'textlayer_debug.log'), JSON.stringify({ at: new Date().toISOString(), name: c.name, text: c.text, raw: c.raw }) + '\n', { flag: 'a' }); } catch (e) { /* ignore */ }
                var guess = readableText(c.text) ? c.text : '';
                return ask('Text of the text layer at ' + cap.fmtTime(c.s, '.').slice(3, 10) + ' (check or type it):', true, guess).then(function (v) {
                    if (v) list.push(Object.assign({}, c, { text: v }));
                    return list;
                });
            });
        }, Promise.resolve([]));
    }
    // Your own MOGRT on the selected clips: each caption / text clip is replaced by the MOGRT with the same text and timing
    function applyMogrtToSelection(s) {
        if (!s.mogrt || !fs.existsSync(s.mogrt)) { toast('The MOGRT file of this style is missing. Import it again.', true); return; }
        refreshSeq().then(function () { return cep.host('readSelection'); }).then(function (sel) {
            return confirmTexts(sel.texts || [], sel.project).then(function (texts) { return { clips: sel.clips, texts: texts }; });
        }).then(function (sel) {
            var list = (sel.clips || []).map(function (c) {
                var t = (textOf(c.params['Caption Text']) + ' ' + textOf(c.params['Emphasis Text'])).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
                return { track: c.track, ticks: c.ticks, node: c.node, text: t };
            }).concat((sel.texts || []).map(function (c) { return { track: c.track, ticks: c.ticks, node: c.node, text: c.text }; }));
            if (!list.length) throw new Error('Select caption or text clips in the timeline first.');
            var conv = list.map(function (c) { return { track: c.track, ticks: c.ticks, node: c.node, params: sty.mogrtParams(s, c.text) }; });
            return cep.host('convertClips', { mogrt: s.mogrt, clips: conv });
        }).then(function (r) {
            toast(s.name + ' put on ' + r.done + ' clip' + (r.done === 1 ? '' : 's') + (r.errs && r.errs.length ? ' (' + r.errs.length + ' warnings)' : ''), !r.done);
            if (r.errs && r.errs.length) console.warn('Bunnys Caption:', r.errs);
        }).catch(function (e) { toast(e.message, true); });
    }
    // controls added in a later template version: a clip without them is rebuilt when the style uses them
    var NEW_PARAMS = ['Bold', 'Italic', 'Emphasis Bold', 'Emphasis Italic', 'All Caps', 'Small Caps', 'Glow Over'];
    function newNeeds(p) {
        return NEW_PARAMS.filter(function (k) { var v = p[k]; return v && (v.b === true || (v.n !== undefined && v.n > 0)); });
    }
    // withMotion: also position and size (Customize, where they are part of the style being edited)
    function applyStyleToSelection(s, withMotion) {
        if (s.type === 'mogrt') { applyMogrtToSelection(s); return; }
        // text layers keep the words exactly as typed (no case or punctuation changes)
        var r = Object.assign(rules(), { textCase: 'as', punct: 'keep' });
        if (s.chunk) r.maxChars = s.chunk.maxChars;
        refreshSeq().then(function () { return cep.host('readSelection'); }).then(function (sel) {
            return confirmTexts(sel.texts || [], sel.project).then(function (texts) { return { clips: sel.clips, texts: texts }; });
        }).then(function (sel) {
            var clips = sel.clips, texts = sel.texts || [];
            if (!clips.length && !texts.length) throw new Error('Select caption or text clips in the timeline first.');
            var params = sty.toParams(s);
            // plain text layers (Premiere text, other templates): replaced by a styled caption with the same text and timing
            var conv = texts.map(function (c) {
                var toks = c.text.split(/\s+/).filter(Boolean), dur = Math.max(0.1, c.e - c.s);
                var ws = toks.map(function (t, i) { return { t: t, s: c.s + dur * i / toks.length, e: c.s + dur * (i + 1) / toks.length, k: false }; });
                var cc = { w: ws.map(function (_, i) { return i; }), s: c.s, e: c.e };
                cap.autoKeywords(ws, [cc], r.keys === 'off' ? 'normal' : r.keys);
                var l = cap.layout(cc, ws, s, r);
                var native = tl.scriptOf(l.text) !== 'latin';
                var p = clone(params);
                var fm = native ? settings.indicFont : s.font, fp = native ? settings.indicFont : (s.punchFont || s.font);
                p['Caption Text'] = { t: l.main, f: fm };
                p['Emphasis Text'] = { t: l.punch, f: fp };
                p['Caption Font'] = { t: fm };
                p['Emphasis Font'] = { t: fp };
                p['Timing Data'] = { t: cap.dataString(cc, l.order, ws) };
                return { track: c.track, ticks: c.ticks, node: c.node, params: p, motion: motionFor(s) };
            });
            var first = conv.length ? cep.host('convertClips', { mogrt: sty.isPro(s) ? TEMPLATE_PRO : TEMPLATE, clips: conv }) : Promise.resolve({ done: 0 });
            return first.then(function (cr) {
                if (cr.done) toast('Turned ' + cr.done + ' text layer' + (cr.done > 1 ? 's' : '') + ' into captions');
                return clips;
            });
        }).then(function (clips) {
            if (!clips.length) return 0;
            var params = sty.toParams(s);
            // only the look changes: text, word timing and position stay exactly as they are
            var out = clips.map(function (c) {
                var p = clone(params);
                var txt = textOf(c.params['Caption Text']) + ' ' + textOf(c.params['Emphasis Text']);
                var native = tl.scriptOf(txt) !== 'latin';
                p['Caption Font'] = { t: native ? settings.indicFont : s.font };
                p['Emphasis Font'] = { t: native ? settings.indicFont : (s.punchFont || s.font) };
                var o = { track: c.track, ticks: c.ticks, node: c.node, params: p, pro: sty.isPro(s), needs: newNeeds(p) };
                if (withMotion && seq) o.motion = motionFor(s);
                return o;
            });
            return batchUpdate(out, 'Styled');
        }).then(function (n) { if (n) toast(s.name + ' applied to ' + n + ' clips'); }).catch(function (e) { toast(e.message, true); });
    }
    $('#btnApplySel').onclick = function () { applyStyleToSelection(currentStyle()); };

    // ---------- Edit tab: Lyrics clips (text, line colours, speed, glow, light sweep, shadow, opacity) ----------
    var txLines = 0;
    var TX_ORDER = ['Speed', 'Custom Colors', 'Line 1 Color', 'Line 2 Color', 'Line 3 Color', 'Glow', 'Glow Color', 'Light Sweep', 'Sweep Color', 'Shadow', 'Shadow Color', 'Opacity'];
    function txSend(params, lines) {
        return cep.host('lyricsSet', { params: params, lines: lines || null }).then(function (r) {
            if (!r.done) toast('Select Lyrics caption clips in the timeline first.', true);
            if (r.errs && r.errs.length) console.warn('Bunnys Caption:', r.errs);
            return r;
        }).catch(function (e) { toast(e.message, true); });
    }
    function txRender(vals) {
        var box = $('#txCtl'), h = '<h5>Look</h5>';
        TX_ORDER.forEach(function (nm) {
            var v = vals[nm];
            if (!v) return;
            if (v.c) h += '<div class="colors"><label>' + esc(nm) + '<input type="color" data-tx="' + esc(nm) + '" value="' + sty.rgbToHex(v.c) + '"></label></div>';
            else if (v.b !== undefined) h += '<label class="check small"><input type="checkbox" data-tx="' + esc(nm) + '"' + (v.b ? ' checked' : '') + '> ' + esc(nm) + '</label>';
            else if (v.n !== undefined) h += '<div class="row"><label>' + esc(nm === 'Speed' ? 'Speed (50 = original)' : nm) + '</label><input type="range" data-tx="' + esc(nm) +
                '" min="0" max="100" step="1" value="' + v.n + '"><output>' + Math.round(v.n) + '</output></div>';
        });
        box.innerHTML = h;
        cpick.decorate(box);
        $$('[data-tx]', box).forEach(function (el) {
            var nm = el.dataset.tx;
            if (el.type === 'range') el.oninput = function () { el.nextElementSibling.textContent = el.value; };
            el.onchange = function () {
                var p = {};
                if (el.type === 'checkbox') p[nm] = { b: el.checked };
                else if (el.type === 'range') p[nm] = { n: +el.value };
                else {
                    p[nm] = { c: sty.hexToRgb(el.value) };
                    // a line colour only shows with Custom Colors on
                    var cc = $('[data-tx="Custom Colors"]', box);
                    if (/^Line \d Color$/.test(nm) && cc && !cc.checked) { cc.checked = true; p['Custom Colors'] = { b: true }; }
                }
                txSend(p);
            };
        });
    }
    $('#txLoad').onclick = function () {
        refreshSeq().then(function () { return cep.host('lyricsRead'); }).then(function (r) {
            if (!r.count) { $('#txBody').classList.add('hidden'); $('#txInfo').textContent = ''; toast('Select Lyrics caption clips in the timeline first.', true); return; }
            txLines = r.first.lines;
            $('#txInfo').textContent = r.count + ' Lyrics clip' + (r.count > 1 ? 's' : '') + ' selected';
            $('#txText').value = r.first.text;
            $('#txBody').classList.remove('hidden');
            txRender(r.first.values);
        }).catch(function (e) { toast(e.message, true); });
    };
    $('#txTextApply').onclick = function () {
        cep.host('lyricsRead').then(function (r) {
            if (r.count !== 1) { toast('Select exactly one Lyrics clip to change its text.', true); return; }
            var L = [];
            for (var i = 1; i <= r.first.lines; i++) L.push('Line ' + i);
            return txSend({}, sty.splitLines({ mogrtLines: L }, $('#txText').value)).then(function (x) { if (x && x.done) toast('Text changed'); });
        }).catch(function (e) { toast(e.message, true); });
    };

    // A Premiere text layer: its font (and fill colour when set) are read from the saved project file.
    // Size, outline and shadow live in a binary block that only stores non-default values, so those come from the current style.
    function captureText(t, projectPath) {
        return cep.host('saveProject').then(function (r) { return r.path || projectPath; }, function () { return projectPath; }).then(function (pp) {
            var st = projtext.styleOf(pp, t.node) || {};
            var base = currentStyle().type === 'mogrt' ? sty.DEFAULT : currentStyle();
            editStyle = clone(base);
            if (st.font) applyFontTo(editStyle, 'main', st.font);
            if (st.color && st.color !== '#000000') { editStyle.text = st.color; editStyle.fill = 'solid'; }
            editStyle.layout = 'single'; editStyle.textCase = 'as';
            editStyle.name = 'Captured ' + new Date().toLocaleDateString();
            editStyle.builtin = false; delete editStyle.file; editStyle.id = ''; delete editStyle.type; delete editStyle.mogrt;
            editStyle.tags = ['captured'];
            keepOnce = true;
            gotoTab('custom');
            toast('Captured the font' + (st.color && st.color !== '#000000' ? ' and colour' : '') + ' of the text layer' + (st.font ? ' (' + st.font + ')' : '') +
                '. Set the rest here, then "Save as new". For a full capture, tweak a Bunnys caption clip instead.');
        });
    }
    $('#btnCapture').onclick = function () {
        refreshSeq().then(function () { return cep.host('readSelection'); }).then(function (sel) {
            if (!sel.clips.length && sel.texts && sel.texts.length) return captureText(sel.texts[0], sel.project).then(function () { return null; });
            if (!sel.clips.length) throw new Error('Select a caption or text clip in the timeline first.');
            return sel.clips;
        }).then(function (clips) {
            if (!clips) return;
            var c = clips[0];
            editStyle = sty.fromParams(currentStyle().type === 'mogrt' ? sty.DEFAULT : currentStyle(), c.params, c.motion, seq);
            editStyle.name = 'Captured ' + new Date().toLocaleDateString();
            editStyle.builtin = false; delete editStyle.file; editStyle.id = '';
            editStyle.layout = textOf(c.params['Emphasis Text']).trim() ? 'duo' : 'single';
            editStyle.tags = ['captured'];
            keepOnce = true;
            gotoTab('custom');
            toast('Captured. Name it and press "Save as new preset".');
        }).catch(function (e) { toast(e.message, true); });
    };

    // ---------- Generate step 4: options that override the style for these captions ----------
    var genOpt = Object.assign({ font: '', punchFont: '', anim: '', hl: '', box: '', scale: 0, posY: 0 }, settings.genOpt || {});
    function saveGen() { settings.genOpt = genOpt; saveSettings(); renderCurStyle(); }
    function effectiveStyle() {
        var s = clone(currentStyle());
        if (genOpt.font) applyFontTo(s, 'main', genOpt.font);
        if (genOpt.punchFont) applyFontTo(s, 'punch', genOpt.punchFont);
        if (genOpt.anim) s.anim = genOpt.anim;
        if (genOpt.hl) s.hlMode = genOpt.hl;
        if (genOpt.box) s.box = genOpt.box;
        if (genOpt.scale) s.scale = genOpt.scale;
        if (genOpt.posY) s.posY = genOpt.posY / 100;
        return s;
    }
    var gFontP = fp.create($('#gFont'), { allowEmpty: true, emptyLabel: 'Style font', onChange: function (ps) { genOpt.font = ps; saveGen(); } });
    var gPunchFontP = fp.create($('#gPunchFont'), { allowEmpty: true, emptyLabel: 'Style font', onChange: function (ps) { genOpt.punchFont = ps; saveGen(); } });
    function syncGen() {
        var s = currentStyle();
        gFontP.set(genOpt.font); gPunchFontP.set(genOpt.punchFont);
        $('#gAnim').value = genOpt.anim; $('#gHl').value = genOpt.hl; $('#gBox').value = genOpt.box;
        bindRange($('#gScale'), function () { return genOpt.scale || s.scale; }, function (v) { genOpt.scale = v; saveGen(); });
        bindRange($('#gPosY'), function () { return genOpt.posY || Math.round(s.posY * 100); }, function (v) { genOpt.posY = v; saveGen(); });
    }
    $('#gAnim').onchange = function () { genOpt.anim = this.value; saveGen(); };
    $('#gHl').onchange = function () { genOpt.hl = this.value; saveGen(); };
    $('#gBox').onchange = function () { genOpt.box = this.value; saveGen(); };
    $('#gReset').onclick = function (e) { e.preventDefault(); genOpt = { font: '', punchFont: '', anim: '', hl: '', box: '', scale: 0, posY: 0 }; saveGen(); syncGen(); toast('Using the style as it is'); };

    // ---------- Edit tab: quick changes on the selected clips (look only, text untouched) ----------
    var qPending = {}, qMotion = null, qLabel = '', qTimer = 0;
    function quickApply(params, label, motion) {
        Object.assign(qPending, params || {});
        if (motion) qMotion = Object.assign(qMotion || {}, motion);
        qLabel = label || qLabel;
        clearTimeout(qTimer);
        // changes are batched so scrolling through fonts or dragging a slider stays smooth
        qTimer = setTimeout(function () {
            var p = qPending, m = qMotion, l = qLabel;
            qPending = {}; qMotion = null; qLabel = '';
            cep.host('applyToSelection', { params: p, motion: m }).then(function (r) {
                if (!r.done) toast('Select Bunnys caption clips in the timeline first.', true);
                else if (r.outdated) {
                    pushUndo({ label: l || 'Change', undo: r.undo });
                    toast(r.outdated + ' clip' + (r.outdated > 1 ? 's were' : ' was') + ' made with an older template and cannot take this. Use Styles > "Apply to selected clips" on them once to update them.', true);
                } else {
                    pushUndo({ label: l || 'Change', undo: r.undo });
                    if (l) toast(l + ' on ' + r.done + ' clip' + (r.done > 1 ? 's' : '') + '  (Ctrl+Z to undo)');
                }
            }).catch(function (e) { toast(e.message, true); });
        }, 120);
    }
    function fontName(ps) { var f = fontByPs(ps); return f ? f.family + ' ' + f.style : ps; }
    fp.create($('#qFont'), { emptyLabel: 'Pick a font', onChange: function (ps) { quickApply({ 'Caption Font': { t: ps } }, fontName(ps)); } });
    fp.create($('#qPunchFont'), { emptyLabel: 'Pick a font', onChange: function (ps) { quickApply({ 'Emphasis Font': { t: ps } }, fontName(ps)); } });
    $('#qAnim').onchange = function () { if (this.value) quickApply({ 'Animation': { d: sty.ANIM[this.value] } }, 'Animation set'); };
    $('#qHl').onchange = function () { if (this.value) quickApply({ 'Highlight Mode': { d: sty.HL[this.value] } }, 'Highlight set'); };
    $('#qBox').onchange = function () { if (this.value) quickApply({ 'Box Mode': { d: sty.BOX[this.value] } }, 'Box set'); };
    // Fill on the selected clips: solid turns the gradient off; gradient needs the Pro template, so light clips are
    // swapped (undoable). The gradient settings start from the current style.
    var qg = null, qgTimer = 0;
    function qgState() {
        if (!qg) { var c = currentStyle(); qg = { gradStops: sty.gradStops(c).slice(), gradType: c.gradType || 'linear', gradAngle: c.gradAngle === undefined ? 90 : c.gradAngle, gradTarget: c.gradTarget || 'all' }; }
        return qg;
    }
    function qgParams() {
        var o = Object.assign(clone(sty.DEFAULT), qgState(), { fill: 'gradient', gradient: 100, emphGradient: 100, layout: 'duo' });
        var all = sty.toParams(o), out = {};
        ['Gradient', 'Emphasis Gradient', 'Gradient Top', 'Gradient Mid 1', 'Gradient Mid 2', 'Gradient Mid 3', 'Gradient Bottom', 'Gradient Type', 'Gradient Angle', 'Gradient Target']
            .forEach(function (k) { out[k] = all[k]; });
        return out;
    }
    function qgApply() {
        clearTimeout(qgTimer);
        qgTimer = setTimeout(function () {
            var params = qgParams();
            refreshSeq().then(function () { return cep.host('readSelection', { only: ['Timing Data'] }); }).then(function (r) {
                if (!r.clips.length) throw new Error('Select Bunnys caption clips in the timeline first.');
                return batchUpdate(r.clips.map(function (c) { return { track: c.track, ticks: c.ticks, node: c.node, params: params, pro: true }; }), 'Gradient');
            }).then(function (n) { if (n) toast('Gradient on ' + n + ' clip' + (n > 1 ? 's' : '') + '  (Ctrl+Z to undo)'); }).catch(function (e) { toast(e.message, true); });
        }, 250);
    }
    var renderQg = gradEditor('qg', qgState, function () { }, function () { if ($('#qFill').value === 'gradient') qgApply(); });
    $('#qgTarget').onchange = function () { qgState().gradTarget = this.value; if ($('#qFill').value === 'gradient') qgApply(); };
    $('#qFill').onchange = function () {
        var v = this.value;
        $('#qGrad').classList.toggle('hidden', v !== 'gradient');
        if (v === 'gradient') { renderQg(); $('#qgTarget').value = qgState().gradTarget; qgApply(); }
        else if (v === 'solid') quickApply({ 'Gradient': { n: 0 }, 'Emphasis Gradient': { n: 0 } }, 'Solid colour');
    };
    $$('[data-qc]').forEach(function (el) {
        // sent when the colour is chosen (dragging in the picker only previews)
        el.onchange = function () { var p = {}; p[el.dataset.qc] = { c: sty.hexToRgb(el.value) }; quickApply(p, el.dataset.qc); };
    });
    $$('[data-qn]').forEach(function (el) {
        bindRange(el, function () { return +el.value; }, function (v) { var p = {}; p[el.dataset.qn] = { n: v }; quickApply(p, el.dataset.qn); }, null, true);
    });
    $$('[data-qb]').forEach(function (el) {
        el.onchange = function () {
            if (el.value === '') return;
            var p = {}, on = el.value === '1';
            el.dataset.qb.split(',').forEach(function (n) { p[n] = { b: on }; });
            quickApply(p, el.title || el.dataset.qb.split(',')[0] + (on ? ' on' : ' off'));
            el.value = '';
        };
    });
    bindRange($('#qScale'), function () { return 100; }, function (v) {
        if (seq) quickApply(null, 'Size', { scale: Math.round(sty.baseScale(seq.w, seq.h) * v / 10) / 10 });
    }, null, true);
    bindRange($('#qPosY'), function () { return 74; }, function (v) { quickApply(null, 'Position', { pos: [0.5, v / 100] }); }, null, true);

    // ---------- Edit tab: full text / word / timing editor ----------
    var selClips = [];
    function toks(t) { return String(t || '').split(/\s+/).filter(Boolean); }
    var EDIT_PARAMS = ['Caption Text', 'Emphasis Text', 'Timing Data', 'Highlight Mode', 'Emphasis Color', 'Text Color'];
    $('#btnLoadSel').onclick = function () {
        refreshSeq().then(function () { return readSel(EDIT_PARAMS); }).then(function (clips) {
            selClips = clips.map(function (c) {
                var main = textOf(c.params['Caption Text']), punch = textOf(c.params['Emphasis Text']), data = textOf(c.params['Timing Data']);
                var words = cap.wordsFromClip(main, punch, data, c.s);
                return { clip: c, main: main.replace(/\r/g, '\n'), punch: punch.replace(/\r/g, '\n'), dur: Math.round((c.e - c.s) * 100) / 100,
                    words: words, origTimes: words.map(function (w) { return [w.s, w.e]; }) };
            });
            renderSel();
            toast(selClips.length + ' caption' + (selClips.length > 1 ? 's' : '') + ' loaded');
        }).catch(function (e) { toast(e.message, true); });
    };
    function chipsHtml(sc, ci) {
        return sc.words.map(function (w, wi) { return '<span class="w' + (w.k ? ' k' : '') + '" data-c="' + ci + '" data-w="' + wi + '">' + esc(w.t) + '</span>'; }).join('');
    }
    function renderSel() {
        var list = $('#selList');
        if (!selClips.length) { list.innerHTML = '<div class="empty">Nothing loaded.</div>'; return; }
        list.innerHTML = selClips.map(function (sc, ci) {
            return '<div class="ed" data-c="' + ci + '"><div class="edh"><span>' + cap.fmtTime(sc.clip.s, '.').slice(3, 10) + '</span>' +
                '<label>On screen (s) <input type="number" class="edDur" min="0.2" step="0.1" value="' + sc.dur + '"></label></div>' +
                '<textarea class="edMain" rows="2" placeholder="Caption text">' + esc(sc.main) + '</textarea>' +
                '<textarea class="edPunch" rows="1" placeholder="Second line in the emphasis look (optional)">' + esc(sc.punch) + '</textarea>' +
                '<div class="ws">' + chipsHtml(sc, ci) + '</div></div>';
        }).join('');
    }
    // text edited: rebuild the word list, keeping highlights of words that stayed the same
    function syncWords(ci) {
        var sc = selClips[ci], box = $('.ed[data-c="' + ci + '"]');
        sc.main = $('.edMain', box).value;
        sc.punch = $('.edPunch', box).value;
        var old = sc.words, all = toks(sc.main).concat(toks(sc.punch));
        sc.words = all.map(function (t, i) { return { t: t, k: old[i] && old[i].t === t ? old[i].k : false }; });
        $('.ws', box).innerHTML = chipsHtml(sc, ci);
    }
    $('#selList').addEventListener('input', function (e) {
        var box = e.target.closest('.ed');
        if (!box) return;
        var ci = +box.dataset.c;
        selClips[ci].dirty = true;
        if (e.target.classList.contains('edDur')) { selClips[ci].dur = Math.max(0.2, parseFloat(e.target.value) || selClips[ci].dur); return; }
        syncWords(ci);
    });
    $('#selList').addEventListener('click', function (e) {
        var el = e.target.closest('.w');
        if (!el) return;
        var w = selClips[+el.dataset.c].words[+el.dataset.w];
        selClips[+el.dataset.c].dirty = true;
        w.k = !w.k;
        el.classList.toggle('k', w.k);
    });
    $('#btnSaveSel').onclick = function () {
        if (!selClips.length) { toast('Load selected clips first', true); return; }
        // only clips that were edited go to Premiere
        var edited = selClips.filter(function (sc) { return sc.dirty; });
        if (!edited.length) { toast('Nothing changed'); return; }
        var out = edited.map(function (sc) {
            var n = sc.words.length, dur = sc.dur, origDur = sc.clip.e - sc.clip.s;
            // same number of words: keep the spoken timing (scaled to a new length); otherwise spread evenly
            var times = sc.words.map(function (w, i) {
                if (n === sc.origTimes.length) {
                    var k = dur / origDur;
                    return [(sc.origTimes[i][0] - sc.clip.s) * k, (sc.origTimes[i][1] - sc.clip.s) * k];
                }
                return [dur * i / n, dur * (i + 1) / n];
            });
            var data = sc.words.map(function (w) { return w.k ? '1' : '0'; }).join('') + '#' + dur.toFixed(2) + '#' +
                times.map(function (t) { return Math.max(0, t[0]).toFixed(2) + ',' + Math.max(0, t[1]).toFixed(2); }).join('|');
            var c = {
                track: sc.clip.track, ticks: sc.clip.ticks, node: sc.clip.node, params: {
                    'Caption Text': { t: sc.main.replace(/\r?\n/g, '\r') },
                    'Emphasis Text': { t: sc.punch.replace(/\r?\n/g, '\r') },
                    'Timing Data': { t: data }
                }
            };
            // words were picked for highlight: make sure the clip highlights picked words
            var P = sc.clip.params, hm = P['Highlight Mode'] && P['Highlight Mode'].d;
            if (sc.words.some(function (w) { return w.k; }) && hm !== sty.HL.keywords && hm !== sty.HL.keywordsSpoken) {
                c.params['Highlight Mode'] = { d: sty.HL.keywords };
                // the style had no highlight of its own: highlighted words get the style's emphasis look, not a default yellow
                if (hm === sty.HL.off) {
                    var ec = P['Emphasis Color'] && P['Emphasis Color'].c, tc = P['Text Color'] && P['Text Color'].c;
                    if (ec && (!tc || ec.join() !== tc.join())) c.params['Highlight Color'] = { c: ec };
                }
            }
            if (Math.abs(dur - origDur) > 0.01) c.end = sc.clip.s + dur;
            sc.newTimes = times.map(function (t) { return [sc.clip.s + Math.max(0, t[0]), sc.clip.s + Math.max(0, t[1])]; });
            return c;
        });
        batchUpdate(out, 'Updated').then(function (n) {
            toast('Updated ' + n + ' clip' + (n > 1 ? 's' : '') + '  (Ctrl+Z to undo)');
            // the clips now hold the saved text and timing: no need to read them back from Premiere
            edited.forEach(function (sc) { sc.clip.e = sc.clip.s + sc.dur; sc.origTimes = sc.newTimes; sc.dirty = false; });
        }).catch(function (e) { toast(e.message, true); });
    };

    // ---------------- customize ----------------
    function loadFonts() {
        if (fontsList) return;
        fontsList = [];
        setTimeout(function () {
            try { fontsList = mod('fonts.js').scan(path.join(DIRS.root, 'fonts-cache.json')); } catch (e) { fontsList = []; }
            fp.setFonts(fontsList);
            renderCurStyle();
        }, 30);
    }
    function fontByLabel(label) {
        if (!fontsList) return null;
        label = String(label || '').trim().toLowerCase();
        for (var i = 0; i < fontsList.length; i++) {
            var f = fontsList[i];
            if ((f.family + ' ' + f.style).toLowerCase() === label || f.ps.toLowerCase() === label) return f;
        }
        return null;
    }
    function fontByPs(ps) { for (var i = 0; i < (fontsList || []).length; i++) if (fontsList[i].ps === ps) return fontsList[i]; return null; }
    function weightOf(style) {
        var s = style.toLowerCase();
        var map = [['thin', 100], ['hairline', 100], ['extralight', 200], ['ultralight', 200], ['light', 300], ['medium', 500], ['semibold', 600], ['demibold', 600],
            ['extrabold', 800], ['ultrabold', 800], ['heavy', 900], ['black', 900], ['bold', 700]];
        var c = s.replace(/[\s-]/g, '');
        for (var i = 0; i < map.length; i++) if (c.indexOf(map[i][0]) >= 0) return map[i][1];
        return 400;
    }
    // copy a font (by PostScript name) into a style, including what the preview needs
    function applyFontTo(s, which, ps) {
        var f = fontByPs(ps);
        if (which === 'punch' && !ps) { s.punchFont = ''; s.punchCss = ''; return; }
        if (!f) { if (which === 'main') s.font = ps; else s.punchFont = ps; return; }
        var it = /italic|oblique/i.test(f.style);
        if (which === 'main') { s.font = f.ps; s.css = f.family; s.weight = weightOf(f.style); s.italic = it; }
        else { s.punchFont = f.ps; s.punchCss = f.family; s.punchWeight = weightOf(f.style); s.punchItalic = it; }
    }
    fp.setFavStore(function () { return settings.favFonts || []; }, function (list) { settings.favFonts = list; saveSettings(); });
    var eFontP = fp.create($('#eFont'), { onChange: function (ps) { editDirty = true; applyFontTo(editStyle, 'main', ps); drawEditPreview(); } });
    var ePunchFontP = fp.create($('#ePunchFont'), { allowEmpty: true, emptyLabel: 'Same as caption font',
        onChange: function (ps) { editDirty = true; applyFontTo(editStyle, 'punch', ps); drawEditPreview(); } });
    function syncFontInputs() {
        if (!editStyle) return;
        eFontP.set(editStyle.font);
        ePunchFontP.set(editStyle.punchFont || '');
    }

    // ---------- multi-colour gradient editor (Customize and Edit tab) ----------
    // pre: id prefix ('g' Customize, 'qg' Edit tab); get(): the style object it edits;
    // onLive(): a change is being made (preview); onDone(): a change is finished (Premiere)
    function gradEditor(pre, get, onLive, onDone) {
        function el(n) { return $('#' + pre + n); }
        function setStops(list) {
            var o = get();
            o.gradStops = list.slice(0, 5);
            o.gradTop = list[0]; o.gradBottom = list[list.length - 1];
        }
        function bar() { var o = get(); el('Bar').style.background = sty.gradCss(o, sty.gradStops(o)); }
        function render() {
            var o = get();
            if (!o) return;
            var st = sty.gradStops(o), ang = o.gradAngle === undefined ? 90 : o.gradAngle;
            var kind = o.gradType === 'radial' || o.gradType === 'angular' ? o.gradType : (ang === 90 ? 'vertical' : ang === 0 ? 'horizontal' : 'linear');
            el('Type').value = kind;
            // every direction except radial can be turned (radial is round, turning it changes nothing)
            el('AngleRow').classList.toggle('hidden', kind === 'radial');
            el('AngleRow').querySelector('label').textContent = kind === 'angular' ? 'Rotation' : 'Angle';
            bindRange(el('Angle'), function () { return ang; }, function (v) {
                var o = get();
                o.gradAngle = v;
                if (o.gradType !== 'angular') { o.gradType = 'linear'; el('Type').value = v === 90 ? 'vertical' : v === 0 ? 'horizontal' : 'linear'; }
                bar(); onLive();
            });
            el('Angle').onchange = function () { onDone(); };
            var box = el('Stops');
            box.innerHTML = st.map(function (c, n) {
                return '<label class="grad-stop">Colour ' + (n + 1) + (st.length > 2 ? '<button type="button" class="gdel" data-i="' + n + '" title="Remove this colour">&times;</button>' : '') +
                    '<input type="color" data-gi="' + n + '" value="' + c + '"></label>';
            }).join('');
            cpick.decorate(box);
            $$('input[data-gi]', box).forEach(function (inp) {
                inp.oninput = function () { var l = sty.gradStops(get()).slice(); l[+inp.dataset.gi] = inp.value.toUpperCase(); setStops(l); bar(); onLive(); };
                inp.onchange = function () { inp.oninput(); onDone(); };
            });
            $$('.gdel', box).forEach(function (b) {
                b.onclick = function (e) { e.preventDefault(); var l = sty.gradStops(get()).slice(); l.splice(+b.dataset.i, 1); setStops(l); render(); onLive(); onDone(); };
            });
            el('Add').disabled = st.length >= 5;
            el('Hint').textContent = st.length >= 5 ? 'Up to 5 colours' : st.length + ' of 5 colours';
            bar();
        }
        el('Type').onchange = function () {
            var v = this.value, o = get();
            if (v === 'vertical') { o.gradType = 'linear'; o.gradAngle = 90; }
            else if (v === 'horizontal') { o.gradType = 'linear'; o.gradAngle = 0; }
            else if (v === 'linear') { o.gradType = 'linear'; if (o.gradAngle === 90 || o.gradAngle === 0 || o.gradAngle === undefined) o.gradAngle = 45; }
            else if (v === 'angular') { if (o.gradType !== 'angular') o.gradAngle = 0; o.gradType = 'angular'; }
            else o.gradType = v;
            render(); onLive(); onDone();
        };
        el('Add').onclick = function (e) {
            e.preventDefault();
            var l = sty.gradStops(get()).slice();
            if (l.length >= 5) return;
            // new colour between the last two, so the gradient does not jump
            l.splice(l.length - 1, 0, sty.mix(l[l.length - 2], l[l.length - 1], 0.5));
            setStops(l); render(); onLive(); onDone();
        };
        return render;
    }
    var renderGrad = gradEditor('g', function () { return editStyle; }, function () { editDirty = true; drawEditPreview(); }, function () { liveChange(); });
    function syncSliders() {
        $$('#tab-custom input[type=range][data-k]').forEach(function (el) {
            var k = el.dataset.k, v = getK(k);
            if (v === undefined) return;
            el.value = v;
            var out = el.nextElementSibling;
            if (out && out.tagName === 'OUTPUT') out.textContent = el.dataset.pct ? Math.round(v * 100) : v;
        });
    }

    var prevI = 0, prevTimer = 0, prevFrame = 0;
    // sliders fire many events per frame: draw at most once per frame
    function drawEditPreview() {
        if (!prevFrame) prevFrame = setTimeout(function () { prevFrame = 0; drawEditNow(); }, 16);
    }
    var txPrev = null;
    function drawEditNow() {
        if (!editStyle) return;
        // Lyrics styles: live animated preview with the template controls
        if (editStyle.mogrtLines) {
            if (!txPrev) txPrev = new (mod('txpreview.js').Preview)($('#editPreview'), ROOT);
            if (txPrev.show(editStyle)) { $('#tab-custom').classList.toggle('single', false); return; }
        }
        if (txPrev) { txPrev.stop(); txPrev.key = ''; }
        $('#editPreview').innerHTML = editStyle.type === 'mogrt' ? mogrtThumb(editStyle) : sty.previewHTML(editStyle, SAMPLE, prevI, 26);
        sty.fit($('#editPreview'));
        $('#tab-custom').classList.toggle('single', editStyle.layout === 'single');
    }
    // Customize for your own MOGRT: which text field gets the caption, what the other fields show, its colours / sliders / switches
    function renderMogrtSetup() {
        var box = $('#mogrtSetup'), s = editStyle;
        $('#tab-custom').classList.toggle('is-mogrt', s.type === 'mogrt');
        if (s.type !== 'mogrt') { box.innerHTML = ''; return; }
        sty.prepareMogrt(s);
        s.mogrtValues = s.mogrtValues || {}; s.mogrtOther = s.mogrtOther || {};
        var F = s.mogrtFields || [], texts = F.filter(function (f) { return f.type === 'text'; });
        if (!F.length) { box.innerHTML = '<p class="hint">This MOGRT has no fields Bunnys Caption can fill.</p>'; return; }
        var lines = !!s.mogrtLines;
        var h = lines ? '<h5>Text</h5><p class="hint small">Each caption is split over ' + texts.length + ' line' + (texts.length > 1 ? 's' : '') +
            ' (one word goes on the big line). Change the words of placed clips in the Edit tab.</p>' :
            '<h5>Text</h5><div class="row"><label>Caption goes into</label><select data-m="main">' +
            texts.map(function (f) { return '<option' + (f.name === s.mogrtMain ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('') + '</select></div>';
        texts.forEach(function (f) {
            if (lines || f.name === s.mogrtMain) return;
            var how = s.mogrtOther[f.name] || 'keep';
            h += '<div class="row"><label>' + esc(f.name) + '</label><select data-mo="' + esc(f.name) + '">' +
                [['empty', 'Empty'], ['keep', 'Its own text (' + esc(String(f.value).slice(0, 24)) + ')'], ['same', 'The caption too'], ['custom', 'Type a text']].map(function (o) {
                    return '<option value="' + o[0] + '"' + (o[0] === how ? ' selected' : '') + '>' + o[1] + '</option>';
                }).join('') + '</select></div>' +
                (how === 'custom' ? '<div class="row"><label></label><input type="text" data-mv="' + esc(f.name) + '" value="' + esc(s.mogrtValues[f.name] !== undefined ? s.mogrtValues[f.name] : f.value) + '"></div>' : '');
        });
        var look = F.filter(function (f) { return f.type !== 'text'; });
        if (look.length) h += '<h5>Look</h5>';
        look.forEach(function (f) {
            var v = s.mogrtValues[f.name] !== undefined ? s.mogrtValues[f.name] : f.value;
            if (f.type === 'color') h += '<div class="colors"><label>' + esc(f.name) + '<input type="color" data-mv="' + esc(f.name) + '" value="' + esc(v) + '"></label></div>';
            else if (f.type === 'slider') h += '<div class="row"><label>' + esc(lines && f.name === 'Speed' ? 'Speed (50 = original)' : f.name) + '</label><input type="range" data-mv="' + esc(f.name) + '" min="' + f.min + '" max="' + f.max + '" step="' + ((f.max - f.min) > 50 ? 1 : 0.1) + '" value="' + v + '"><output>' + Math.round(v * 10) / 10 + '</output></div>';
            else if (f.type === 'check') h += '<label class="check small"><input type="checkbox" data-mv="' + esc(f.name) + '"' + (v ? ' checked' : '') + '> ' + esc(f.name) + '</label>';
        });
        h += '<p class="hint small">Used when adding captions and with "Apply to selected". Reset goes back to the saved values.</p>';
        box.innerHTML = h;
        cpick.decorate(box);
        if ($('[data-m="main"]', box)) $('[data-m="main"]', box).onchange = function () { s.mogrtMain = this.value; delete s.mogrtOther[this.value]; editDirty = true; renderMogrtSetup(); };
        $$('[data-mo]', box).forEach(function (el) { el.onchange = function () { s.mogrtOther[el.dataset.mo] = el.value; editDirty = true; renderMogrtSetup(); }; });
        $$('[data-mv]', box).forEach(function (el) {
            function put(ev) {
                var v = el.type === 'checkbox' ? el.checked : (el.type === 'range' ? +el.value : el.value);
                if (el.type === 'color') v = String(v).toUpperCase();
                s.mogrtValues[el.dataset.mv] = v; editDirty = true;
                // a line colour only shows with Custom Colors on: switch it on with the first colour change
                if (lines && /^Line \d Color$/.test(el.dataset.mv) && !s.mogrtValues['Custom Colors']) {
                    s.mogrtValues['Custom Colors'] = true;
                    var cc = $('[data-mv="Custom Colors"]', box); if (cc) cc.checked = true;
                }
                if (lines) { drawEditPreview(); liveLyrics(s, el.type === 'range' && ev && ev.type === 'input'); }
                if (el.type === 'range' && el.nextElementSibling) el.nextElementSibling.textContent = Math.round(v * 10) / 10;
            }
            el.oninput = put; el.onchange = put;
        });
    }
    function getK(k) { var p = k.split('.'); return p.length > 1 ? editStyle[p[0]][p[1]] : editStyle[k]; }
    function setK(k, v) { editDirty = true; var p = k.split('.'); if (p.length > 1) editStyle[p[0]][p[1]] = v; else editStyle[k] = v; }
    var setLayout, setFill;
    function fillView() {
        var g = editStyle.fill === 'gradient';
        $('#fillSolid').classList.toggle('hidden', g);
        $('#fillGrad').classList.toggle('hidden', !g);
    }
    // keepOnce: the caller already put a style in editStyle (Edit button, Capture).
    // Otherwise unsaved edits survive tab switches; a clean editor follows the selected style.
    // resetBase: the style as it was when it came into the editor (or was last saved): what Reset goes back to
    var editDirty = false, keepOnce = false, resetBase = null;
    function openEditor() {
        var keep = keepOnce;
        keepOnce = false;
        if (keep) { editDirty = !editStyle.id; resetBase = clone(editStyle); }
        else if (!editStyle || (!editDirty && editStyle.id !== settings.styleId)) { editStyle = clone(currentStyle()); editDirty = false; resetBase = clone(editStyle); }
        if (!resetBase) resetBase = clone(editStyle);
        if (!editStyle.chunk) editStyle.chunk = clone(sty.DEFAULT.chunk);
        // styles saved before a setting existed get its default (not a random slider position)
        Object.keys(sty.DEFAULT).forEach(function (k) { if (editStyle[k] === undefined) editStyle[k] = clone(sty.DEFAULT[k]); });
        if (!editStyle.fill) editStyle.fill = sty.fillOf(editStyle);
        loadFonts();
        $('#eName').value = editStyle.name || '';
        $('#eName').oninput = function () { editStyle.name = this.value; editDirty = true; };
        if (!setLayout) setLayout = seg('#eLayout', editStyle.layout, function (v) { editStyle.layout = v; editDirty = true; drawEditPreview(); });
        else setLayout(editStyle.layout);
        $$('#tab-custom [data-k]').forEach(function (el) {
            var k = el.dataset.k;
            if (el.type === 'range') {
                bindRange(el, function () { return getK(k); }, function (v) { setK(k, v); drawEditPreview(); },
                    el.dataset.pct ? function (v) { return Math.round(v * 100); } : null);
                // Live: sent to Premiere when the slider is let go
                el.onchange = liveChange;
            } else if (el.type === 'checkbox') {
                el.checked = !!getK(k);
                el.onchange = function () { setK(k, el.checked); drawEditPreview(); liveChange(); };
            } else {
                el.value = getK(k);
                el.oninput = function () { setK(k, el.value); drawEditPreview(); };
                el.onchange = function () { setK(k, el.value); drawEditPreview(); liveChange(); };
            }
        });
        liveSent = sty.toParams(editStyle);
        liveMotion = seq ? JSON.stringify(motionFor(editStyle)) : null;
        renderGrad();
        if (!setFill) setFill = seg('#eFill', editStyle.fill, function (v) {
            editStyle.fill = v; editDirty = true;
            // switching to a gradient with both strengths at 0 would show nothing
            if (v === 'gradient' && !(editStyle.gradient > 0) && !(editStyle.emphGradient > 0)) { editStyle.gradient = 100; editStyle.emphGradient = 100; syncSliders(); }
            fillView(); drawEditPreview(); liveChange();
        });
        else setFill(editStyle.fill);
        fillView();
        syncFontInputs();
        renderMogrtSetup();
        drawEditPreview();
        clearInterval(prevTimer);
        prevTimer = setInterval(function () {
            if (document.hidden || !$('#tab-custom').classList.contains('on')) return;
            prevI = (prevI + 1) % 4;
            drawEditPreview();
        }, 600);
    }
    $('#btnSaveNew').onclick = function () {
        ask('Preset name', true, editStyle.name && !/^Captured/.test(editStyle.name) ? editStyle.name + ' copy' : 'My style').then(function (name) {
            if (!name) return;
            editStyle.name = name;
            var s = store.save(editStyle, true);
            editStyle = clone(s);
            editDirty = false; resetBase = clone(s);
            loadStyles(); renderTags(); renderGrid(); selectStyle(s.id);
            $('#eName').value = name;
            toast('Saved "' + name + '". It is now in Styles > mine.');
        });
    };
    $('#btnSave').onclick = function () {
        if (editStyle.builtin || !editStyle.file) { $('#btnSaveNew').click(); return; }
        var s = store.save(editStyle);
        editStyle = clone(s);
        editDirty = false; resetBase = clone(s);
        loadStyles(); renderGrid(); selectStyle(s.id);
        toast('Saved');
    };
    $('#btnUseEdit').onclick = function () {
        if (editStyle.builtin && JSON.stringify(editStyle) === JSON.stringify(styleById(editStyle.id))) { selectStyle(editStyle.id); gotoTab('generate'); return; }
        // unsaved edits are kept as a session style until saved
        var tmp = clone(editStyle);
        tmp.id = 'session'; tmp.name = (editStyle.name || 'Custom') + ' (unsaved)'; tmp.builtin = true; tmp.tags = ['mine'];
        styles = styles.filter(function (x) { return x.id !== 'session'; });
        styles.unshift(tmp);
        selectStyle('session');
        gotoTab('generate');
    };
    $('#btnApplyEdit').onclick = function () { applyStyleToSelection(editStyle, true); };
    // Reset: back to the style as it was saved (built-in styles: as shipped)
    $('#btnResetStyle').onclick = function () {
        var base = resetBase || (editStyle && editStyle.id ? styleById(editStyle.id) : null) || currentStyle();
        // what Live last sent to the clips: kept, so the clips are put back too
        var sent = liveSent, moved = liveMotion;
        editStyle = clone(base);
        keepOnce = true;
        openEditor();
        editDirty = false;
        liveSent = sent; liveMotion = moved;
        liveChange();
        toast('Back to "' + (base.name || 'style') + '"' + (settings.liveEdit ? '' : '. Press "Apply to selected" to put it on the clips.'));
    };
    // Live on selected: only the parameters that changed are sent. A premium effect on clips made from the
    // light template needs the full apply (it swaps them to the Pro template).
    var liveSent = null, liveTimer = 0, liveMotion = null;
    var PREMIUM = { 'Gradient': 1, 'Emphasis Gradient': 1, 'Gradient Top': 1, 'Gradient Bottom': 1, 'Gradient Mid 1': 1, 'Gradient Mid 2': 1,
        'Gradient Mid 3': 1, 'Gradient Type': 1, 'Gradient Angle': 1, 'Gradient Target': 1, 'Inner Glow Size': 1, 'Inner Glow Choke': 1,
        'Inner Shadow Color': 1, 'Inner Shadow Distance': 1, 'Inner Shadow Angle': 1, 'Inner Shadow Size': 1, 'Sweep Color': 1, 'Sweep Width': 1,
        'Sweep Angle': 1, 'Sweep Speed': 1, 'Deep Glow': 1, 'Deep Glow Radius': 1, 'Deep Glow Color': 1, 'Bevel': 1, 'Inner Glow': 1, 'Inner Glow Color': 1,
        'Inner Shadow': 1, 'Depth': 1, 'Depth Color': 1, 'Light Sweep': 1, 'Ghost': 1 };
    $('#liveEdit').checked = !!settings.liveEdit;
    $('#liveEdit').onchange = function () {
        settings.liveEdit = this.checked; saveSettings();
        if (this.checked) { liveSent = sty.toParams(editStyle); liveMotion = seq ? JSON.stringify(motionFor(editStyle)) : null; }
    };
    // Live for Lyrics styles: the look controls that changed go straight to the selected Lyrics clips.
    // Slider drags are sent when the slider is let go (each write re-renders the graphic in Premiere).
    var txLiveSent = null, txLiveTimer = 0;
    function liveLyrics(s, dragging) {
        if (!settings.liveEdit || dragging) return;
        clearTimeout(txLiveTimer);
        txLiveTimer = setTimeout(function () {
            var now = sty.mogrtParams(s), diff = {}, any = false;
            Object.keys(now).forEach(function (k) {
                if (txLiveSent && JSON.stringify(txLiveSent[k]) === JSON.stringify(now[k])) return;
                diff[k] = now[k]; any = true;
            });
            txLiveSent = now;
            if (!any) return;
            cep.host('lyricsSet', { params: diff }).then(function (r) {
                if (!r.done) toast('Live: select Lyrics clips in the timeline to see changes there.', true);
            }).catch(function (e) { toast(e.message, true); });
        }, 120);
    }
    function liveChange() {
        if (editStyle && editStyle.mogrtLines) { txLiveSent = null; liveLyrics(editStyle); return; }
        if (!settings.liveEdit || !editStyle || editStyle.type === 'mogrt') return;
        clearTimeout(liveTimer);
        liveTimer = setTimeout(function () {
            var now = sty.toParams(editStyle), diff = {}, premium = false, any = false;
            Object.keys(now).forEach(function (k) {
                if (liveSent && JSON.stringify(liveSent[k]) === JSON.stringify(now[k])) return;
                diff[k] = now[k]; any = true;
                if (PREMIUM[k]) premium = true;
            });
            liveSent = now;
            // position / size are not template parameters: compared on their own
            var mo = seq ? motionFor(editStyle) : null, moKey = JSON.stringify(mo), moved = liveMotion !== null && moKey !== liveMotion;
            liveMotion = moKey;
            if (!any && !moved) return;
            if ((premium && sty.isPro(editStyle)) || newNeeds(diff).length) applyStyleToSelection(editStyle, true);
            else quickApply(diff, 'Live', moved ? mo : null);
        }, 150);
    }

    // ---------------- settings ----------------
    function refreshEngine() {
        $('#engState').textContent = engine.has('cpu') ? 'Installed' : (process.platform === 'darwin' ? 'Not installed. Mac: open Terminal and run  brew install whisper-cpp' : 'Not installed');
        $('#btnEngine').textContent = engine.has('cpu') ? 'Reinstall' : 'Install';
        $('#procSel').value = settings.processor;
        var gs = $('#gpuVarSel');
        gs.innerHTML = ['cuda12', 'cuda11'].map(function (k) {
            var v = eng.VARIANTS[k];
            return '<option value="' + k + '">' + v.label + ', ' + v.mb + ' MB' + (engine.has(k) ? ' (installed)' : '') + '</option>';
        }).join('');
        gs.value = settings.gpuVariant;
        $('#btnGpuEngine').textContent = engine.has(settings.gpuVariant) ? 'Reinstall' : 'Install';
        engine.detectGpu().then(function (g) {
            $('#gpuName').textContent = g ? g : 'No NVIDIA GPU found (CPU will be used)';
            $('#btnGpuEngine').disabled = !g;
        });
        var ms = $('#modelSel');
        ms.innerHTML = eng.MODELS.map(function (m) { return '<option value="' + m.id + '">' + m.label + (engine.hasModel(m.id) ? '  (downloaded)' : '') + '</option>'; }).join('');
        ms.value = settings.model;
        $('#modelState').textContent = engine.hasModel(settings.model) ? 'Ready' : 'Not downloaded yet';
        $('#btnModel').classList.toggle('hidden', engine.hasModel(settings.model));
    }
    $('#modelSel').onchange = function () {
        settings.model = this.value;
        var L = LANGS[settings.lang];
        if (/\.en-/.test(this.value) && L.lang !== 'en') { settings.lang = 'en'; $('#langSel').value = 'en'; $('#langHint').textContent = ''; toast('English-only model: language set to English'); }
        saveSettings(); refreshEngine();
    };
    $('#procSel').onchange = function () { settings.processor = this.value; saveSettings(); };
    $('#gpuVarSel').onchange = function () { settings.gpuVariant = this.value; saveSettings(); refreshEngine(); };
    $('#btnGpuEngine').onclick = function () {
        var b = this, v = settings.gpuVariant;
        if (engine.libZip(v) || settings.libDir) { installZipFromDialog(b, 'Pick ' + eng.VARIANTS[v].zip); return; }
        ask('Download the ' + eng.VARIANTS[v].label + ' engine (' + eng.VARIANTS[v].mb + ' MB) from github.com/ggml-org/whisper.cpp?').then(function (yes) {
            if (!yes) return;
            busy(b, true);
            engine.installEngine(v, function (f) { progress('#progE', f, 'GPU engine ' + Math.round(f * 100) + '%'); })
                .then(function () { if (settings.processor === 'cpu') settings.processor = 'auto'; saveSettings(); toast('GPU engine installed'); }, function (e) { toast(e.message, true); })
                .then(function () { hideProgress('#progE'); busy(b, false); refreshEngine(); });
        });
    };
    var sIndicP = fp.create($('#sIndicFont'), { onChange: function (ps, f) {
        settings.indicFont = ps; saveSettings();
        toast('Bangla/Hindi captions will use ' + (f ? f.family + ' ' + f.style : ps));
    } });
    sIndicP.set(settings.indicFont);
    // Install buttons open a file dialog in the files folder; the picked zip/bin is installed.
    function libSub(sub) { return settings.libDir ? path.join(settings.libDir, sub) : ''; }
    function installZipFromDialog(btn, title) {
        var f = cep.pickFile(title, ['zip'], libSub('engine'));
        if (!f) return;
        busy(btn, true);
        progress('#progE', -1, 'Installing ' + path.basename(f));
        engine.installEngineZip(f).then(function (v) {
            if (v !== 'cpu') { settings.gpuVariant = v; if (settings.processor === 'cpu') settings.processor = 'auto'; saveSettings(); }
            toast(eng.VARIANTS[v].label + ' engine installed');
        }, function (e) { toast(e.message, true); }).then(function () { hideProgress('#progE'); busy(btn, false); refreshEngine(); });
    }
    $('#btnEngine').onclick = function () { installZipFromDialog(this, 'Pick whisper-bin-x64.zip'); };
    $('#btnModelFile').onclick = function () {
        var b = this, f = cep.pickFile('Pick a model file (ggml-*.bin)', ['bin'], libSub('models'));
        if (!f) return;
        var id = eng.modelIdOf(f);
        if (!id) { toast('Pick a model file (.bin) from the Offline Files folders', true); return; }
        busy(b, true);
        engine.installModelFile(f, function (p) { progress('#progE', p, 'Copying model ' + Math.round(p * 100) + '%'); }).then(function () {
            if (eng.MODELS.some(function (m) { return m.id === id; })) settings.model = id;
            saveSettings(); toast('Model ready: ' + id);
        }, function (e) { toast(e.message, true); }).then(function () { hideProgress('#progE'); busy(b, false); refreshEngine(); });
    };
    function showLib() {
        $('#libPath').textContent = settings.libDir || 'not set';
        var f = engine.scanLibrary();
        $('#libScan').textContent = settings.libDir ? 'Found engines: ' + (f.engines.join(', ') || 'none') + '. Models: ' + (f.models.length ? f.models.join(', ') : 'none') + '.' : '';
    }
    $('#btnLibPick').onclick = function () {
        var d = cep.pickFolder('Choose the folder with the Bunnys Caption files', settings.libDir);
        if (!d) return;
        settings.libDir = d; engine.lib = d; saveSettings(); showLib(); refreshEngine();
    };
    $('#btnLibOpen').onclick = function () { if (settings.libDir) cep.openFolder(settings.libDir); else toast('Choose the folder first', true); };
    $('#btnLibInstall').onclick = function () {
        var b = this;
        if (!settings.libDir) { $('#btnLibPick').click(); if (!settings.libDir) return; }
        busy(b, true);
        engine.installLibraryEngines(function (v) { progress('#progE', -1, 'Installing ' + eng.VARIANTS[v].label); }).then(function (done) {
            var f = engine.scanLibrary();
            if (!engine.hasModel(settings.model) && f.models.length) settings.model = f.models.indexOf('base.en-q5_1') >= 0 ? 'base.en-q5_1' : f.models[0];
            if (engine.has('cuda12') || engine.has('cuda11')) { settings.gpuVariant = engine.has('cuda12') ? 'cuda12' : 'cuda11'; }
            saveSettings();
            toast((done.length ? 'Installed: ' + done.join(', ') + '. ' : 'Engines already installed. ') + f.models.length + ' models found.');
        }, function (e) { toast(e.message, true); }).then(function () { hideProgress('#progE'); busy(b, false); showLib(); refreshEngine(); });
    };
    $('#btnModel').onclick = function () {
        var b = this; busy(b, true);
        engine.installModel(settings.model, function (f) { progress('#progE', f, 'Model ' + Math.round(f * 100) + '%'); })
            .then(function () { toast('Model ready'); }, function (e) { toast(e.message, true); })
            .then(function () { hideProgress('#progE'); busy(b, false); refreshEngine(); });
    };
    $('#sThreads').max = String(Math.max(2, cores));
    bindRange($('#sThreads'), function () { return settings.threads; }, function (v) { settings.threads = v; saveSettings(); });
    bindRange($('#sBatch'), function () { return settings.batch; }, function (v) { settings.batch = v; saveSettings(); });
    $('#sPrompt').value = settings.prompt;
    $('#sPrompt').oninput = function () { settings.prompt = this.value; saveSettings(); };
    $('#btnSelfTest').onclick = function () {
        var b = this; busy(b, true);
        cep.host('selfTest', { mogrt: TEMPLATE }).then(function (r) {
            var lines = r.steps.map(function (st) { return (st.ok ? 'OK   ' : 'FAIL ') + st.name + ': ' + st.info; });
            var NL = String.fromCharCode(10);
            var text = 'Bunnys Caption self-test ' + new Date().toISOString() + NL + lines.join(NL);
            try { fs.writeFileSync(path.join(DIRS.root, 'selftest.log'), text); } catch (e) { /* read only */ }
            var log = $('#testLog');
            log.textContent = text;
            log.classList.remove('hidden');
            var bad = r.steps.filter(function (st) { return !st.ok; }).length;
            toast(bad ? bad + ' checks failed (details below)' : 'All checks passed', !!bad);
        }).catch(function (e) { toast(e.message, true); }).then(function () { busy(b, false); });
    };
    $('#btnDataDir').onclick = function () { cep.openFolder(DIRS.styles); };
    $('#btnClearTemp').onclick = function () {
        var n = 0;
        try { fs.readdirSync(DIRS.temp).forEach(function (f) { try { fs.unlinkSync(path.join(DIRS.temp, f)); n++; } catch (e) { /* in use */ } }); } catch (e) { /* none */ }
        toast('Removed ' + n + ' temp files');
    };

    function refitPreviews() {
        sty.fitAll($$('.pvbox').concat([$('#curStyle .mini'), $('#editPreview')]));
    }
    var refitTimer = 0;
    window.addEventListener('resize', function () { clearTimeout(refitTimer); refitTimer = setTimeout(refitPreviews, 120); });
    try { document.fonts.ready.then(function () { setTimeout(refitPreviews, 50); }); } catch (e) { /* old engine */ }

    setTimeout(loadFonts, 400);

    // ---------------- boot ----------------
    loadStyles();
    renderTags();
    initRules();
    if (settings.useStyleRules) applyStyleRules();
    renderCurStyle();
    syncGen();
    // After Effects: the same panel works on the active composition
    if (cep.APP === 'AEFT') {
        $('#seqInfo').textContent = 'No composition'; $('#seqInfo').title = 'Active composition';
        var allBtn = $('[data-v="all"]'); if (allBtn) allBtn.textContent = 'Whole comp';
        var inOutBtn = allBtn && allBtn.nextElementSibling; if (inOutBtn) inOutBtn.textContent = 'Work area';
        var aeTracks = $('#audioTracks .muted'); if (aeTracks) aeTracks.textContent = 'Open a composition';
        var ll = $('#btnLoadLast'); if (ll) ll.title = 'Reload the last transcript of this composition';
    }
    refreshSeq().catch(function () { /* no sequence yet */ });
    if (!fs.existsSync(TEMPLATE) || !fs.existsSync(TEMPLATE_PRO)) toast('Template files missing in the mogrt folder. Reinstall the panel.', true);
})();
