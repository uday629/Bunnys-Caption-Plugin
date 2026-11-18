// Builds the 22 Bunnys Caption Lyrics .mogrt files (source comps TXT 1..22) with Bunnys Caption controls.
// Wrapper comp "Bunnys Caption Lyrics nn" = the original comp (time-remapped for Speed) + glow / light sweep / shadow / opacity,
// all driven by a "BC Controls" null. Each text line can be recoloured (Fill effect, off by default).
var AEP = ""; // set to the lyric source project (.aep with comps "TXT 1" .. "TXT 22")
var BASE = "E:/Claude Desktop/Bunnys Caption Lyrics Build";
var OUTDIR = BASE + "/mogrt";
var LOG = BASE + "/mogrt_log.txt";
var TEST = { 1: 1, 5: 1, 14: 1 }; // also render a frame with the controls turned up
var STEP = "";
var ONLY = null;
function log(m) { var l = new File(LOG); l.open("a"); l.writeln(m); l.close(); }
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function jsStr(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"'; }
function q(s) { return '"' + s + '"'; }

function fixFonts() {
    var MAP = { "Anton": ["Anton", "Regular"], "InterItalic-ExtraBoldItalic": ["Inter", "Extra Bold Italic"] };
    function psFor(fam, sty) {
        var all = app.fonts.allFonts;
        for (var a = 0; a < all.length; a++) for (var b = 0; b < all[a].length; b++) {
            var fo = all[a][b];
            if (fo.familyName === fam && fo.styleName === sty && !fo.isSubstitute) return fo.postScriptName;
        }
        return null;
    }
    var fixed = 0;
    for (var ci = 1; ci <= app.project.numItems; ci++) {
        var ct = app.project.item(ci);
        if (!(ct instanceof CompItem)) continue;
        for (var li = 1; li <= ct.numLayers; li++) {
            var tl = ct.layer(li);
            if (!(tl instanceof TextLayer)) continue;
            var sp = tl.property("Source Text"), td = sp.value, m = MAP[td.font];
            // the script font shows mixed case in the originals although All Caps is set (old layout cache); keep it mixed case
            if (/^Sloop/.test(td.font) && td.allCaps && sp.numKeys === 0) {
                try { td.fontCapsOption = FontCapsOption.FONT_NORMAL_CAPS; sp.setValue(td); log("caps off: " + ct.name + "/" + tl.name + " -> " + sp.value.allCaps); }
                catch (eC) { log("caps off failed " + ct.name + "/" + tl.name + ": " + eC); }
                td = sp.value;
            }
            if (!m) continue;
            var ps = psFor(m[0], m[1]);
            if (!ps) { log("no installed font for " + td.font); continue; }
            if (sp.numKeys > 0) { for (var kk = 1; kk <= sp.numKeys; kk++) { var kd = sp.keyValue(kk); kd.font = ps; sp.setValueAtKey(kk, kd); } }
            else { td.font = ps; sp.setValue(td); }
            fixed++;
        }
    }
    log("font remapped layers: " + fixed);
}
function findComp(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
}
function addFx(layer, match, name) {
    var fx = layer.property("ADBE Effect Parade").addProperty(match);
    if (name) fx.name = name;
    return fx;
}
function textColor(td) {
    try { if (td.applyFill) return td.fillColor; } catch (e) {}
    try { if (td.applyStroke) return td.strokeColor; } catch (e2) {}
    return [1, 1, 1];
}

function diag(n, w, L, inner, at) {
    var bad = [];
    function chk(p, nm) { try { if (p.expression && p.expressionError) bad.push(nm + ": " + p.expressionError); } catch (e) { bad.push(nm + " ?" + e); } }
    chk(L.property("ADBE Time Remapping"), "remap");
    chk(L.property("ADBE Transform Group").property("ADBE Opacity"), "opacity");
    var fx = L.property("ADBE Effect Parade");
    for (var i = 1; i <= fx.numProperties; i++) for (var j = 1; j <= fx.property(i).numProperties; j++) chk(fx.property(i).property(j), fx.property(i).name + "/" + fx.property(i).property(j).name);
    for (var k = 1; k <= inner.numLayers; k++) { var l = inner.layer(k); if (!(l instanceof TextLayer)) continue; chk(l.property("Source Text"), l.name + "/text"); var f = l.property("ADBE Effect Parade").property("BC Color"); if (f) { chk(f.property("Map White To"), l.name + "/tintC"); chk(f.property("Amount to Tint"), l.name + "/tintA"); } }
    var rv = "?", ov = "?";
    try { rv = L.property("ADBE Time Remapping").valueAtTime(at, false); ov = L.property("ADBE Transform Group").property("ADBE Opacity").valueAtTime(at, false); } catch (e) {}
    log("diag " + n + " remap@" + at.toFixed(2) + "=" + rv + " opacity=" + ov + " L.in=" + L.inPoint + " out=" + L.outPoint + " errs=" + bad.join(" | "));
    try { inner.saveFrameToPng(at, new File(BASE + "/frames/" + n + "_inner.png")); } catch (e) {}
}
function build(n) {
    var inner = findComp("TXT " + n);
    if (!inner) { log("TXT " + n + " missing"); return; }
    var wname = "Bunnys Caption Lyrics " + pad(n), ctl = 'comp(' + q(wname) + ').layer("BC Controls")';
    STEP = "0 inner comp";
    // ---- inner comp: text fields + per-line colour ----
    var lines = [], texts = [], tls = [], hold = inner.duration;
    for (var j = 1; j <= inner.numLayers; j++) {
        var l = inner.layer(j);
        if (l.enabled && l.outPoint < hold && l.outPoint > 0.5) hold = l.outPoint;
        if (!(l instanceof TextLayer) || lines.length >= 3) continue;
        var k = lines.length + 1;
        texts.push(l.property("Source Text").value.text);
        tls.push(l);
        var fill = addFx(l, "ADBE Tint", "BC Color");
        fill.moveTo(1);
        fill = l.property("ADBE Effect Parade").property("BC Color");
        var col = textColor(l.property("Source Text").value);
        fill.property("Map Black To").setValue(col); fill.property("Map White To").setValue(col);
        var opFull = fill.property("Amount to Tint").value;
        lines.push(col);
    }
    hold = Math.max(0.5, hold - inner.frameDuration);

    STEP = "1 wrapper comp";
    // ---- wrapper comp ----
    var w = app.project.items.addComp(wname, inner.width, inner.height, inner.pixelAspect, 10, inner.frameRate);
    var L = w.layers.add(inner);
    L.name = "Lyrics";
    for (var tx = texts.length; tx >= 1; tx--) { var tl = w.layers.addText(texts[tx - 1]); tl.name = "Line " + tx; tl.enabled = false; }
    var c = w.layers.addNull(10);
    c.name = "BC Controls";
    function slider(nm, v) { addFx(c, "ADBE Slider Control", nm).property(1).setValue(v); }
    function color(nm, v) { addFx(c, "ADBE Color Control", nm).property(1).setValue(v); }
    function check(nm, v) { addFx(c, "ADBE Checkbox Control", nm).property(1).setValue(v); }
    var eg = [];
    slider("Speed", 50);
    check("Custom Colors", 0);
    for (var i = 0; i < lines.length; i++) color("Line " + (i + 1) + " Color", lines[i]);
    var hero = lines[lines.length > 1 ? 1 : 0] || [1, 1, 1];
    slider("Glow", 0); color("Glow Color", hero);
    slider("Light Sweep", 0); color("Sweep Color", [1, 1, 1]);
    slider("Shadow", 0); color("Shadow Color", [0, 0, 0]);
    slider("Opacity", 100);
    for (var z = 0; z < tls.length; z++) {
        var zl = tls[z], zk = z + 1, zf = zl.property("ADBE Effect Parade").property("BC Color");
        // the script font shows mixed case in the originals although All Caps is set; through an expression it would apply
        var zdoc = zl.property("Source Text").value, zsc = /^Sloop/.test(zdoc.font) && zdoc.allCaps;
        zl.property("Source Text").expression = 'var t = String(comp(' + q(wname) + ').layer("Line ' + zk + '").text.sourceText);\n' +
            't == ' + jsStr(texts[z]) + ' ? value : t';
        zf.property("Map Black To").expression = ctl + '.effect("Line ' + zk + ' Color")("Color")';
        zf.property("Map White To").expression = ctl + '.effect("Line ' + zk + ' Color")("Color")';
        zf.property("Amount to Tint").expression = ctl + '.effect("Custom Colors")("Checkbox") * ' + opFull;
    }
    function cp(nm) { return c.property("ADBE Effect Parade").property(nm).property(1); }
    var C = 'thisComp.layer("BC Controls")';

    STEP = "2 speed";
    // speed: 50 = original, 0 = 1/4, 100 = 4x; holds the last full frame
    L.timeRemapEnabled = true;
    L.outPoint = w.duration;
    L.property("ADBE Time Remapping").expression =
        'var m = Math.pow(2, (' + C + '.effect("Speed")("Slider") - 50) / 25);\nMath.min(Math.max(0, (time - inPoint) * m), ' + hold.toFixed(4) + ');';
    L.property("ADBE Transform Group").property("ADBE Opacity").expression = C + '.effect("Opacity")("Slider")';

    STEP = "3 var g  addFx";
    var g = addFx(L, "ADBE Glo2", "BC Glow");
    g.property("Glow Colors").setValue(2);
    g.property("Glow Threshold").setValue(60);
    g.property("Glow Intensity").expression = C + '.effect("Glow")("Slider") / 100';
    g.property("Glow Radius").expression = '10 + ' + C + '.effect("Glow")("Slider") * 0.4';
    g.property("Color A").expression = C + '.effect("Glow Color")("Color")';
    g.property("Color B").expression = C + '.effect("Glow Color")("Color")';

    STEP = "4 var s  addFx";
    var s = addFx(L, "CC Light Sweep", "BC Sweep");
    s.property("Width").setValue(60);
    s.property("Sweep Intensity").expression = C + '.effect("Light Sweep")("Slider")';
    s.property("Edge Intensity").expression = C + '.effect("Light Sweep")("Slider") * 1.5';
    s.property("Light Color").expression = C + '.effect("Sweep Color")("Color")';
    s.property("Center").expression = 'var p = ((time - inPoint) % 1.6) / 1.6;\n[linear(p, 0, 1, -0.2 * thisComp.width, 1.2 * thisComp.width), thisComp.height / 2]';

    STEP = "5 var d  addFx";
    var d = addFx(L, "ADBE Drop Shadow", "BC Shadow");
    var dOp = d.property("Opacity"), dFull = 1;
    try { if (dOp.hasMax && dOp.maxValue > 1) dFull = dOp.maxValue; } catch (e) {}
    dOp.expression = C + '.effect("Shadow")("Slider") / 100 * ' + dFull;
    d.property("Distance").setValue(10);
    d.property("Softness").setValue(25);
    d.property("Shadow Color").expression = C + '.effect("Shadow Color")("Color")';

    STEP = "6 Essential Graphics";
    // ---- Essential Graphics: text lines first, then the look ----
    for (var t = 1; t <= texts.length; t++) w.layer("Line " + t).property("Source Text").addToMotionGraphicsTemplateAs(w, "Line " + t);
    STEP = "7 pSpeedaddToMotion";
    var EG = ["Speed", "Custom Colors"];
    for (var u = 0; u < lines.length; u++) EG.push("Line " + (u + 1) + " Color");
    EG = EG.concat(["Glow", "Glow Color", "Light Sweep", "Sweep Color", "Shadow", "Shadow Color", "Opacity"]);
    for (var v = 0; v < EG.length; v++) cp(EG[v]).addToMotionGraphicsTemplateAs(w, EG[v]);

    STEP = "8 var at  Mathmin";
    var at = Math.min(hold, inner.duration * 2 / 3);
    diag(n, w, L, inner, at);
    try { w.saveFrameToPng(at, new File(BASE + "/frames/" + n + ".png")); } catch (e) { log("frame " + n + " " + e); }
    if (TEST[n]) {
        cp("Custom Colors").setValue(1); if (lines.length) cp("Line 1 Color").setValue([1, 0.8, 0]);
        cp("Glow").setValue(70); cp("Light Sweep").setValue(80); cp("Shadow").setValue(90);
        try { w.saveFrameToPng(at, new File(BASE + "/frames/" + n + "_ctl.png")); } catch (e) { log("ctl frame " + n + " " + e); }
        cp("Custom Colors").setValue(0); if (lines.length) cp("Line 1 Color").setValue(lines[0]);
        cp("Glow").setValue(0); cp("Light Sweep").setValue(0); cp("Shadow").setValue(0);
    }
    STEP = "9 wmotionGraphicsTemplateName";
    w.motionGraphicsTemplateName = wname;
    var ok = w.exportAsMotionGraphicsTemplate(true, new Folder(OUTDIR).fsName);
    log("TXT " + n + " lines=" + lines.length + " hold=" + hold.toFixed(2) + " shadowMax=" + dFull + " fillOp=" + opFull + " export=" + ok);
}

if (!AEP) throw new Error("Set AEP at the top of build_lyrics_mogrts.jsx first.");
try {
    try { app.beginSuppressDialogs(); } catch (e) {}
    new Folder(OUTDIR).create();
    new Folder(BASE + "/frames").create();
    app.open(new File(AEP));
    log("opened");
    var wf = new File(BASE + "/work/Bunnys Caption Lyrics.aep"); if (wf.exists) wf.remove();
    app.project.save(wf);
    fixFonts();
    for (var n = 1; n <= 22; n++) {
        if (ONLY && !ONLY[n]) continue;
        try { build(n); } catch (err) { log("TXT " + n + " ERR at " + STEP + ": " + err.toString() + " line " + err.line); }
    }
} catch (err2) { log("FATAL " + err2.toString() + " line " + err2.line); }
try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e) {}
try { app.endSuppressDialogs(false); } catch (e) {}
log("done");
