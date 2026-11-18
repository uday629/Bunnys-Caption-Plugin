// Bunnys Caption - After Effects host script (ExtendScript, ES3).
// Same API as host.jsx (Premiere), so the panel works the same in both apps.
// A caption is a layer of the template comp (from the MOGRT's own AE project) in the active comp;
// its controls are the layer's Essential Properties, exactly what Premiere shows for the MOGRT.
// Clip address used by the panel: {track: 0, ticks: "<layer id>", node: <layer id>}.
// Created by Bunnys Framelab - instagram.com/bunnysframelab

var BC = (function () {
    var TEMPLATE_KEY = "Timing Data";
    var PRO_KEY = "Depth";
    var TAG = "BunnysCaption";
    var TPL_TAG = "BC_TEMPLATE:";
    var DROPDOWNS = { "Highlight Mode": 1, "Box Mode": 1, "Animation": 1, "Gradient Type": 1, "Gradient Target": 1 };
    var PRO_ONLY = { "Gradient": 1, "Emphasis Gradient": 1, "Gradient Top": 1, "Gradient Bottom": 1, "Gradient Mid 1": 1, "Gradient Mid 2": 1, "Gradient Mid 3": 1,
        "Gradient Type": 1, "Gradient Angle": 1, "Gradient Target": 1, "Inner Glow Size": 1, "Inner Glow Choke": 1, "Inner Shadow Color": 1, "Inner Shadow Distance": 1,
        "Inner Shadow Angle": 1, "Inner Shadow Size": 1, "Sweep Color": 1, "Sweep Width": 1, "Sweep Angle": 1, "Sweep Speed": 1, "Deep Glow": 1, "Deep Glow Radius": 1,
        "Deep Glow Color": 1, "Bevel": 1, "Inner Glow": 1, "Inner Glow Color": 1, "Inner Shadow": 1, "Depth": 1, "Depth Color": 1, "Light Sweep": 1, "Ghost": 1 };
    var COLOR_TYPE = 6418, TEXT_TYPE = 6424;

    // ---------- JSON ----------
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
        if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(J(v[i])); return "[" + a.join(",") + "]"; }
        var o = [];
        for (var k in v) if (v.hasOwnProperty(k) && typeof v[k] !== "function") o.push(q(k) + ":" + J(v[k]));
        return "{" + o.join(",") + "}";
    }
    function P(s) { return eval("(" + s + ")"); }
    function ok(o) { o = o || {}; o.ok = true; return J(o); }
    // never concatenate an Error object in this host: AE throws while converting it
    function msg(e) { return (e && e.message) ? e.message : String(e && e.description ? e.description : "error"); }
    function fail(m) { return J({ ok: false, err: String(m) }); }

    function compOrNull() { var c = app.project ? app.project.activeItem : null; return (c && c instanceof CompItem) ? c : null; }
    function noComp() { return fail("Open a composition first (click it in the Project panel or the timeline)."); }

    // ---------- templates ----------
    // a.__tpl: {mogrtPath: {aep, tpl}} made by the panel (it unpacks the MOGRT's AE project)
    var tplCache = {};
    function findTemplate(tag) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.comment === tag) return it;
        }
        return null;
    }
    function templatesFolder() {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof FolderItem && it.name === "Bunnys Caption Templates" && it.parentFolder === app.project.rootFolder) return it;
        }
        return app.project.items.addFolder("Bunnys Caption Templates");
    }
    function templateComp(a, mogrt) {
        var t = a.__tpl && a.__tpl[mogrt];
        if (!t) throw new Error("Template not prepared: " + mogrt);
        var tag = TPL_TAG + t.tpl + "|" + t.key;
        var c = tplCache[tag];
        try { if (c && c.comment === tag) return c; } catch (e) { c = null; }
        c = findTemplate(tag);
        if (c) { tplCache[tag] = c; return c; }
        var f = new File(t.aep);
        if (!f.exists) throw new Error("Template project missing: " + t.aep);
        // items that exist before the import: AE can return an older folder with a similar name from importFile,
        // so the new template is found among the items the import added
        var before = {};
        for (var b = 1; b <= app.project.numItems; b++) before[app.project.item(b).id] = true;
        var imported = app.project.importFile(new ImportOptions(f));
        var found = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (!(it instanceof CompItem) || it.comment || before[it.id]) continue;
            var nm = "";
            try { nm = it.motionGraphicsTemplateName; } catch (e2) {}
            if (nm === t.tpl && it.motionGraphicsTemplateControllerCount > 0) { found = it; break; }
        }
        if (!found) throw new Error("Template comp \"" + t.tpl + "\" not found in " + t.aep);
        found.comment = tag;
        // the folder of the import: the new top folder that holds the template comp
        var top = found.parentFolder;
        while (top && top.parentFolder && top.parentFolder !== app.project.rootFolder) top = top.parentFolder;
        if (top && top !== app.project.rootFolder && !before[top.id]) imported = top;
        else if (!imported || before[imported.id]) imported = null;
        try { if (imported) { imported.parentFolder = templatesFolder(); imported.name = t.tpl; } } catch (e3) {}
        tplCache[tag] = found;
        return found;
    }

    // ---------- caption layers ----------
    function overrides(L) { try { return L.property("ADBE Layer Overrides"); } catch (e) { return null; } }
    function prop(L, name) {
        var ov = overrides(L);
        if (!ov) return null;
        for (var i = 1; i <= ov.numProperties; i++) if (ov.property(i).name === name) return ov.property(i);
        return null;
    }
    function isTagged(L) { try { return String(L.comment).indexOf(TAG) === 0; } catch (e) { return false; } }
    function isCaption(L) { return (L instanceof AVLayer) && isTagged(L) && !!prop(L, TEMPLATE_KEY); }
    function isLyrics(L) { return (L instanceof AVLayer) && !!prop(L, "Line 1") && !!prop(L, "Speed") && !!prop(L, "Custom Colors"); }
    function findClip(track, ticks, node) {
        var id = Number(node || ticks);
        try { return app.project.layerByID(id); } catch (e) { return null; }
    }
    function addr(L) { return { track: 0, ticks: String(L.id), node: L.id }; }
    function plainOf(v) { return (v instanceof TextDocument) ? v.text : String(v); }

    function readParam(p, v) {
        if (v.c) { var c = p.value; return { c: [c[0] * 255, c[1] * 255, c[2] * 255] }; }
        if (v.t !== undefined) return { t: plainOf(p.value) };
        if (v.d !== undefined) return { d: Number(p.value) };
        if (v.b !== undefined) return { b: !!p.value };
        return { n: Number(p.value) };
    }
    function same(a, b) {
        if (a.c && b.c) return Math.abs(a.c[0] - b.c[0]) < 1 && Math.abs(a.c[1] - b.c[1]) < 1 && Math.abs(a.c[2] - b.c[2]) < 1;
        if (a.n !== undefined && b.n !== undefined) return Math.abs(a.n - b.n) < 0.0001;
        if (a.d !== undefined) return a.d === b.d;
        if (a.b !== undefined) return a.b === b.b;
        return false;
    }
    // prm: { name: {c:[r,g,b] 0-255} | {n} | {b} | {d: AE menu index} | {t, f} }
    function applyParams(L, prm, before) {
        var ov = overrides(L), errs = [], byName = {};
        if (!ov) return "not a template layer";
        for (var i = 1; i <= ov.numProperties; i++) byName[ov.property(i).name] = ov.property(i);
        for (var name in prm) {
            if (!prm.hasOwnProperty(name)) continue;
            var v = prm[name], p = byName[name];
            if (!p) continue;
            var old = null;
            try { old = readParam(p, v); } catch (e0) { old = null; }
            if (old && v.t === undefined && same(old, v)) continue;
            if (before && old) before[name] = old;
            try {
                if (v.c) p.setValue([v.c[0] / 255, v.c[1] / 255, v.c[2] / 255, 1]);
                else if (v.t !== undefined) {
                    var td = p.value;
                    if (td instanceof TextDocument) {
                        td.text = String(v.t).length ? String(v.t) : " ";
                        if (v.f) { try { td.font = v.f; } catch (eF) {} }
                        p.setValue(td);
                    } else p.setValue(String(v.t));
                }
                else if (v.d !== undefined) p.setValue(v.d);
                else if (v.b !== undefined) p.setValue(v.b ? 1 : 0);
                else if (v.n !== undefined) p.setValue(v.n);
            } catch (e) { errs.push(name + ": " + msg(e)); }
        }
        return errs.join("; ");
    }
    function readAll(L) {
        var ov = overrides(L), prm = {};
        if (!ov) return prm;
        for (var i = 1; i <= ov.numProperties; i++) {
            var p = ov.property(i), n = p.name;
            try {
                if (p.propertyValueType === COLOR_TYPE) { var c = p.value; prm[n] = { c: [c[0] * 255, c[1] * 255, c[2] * 255] }; }
                else if (p.propertyValueType === TEXT_TYPE) prm[n] = { v: plainOf(p.value) };
                else if (DROPDOWNS[n]) prm[n] = { d: Number(p.value) };
                else prm[n] = { v: p.value };
            } catch (e) {}
        }
        return prm;
    }
    // full snapshot in applyParams form (undo of a swap)
    function snapshotParams(L) {
        var ov = overrides(L), prm = {};
        if (!ov) return prm;
        for (var i = 1; i <= ov.numProperties; i++) {
            var p = ov.property(i), n = p.name;
            try {
                if (p.propertyValueType === COLOR_TYPE) { var c = p.value; prm[n] = { c: [c[0] * 255, c[1] * 255, c[2] * 255] }; }
                else if (p.propertyValueType === TEXT_TYPE) prm[n] = { t: plainOf(p.value) };
                else if (DROPDOWNS[n]) prm[n] = { d: Number(p.value) };
                else prm[n] = { n: Number(p.value) };
            } catch (e) {}
        }
        return prm;
    }
    function getMotion(L) {
        var c = L.containingComp, pos = null, sc = null;
        try { var p = L.property("ADBE Transform Group").property("ADBE Position").value; pos = [p[0] / c.width, p[1] / c.height]; } catch (e) {}
        try { sc = L.property("ADBE Transform Group").property("ADBE Scale").value[0]; } catch (e2) {}
        return { pos: pos, scale: sc };
    }
    function setMotion(L, pos, scale) {
        var c = L.containingComp, tg = L.property("ADBE Transform Group");
        try { if (pos) { var cur = tg.property("ADBE Position").value; var nv = [pos[0] * c.width, pos[1] * c.height]; if (cur.length > 2) nv.push(cur[2]); tg.property("ADBE Position").setValue(nv); } } catch (e) {}
        try { if (scale) { var s = tg.property("ADBE Scale").value; var ns = [scale, scale]; if (s.length > 2) ns.push(s[2]); tg.property("ADBE Scale").setValue(ns); } } catch (e2) {}
    }
    // a template layer at [s, e] in comp, on top
    function placeLayer(comp, tpl, s, e) {
        var L = comp.layers.add(tpl);
        L.startTime = s;
        L.outPoint = Math.min(Math.max(s + comp.frameDuration, e), s + tpl.duration);
        L.comment = TAG;
        return L;
    }

    // ---------- info / audio ----------
    function info() {
        var comp = compOrNull();
        if (!comp) return noComp();
        var a = [], caps = 0, sel = 0;
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            if (isTagged(L)) { caps++; if (L.selected) sel++; continue; }
            var has = false;
            try { has = L.hasAudio; } catch (e) {}
            if (has) a.push({ i: i - 1, name: L.name, clips: 1, muted: !L.audioEnabled });
        }
        return ok({
            name: comp.name, id: comp.id, w: comp.width, h: comp.height, fps: comp.frameRate,
            inPt: comp.workAreaStart, outPt: comp.workAreaStart + comp.workAreaDuration, end: comp.duration,
            video: [{ i: 0, name: "Layers", clips: caps }], audio: a, selected: sel,
            app: "After Effects " + app.version, projectPath: app.project.file ? app.project.file.fsName : "", host: "AEFT"
        });
    }
    // AE renders audio as AIFF; the panel turns it into the WAV the speech engine reads.
    function exportAudio(argStr) {
        var a = P(argStr), comp = compOrNull();
        if (!comp) return noComp();
        var aif = new File(String(a.out).replace(/\.wav$/i, "") + ".aif");
        if (aif.exists) aif.remove();
        var keep = {}, restore = [], rqState = [];
        if (a.tracks && a.tracks.length) {
            for (var k = 0; k < a.tracks.length; k++) keep[a.tracks[k] + 1] = 1;
            for (var i = 1; i <= comp.numLayers; i++) {
                var L = comp.layer(i), has = false;
                try { has = L.hasAudio; } catch (e0) {}
                if (!has) continue;
                restore.push([L, L.audioEnabled]);
                try { L.audioEnabled = !!keep[i]; } catch (e1) {}
            }
        }
        var rq = app.project.renderQueue, item = null, err = "";
        for (var r = 1; r <= rq.numItems; r++) { try { rqState.push([rq.item(r), rq.item(r).render]); rq.item(r).render = false; } catch (e2) {} }
        try {
            item = rq.items.add(comp);
            var om = item.outputModule(1);
            om.applyTemplate("AIFF 48kHz");
            om.file = aif;
            if (a.inOut) { item.timeSpanStart = comp.workAreaStart; item.timeSpanDuration = comp.workAreaDuration; }
            else { item.timeSpanStart = 0; item.timeSpanDuration = comp.duration; }
            rq.render();
        } catch (e3) { err = msg(e3); }
        try { if (item) item.remove(); } catch (e4) {}
        for (var s = 0; s < rqState.length; s++) { try { rqState[s][0].render = rqState[s][1]; } catch (e5) {} }
        for (var t = 0; t < restore.length; t++) { try { restore[t][0].audioEnabled = restore[t][1]; } catch (e6) {} }
        if (!aif.exists) return fail("Audio render failed" + (err ? ": " + err : ". Does the comp have audio?"));
        return ok({ path: aif.fsName, aiff: true, offset: a.inOut ? comp.workAreaStart : 0 });
    }
    function pickTrack(argStr) { return compOrNull() ? ok({ track: 0 }) : noComp(); }

    // ---------- insert / edit ----------
    // payload: {mogrt, custom, textParam, params, motion, caps:[{s,e,main,punch,text,data,name,lines}], mainFont, punchFont, sameParams, __tpl}
    function insert(argStr) {
        var a = P(argStr), comp = compOrNull();
        if (!comp) return noComp();
        var tpl;
        try { tpl = templateComp(a, a.mogrt); } catch (e) { return fail(msg(e)); }
        var done = 0, errs = [], made = [];
        app.beginUndoGroup("Bunnys Caption: add captions");
        try {
            for (var i = 0; i < a.caps.length; i++) {
                var c = a.caps[i], L = null;
                try { L = placeLayer(comp, tpl, c.s, c.e); } catch (e1) { errs.push("add at " + c.s + ": " + msg(e1)); continue; }
                var prm = {};
                for (var k in a.params) if (a.params.hasOwnProperty(k)) prm[k] = a.params[k];
                if (a.custom && c.lines) { for (var ln in c.lines) if (c.lines.hasOwnProperty(ln)) prm[ln] = { t: c.lines[ln] }; }
                else if (a.custom) {
                    if (a.textParam) prm[a.textParam] = { t: c.text };
                    if (a.sameParams) for (var sp = 0; sp < a.sameParams.length; sp++) prm[a.sameParams[sp]] = { t: c.text };
                } else {
                    prm["Caption Text"] = { t: c.main };
                    prm["Emphasis Text"] = { t: c.punch };
                    prm["Caption Font"] = { t: a.mainFont || "" };
                    prm["Emphasis Font"] = { t: a.punchFont || "" };
                    prm["Timing Data"] = { t: c.data };
                }
                var er = applyParams(L, prm);
                if (er) errs.push(er);
                if (a.motion) setMotion(L, a.motion.pos, a.motion.scale);
                if (c.name) { try { L.name = c.name; } catch (e2) {} }
                made.push(addr(L));
                done++;
            }
        } finally { app.endUndoGroup(); }
        return ok({ done: done, errs: errs.slice(0, 5), made: made });
    }
    function readClip(L) {
        var o = addr(L);
        o.s = L.inPoint; o.e = L.outPoint; o.params = readAll(L); o.motion = getMotion(L); o.pro = !!prop(L, PRO_KEY);
        return o;
    }
    function lyricsText(L) {
        var out = [];
        for (var k = 1; k <= 3; k++) { var p = prop(L, "Line " + k); if (!p) break; var t = plainOf(p.value).replace(/^\s+|\s+$/g, ""); if (t) out.push(t); }
        return out.join(" ");
    }
    function readSelection(argStr) {
        var comp = compOrNull();
        if (!comp) return noComp();
        var out = [], other = [], sel = comp.selectedLayers;
        for (var i = 0; i < sel.length; i++) {
            var L = sel[i];
            if (isCaption(L)) { out.push(readClip(L)); continue; }
            var t = null;
            if (isLyrics(L)) t = lyricsText(L);
            else if (L instanceof TextLayer) { try { t = L.property("Source Text").value.text; } catch (e) { t = null; } }
            if (t === null) continue;
            var o = addr(L);
            o.isText = true; o.text = t; o.name = L.name; o.raw = ""; o.s = L.inPoint; o.e = L.outPoint; o.motion = getMotion(L);
            other.push(o);
        }
        return ok({ clips: out, texts: other, project: app.project.file ? app.project.file.fsName : "" });
    }
    // replace each clip by a new template layer with the same timing (any text clip -> styled caption)
    function convertClips(argStr) {
        var a = P(argStr), comp = compOrNull();
        if (!comp) return noComp();
        var tpl;
        try { tpl = templateComp(a, a.mogrt); } catch (e) { return fail(msg(e)); }
        var done = 0, errs = [];
        app.beginUndoGroup("Bunnys Caption: convert");
        try {
            for (var i = 0; i < a.clips.length; i++) {
                var c = a.clips[i], old = findClip(c.track, c.ticks, c.node);
                if (!old) { errs.push("layer gone: " + c.node); continue; }
                var s0 = old.inPoint, e0 = old.outPoint, nm = old.name, at = old.index;
                var L = placeLayer(old.containingComp, tpl, s0, e0);
                try { L.moveBefore(old); } catch (eM) {}
                var er = applyParams(L, c.params);
                if (er) errs.push(er);
                if (c.motion) setMotion(L, c.motion.pos, c.motion.scale);
                try { L.name = nm || "Bunnys Caption"; } catch (e1) {}
                try { old.remove(); } catch (e2) { errs.push("could not remove the original"); }
                done++;
            }
        } finally { app.endUndoGroup(); }
        return ok({ done: done, errs: errs.slice(0, 5) });
    }
    function swapLayer(L, tpl, keepAll) {
        var s0 = L.inPoint, e0 = L.outPoint, nm = L.name, mo = getMotion(L);
        var keep = keepAll ? snapshotParams(L) : {};
        if (!keepAll) {
            var names = ["Caption Text", "Emphasis Text", "Timing Data", "Caption Font", "Emphasis Font"];
            for (var i = 0; i < names.length; i++) { var p = prop(L, names[i]); if (p) keep[names[i]] = { t: plainOf(p.value) }; }
        }
        var N = placeLayer(L.containingComp, tpl, s0, e0);
        try { N.moveBefore(L); } catch (e) {}
        applyParams(N, keep);
        if (mo) setMotion(N, mo.pos, mo.scale);
        try { N.name = nm; } catch (e2) {}
        L.remove();
        return N;
    }
    // payload: {liteMogrt, proMogrt, clips:[{track,ticks,node,params,motion,pro,needs,end}], __tpl}
    function updateClips(argStr) {
        var a = P(argStr), comp = compOrNull();
        if (!comp) return noComp();
        var done = 0, errs = [], swapped = 0, undo = [];
        app.beginUndoGroup("Bunnys Caption: update");
        try {
            for (var i = 0; i < a.clips.length; i++) {
                var c = a.clips[i], L = findClip(c.track, c.ticks, c.node);
                if (!L) { errs.push("layer gone: " + c.node); continue; }
                var wasSwapped = false, oldSnap = null, oldMogrt = a.liteMogrt;
                var outdated = false;
                if (c.needs) for (var nd = 0; nd < c.needs.length; nd++) if (!prop(L, c.needs[nd])) { outdated = true; break; }
                var isPro = !!prop(L, PRO_KEY);
                if ((c.pro && a.proMogrt && !isPro) || (outdated && (isPro || c.pro ? a.proMogrt : a.liteMogrt))) {
                    try {
                        oldSnap = { params: snapshotParams(L), motion: getMotion(L), s: L.inPoint, e: L.outPoint, name: L.name };
                        if (isPro) oldMogrt = a.proMogrt;
                        L = swapLayer(L, templateComp(a, (c.pro || isPro) ? a.proMogrt : a.liteMogrt), false);
                        swapped++; wasSwapped = true;
                    } catch (eS) { errs.push("swap: " + msg(eS)); continue; }
                }
                var before = {}, mo = c.motion ? getMotion(L) : null, end0 = L.outPoint;
                var er = applyParams(L, c.params, wasSwapped ? null : before);
                if (er) errs.push(er);
                if (c.motion) setMotion(L, c.motion.pos, c.motion.scale);
                if (c.end) { try { L.outPoint = c.end; } catch (eE) {} }
                var ad = addr(L);
                if (!wasSwapped) { ad.params = before; ad.motion = mo; ad.end = c.end ? end0 : 0; undo.push(ad); }
                else if (oldSnap && oldMogrt) { oldSnap.mogrt = oldMogrt; ad.swap = oldSnap; undo.push(ad); }
                done++;
            }
        } finally { app.endUndoGroup(); }
        return ok({ done: done, swapped: swapped, errs: errs.slice(0, 5), undo: undo });
    }
    // put a swapped layer back: payload {clips:[{track,ticks,node,swap:{mogrt,params,motion,s,e,name}}], __tpl}
    function unswap(argStr) {
        var a = P(argStr), done = 0, back = [];
        app.beginUndoGroup("Bunnys Caption: undo");
        try {
            for (var i = 0; i < a.clips.length; i++) {
                var c = a.clips[i], sw = c.swap, L = findClip(c.track, c.ticks, c.node);
                if (!L || !sw) continue;
                var tpl;
                try { tpl = templateComp(a, sw.mogrt); } catch (e) { continue; }
                var N = placeLayer(L.containingComp, tpl, sw.s, sw.e);
                try { N.moveBefore(L); } catch (e1) {}
                applyParams(N, sw.params);
                if (sw.motion) setMotion(N, sw.motion.pos, sw.motion.scale);
                try { N.name = sw.name; } catch (e2) {}
                L.remove();
                back.push(addr(N));
                done++;
            }
        } finally { app.endUndoGroup(); }
        return ok({ done: done, clips: back });
    }
    function removeCaptions(argStr) {
        var comp = compOrNull();
        if (!comp) return noComp();
        var n = 0;
        app.beginUndoGroup("Bunnys Caption: remove captions");
        try { for (var i = comp.numLayers; i >= 1; i--) { var L = comp.layer(i); if (isCaption(L) || (isTagged(L) && isLyrics(L))) { L.remove(); n++; } } }
        finally { app.endUndoGroup(); }
        return ok({ removed: n });
    }
    function removeClips(argStr) {
        var a = P(argStr), n = 0;
        app.beginUndoGroup("Bunnys Caption: remove");
        try { for (var i = 0; i < a.clips.length; i++) { var L = findClip(a.clips[i].track, a.clips[i].ticks, a.clips[i].node); if (L) { try { L.remove(); n++; } catch (e) {} } } }
        finally { app.endUndoGroup(); }
        return ok({ removed: n });
    }
    function applyToSelection(argStr) {
        var a = P(argStr), comp = compOrNull();
        if (!comp) return noComp();
        var n = 0, undo = [], outdated = 0, sel = comp.selectedLayers;
        app.beginUndoGroup("Bunnys Caption: quick change");
        try {
            for (var i = 0; i < sel.length; i++) {
                var L = sel[i];
                if (!isCaption(L)) continue;
                var before = {}, mo = a.motion ? getMotion(L) : null;
                for (var pn in (a.params || {})) { if (a.params.hasOwnProperty(pn) && !prop(L, pn) && !PRO_ONLY[pn]) { outdated++; break; } }
                applyParams(L, a.params || {}, before);
                if (a.motion) setMotion(L, a.motion.pos || null, a.motion.scale || null);
                var ad = addr(L); ad.params = before; ad.motion = mo;
                undo.push(ad);
                n++;
            }
        } finally { app.endUndoGroup(); }
        return ok({ done: n, undo: undo, outdated: outdated });
    }

    // ---------- Lyrics ----------
    function lyricsRead() {
        var comp = compOrNull();
        if (!comp) return noComp();
        var sel = comp.selectedLayers, n = 0, first = null;
        for (var i = 0; i < sel.length; i++) {
            var L = sel[i];
            if (!isLyrics(L)) continue;
            n++;
            if (first) continue;
            var ov = overrides(L), vals = {}, lines = 0;
            for (var j = 1; j <= ov.numProperties; j++) {
                var p = ov.property(j), nm = p.name;
                try {
                    if (/^Line \d$/.test(nm)) { lines++; continue; }
                    if (p.propertyValueType === COLOR_TYPE) { var c = p.value; vals[nm] = { c: [c[0] * 255, c[1] * 255, c[2] * 255] }; }
                    else if (nm === "Custom Colors") vals[nm] = { b: !!p.value };
                    else vals[nm] = { n: Number(p.value) };
                } catch (e) {}
            }
            first = { text: lyricsText(L), lines: lines, values: vals, name: L.name };
        }
        return ok({ count: n, first: first });
    }
    function lyricsSet(argStr) {
        var a = P(argStr), comp = compOrNull();
        if (!comp) return noComp();
        var sel = comp.selectedLayers, done = 0, errs = [];
        app.beginUndoGroup("Bunnys Caption: Lyrics change");
        try {
            for (var i = 0; i < sel.length; i++) {
                var L = sel[i];
                if (!isLyrics(L)) continue;
                var prm = {};
                for (var k in a.params) if (a.params.hasOwnProperty(k)) prm[k] = a.params[k];
                if (a.lines) for (var l in a.lines) if (a.lines.hasOwnProperty(l)) prm[l] = { t: a.lines[l] };
                var er = applyParams(L, prm);
                if (er) errs.push(er);
                if (a.lines) { try { L.name = lyricsText(L).slice(0, 40); } catch (e2) {} }
                done++;
            }
        } finally { app.endUndoGroup(); }
        return ok({ done: done, errs: errs.slice(0, 5) });
    }

    // ---------- misc ----------
    function ping() { return ok({ version: app.version, host: "AEFT" }); }
    function saveProject() {
        if (!app.project.file) return fail("Save the After Effects project once first (File > Save).");
        try { app.project.save(); } catch (e) { return fail("Could not save the project: " + msg(e)); }
        return ok({ path: app.project.file.fsName });
    }
    // AE's own Edit > Undo / Redo
    function premiereUndo(argStr) {
        var a = P(argStr);
        try { app.executeCommand(a.redo ? 2035 : 16); } catch (e) { return fail("Undo is not available here: " + msg(e)); }
        return ok({});
    }
    function undoIndex() { return ok({ index: -1 }); }
    function selfTest(argStr) {
        var a = P(argStr), comp = compOrNull(), rep = { steps: [] };
        function step(name, fn) {
            try { rep.steps.push({ name: name, ok: true, info: fn() }); }
            catch (e) { rep.steps.push({ name: name, ok: false, info: msg(e) + (e && e.line ? " @" + e.line : "") }); }
        }
        if (!comp) return noComp();
        var at = a.at === undefined ? comp.time : a.at, L = null, tpl = null;
        step("app", function () { return "After Effects " + app.version + " / " + comp.name + " " + comp.width + "x" + comp.height; });
        step("template", function () { tpl = templateComp(a, a.mogrt); return tpl.name + " " + tpl.width + "x" + tpl.height; });
        if (!tpl) return ok(rep);
        step("add layer", function () { L = placeLayer(comp, tpl, at, at + 2); return "in " + L.inPoint + " out " + L.outPoint; });
        if (!L) return ok(rep);
        step("set params", function () {
            return applyParams(L, { "Caption Text": { t: "SELF TEST\rLINE TWO" }, "Emphasis Text": { t: "WORKS" }, "Text Color": { c: [255, 138, 0] },
                "Highlight Mode": { d: 3 }, "Glow": { n: 40 }, "Fade Out": { b: true }, "Timing Data": { t: "0010#2#0,0.5|0.5,1|1,1.5" } }) || "no errors";
        });
        step("read back", function () { var p = readAll(L); return "Caption=" + (p["Caption Text"] ? p["Caption Text"].v : "?") + " HM=" + (p["Highlight Mode"] ? p["Highlight Mode"].d : "?"); });
        step("motion", function () { setMotion(L, [0.5, 0.7], 110); return J(getMotion(L)); });
        if (!a.keep) step("remove", function () { L.remove(); return "removed"; });
        return ok(rep);
    }

    return {
        ping: ping, info: info, exportAudio: exportAudio, pickTrack: pickTrack, insert: insert,
        lyricsRead: lyricsRead, lyricsSet: lyricsSet,
        readSelection: readSelection, saveProject: saveProject, convertClips: convertClips, applyToSelection: applyToSelection, updateClips: updateClips,
        removeCaptions: removeCaptions, removeClips: removeClips, premiereUndo: premiereUndo, undoIndex: undoIndex, unswap: unswap, selfTest: selfTest
    };
})();
