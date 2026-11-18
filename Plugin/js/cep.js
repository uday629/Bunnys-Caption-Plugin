// Thin bridge to Premiere (no CSInterface.js needed) plus app data paths.
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');

var EXT_ROOT = (function () {
    try {
        var p = decodeURI(window.location.pathname);
        if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
        return path.dirname(p);
    } catch (e) { return __dirname; }
})();

var DATA = path.join(process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support'), 'BunnysFramelab', 'BunnysCaption');
var DIRS = {
    root: DATA,
    engine: path.join(DATA, 'engine'),
    models: path.join(DATA, 'models'),
    styles: path.join(DATA, 'styles'),
    mogrts: path.join(DATA, 'mogrts'),
    transcripts: path.join(DATA, 'transcripts'),
    temp: path.join(DATA, 'temp')
};
Object.keys(DIRS).forEach(function (k) { try { fs.mkdirSync(DIRS[k], { recursive: true }); } catch (e) { /* exists */ } });

// Load jsx/host.jsx again and report why it failed, if it does.
var HOST_FILE = path.join(EXT_ROOT, 'jsx', 'host.jsx').replace(/\\/g, '/');
function reloadHost() {
    return new Promise(function (resolve) {
        var s = 'try{$.evalFile(new File(' + JSON.stringify(HOST_FILE) + '));"ok"}catch(e){"host.jsx line "+e.line+": "+e.message}';
        window.__adobe_cep__.evalScript(s, function (r) { resolve(r); });
    });
}

// ---------- After Effects support ----------
// The same panel runs in Premiere Pro and After Effects. AE cannot place a MOGRT, so the panel unpacks the AE
// project inside it (project.aegraphic) and the AE host uses that comp as a template, with the MOGRT's controls
// as the layer's Essential Properties.
var APP = (function () {
    try { return JSON.parse(window.__adobe_cep__.getHostEnvironment()).appName || 'PPRO'; } catch (e) { return 'PPRO'; }
})();
function zipEntries(buf) {
    var out = {}, e = buf.length - 22;
    while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
    if (e < 0) return out;
    var n = buf.readUInt16LE(e + 10), p = buf.readUInt32LE(e + 16);
    for (var i = 0; i < n; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) break;
        var method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
        var lo = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nl);
        var data = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
        var raw = buf.slice(data, data + csize);
        try { out[name] = method === 8 ? require('zlib').inflateRawSync(raw) : raw; } catch (x) { /* skip */ }
        p += 46 + nl + xl + cl;
    }
    return out;
}
var tplPrepared = {};
// MOGRT -> {aep, tpl, key}: its AE project written once to the temp folder
function prepareTemplate(mogrt) {
    var st = fs.statSync(mogrt), key = path.basename(mogrt, '.mogrt').replace(/[^\w.-]+/g, '_') + '-' + Math.round(st.mtimeMs).toString(36);
    if (tplPrepared[key]) return tplPrepared[key];
    var z = zipEntries(fs.readFileSync(mogrt));
    var def = JSON.parse(z['definition.json'].toString('utf8').replace(/^﻿/, ''));
    var nm = def.capsuleNameLocalized || def.capsuleName || {};
    var tpl = nm.strDB && nm.strDB[0] ? nm.strDB[0].str : path.basename(mogrt, '.mogrt');
    var inner = zipEntries(z['project.aegraphic']);
    var aepName = Object.keys(inner).filter(function (k) { return /\.aep$/i.test(k); })[0];
    if (!aepName) throw new Error('No After Effects project inside ' + path.basename(mogrt));
    var dir = path.join(DIRS.temp, 'ae-templates');
    fs.mkdirSync(dir, { recursive: true });
    var aep = path.join(dir, key + '.aep');
    if (!fs.existsSync(aep)) fs.writeFileSync(aep, inner[aepName]);
    tplPrepared[key] = { aep: aep.replace(/\\/g, '/'), tpl: tpl, key: key };
    return tplPrepared[key];
}
// every MOGRT path in a payload (also nested, e.g. undo snapshots) gets its template in arg.__tpl
function withTemplates(arg) {
    if (!arg || typeof arg !== 'object') return arg;
    var map = {};
    (function walk(o) {
        if (!o || typeof o !== 'object') return;
        Object.keys(o).forEach(function (k) {
            var v = o[k];
            if (typeof v === 'string' && /mogrt$/i.test(k) && /\.mogrt$/i.test(v)) { if (!map[v]) { try { map[v] = prepareTemplate(v); } catch (e) { /* host reports it */ } } }
            else if (v && typeof v === 'object') walk(v);
        });
    })(arg);
    if (Object.keys(map).length) arg = Object.assign({}, arg, { __tpl: map });
    return arg;
}
// AE renders AIFF (big-endian PCM); the speech engine reads WAV
function aiffToWav(src, dst) {
    var b = fs.readFileSync(src), ch = 0, bits = 16, rate = 48000, data = null, le = false;
    var aifc = b.toString('ascii', 8, 12) === 'AIFC';
    for (var p = 12; p + 8 <= b.length;) {
        var id = b.toString('ascii', p, p + 4), size = b.readUInt32BE(p + 4), body = p + 8;
        if (id === 'COMM') {
            ch = b.readUInt16BE(body); bits = b.readUInt16BE(body + 6);
            var exp = (b.readUInt16BE(body + 8) & 0x7fff) - 16383, mant = b.readUInt32BE(body + 10);
            rate = Math.round(mant * Math.pow(2, exp - 31));
            if (aifc && size >= 22) le = b.toString('ascii', body + 18, body + 22) === 'sowt';
        } else if (id === 'SSND') {
            var off = b.readUInt32BE(body);
            data = b.slice(body + 8 + off, Math.min(b.length, body + size));
        }
        p = body + size + (size & 1);
    }
    if (!data || !ch) throw new Error('Could not read the audio After Effects rendered.');
    var bps = bits / 8, pcm = Buffer.from(data);
    if (!le && bps > 1) {
        for (var i = 0; i + bps <= pcm.length; i += bps) {
            for (var a = 0, z = bps - 1; a < z; a++, z--) { var t = pcm[i + a]; pcm[i + a] = pcm[i + z]; pcm[i + z] = t; }
        }
    }
    var head = Buffer.alloc(44);
    head.write('RIFF', 0, 'ascii'); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8, 'ascii');
    head.write('fmt ', 12, 'ascii'); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(ch, 22);
    head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * ch * bps, 28); head.writeUInt16LE(ch * bps, 32); head.writeUInt16LE(bits, 34);
    head.write('data', 36, 'ascii'); head.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(dst, Buffer.concat([head, pcm]));
    try { fs.unlinkSync(src); } catch (e) { /* keep */ }
}

// Run a BC.* host function (Premiere Pro or After Effects).
function host(fn, arg) {
    if (APP !== 'AEFT') return call(fn, arg);
    arg = withTemplates(arg);
    if (fn !== 'exportAudio') return call(fn, arg);
    return call(fn, arg).then(function (r) {
        if (r.aiff) { aiffToWav(r.path, arg.out); r.path = arg.out; }
        return r;
    });
}
// Arguments are JSON-encoded into one string literal.
function call(fn, arg, retried) {
    return new Promise(function (resolve, reject) {
        var call = '(typeof BC==="undefined")?"__NO_BC__":BC.' + fn + '(' + (arg === undefined ? '' : JSON.stringify(JSON.stringify(arg))) + ')';
        if (!window.__adobe_cep__) { reject(new Error('Not running inside Premiere Pro or After Effects.')); return; }
        window.__adobe_cep__.evalScript(call, function (res) {
            if (res === '__NO_BC__' && !retried) {
                // host script did not load at startup: load it now and try once more
                reloadHost().then(function (r) {
                    if (r !== 'ok') { reject(new Error('Premiere script failed to load (' + r + ')')); return; }
                    call(fn, arg, true).then(resolve, reject);
                });
                return;
            }
            if (res === 'EvalScript error.' || res === undefined || res === '__NO_BC__') { reject(new Error('Premiere script error in ' + fn)); return; }
            var o;
            try { o = JSON.parse(res); } catch (e) { reject(new Error(String(res))); return; }
            if (!o.ok) reject(new Error(o.err || 'Unknown error')); else resolve(o);
        });
    });
}

function openURL(url) {
    try { window.cep.util.openURLInDefaultBrowser(url); }
    catch (e) { require('child_process').exec(process.platform === 'win32' ? 'start "" "' + url + '"' : 'open "' + url + '"'); }
}

function openFolder(p) {
    require('child_process').exec((process.platform === 'win32' ? 'explorer "' : 'open "') + p + '"');
}

function pickFile(title, exts, startDir) {
    try {
        var r = window.cep.fs.showOpenDialogEx(false, false, title, startDir || '', exts);
        return r && r.data && r.data.length ? r.data[0] : '';
    } catch (e) { return ''; }
}
function pickFolder(title, startDir) {
    try {
        var r = window.cep.fs.showOpenDialogEx(false, true, title, startDir || '');
        return r && r.data && r.data.length ? r.data[0] : '';
    } catch (e) { return ''; }
}

function saveDialog(title, name, exts) {
    try {
        var r = window.cep.fs.showSaveDialogEx(title, '', exts, name);
        return r && r.data ? r.data : '';
    } catch (e) { return ''; }
}

function readJSON(p, fallback) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 1)); }

module.exports = {
    EXT_ROOT: EXT_ROOT, DIRS: DIRS, host: host, APP: APP, aiffToWav: aiffToWav, prepareTemplate: prepareTemplate, openURL: openURL, openFolder: openFolder,
    pickFile: pickFile, pickFolder: pickFolder, saveDialog: saveDialog, readJSON: readJSON, writeJSON: writeJSON
};
