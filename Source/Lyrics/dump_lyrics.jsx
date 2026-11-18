// Dumps all TXT comps of the lyric source project into JSON (layers, text docs, animators, keyframes, expressions, effects)
var AEP = ""; // set to the lyric source project (.aep)
var OUT = "E:/Claude Desktop/Bunnys Caption Lyrics Build/lyrics_dump.json";

function esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t"); }
function js(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return isFinite(v) ? String(Math.round(v * 100000) / 100000) : "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return '"' + esc(v) + '"';
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(js(v[i])); return "[" + a.join(",") + "]"; }
    var p = []; for (var k in v) { if (v.hasOwnProperty(k)) p.push('"' + esc(k) + '":' + js(v[k])); }
    return "{" + p.join(",") + "}";
}
function val(v) {
    if (v instanceof TextDocument) {
        var d = { text: v.text };
        try { d.font = v.font; } catch (e) {}
        try { d.size = v.fontSize; } catch (e) {}
        try { d.fill = v.fillColor; d.applyFill = v.applyFill; } catch (e) {}
        try { d.stroke = v.strokeColor; d.applyStroke = v.applyStroke; d.strokeW = v.strokeWidth; } catch (e) {}
        try { d.tracking = v.tracking; d.just = String(v.justification); d.leading = v.leading; } catch (e) {}
        try { d.fauxB = v.fauxBold; d.fauxI = v.fauxItalic; d.allCaps = v.allCaps; d.smallCaps = v.smallCaps; } catch (e) {}
        return d;
    }
    if (v instanceof Shape) {
        try { return { shape: 1, v: v.vertices, i: v.inTangents, o: v.outTangents, closed: v.closed }; } catch (e) { return "shape"; }
    }
    return v;
}
function prop(p, depth) {
    var o = { n: p.name, m: p.matchName };
    if (p.propertyType === PropertyType.PROPERTY) {
        try { if (!p.enabled) o.off = 1; } catch (e) {}
        try { o.v = val(p.value); } catch (e) {}
        try { if (p.expressionEnabled && p.expression !== "") o.ex = p.expression; else if (p.expression !== "") o.exOff = p.expression; } catch (e) {}
        try {
            if (p.numKeys > 0) {
                var ks = [];
                for (var k = 1; k <= p.numKeys; k++) {
                    var key = { t: p.keyTime(k), v: val(p.keyValue(k)), ii: String(p.keyInInterpolationType(k)), oi: String(p.keyOutInterpolationType(k)) };
                    try {
                        if (p.keyInInterpolationType(k) === KeyframeInterpolationType.BEZIER || p.keyOutInterpolationType(k) === KeyframeInterpolationType.BEZIER) {
                            var ei = p.keyInTemporalEase(k), eo = p.keyOutTemporalEase(k);
                            key.ei = []; key.eo = [];
                            for (var q = 0; q < ei.length; q++) key.ei.push([ei[q].speed, ei[q].influence]);
                            for (var q2 = 0; q2 < eo.length; q2++) key.eo.push([eo[q2].speed, eo[q2].influence]);
                        }
                    } catch (e) {}
                    ks.push(key);
                }
                o.k = ks;
            }
        } catch (e) {}
    } else {
        o.c = [];
        for (var i = 1; i <= p.numProperties; i++) {
            try { o.c.push(prop(p.property(i), depth + 1)); } catch (e) {}
        }
    }
    return o;
}
function layerInfo(l) {
    var o = { name: l.name, idx: l.index, type: "", "in": l.inPoint, "out": l.outPoint, start: l.startTime, stretch: l.stretch, enabled: l.enabled, blend: String(l.blendingMode), td: l.threeDLayer };
    try { if (l.parent) o.parent = l.parent.index; } catch (e) {}
    try { o.matte = String(l.trackMatteType); } catch (e) {}
    if (l instanceof TextLayer) o.type = "text";
    else if (l instanceof ShapeLayer) o.type = "shape";
    else if (l instanceof CameraLayer) o.type = "camera";
    else if (l instanceof LightLayer) o.type = "light";
    else if (l instanceof AVLayer) { o.type = "av"; try { o.src = l.source.name; o.srcIsComp = (l.source instanceof CompItem); o.solid = (l.source.mainSource instanceof SolidSource); } catch (e) {} }
    o.props = [];
    for (var i = 1; i <= l.numProperties; i++) {
        try { o.props.push(prop(l.property(i), 0)); } catch (e) {}
    }
    return o;
}

var LOG="E:/Claude Desktop/Bunnys Caption Lyrics Build/dump_log.txt";
function log(m){var l=new File(LOG);l.open("a");l.writeln(m);l.close();}
log("start");
try{app.beginSuppressDialogs();}catch(e){log("nosup "+e);}
var res = { comps: [], other: [] };
try{
var f = new File(AEP);
app.open(f);
log("opened "+app.project.numItems);
for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem) {
        var c = { name: it.name, w: it.width, h: it.height, fps: it.frameRate, dur: it.duration, bg: it.bgColor, layers: [] };
        for (var j = 1; j <= it.numLayers; j++) {
            try { c.layers.push(layerInfo(it.layer(j))); } catch (e) { c.layers.push({ err: String(e) }); }
        }
        res.comps.push(c);
    } else {
        res.other.push({ name: it.name, type: it.typeName });
    }
}
}catch(e){log("ERR "+e+" line "+e.line);}
var out = new File(OUT);
out.encoding = "UTF-8";
out.open("w");
out.write(js(res));
out.close();
log("done");
try{app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);}catch(e){}
try{app.endSuppressDialogs(false);}catch(e){}
