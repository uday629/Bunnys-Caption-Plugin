// Installed font scanner. Reads only the 'name' table of each font file to get
// family / style / PostScript names (Premiere needs PostScript names).
// Results are cached on disk, so the scan runs once per font change.
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');

function fontDirs() {
    var dirs = [];
    if (process.platform === 'win32') {
        dirs.push(path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'));
        if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'));
    } else {
        dirs.push('/Library/Fonts', '/System/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts'));
    }
    return dirs;
}

function readName(buf, base) {
    var count = buf.readUInt16BE(base + 2);
    var strOff = base + buf.readUInt16BE(base + 4);
    var out = {};
    var rec = base + 6;
    for (var i = 0; i < count; i++, rec += 12) {
        var pid = buf.readUInt16BE(rec), eid = buf.readUInt16BE(rec + 2), lang = buf.readUInt16BE(rec + 4);
        var nid = buf.readUInt16BE(rec + 6), len = buf.readUInt16BE(rec + 8), off = buf.readUInt16BE(rec + 10);
        if ([1, 2, 4, 6, 16, 17].indexOf(nid) < 0) continue;
        var s = strOff + off;
        if (s + len > buf.length) continue;
        var str;
        if (pid === 3 || pid === 0) {
            if (pid === 3 && lang !== 0x409 && out[nid]) continue;
            var a = [];
            for (var j = 0; j + 1 < len; j += 2) a.push(buf.readUInt16BE(s + j));
            str = String.fromCharCode.apply(null, a);
        } else if (pid === 1 && eid === 0) {
            if (out[nid]) continue;
            str = buf.toString('latin1', s, s + len);
        } else continue;
        out[nid] = str;
    }
    return out;
}

function readAt(fd, pos, len) {
    var b = Buffer.alloc(len);
    var n = fs.readSync(fd, b, 0, len, pos);
    return n < len ? b.slice(0, n) : b;
}

// off = offset of the font's table directory; tables are read where they are (TTCs can be large)
function parseFace(fd, off) {
    var head = readAt(fd, off, 12);
    var num = head.readUInt16BE(4);
    var dir = readAt(fd, off + 12, num * 16);
    for (var i = 0; i < num; i++) {
        var r = i * 16;
        if (dir.toString('ascii', r, r + 4) === 'name') {
            var tOff = dir.readUInt32BE(r + 8), tLen = Math.min(dir.readUInt32BE(r + 12), 256 * 1024);
            var n = readName(readAt(fd, tOff, tLen), 0);
            var fam = n[16] || n[1], sty = n[17] || n[2];
            if (!n[6] || !fam) return null;
            return { family: fam, style: sty || 'Regular', full: n[4] || (fam + ' ' + sty), ps: n[6] };
        }
    }
    return null;
}

function parseFile(file) {
    var fd = fs.openSync(file, 'r');
    try {
        var head = readAt(fd, 0, 16 + 4 * 16);
        if (head.toString('ascii', 0, 4) === 'ttcf') {
            var faces = [], n = Math.min(head.readUInt32BE(8), 16);
            var offs = readAt(fd, 12, n * 4);
            for (var i = 0; i < n; i++) {
                var f = parseFace(fd, offs.readUInt32BE(i * 4));
                if (f) faces.push(f);
            }
            return faces;
        }
        var one = parseFace(fd, 0);
        return one ? [one] : [];
    } catch (e) {
        return [];
    } finally {
        fs.closeSync(fd);
    }
}

function listFiles() {
    var files = [];
    fontDirs().forEach(function (d) {
        try {
            fs.readdirSync(d).forEach(function (f) {
                if (/\.(ttf|otf|ttc)$/i.test(f)) files.push(path.join(d, f));
            });
        } catch (e) { /* dir missing */ }
    });
    return files;
}

// Returns [{family, style, full, ps}] sorted by family then style.
function scan(cacheFile) {
    var files = listFiles();
    var stamp = files.length + ':' + files.slice(-5).join('|');
    if (cacheFile) {
        try {
            var c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            if (c.stamp === stamp) return c.fonts;
        } catch (e) { /* no cache */ }
    }
    var seen = {}, fonts = [];
    files.forEach(function (f) {
        parseFile(f).forEach(function (face) {
            if (seen[face.ps]) return;
            seen[face.ps] = 1;
            fonts.push(face);
        });
    });
    fonts.sort(function (a, b) { return a.family.localeCompare(b.family) || a.style.localeCompare(b.style); });
    if (cacheFile) {
        try { fs.writeFileSync(cacheFile, JSON.stringify({ stamp: stamp, fonts: fonts })); } catch (e) { /* read-only */ }
    }
    return fonts;
}

module.exports = { scan: scan };
