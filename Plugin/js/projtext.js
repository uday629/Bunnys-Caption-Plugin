// Reads the text of Premiere text layers from the saved project file.
// Premiere's scripting API returns a text layer's "Source Text" as cut-off binary, but the project
// stores each text component with its text as InstanceName. Track item -> component chain -> text.
'use strict';
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

function unescapeXml(s) {
    return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, '&');
}

function readProject(file) {
    var buf = fs.readFileSync(file);
    try { return zlib.gunzipSync(buf).toString('utf8'); } catch (e) { return buf.toString('utf8'); }
}

// block of the object with this ObjectID
function objectBlock(xml, id) {
    var m = new RegExp('<(\\w+) ObjectID="' + id + '"[^>]*>').exec(xml);
    if (!m) return '';
    var end = xml.indexOf('</' + m[1] + '>', m.index);
    return end < 0 ? '' : xml.slice(m.index, end);
}

// nodeIds: track item node ids as Premiere scripting reports them (hex or decimal strings)
// returns {nodeId: text}
function textsFromXml(xml, nodeIds) {
    var out = {};
    nodeIds.forEach(function (nid) {
        var cands = [parseInt(nid, 16), parseInt(nid, 10)].filter(function (n, i, a) { return !isNaN(n) && a.indexOf(n) === i; });
        for (var c = 0; c < cands.length; c++) {
            var at = xml.indexOf('<ID>' + cands[c] + '</ID>');
            while (at >= 0) {
                var start = xml.lastIndexOf('<VideoClipTrackItem ObjectID=', at);
                var stop = xml.indexOf('</VideoClipTrackItem>', start);
                if (start >= 0 && stop > at) {
                    var item = xml.slice(start, stop);
                    var comp = /<Components ObjectRef="(\d+)"\/>/.exec(item);
                    if (comp) {
                        var chain = objectBlock(xml, comp[1]), texts = [], re = /<Component Index="\d+" ObjectRef="(\d+)"\/>/g, r;
                        while ((r = re.exec(chain))) {
                            var fx = objectBlock(xml, r[1]);
                            if (/<MatchName>AE\.ADBE Text<\/MatchName>/.test(fx)) {
                                var name = /<InstanceName>([\s\S]*?)<\/InstanceName>/.exec(fx);
                                if (name) texts.push(unescapeXml(name[1]));
                            }
                        }
                        if (texts.length) { out[nid] = texts.join(' '); break; }
                    }
                }
                at = xml.indexOf('<ID>' + cands[c] + '</ID>', at + 1);
            }
            if (out[nid]) break;
        }
    });
    return out;
}

// The project file plus Premiere's auto-saves of it, newest first.
function candidates(projectPath) {
    var list = [];
    if (projectPath && fs.existsSync(projectPath)) list.push(projectPath);
    try {
        var dir = path.join(path.dirname(projectPath), 'Adobe Premiere Pro Auto-Save');
        var base = path.basename(projectPath, '.prproj');
        fs.readdirSync(dir).forEach(function (f) {
            if (f.indexOf(base) === 0 && /\.prproj$/i.test(f)) list.push(path.join(dir, f));
        });
    } catch (e) { /* no auto-save folder */ }
    return list.map(function (f) { return { f: f, t: fs.statSync(f).mtimeMs }; })
        .sort(function (a, b) { return b.t - a.t; }).slice(0, 4).map(function (x) { return x.f; });
}

function lookup(projectPath, nodeIds) {
    var found = {}, left = nodeIds.slice();
    candidates(projectPath).forEach(function (f) {
        if (!left.length) return;
        try {
            var got = textsFromXml(readProject(f), left);
            Object.keys(got).forEach(function (k) { found[k] = got[k]; });
            left = left.filter(function (k) { return !found[k]; });
        } catch (e) { /* unreadable file */ }
    });
    return found;
}

// ---------- look of a Premiere text layer ----------
// The Source Text value is a binary (FlatBuffers) document that only stores what differs from Premiere's
// defaults. What can be read reliably: the font (PostScript name, the string before the text) and a fill
// colour when one is set (a table of three colour bytes).
function textItemBlock(xml, nid) {
    var cands = [parseInt(nid, 16), parseInt(nid, 10)].filter(function (n, i, a) { return !isNaN(n) && a.indexOf(n) === i; });
    for (var c = 0; c < cands.length; c++) {
        var at = xml.indexOf('<ID>' + cands[c] + '</ID>');
        while (at >= 0) {
            var start = xml.lastIndexOf('<VideoClipTrackItem ObjectID=', at);
            var stop = xml.indexOf('</VideoClipTrackItem>', start);
            if (start >= 0 && stop > at) {
                var comp = /<Components ObjectRef="(\d+)"\/>/.exec(xml.slice(start, stop));
                if (comp) {
                    var chain = objectBlock(xml, comp[1]), re = /<Component Index="\d+" ObjectRef="(\d+)"\/>/g, r;
                    while ((r = re.exec(chain))) {
                        var fx = objectBlock(xml, r[1]);
                        if (/<MatchName>AE\.ADBE Text<\/MatchName>/.test(fx)) return fx;
                    }
                }
            }
            at = xml.indexOf('<ID>' + cands[c] + '</ID>', at + 1);
        }
    }
    return '';
}
function styleFromBlob(b, text) {
    var out = {};
    var strs = [], re = /[ -~]{3,}/g, m, asc = b.toString('latin1');
    while ((m = re.exec(asc))) strs.push(m[0]);
    for (var i = 0; i < strs.length; i++) {
        var t = strs[i];
        if (/^[A-Za-z][A-Za-z0-9-]{2,}$/.test(t) && t !== text && !/^D3/.test(t)) { out.font = t; break; }
    }
    // colour table: vtable 0a 00 08 00 with three one-byte fields at 4..7, then the table that points at it
    for (var v = 0; v + 10 < b.length; v++) {
        if (b[v] !== 0x0a || b[v + 1] || b[v + 2] !== 0x08 || b[v + 3]) continue;
        var o = [b[v + 4], b[v + 6], b[v + 8]];
        if (b[v + 5] || b[v + 7] || b[v + 9] || o.some(function (x) { return x < 4 || x > 7; })) continue;
        for (var t2 = v + 10; t2 < Math.min(b.length - 8, v + 400); t2++) {
            if (b.readInt32LE(t2) === t2 - v) {
                out.color = '#' + o.map(function (x) { var h = b[t2 + x].toString(16); return h.length < 2 ? '0' + h : h; }).join('').toUpperCase();
                break;
            }
        }
        if (out.color) break;
    }
    return out;
}
function styleOf(projectPath, nid) {
    var files = candidates(projectPath);
    for (var i = 0; i < files.length; i++) {
        try {
            var xml = readProject(files[i]), fx = textItemBlock(xml, nid);
            if (!fx) continue;
            // the Source Text parameter is its own object, referenced from the component
            var src = null, pr = /<Param Index="\d+" ObjectRef="(\d+)"\/>/g, pm;
            while (!src && (pm = pr.exec(fx))) {
                var pb = objectBlock(xml, pm[1]);
                if (/<Name>Source Text<\/Name>/.test(pb)) src = /<StartKeyframeValue Encoding="base64"[^>]*>([^<]*)<\/StartKeyframeValue>/.exec(pb);
            }
            var inst = /<InstanceName>([\s\S]*?)<\/InstanceName>/.exec(fx);
            var text = inst ? unescapeXml(inst[1]) : '';
            var st = src ? styleFromBlob(Buffer.from(src[1].trim(), 'base64'), text) : {};
            st.text = text;
            return st;
        } catch (e) { /* unreadable file */ }
    }
    return null;
}

module.exports = { lookup: lookup, textsFromXml: textsFromXml, styleOf: styleOf, styleFromBlob: styleFromBlob };
