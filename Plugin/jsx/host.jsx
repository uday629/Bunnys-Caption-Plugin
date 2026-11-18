// Bunnys Caption - Premiere Pro host script (ExtendScript, ES3).
// Every public function takes/returns JSON strings so the panel can batch work.
// Created by Bunnys Framelab - instagram.com/bunnysframelab

var BC = (function () {
    var TICKS = 254016000000;
    var TEMPLATE_KEY = "Timing Data";        // param that marks a Bunnys Caption clip
    var COLOR_PARAMS = { "Text Color": 1, "Emphasis Color": 1, "Highlight Color": 1, "Stroke Color": 1, "Glow Color": 1, "Box Color": 1,
        "Gradient Top": 1, "Gradient Bottom": 1, "Gradient Mid 1": 1, "Gradient Mid 2": 1, "Gradient Mid 3": 1, "Inner Glow Color": 1, "Depth Color": 1,
        "Inner Shadow Color": 1, "Sweep Color": 1, "Deep Glow Color": 1, "Glow Over Color": 1 };
    // parameters only the Pro template has (missing on light clips by design, not because the clip is old)
    var PRO_ONLY = { "Gradient": 1, "Emphasis Gradient": 1, "Gradient Top": 1, "Gradient Bottom": 1, "Gradient Mid 1": 1, "Gradient Mid 2": 1, "Gradient Mid 3": 1,
        "Gradient Type": 1, "Gradient Angle": 1, "Gradient Target": 1, "Inner Glow Size": 1, "Inner Glow Choke": 1, "Inner Shadow Color": 1, "Inner Shadow Distance": 1,
        "Inner Shadow Angle": 1, "Inner Shadow Size": 1, "Sweep Color": 1, "Sweep Width": 1, "Sweep Angle": 1, "Sweep Speed": 1, "Deep Glow": 1, "Deep Glow Radius": 1,
        "Deep Glow Color": 1, "Bevel": 1, "Inner Glow": 1, "Inner Glow Color": 1, "Inner Shadow": 1, "Depth": 1, "Depth Color": 1, "Light Sweep": 1, "Ghost": 1 };
    var BOOL_PARAMS = { "Fade Out": 1, "Bold": 1, "Italic": 1, "Emphasis Bold": 1, "Emphasis Italic": 1, "All Caps": 1, "Small Caps": 1 };
    var PRO_KEY = "Depth";                   // only the Pro template has this parameter
    var DROPDOWNS = { "Highlight Mode": 1, "Box Mode": 1, "Animation": 1, "Gradient Type": 1, "Gradient Target": 1 };
    var ddOffset = null;                     // Premiere dropdown index base vs AE's 1-based menu

    // ---------- JSON (ExtendScript has no reliable global JSON in Premiere) ----------
    function q(s) {
        return '"' + String(s).replace(/[\\"\u0000-\u001f]/g, function (c) {
            var m = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
            if (m[c]) return m[c];
            var h = c.charCodeAt(0).toString(16);
            return "\\u" + "0000".substr(h.length) + h;
        }) + '"';
    }
    function J(v) {
        if (v === null || v === undefined) return "null";
        var t = typeof v;
        if (t === "number") return isFinite(v) ? String(v) : "null";
        if (t === "boolean") return v ? "true" : "false";
        if (t === "string") return q(v);
        if (v instanceof Array) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(J(v[i]));
            return "[" + a.join(",") + "]";
        }
        var o = [];
        for (var k in v) if (v.hasOwnProperty(k) && typeof v[k] !== "function") o.push(q(k) + ":" + J(v[k]));
        return "{" + o.join(",") + "}";
    }
    // input comes from our own panel (JSON.stringify) or from Premiere getValue()
    function P(s) { return eval("(" + s + ")"); }
    function ok(o) { o = o || {}; o.ok = true; return J(o); }
    function fail(msg) { return J({ ok: false, err: String(msg) }); }

    function seqOrNull() { return app.project ? app.project.activeSequence : null; }
    function secToTicks(s) { return String(Math.round(s * TICKS)); }
    function timeOf(sec) { var t = new Time(); t.seconds = sec; return t; }
    function inOut(seq) {
        var i = 0, o = 0;
        try { i = seq.getInPointAsTime().seconds; o = seq.getOutPointAsTime().seconds; }
        catch (e) { i = parseFloat(seq.getInPoint()); o = parseFloat(seq.getOutPoint()); }
        return [i || 0, o || 0];
    }

    function isCaption(ti) {
        try {
            if (!ti.isMGT || !ti.isMGT()) return false;
            var c = ti.getMGTComponent();
            return !!(c && c.properties.getParamForDisplayName(TEMPLATE_KEY));
        } catch (e) { return false; }
    }

    function info() {
        var seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var io = inOut(seq);
        var v = [], a = [];
        for (var i = 0; i < seq.videoTracks.numTracks; i++) v.push({ i: i, name: seq.videoTracks[i].name, clips: seq.videoTracks[i].clips.numItems });
        for (var j = 0; j < seq.audioTracks.numTracks; j++) {
            var at = seq.audioTracks[j], muted = false;
            try { muted = at.isMuted(); } catch (e1) {}
            a.push({ i: j, name: at.name, clips: at.clips.numItems, muted: muted });
        }
        var fps = 0;
        try { fps = TICKS / parseFloat(seq.timebase); } catch (e2) {}
        var sel = 0;
        try { var s = seq.getSelection(); for (var k = 0; k < s.length; k++) if (isCaption(s[k])) sel++; } catch (e3) {}
        return ok({
            name: seq.name, id: seq.sequenceID, w: seq.frameSizeHorizontal, h: seq.frameSizeVertical, fps: fps,
            inPt: io[0], outPt: io[1], end: seq.end ? parseFloat(seq.end) / TICKS : 0, video: v, audio: a, selected: sel,
            app: app.version, projectPath: app.project.path
        });
    }

    function findEpr() {
        var base = new Folder(app.path).fsName, bases = [base, base + "/Contents"];
        // Mac: app.path can be the folder that holds the .app bundle
        try {
            var apps = new Folder(base).getFiles("*.app");
            for (var a = 0; a < apps.length; a++) bases.push(apps[a].fsName + "/Contents");
        } catch (eA) {}
        for (var b = 0; b < bases.length; b++) {
            var f = new File(bases[b] + "/MediaIO/systempresets/3F3F3F3F_57415645/Waveform Audio 48kHz 16-bit.epr");
            if (f.exists) return f.fsName;
            var root = new Folder(bases[b] + "/MediaIO/systempresets");
            var dirs = root.exists ? root.getFiles() : [];
            for (var i = 0; i < dirs.length; i++) {
                if (!(dirs[i] instanceof Folder)) continue;
                var eprs = dirs[i].getFiles("*.epr");
                for (var j = 0; j < eprs.length; j++) if (/waveform/i.test(eprs[j].name)) return eprs[j].fsName;
            }
        }
        return "";
    }

    // Mixdown of the chosen audio tracks to a WAV for transcription.
    function exportAudio(argStr) {
        var a = P(argStr);
        var seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var epr = findEpr();
        if (!epr) return fail("WAV export preset not found in Premiere's install folder.");
        var keep = {}, restore = [];
        if (a.tracks && a.tracks.length) {
            for (var k = 0; k < a.tracks.length; k++) keep[a.tracks[k]] = 1;
            for (var i = 0; i < seq.audioTracks.numTracks; i++) {
                var tr = seq.audioTracks[i], was = false;
                try { was = tr.isMuted(); } catch (e0) {}
                restore.push(was);
                try { tr.setMute(keep[i] ? 0 : 1); } catch (e1) {}
            }
        }
        var res;
        try {
            var mode = a.inOut ? app.encoder.ENCODE_IN_TO_OUT : app.encoder.ENCODE_ENTIRE;
            res = seq.exportAsMediaDirect(a.out, epr, mode);
        } catch (e2) { res = "error: " + e2; }
        for (var r = 0; r < restore.length; r++) { try { seq.audioTracks[r].setMute(restore[r] ? 1 : 0); } catch (e3) {} }
        var f = new File(a.out);
        if (!f.exists) return fail("Audio export failed: " + res);
        return ok({ path: f.fsName, offset: a.inOut ? inOut(seq)[0] : 0 });
    }

    // ---------- track helpers ----------
    function trackFree(track, from, to) {
        for (var i = 0; i < track.clips.numItems; i++) {
            var c = track.clips[i];
            if (c.start.seconds < to && c.end.seconds > from) return false;
        }
        return true;
    }
    // A MOGRT lands 30 s long before it is trimmed, so the track must be free a bit past the last caption.
    function pickTrack(argStr) {
        var a = P(argStr), seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var from = a.from, to = a.to + 31;
        if (a.track >= 0) {
            if (a.track >= seq.videoTracks.numTracks) return fail("Track V" + (a.track + 1) + " does not exist.");
            if (!a.force && !trackFree(seq.videoTracks[a.track], from, to)) return fail("Track V" + (a.track + 1) + " has clips in that range. Pick an empty track.");
            return ok({ track: a.track });
        }
        for (var i = 1; i < seq.videoTracks.numTracks; i++) {
            if (trackFree(seq.videoTracks[i], from, to)) return ok({ track: i });
        }
        var before = seq.videoTracks.numTracks;
        try {
            app.enableQE();
            qe.project.getActiveSequence().addTracks(1, before, 0);
        } catch (e) {}
        if (seq.videoTracks.numTracks > before) return ok({ track: seq.videoTracks.numTracks - 1, added: true });
        return fail("No empty video track. Add one (Sequence > Add Tracks) and try again.");
    }

    // ---------- parameter helpers ----------
    function param(comp, name) { try { return comp.properties.getParamForDisplayName(name); } catch (e) { return null; } }

    function setText(p, txt, font, ui) {
        if (ui === undefined) ui = true;
        var cur = null;
        try { cur = p.getValue(); } catch (e) {}
        var o = null;
        if (typeof cur === "string" && cur.charAt(0) === "{") { try { o = P(cur); } catch (e1) { o = null; } }
        if (o && o.textEditValue !== undefined) {
            o.textEditValue = txt;
            if (font && o.fontEditValue !== undefined) o.fontEditValue = (o.fontEditValue instanceof Array) ? [font] : font;
            // collapse per-run arrays to one run covering the whole string
            for (var k in o) {
                if (!o.hasOwnProperty(k) || !(o[k] instanceof Array)) continue;
                if (k === "fontTextRunLength") o[k] = [txt.length];
                else if (o[k].length > 1) o[k] = [o[k][0]];
            }
            if (o.capPropTextRunCount !== undefined) o.capPropTextRunCount = 1;
            p.setValue(J(o), ui);
        } else {
            p.setValue(txt, ui);
        }
    }

    function calibrate(comp) {
        if (ddOffset !== null) return;
        var p = param(comp, "Highlight Mode");
        if (!p) return;
        // template default is AE menu item 2 ("Active Word")
        var v = Number(p.getValue());
        ddOffset = isNaN(v) ? 0 : v - 2;
    }

    // current value of a parameter in the same form applyParams takes (used for undo)
    function readParam(p, v) {
        if (v.c) { var cv = p.getColorValue(); return { c: [cv[1], cv[2], cv[3]] }; }
        if (v.t !== undefined) return { t: plainText(p.getValue()) };
        if (v.d !== undefined) return { d: Number(p.getValue()) - (ddOffset || 0) };
        if (v.b !== undefined) return { b: !!p.getValue() };
        return { n: Number(p.getValue()) };
    }
    function same(a, b) {
        if (a.c && b.c) return Math.abs(a.c[0] - b.c[0]) < 1 && Math.abs(a.c[1] - b.c[1]) < 1 && Math.abs(a.c[2] - b.c[2]) < 1;
        if (a.n !== undefined && b.n !== undefined) return Math.abs(a.n - b.n) < 0.0001;
        if (a.d !== undefined) return a.d === b.d;
        if (a.b !== undefined) return a.b === b.b;
        return false;
    }
    // prm: { name: {c:[r,g,b]} | {n:number} | {b:bool} | {d:aeMenuIndex} | {t:text, f:font} }
    // before (optional): filled with the old values of the parameters that change.
    // Values that are already right are skipped (every write re-renders the graphic), and Premiere's
    // panels are refreshed once per clip instead of once per parameter.
    function applyParams(ti, prm, before) {
        var comp = ti.getMGTComponent();
        if (!comp) return "not a graphic";
        calibrate(comp);
        var errs = [], todo = [];
        for (var name in prm) {
            if (!prm.hasOwnProperty(name)) continue;
            var v = prm[name], p = param(comp, name);
            if (!p) continue;
            var old = null;
            if (v.t === undefined || before) { try { old = readParam(p, v); } catch (e0) { old = null; } }
            if (old && v.t === undefined && same(old, v)) continue;
            if (before && old) before[name] = old;
            todo.push([name, p, v]);
        }
        for (var i = 0; i < todo.length; i++) {
            var nm = todo[i][0], pp = todo[i][1], vv = todo[i][2], ui = i === todo.length - 1;
            try {
                if (vv.c) pp.setColorValue(255, vv.c[0], vv.c[1], vv.c[2], ui);
                else if (vv.t !== undefined) setText(pp, vv.t, vv.f, ui);
                else if (vv.d !== undefined) pp.setValue(vv.d + (ddOffset || 0), ui);
                else if (vv.b !== undefined) pp.setValue(vv.b ? true : false, ui);
                else if (vv.n !== undefined) pp.setValue(vv.n, ui);
            } catch (e) { errs.push(nm + ": " + e); }
        }
        return errs.join("; ");
    }

    function motionComp(ti) {
        for (var i = 0; i < ti.components.numItems; i++) {
            var c = ti.components[i];
            if (c.matchName === "AE.ADBE Motion" || c.displayName === "Motion") return c;
        }
        return null;
    }
    function setMotion(ti, pos, scale) {
        var m = motionComp(ti);
        if (!m) return;
        var pp = param(m, "Position") || m.properties[0];
        var sp = param(m, "Scale") || m.properties[1];
        try { if (pos) pp.setValue(pos, true); } catch (e) {}
        try { if (scale) sp.setValue(scale, true); } catch (e2) {}
    }
    function getMotion(ti) {
        var m = motionComp(ti);
        if (!m) return null;
        var pp = param(m, "Position") || m.properties[0];
        var sp = param(m, "Scale") || m.properties[1];
        var pos = null, sc = null;
        try { pos = pp.getValue(); } catch (e) {}
        try { sc = sp.getValue(); } catch (e2) {}
        return { pos: pos ? [pos[0], pos[1]] : null, scale: sc };
    }

    // For user-imported templates: the first parameter holding text.
    function firstTextParam(ti) {
        var comp = ti.getMGTComponent();
        if (!comp) return "";
        for (var i = 0; i < comp.properties.numItems; i++) {
            var v = null;
            try { v = comp.properties[i].getValue(); } catch (e) {}
            if (typeof v === "string" && v.length && !/^-?\d+(\.\d+)?$/.test(v)) return comp.properties[i].displayName;
        }
        return "";
    }

    function setEnd(ti, sec) {
        try { ti.end = timeOf(sec); } catch (e) {}
    }
    // A MOGRT lands at its full length (often 30 s) and overwrites whatever is under it. To put one between
    // other clips (swaps, conversions): its project item gets an out point of the wanted length and is laid
    // on the track with overwriteClip, so only that span is used. (Moving a clip with TrackItem.move breaks the
    // track's order when it lands before other clips: Premiere then does not draw it.)
    var mgtItems = {};
    function mgtItem(seq, file, track) {
        var key = file + "|" + app.project.path;
        var pi = mgtItems[key];
        if (pi) return pi;
        // one import past the end of the sequence (nothing there to overwrite) gives the project item
        var far = 60;
        try { far = Math.max(far, seq.end / TICKS + 60); } catch (e) {}
        var ti = seq.importMGT(file, secToTicks(far), track, 0);
        if (!ti) return null;
        pi = ti.projectItem;
        try { ti.remove(false, false); } catch (e2) {}
        mgtItems[key] = pi;
        return pi;
    }
    function placeMGT(seq, file, s0, track, e0, again) {
        var pi = mgtItem(seq, file, track), okLay = false;
        if (!pi) return null;
        try {
            pi.setInPoint(0, 4); pi.setOutPoint(Math.max(0.05, e0 - s0), 4);
            seq.videoTracks[track].overwriteClip(pi, s0);
            okLay = true;
        } catch (e) { okLay = false; }
        // the remembered project item is gone (other project, removed from the bin): get a new one once
        if (!okLay) { delete mgtItems[file + "|" + app.project.path]; return again ? null : placeMGT(seq, file, s0, track, e0, true); }
        try { pi.clearOutPoint(); } catch (e3) {}
        var tr = seq.videoTracks[track], best = null, bd = 1;
        for (var j = 0; j < tr.clips.numItems; j++) {
            var d = Math.abs(tr.clips[j].start.seconds - s0);
            if (d < bd) { bd = d; best = tr.clips[j]; }
        }
        if (!best || bd > 0.1) return null;
        setEnd(best, e0);
        return best;
    }

    // ---------- insert ----------
    // payload: {mogrt, track, custom:bool, textParam, params:{...shared}, motion:{pos,scale},
    //           caps:[{s,e,main,punch,data,name}], mainFont, punchFont}
    function insert(argStr) {
        var a = P(argStr), seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var f = new File(a.mogrt);
        if (!f.exists) return fail("Template not found: " + a.mogrt);
        var done = 0, errs = [], made = [];
        for (var i = 0; i < a.caps.length; i++) {
            var c = a.caps[i];
            var ti = null;
            try { ti = seq.importMGT(f.fsName, secToTicks(c.s), a.track, 0); } catch (e) { errs.push("import: " + e); }
            if (!ti) { errs.push("import failed at " + c.s.toFixed(2) + "s"); continue; }
            setEnd(ti, c.e);
            var prm = {};
            for (var k in a.params) if (a.params.hasOwnProperty(k)) prm[k] = a.params[k];
            if (a.custom && c.lines) {
                // multi-line templates (Lyrics): the caption words are already split per line
                for (var ln in c.lines) if (c.lines.hasOwnProperty(ln)) prm[ln] = { t: c.lines[ln] };
            } else if (a.custom) {
                var tp = a.textParam || firstTextParam(ti);
                if (tp) prm[tp] = { t: c.text };
                // other text fields that should also show the caption
                if (a.sameParams) for (var sp = 0; sp < a.sameParams.length; sp++) prm[a.sameParams[sp]] = { t: c.text };
            } else {
                prm["Caption Text"] = { t: c.main, f: a.mainFont };
                prm["Emphasis Text"] = { t: c.punch, f: a.punchFont };
                prm["Caption Font"] = { t: a.mainFont || "" };
                prm["Emphasis Font"] = { t: a.punchFont || "" };
                prm["Timing Data"] = { t: c.data };
            }
            var er = applyParams(ti, prm);
            if (er) errs.push(er);
            if (a.motion) setMotion(ti, a.motion.pos, a.motion.scale);
            if (c.name) { try { ti.name = c.name; } catch (e2) {} }
            made.push({ track: a.track, ticks: ti.start.ticks, node: ti.nodeId });
            done++;
        }
        return ok({ done: done, errs: errs.slice(0, 5), made: made });
    }

    // ---------- selection ----------
    function selectedCaptions(seq, all) {
        var out = [], sel = [];
        try { sel = seq.getSelection(); } catch (e) {}
        for (var i = 0; i < sel.length; i++) if (all || isCaption(sel[i])) out.push(sel[i]);
        return out;
    }
    // track index of every clip in one pass: {nodeId@ticks: track}
    var trackMap = null;
    function buildTrackMap(seq) {
        trackMap = {};
        for (var t = 0; t < seq.videoTracks.numTracks; t++) {
            var tr = seq.videoTracks[t];
            for (var j = 0; j < tr.clips.numItems; j++) trackMap[tr.clips[j].nodeId + "@" + tr.clips[j].start.ticks] = t;
        }
    }
    function trackIndexOf(seq, ti) {
        if (trackMap) { var k = trackMap[ti.nodeId + "@" + ti.start.ticks]; if (k !== undefined) return k; }
        for (var t = 0; t < seq.videoTracks.numTracks; t++) {
            var tr = seq.videoTracks[t];
            for (var j = 0; j < tr.clips.numItems; j++) {
                var c = tr.clips[j];
                if (c.start.ticks === ti.start.ticks && c.nodeId === ti.nodeId) return t;
            }
        }
        return -1;
    }
    // only: optional {name: 1} of the parameters to read (reading all ~40 is slow with many clips)
    function readClip(seq, ti, only) {
        var comp = ti.getMGTComponent();
        var prm = {};
        for (var i = 0; i < comp.properties.numItems; i++) {
            var p = comp.properties[i], n = p.displayName;
            if (only && !only[n] && n !== PRO_KEY) continue;
            try {
                if (COLOR_PARAMS[n]) { var cv = p.getColorValue(); prm[n] = { c: [cv[1], cv[2], cv[3]] }; }
                else if (DROPDOWNS[n]) prm[n] = { d: Number(p.getValue()) - (ddOffset || 0) };
                else prm[n] = { v: p.getValue() };
            } catch (e) {}
        }
        return { s: ti.start.seconds, e: ti.end.seconds, ticks: ti.start.ticks, node: ti.nodeId, track: trackIndexOf(seq, ti), params: prm, motion: getMotion(ti), pro: !!prm[PRO_KEY] };
    }
    // plain text from a Source Text value (Premiere returns JSON for styled text)
    function plainText(v) {
        if (v === null || v === undefined) return "";
        var s = String(v), i = s.indexOf("{");
        if (i >= 0) {
            // styled text comes as JSON, sometimes after a short binary header
            try { var o = P(s.substring(i)); if (o.textEditValue !== undefined) return String(o.textEditValue); } catch (e) {}
            var m = s.match(/"textEditValue"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (m) return m[1].replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"');
        }
        return s;
    }
    function codesOf(v) {
        var s = String(v === null || v === undefined ? "" : v), a = [];
        for (var i = 0; i < Math.min(s.length, 120); i++) a.push(s.charCodeAt(i));
        return a.join(",");
    }
    // ---------- Lyrics clips (multi-line lyric templates with a "Speed" control) ----------
    function isLyrics(ti) {
        try {
            if (!ti.isMGT || !ti.isMGT()) return false;
            var c = ti.getMGTComponent();
            return !!(c && param(c, "Line 1") && param(c, "Speed") && param(c, "Custom Colors"));
        } catch (e) { return false; }
    }
    function lyricsText(ti) {
        var c = ti.getMGTComponent(), out = [];
        for (var k = 1; k <= 3; k++) {
            var p = param(c, "Line " + k);
            if (!p) break;
            var t = plainText(p.getValue()).replace(/^\s+|\s+$/g, "");
            if (t) out.push(t);
        }
        return out.join(" ");
    }
    // the selected Lyrics clips: their text, line count and current look (from the first one)
    function lyricsRead() {
        var seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var sel = [], n = 0, first = null;
        try { sel = seq.getSelection(); } catch (e) {}
        for (var i = 0; i < sel.length; i++) {
            if (!isLyrics(sel[i])) continue;
            n++;
            if (first) continue;
            var c = sel[i].getMGTComponent(), vals = {}, lines = 0;
            for (var j = 0; j < c.properties.numItems; j++) {
                var p = c.properties[j], nm = p.displayName;
                try {
                    if (/^Line \d$/.test(nm)) { lines++; continue; }
                    if (/Color$/.test(nm)) { var cv = p.getColorValue(); vals[nm] = { c: [cv[1], cv[2], cv[3]] }; }
                    else if (nm === "Custom Colors") vals[nm] = { b: !!p.getValue() };
                    else { var v = Number(p.getValue()); if (!isNaN(v)) vals[nm] = { n: v }; }
                } catch (e2) {}
            }
            first = { text: lyricsText(sel[i]), lines: lines, values: vals, name: sel[i].name };
        }
        return ok({ count: n, first: first });
    }
    // payload: {params:{name:{c|n|b|t}}, lines:{'Line 1':text,...} (optional, needs one clip)}
    function lyricsSet(argStr) {
        var a = P(argStr), seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var sel = [], done = 0, errs = [];
        try { sel = seq.getSelection(); } catch (e) {}
        for (var i = 0; i < sel.length; i++) {
            if (!isLyrics(sel[i])) continue;
            var prm = {};
            for (var k in a.params) if (a.params.hasOwnProperty(k)) prm[k] = a.params[k];
            if (a.lines) for (var l in a.lines) if (a.lines.hasOwnProperty(l)) prm[l] = { t: a.lines[l] };
            var er = applyParams(sel[i], prm);
            if (er) errs.push(er);
            if (a.lines) { try { sel[i].name = lyricsText(sel[i]).slice(0, 40); } catch (e2) {} }
            done++;
        }
        return ok({ done: done, errs: errs.slice(0, 5) });
    }

    // Text of any title/graphic clip that is not a Bunnys caption: Premiere text layers, other MOGRTs.
    var lastRaw = "";
    function textOfClip(ti) {
        lastRaw = "";
        try {
            if (isLyrics(ti)) return lyricsText(ti);
            if (ti.isMGT && ti.isMGT()) {
                var tp = firstTextParam(ti);
                if (tp) return plainText(param(ti.getMGTComponent(), tp).getValue());
            }
        } catch (e) {}
        var named = [];
        try {
            for (var k = 0; k < ti.components.numItems; k++) {
                var tc = ti.components[k];
                if (tc.matchName !== "AE.ADBE Text") continue;
                var inst = "";
                try { inst = tc.instanceName ? String(tc.instanceName) : ""; } catch (e6) {}
                var dm = /^[^(]*\((.*)\)\s*$/.exec(String(tc.displayName || ""));
                if (inst) named.push(inst); else if (dm && dm[1]) named.push(dm[1]);
            }
        } catch (e7) {}
        if (named.length) return named.join(" ");
        try {
            for (var i = 0; i < ti.components.numItems; i++) {
                var c = ti.components[i];
                for (var j = 0; j < c.properties.numItems; j++) {
                    var p = c.properties[j];
                    if (p.displayName === "Source Text") { var raw = p.getValue(); lastRaw = codesOf(raw); return plainText(raw); }
                }
            }
        } catch (e2) {}
        return null;
    }
    function readSelection(argStr) {
        var a = argStr ? P(argStr) : {}, only = null;
        if (a && a.only) { only = {}; for (var o = 0; o < a.only.length; o++) only[a.only[o]] = 1; }
        var seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var sel = [], out = [], other = [];
        try { sel = seq.getSelection(); } catch (e) {}
        buildTrackMap(seq);
        for (var i = 0; i < sel.length; i++) {
            var ti = sel[i];
            if (isCaption(ti)) {
                calibrate(ti.getMGTComponent());
                out.push(readClip(seq, ti, only));
            } else {
                var t = textOfClip(ti);
                if (t !== null) {
                    var nm = "";
                    try { nm = ti.name; } catch (e5) {}
                    other.push({ isText: true, text: t, name: nm, raw: lastRaw, s: ti.start.seconds, e: ti.end.seconds, ticks: ti.start.ticks, node: ti.nodeId,
                        track: trackIndexOf(seq, ti), motion: getMotion(ti) });
                }
            }
        }
        trackMap = null;
        var pp = "";
        try { pp = app.project.path; } catch (e8) {}
        return ok({ clips: out, texts: other, project: pp });
    }

    // Turn any selected text clip into a Bunnys caption with the same timing, track and text.
    // payload: {mogrt, clips:[{track,ticks,node,params,motion}]}
    function convertClips(argStr) {
        var a = P(argStr), seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var f = new File(a.mogrt);
        if (!f.exists) return fail("Template not found: " + a.mogrt);
        var done = 0, errs = [];
        for (var i = 0; i < a.clips.length; i++) {
            var c = a.clips[i], ti = findClip(seq, c.track, c.ticks, c.node);
            if (!ti) { errs.push("clip moved: " + c.ticks); continue; }
            var s0 = ti.start.seconds, e0 = ti.end.seconds, nm = "";
            try { nm = ti.name; } catch (e1) {}
            try { ti.remove(false, false); } catch (e2) { errs.push("could not remove the original: " + e2); continue; }
            var n = null;
            try { n = placeMGT(seq, f.fsName, s0, c.track, e0); } catch (e3) { errs.push("import: " + e3); }
            if (!n) { errs.push("import failed at " + s0); continue; }
            var er = applyParams(n, c.params);
            if (er) errs.push(er);
            if (c.motion) setMotion(n, c.motion.pos, c.motion.scale);
            try { n.name = nm || "Bunnys Caption"; } catch (e4) {}
            done++;
        }
        return ok({ done: done, errs: errs.slice(0, 5) });
    }
    // by track + start; the node id is preferred but a clip swapped to another template has a new one
    function findClip(seq, track, ticks, node) {
        var tr = seq.videoTracks[track];
        if (!tr) return null;
        var byTime = null;
        for (var j = 0; j < tr.clips.numItems; j++) {
            var c = tr.clips[j];
            if (c.start.ticks !== ticks) continue;
            if (!node || c.nodeId === node) return c;
            if (!byTime && isCaption(c)) byTime = c;
        }
        return byTime;
    }
    // A premium style on a clip made from the light template: put a Pro clip in its place.
    // every parameter of a caption clip in the form applyParams takes: enough to rebuild the clip exactly
    var TEXT_PARAMS = { "Caption Text": 1, "Emphasis Text": 1, "Caption Font": 1, "Emphasis Font": 1, "Timing Data": 1 };
    function snapshot(ti) {
        var comp = ti.getMGTComponent(), prm = {};
        calibrate(comp);
        for (var i = 0; i < comp.properties.numItems; i++) {
            var p = comp.properties[i], n = p.displayName;
            try {
                if (COLOR_PARAMS[n]) { var cv = p.getColorValue(); prm[n] = { c: [cv[1], cv[2], cv[3]] }; }
                else if (DROPDOWNS[n]) prm[n] = { d: Number(p.getValue()) - (ddOffset || 0) };
                else if (TEXT_PARAMS[n]) prm[n] = { t: plainText(p.getValue()) };
                else if (BOOL_PARAMS[n]) prm[n] = { b: !!p.getValue() };
                else { var v = Number(p.getValue()); if (!isNaN(v)) prm[n] = { n: v }; }
            } catch (e) {}
        }
        return { params: prm, motion: getMotion(ti), s: ti.start.seconds, e: ti.end.seconds, name: ti.name };
    }
    // put a clip back as it was before a template swap: payload {clips:[{track,ticks,node,swap:{mogrt,params,motion,s,e,name}}]}
    function unswap(argStr) {
        var a = P(argStr), seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var done = 0, back = [];
        for (var i = 0; i < a.clips.length; i++) {
            var c = a.clips[i], sw = c.swap, ti = findClip(seq, c.track, c.ticks, c.node);
            if (!ti || !sw) continue;
            try { ti.remove(false, false); } catch (e0) { continue; }
            var n = null;
            try { n = placeMGT(seq, new File(sw.mogrt).fsName, sw.s, c.track, sw.e); } catch (e1) { n = null; }
            if (!n) continue;
            applyParams(n, sw.params);
            if (sw.motion) setMotion(n, sw.motion.pos, sw.motion.scale);
            try { n.name = sw.name; } catch (e2) {}
            back.push({ track: c.track, ticks: n.start.ticks, node: n.nodeId });
            done++;
        }
        return ok({ done: done, clips: back });
    }
    function swapToPro(seq, ti, track, mogrt) {
        var s = ti.start.seconds, e = ti.end.seconds, nm = ti.name;
        var keep = {}, comp = ti.getMGTComponent();
        // carry over text and timing; everything else comes from the style
        var names = ["Caption Text", "Emphasis Text", "Timing Data"];
        for (var i = 0; i < names.length; i++) { var p = param(comp, names[i]); if (p) { var v = p.getValue(); keep[names[i]] = { t: (typeof v === "string" && v.charAt(0) === "{") ? P(v).textEditValue : String(v) }; } }
        var mo = getMotion(ti);
        ti.remove(false, false);
        var n = placeMGT(seq, new File(mogrt).fsName, s, track, e);
        if (!n) return null;
        applyParams(n, keep);
        if (mo) setMotion(n, mo.pos, mo.scale);
        try { n.name = nm; } catch (e2) {}
        return n;
    }

    // payload: {proMogrt, clips:[{track,ticks,node,params,motion,pro}]}
    function updateClips(argStr) {
        var a = P(argStr), seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var done = 0, errs = [], swapped = 0, undo = [];
        for (var i = 0; i < a.clips.length; i++) {
            var c = a.clips[i], ti = findClip(seq, c.track, c.ticks, c.node);
            if (!ti) { errs.push("clip moved: " + c.ticks); continue; }
            var wasSwapped = false, old = null, oldMogrt = a.liteMogrt;
            // a clip made with an older template lacks newer controls (bold, glow over...): rebuilt on the current one
            var cm = ti.getMGTComponent(), outdated = false;
            if (c.needs) for (var nd = 0; nd < c.needs.length; nd++) if (!param(cm, c.needs[nd])) { outdated = true; break; }
            var isPro = !!param(cm, PRO_KEY);
            if ((c.pro && a.proMogrt && !isPro) || (outdated && (isPro || c.pro ? a.proMogrt : a.liteMogrt))) {
                // remember the clip exactly, so undo can put it back
                try { old = snapshot(ti); } catch (eS) { old = null; }
                if (isPro) oldMogrt = a.proMogrt;
                ti = swapToPro(seq, ti, c.track, (c.pro || isPro) ? a.proMogrt : a.liteMogrt);
                if (!ti) { errs.push("could not swap template at " + c.ticks); continue; }
                swapped++; wasSwapped = true;
            }
            var before = {}, mo = c.motion ? getMotion(ti) : null, end0 = ti.end.seconds;
            var er = applyParams(ti, c.params, wasSwapped ? null : before);
            if (er) errs.push(er);
            if (c.motion) setMotion(ti, c.motion.pos, c.motion.scale);
            if (c.end) setEnd(ti, c.end);
            if (!wasSwapped) undo.push({ track: c.track, ticks: ti.start.ticks, node: ti.nodeId, params: before, motion: mo, end: c.end ? end0 : 0 });
            else if (old && oldMogrt) { old.mogrt = oldMogrt; undo.push({ track: c.track, ticks: ti.start.ticks, node: ti.nodeId, swap: old }); }
            done++;
        }
        return ok({ done: done, swapped: swapped, errs: errs.slice(0, 5), undo: undo });
    }

    // Remove Bunnys Caption clips on one track (or the selected ones) before regenerating.
    function removeCaptions(argStr) {
        var a = P(argStr), seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var n = 0;
        var tr = seq.videoTracks[a.track];
        if (!tr) return fail("No such track.");
        for (var j = tr.clips.numItems - 1; j >= 0; j--) {
            var c = tr.clips[j];
            if (isCaption(c)) { try { c.remove(false, false); n++; } catch (e) {} }
        }
        return ok({ removed: n });
    }

    function ping() { return ok({ version: app.version }); }

    // Save the project (used to read text layers from the saved file).
    function saveProject() {
        try { app.project.save(); } catch (e) { return fail("Could not save the project: " + e); }
        return ok({ path: app.project.path });
    }

    // Set a few parameters on every selected caption (quick font / animation changes). Text is untouched.
    function applyToSelection(argStr) {
        var a = P(argStr), seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var sel = [], n = 0, undo = [], where = {}, outdated = 0;
        try { sel = seq.getSelection(); } catch (e) {}
        // track of every clip in one pass (asking per clip is slow with many captions)
        for (var t = 0; t < seq.videoTracks.numTracks; t++) {
            var tr = seq.videoTracks[t];
            for (var j = 0; j < tr.clips.numItems; j++) where[tr.clips[j].nodeId + "@" + tr.clips[j].start.ticks] = t;
        }
        for (var i = 0; i < sel.length; i++) {
            if (!isCaption(sel[i])) continue;
            var before = {}, mo = a.motion ? getMotion(sel[i]) : null, cmp = sel[i].getMGTComponent();
            for (var pn in (a.params || {})) { if (a.params.hasOwnProperty(pn) && !param(cmp, pn) && !PRO_ONLY[pn]) { outdated++; break; } }
            applyParams(sel[i], a.params || {}, before);
            if (a.motion) setMotion(sel[i], a.motion.pos || null, a.motion.scale || null);
            var tk = where[sel[i].nodeId + "@" + sel[i].start.ticks];
            undo.push({ track: tk === undefined ? trackIndexOf(seq, sel[i]) : tk, ticks: sel[i].start.ticks, node: sel[i].nodeId, params: before, motion: mo });
            n++;
        }
        return ok({ done: n, undo: undo, outdated: outdated });
    }

    // Remove the given clips (undo of "Add captions").
    function removeClips(argStr) {
        var a = P(argStr), seq = seqOrNull();
        if (!seq) return fail("Open a sequence first.");
        var n = 0;
        for (var i = 0; i < a.clips.length; i++) {
            var c = a.clips[i], ti = findClip(seq, c.track, c.ticks, c.node);
            if (ti) { try { ti.remove(false, false); n++; } catch (e) {} }
        }
        return ok({ removed: n });
    }

    // Premiere's own undo / redo (QE DOM, not officially supported): used when the panel has nothing to undo.
    function premiereUndo(argStr) {
        var a = P(argStr);
        try { app.enableQE(); if (a.redo) qe.project.redo(); else qe.project.undo(); } catch (e) { return fail("Undo is not available here: " + e); }
        return ok({});
    }
    // Position in Premiere's undo history (QE DOM, may be missing): -1 when unknown.
    // Lets the panel see whether the user changed something in Premiere after the panel's last change.
    function undoIndex() {
        var n = -1;
        try { app.enableQE(); n = Number(qe.project.undoStackIndex()); } catch (e) { n = -1; }
        if (isNaN(n)) n = -1;
        return ok({ index: n });
    }

    // One-click diagnostics: insert one caption, exercise every API the panel uses, then remove it.
    function selfTest(argStr) {
        var a = P(argStr), seq = seqOrNull(), rep = { steps: [] };
        function step(name, fn) {
            try { rep.steps.push({ name: name, ok: true, info: fn() }); }
            catch (e) { rep.steps.push({ name: name, ok: false, info: String(e) + (e.line ? " @" + e.line : "") }); }
        }
        if (!seq) return fail("Open a sequence first.");
        if (a.at === undefined) { try { a.at = seq.getPlayerPosition().seconds; } catch (e0) { a.at = 0; } }
        var ti = null, track = -1;
        step("app", function () { return app.version + " / " + seq.name + " " + seq.frameSizeHorizontal + "x" + seq.frameSizeVertical; });
        step("pick track", function () {
            var r = P(pickTrack(J({ from: a.at, to: a.at + 2, track: -1 })));
            if (!r.ok) throw r.err;
            track = r.track;
            return "V" + (track + 1) + (r.added ? " (added)" : "");
        });
        if (track < 0) return ok(rep);
        step("importMGT", function () {
            ti = seq.importMGT(new File(a.mogrt).fsName, secToTicks(a.at), track, 0);
            if (!ti) throw "returned null";
            return "start " + ti.start.seconds + " end " + ti.end.seconds + " isMGT " + ti.isMGT();
        });
        if (!ti) return ok(rep);
        step("trim end", function () { setEnd(ti, a.at + 2); return "end now " + ti.end.seconds; });
        step("params", function () {
            var c = ti.getMGTComponent(), out = [];
            for (var i = 0; i < c.properties.numItems; i++) {
                var p = c.properties[i], v = null;
                try { v = p.getValue(); } catch (e) { v = "ERR " + e; }
                out.push(p.displayName + "=" + (typeof v) + ":" + String(v).substr(0, 140));
            }
            return out.join(" | ");
        });
        step("dropdown base", function () { ddOffset = null; calibrate(ti.getMGTComponent()); return "offset " + ddOffset; });
        step("set params", function () {
            var er = applyParams(ti, {
                "Caption Text": { t: "SELF TEST\rLINE TWO", f: "Arial-Black" }, "Emphasis Text": { t: "WORKS", f: "" },
                "Text Color": { c: [255, 138, 0] }, "Highlight Mode": { d: 3 }, "Glow": { n: 40 }, "Fade Out": { b: true },
                "Timing Data": { t: "0010#2#0,0.5|0.5,1|1,1.5" }
            });
            return er || "no errors";
        });
        step("read back", function () {
            var c = ti.getMGTComponent();
            var hm = param(c, "Highlight Mode"), tc = param(c, "Text Color"), ct = param(c, "Caption Text"), fo = param(c, "Fade Out");
            return "HighlightMode=" + hm.getValue() + " TextColor=" + tc.getColorValue() + " FadeOut=" + fo.getValue() + " Caption=" + String(ct.getValue()).substr(0, 200);
        });
        step("motion", function () {
            var m = motionComp(ti);
            if (!m) {
                var names = [];
                for (var i = 0; i < ti.components.numItems; i++) names.push(ti.components[i].displayName + "/" + ti.components[i].matchName);
                throw "Motion not found: " + names.join(", ");
            }
            setMotion(ti, [0.5, 0.7], 110);
            return J(getMotion(ti));
        });
        step("rename", function () { ti.name = "BC self test"; return ti.name; });
        step("selection read", function () { return "isCaption " + isCaption(ti); });
        if (!a.keep) step("remove", function () { ti.remove(false, false); return "removed"; });
        return ok(rep);
    }

    return {
        ping: ping, info: info, exportAudio: exportAudio, pickTrack: pickTrack, insert: insert,
        lyricsRead: lyricsRead, lyricsSet: lyricsSet,
        readSelection: readSelection, saveProject: saveProject, convertClips: convertClips, applyToSelection: applyToSelection, updateClips: updateClips, removeCaptions: removeCaptions, removeClips: removeClips, premiereUndo: premiereUndo, undoIndex: undoIndex, unswap: unswap, selfTest: selfTest
    };
})();

// In After Effects the same panel uses the AE host (same functions, AE layers instead of Premiere clips).
try {
    if (BridgeTalk.appName === "aftereffects") $.evalFile(new File(new File($.fileName).parent.fsName + "/host_ae.jsx"));
} catch (eHost) { /* the panel reports a missing host when it calls it */ }
