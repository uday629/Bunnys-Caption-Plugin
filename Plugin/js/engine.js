// Speech-to-text engine: whisper.cpp (offline). Downloads the engine and models on demand.
// CPU build for every PC, CUDA builds for NVIDIA GPUs; a failed GPU run falls back to the CPU.
// Runs at below-normal priority so Premiere stays responsive.
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var https = require('https');
var cp = require('child_process');

var REL = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/';
var VARIANTS = {
    cpu: { zip: 'whisper-bin-x64.zip', mb: 9, label: 'CPU (any PC)' },
    cuda12: { zip: 'whisper-cublas-12.4.0-bin-x64.zip', mb: 670, label: 'NVIDIA GPU, CUDA 12 (RTX 20/30/40/50)' },
    cuda11: { zip: 'whisper-cublas-11.8.0-bin-x64.zip', mb: 270, label: 'NVIDIA GPU, CUDA 11 (GTX 10/16, older drivers)' }
};
var MODEL_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';
var MODELS = [
    { id: 'tiny.en-q5_1', label: 'Tiny English - fastest, 32 MB', mb: 32, en: true },
    { id: 'base.en-q5_1', label: 'Base English - recommended, 60 MB', mb: 60, en: true },
    { id: 'small.en-q5_1', label: 'Small English - most accurate, 190 MB', mb: 190, en: true },
    { id: 'base-q5_1', label: 'Base multilingual - fast, 60 MB', mb: 60, en: false },
    { id: 'small-q5_1', label: 'Small multilingual - Hindi on slow PCs, 190 MB', mb: 190, en: false },
    { id: 'large-v3-turbo-q5_0', label: 'Large v3 Turbo - Hindi and fast multilingual, 574 MB', mb: 574, en: false },
    { id: 'large-v3-q5_0', label: 'Large v3 - most accurate multilingual, 1.1 GB', mb: 1081, en: false },
    // Whisper medium trained on ~300 h of Bangla (OmiKhan/bangla-asr-whisper-medium, Apache-2.0), converted for whisper.cpp
    { id: 'bangla-medium-q5_0', label: 'Bangla Pro - trained on Bangla, best for Bangla, 540 MB', mb: 539, en: false, bn: true, notimestamps: true, url: '' }
];
var VAD = { file: 'ggml-silero-v5.1.2.bin', url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin' };

function Engine(dirs) {
    this.dirs = dirs;
    this.child = null;
    this.gpu = null;          // detected NVIDIA GPU name, '' if none
    this.lib = '';            // optional folder with downloaded zips/models (offline install)
}


// Offline files can keep their original names or the friendly names of the Bunnys Caption package,
// and can sit in the offline folder itself or in any folder one level below it.
var LIB_ALIAS = {
 "whisper-bin-x64.zip": "Speech Engine - CPU (any PC).zip",
 "whisper-cublas-12.4.0-bin-x64.zip": "Speech Engine - NVIDIA GPU RTX 20-50 (CUDA 12).zip",
 "whisper-cublas-11.8.0-bin-x64.zip": "Speech Engine - NVIDIA GPU GTX 10-16 (CUDA 11).zip",
 "ggml-silero-v5.1.2.bin": "Voice Detector (all languages).bin",
 "ggml-tiny.en-q5_1.bin": "English Model - Fastest (Tiny).bin",
 "ggml-base.en-q5_1.bin": "English Model - Recommended (Base).bin",
 "ggml-small.en-q5_1.bin": "English Model - Most Accurate (Small).bin",
 "ggml-bangla-medium-q5_0.bin": "Bangla Model - Bangla Pro.bin",
 "ggml-base-q5_1.bin": "Multi-language Model - Fast (Base).bin",
 "ggml-small-q5_1.bin": "Multi-language Model - Medium (Small).bin",
 "ggml-large-v3-turbo-q5_0.bin": "Multi-language Model - Best for Hindi (Large v3 Turbo).bin",
 "ggml-large-v3-q5_0.bin": "Multi-language Model - Most Accurate (Large v3).bin",
 "llama-b11803-bin-win-cpu-x64.zip": "Translator Engine - CPU (any PC).zip",
 "llama-b11803-bin-win-cuda-12.4-x64.zip": "Translator Engine - NVIDIA GPU (CUDA 12).zip",
 "Qwen3-4B-Q4_K_M.gguf": "Translator Model (Bangla-Hindi to English).gguf"
};
function libFind(lib, name, min) {
    if (!lib) return '';
    var names = [name], alias = LIB_ALIAS[name];
    if (alias) names.push(alias);
    var dirs = [lib];
    try { fs.readdirSync(lib).forEach(function (d) { try { if (fs.statSync(path.join(lib, d)).isDirectory()) dirs.push(path.join(lib, d)); } catch (e) { /* skip */ } }); } catch (e) { return ''; }
    for (var i = 0; i < dirs.length; i++) for (var j = 0; j < names.length; j++) {
        var p = path.join(dirs[i], names[j]);
        try { if (fs.statSync(p).size > (min || 1000000)) return p; } catch (e) { /* not here */ }
    }
    return '';
}

var IS_MAC = process.platform === 'darwin';
function fileOk(p, min) { try { return fs.statSync(p).size > (min || 1000000); } catch (e) { return false; } }

// models are used straight from the library folder when they are there (no copy needed)
Engine.prototype.modelPath = function (id) {
    var name = 'ggml-' + id + '.bin';
    var own = path.join(this.dirs.models, name);
    if (fileOk(own) || !this.lib) return own;
    return libFind(this.lib, name) || own;
};
Engine.prototype.hasModel = function (id) {
    var m = MODELS.filter(function (x) { return x.id === id; })[0];
    // half-downloaded files would crash the engine, so check against the known size
    return fileOk(this.modelPath(id), m ? m.mb * 1000000 * 0.95 : 1000000);
};

// engine zip for a variant inside the library folder, '' if missing
Engine.prototype.libZip = function (variant) {
    if (!this.lib) return '';
    var name = VARIANTS[variant].zip;
    return libFind(this.lib, name, 100000);
};
function variantOfZip(file) {
    var n = path.basename(file).toLowerCase();
    if (/cublas-12|cuda-12|cuda 12/.test(n)) return 'cuda12';
    if (/cublas-11|cuda-11|cuda 11/.test(n)) return 'cuda11';
    if (/whisper-(blas-)?bin-x64|speech engine - cpu/.test(n)) return 'cpu';
    return '';
}
function modelIdOf(file) {
    var b = path.basename(file);
    for (var k in LIB_ALIAS) if (LIB_ALIAS[k].toLowerCase() === b.toLowerCase()) b = k;
    var m = b.match(/^ggml-(.+)\.bin$/i);
    return m ? m[1] : '';
}

function findExe(dir, depth) {
    if (depth > 3) return '';
    var items = [];
    try { items = fs.readdirSync(dir); } catch (e) { return ''; }
    for (var i = 0; i < items.length; i++) if (/^whisper-cli(\.exe)?$/i.test(items[i])) return path.join(dir, items[i]);
    for (var j = 0; j < items.length; j++) {
        var p = path.join(dir, items[j]);
        // the CPU build lives in engine/cpu; older installs unpacked straight into engine/
        if (depth === 0 && VARIANTS[items[j]] && items[j] !== 'cpu') continue;
        try { if (fs.statSync(p).isDirectory()) { var f = findExe(p, depth + 1); if (f) return f; } } catch (e) { /* skip */ }
    }
    return '';
}
// Mac: the engine comes from Homebrew (brew install whisper-cpp). It uses the Apple GPU (Metal) by itself.
var BREW = ['/opt/homebrew/bin', '/usr/local/bin'];
function brewExe(names) {
    for (var i = 0; i < BREW.length; i++) for (var j = 0; j < names.length; j++) {
        var p = path.join(BREW[i], names[j]);
        try { if (fs.statSync(p).isFile()) return p; } catch (e) { /* not here */ }
    }
    return '';
}
Engine.prototype.exePath = function (variant) {
    variant = variant || 'cpu';
    if (IS_MAC) return variant === 'cpu' ? (findExe(path.join(this.dirs.engine, 'cpu'), 1) || brewExe(['whisper-cli', 'whisper-cpp'])) : '';
    var d = path.join(this.dirs.engine, variant);
    var f = findExe(d, 1);
    if (!f && variant === 'cpu') f = findExe(this.dirs.engine, 0);
    return f;
};
Engine.prototype.has = function (variant) { return !!this.exePath(variant); };
Engine.prototype.ready = function () { return this.has('cpu') || this.has('cuda12') || this.has('cuda11'); };

// NVIDIA GPU name via nvidia-smi (installed with the driver); '' when there is none.
Engine.prototype.detectGpu = function () {
    var self = this;
    if (IS_MAC) { self.gpu = ''; return Promise.resolve(''); }
    if (self.gpu !== null) return Promise.resolve(self.gpu);
    return new Promise(function (resolve) {
        cp.execFile('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { windowsHide: true, timeout: 5000 }, function (err, out) {
            self.gpu = err ? '' : String(out).split(/\r?\n/)[0].trim();
            resolve(self.gpu);
        });
    });
};
// GPU variant to use for this machine: cuda12 for current cards, cuda11 only if that is what is installed
Engine.prototype.gpuVariant = function () {
    if (this.has('cuda12')) return 'cuda12';
    if (this.has('cuda11')) return 'cuda11';
    return 'cuda12';
};

// curl.exe ships with Windows 10/11 and copes better with proxies and slow CDNs than Node's https.
function curlDownload(url, dest, onProgress) {
    return new Promise(function (resolve, reject) {
        var part = dest + '.part';
        var total = 0;
        cp.execFile('curl.exe', ['-sIL', '--connect-timeout', '20', url], { windowsHide: true, timeout: 60000 }, function (e, out) {
            var m = String(out || '').match(/content-length:\s*(\d+)/gi);
            if (m) total = parseInt(m[m.length - 1].split(':')[1], 10) || 0;
            var child = cp.spawn('curl.exe', ['-L', '--fail', '--retry', '5', '--retry-delay', '3', '--connect-timeout', '30', '-C', '-', '-o', part, url], { windowsHide: true });
            var timer = setInterval(function () {
                try { var sz = fs.statSync(part).size; if (onProgress) onProgress(total ? sz / total : 0, sz); } catch (x) { /* not yet */ }
            }, 400);
            child.on('error', function (err) { clearInterval(timer); reject(err); });
            child.on('close', function (code) {
                clearInterval(timer);
                if (code !== 0) { reject(new Error('Download failed (curl ' + code + ')')); return; }
                try { fs.renameSync(part, dest); resolve(dest); } catch (x) { reject(x); }
            });
        });
    });
}
function download(url, dest, onProgress) {
    if (process.platform !== 'win32') return httpsDownload(url, dest, onProgress);
    return curlDownload(url, dest, onProgress).catch(function (e) {
        // no curl, or it failed: try Node's own client once
        return httpsDownload(url, dest, onProgress).catch(function () { throw e; });
    });
}

function httpsDownload(url, dest, onProgress, redirects) {
    redirects = redirects || 0;
    return new Promise(function (resolve, reject) {
        var req = https.get(url, { headers: { 'User-Agent': 'BunnysCaption/1.1' } }, function (res) {
            if ([301, 302, 303, 307, 308].indexOf(res.statusCode) >= 0 && res.headers.location) {
                res.resume();
                if (redirects > 8) { reject(new Error('Too many redirects')); return; }
                var next = new URL(res.headers.location, url).toString();
                httpsDownload(next, dest, onProgress, redirects + 1).then(resolve, reject);
                return;
            }
            if (res.statusCode !== 200) { res.resume(); reject(new Error('Download failed (' + res.statusCode + ')')); return; }
            var total = parseInt(res.headers['content-length'] || '0', 10), got = 0, last = 0;
            var part = dest + '.part';
            var out = fs.createWriteStream(part);
            res.on('data', function (c) {
                got += c.length;
                var now = Date.now();
                if (onProgress && now - last > 200) { last = now; onProgress(total ? got / total : 0, got); }
            });
            res.pipe(out);
            out.on('finish', function () {
                out.close(function () {
                    try { fs.renameSync(part, dest); resolve(dest); } catch (e) { reject(e); }
                });
            });
            out.on('error', reject);
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(60000, function () { req.destroy(new Error('Network timeout')); });
    });
}

function unzip(zip, dest) {
    if (IS_MAC) return new Promise(function (resolve, reject) {
        try { fs.mkdirSync(dest, { recursive: true }); } catch (e) { /* exists */ }
        cp.execFile('/usr/bin/ditto', ['-x', '-k', zip, dest], function (err) { if (err) reject(new Error('Could not unzip ' + path.basename(zip))); else resolve(); });
    });
    return new Promise(function (resolve, reject) {
        var q = function (s) { return "'" + s.replace(/'/g, "''") + "'"; };
        var cmd = 'Expand-Archive -LiteralPath ' + q(zip) + ' -DestinationPath ' + q(dest) + ' -Force';
        cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, maxBuffer: 1 << 20 }, function (err) {
            if (err) reject(new Error('Could not unzip ' + path.basename(zip) + ': ' + err.message)); else resolve();
        });
    });
}

// Install an engine zip the user already has (picked in a file dialog, or found in the library folder).
Engine.prototype.installEngineZip = function (zip) {
    var self = this;
    if (IS_MAC) return Promise.reject(new Error('On Mac the speech engine comes from Homebrew. Open Terminal and run: brew install whisper-cpp'));
    var variant = variantOfZip(zip);
    if (!variant) return Promise.reject(new Error('Not a whisper.cpp engine zip: ' + path.basename(zip)));
    return unzip(zip, path.join(this.dirs.engine, variant)).then(function () {
        if (!self.has(variant)) throw new Error('Engine files not found inside ' + path.basename(zip));
        return variant;
    });
};
// Use a model file the user already has: copied into the plugin's model folder.
Engine.prototype.installModelFile = function (file, onProgress) {
    var id = modelIdOf(file);
    var dest = path.join(this.dirs.models, 'ggml-' + id + '.bin');
    if (!id) return Promise.reject(new Error('Model files are named ggml-<name>.bin'));
    if (path.resolve(file) === path.resolve(dest)) return Promise.resolve(id);
    return new Promise(function (resolve, reject) {
        var total = fs.statSync(file).size, done = 0;
        var rd = fs.createReadStream(file), wr = fs.createWriteStream(dest + '.part');
        rd.on('data', function (c) { done += c.length; if (onProgress) onProgress(done / total); });
        rd.on('error', reject); wr.on('error', reject);
        wr.on('finish', function () { try { fs.renameSync(dest + '.part', dest); resolve(id); } catch (e) { reject(e); } });
        rd.pipe(wr);
    });
};

Engine.prototype.installEngine = function (variant, onProgress) {
    var self = this;
    variant = variant || 'cpu';
    var local = this.libZip(variant);
    if (local) return this.installEngineZip(local);
    var v = VARIANTS[variant];
    var zip = path.join(this.dirs.temp, v.zip);
    return download(REL + v.zip, zip, onProgress).then(function () {
        return self.installEngineZip(zip).then(function (r) { try { fs.unlinkSync(zip); } catch (e) { /* ignore */ } return r; });
    });
};

Engine.prototype.installModel = function (id, onProgress) {
    if (this.hasModel(id)) return Promise.resolve(this.modelPath(id));
    var m = MODELS.filter(function (x) { return x.id === id; })[0] || {};
    // models that are not on the whisper.cpp model page come from their own link, or the offline files folder
    if (m.url === '') return Promise.reject(new Error('Copy ggml-' + id + '.bin into the files folder (Settings > Offline files), then press Scan.'));
    return download(m.url || MODEL_BASE + 'ggml-' + id + '.bin', path.join(this.dirs.models, 'ggml-' + id + '.bin'), onProgress);
};

// Everything usable in a folder: unzip engines, report models (used in place).
Engine.prototype.scanLibrary = function () {
    var self = this, found = { engines: [], models: [] };
    if (!this.lib) return found;
    if (!IS_MAC) Object.keys(VARIANTS).forEach(function (v) { if (self.libZip(v)) found.engines.push(v); });
    MODELS.forEach(function (m) { if (self.hasModel(m.id)) found.models.push(m.id); });
    return found;
};
Engine.prototype.installLibraryEngines = function (onStep) {
    var self = this;
    var todo = IS_MAC ? [] : Object.keys(VARIANTS).filter(function (v) { return self.libZip(v) && !self.has(v); });
    return todo.reduce(function (p, v) {
        return p.then(function () { if (onStep) onStep(v); return self.installEngineZip(self.libZip(v)); });
    }, Promise.resolve()).then(function () { return todo; });
};

Engine.prototype.cancel = function () {
    this.cancelled = true;
    if (this.child) { try { this.child.kill(); } catch (e) { /* gone */ } this.child = null; }
};

function run(self, exe, args, onProgress) {
    return new Promise(function (resolve, reject) {
        var child = cp.spawn(exe, args, { cwd: path.dirname(exe), windowsHide: true });
        self.child = child;
        try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { /* not permitted */ }
        var errTail = '', file = -1;
        child.stderr.on('data', function (d) {
            var s = d.toString();
            errTail = (errTail + s).slice(-3000);
            // with several input files, onProgress(fraction of the current file, index of that file)
            var n = (s.match(/processing '/g) || []).length;
            if (n) { file += n; if (onProgress) onProgress(0, file); }
            var m = s.match(/progress\s*=\s*(\d+)%/g);
            if (m && onProgress) onProgress(parseInt(m[m.length - 1].replace(/\D/g, ''), 10) / 100);
        });
        child.stdout.on('data', function () { /* segments are read from the json file */ });
        child.on('error', function (e) { self.child = null; reject(e); });
        child.on('close', function (code) { self.child = null; resolve({ code: code, log: errTail }); });
    });
}

// ---- audio chunks ----
// Whisper reads 30 s windows and, with music under the voice or fast Bangla/Hindi, often stops early in a
// window and skips the rest (or loops). Cutting the audio at pauses into short pieces and transcribing each
// piece on its own fixes both, and keeps word times right. All pieces go through one engine run.
function readWav(file) {
    var b = fs.readFileSync(file);
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
    var p = 12, fmt = null, data = null;
    while (p + 8 <= b.length) {
        var id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
        if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), align: b.readUInt16LE(p + 20), bits: b.readUInt16LE(p + 22), raw: b.slice(p + 8, p + 8 + size) };
        if (id === 'data') { data = { start: p + 8, len: Math.min(size, b.length - p - 8) }; break; }
        p += 8 + size + (size & 1);
    }
    // 16-bit PCM is what the export preset writes; anything else is sent whole
    if (!fmt || !data || fmt.bits !== 16 || (fmt.tag !== 1 && fmt.tag !== 0xFFFE)) return null;
    return { buf: b, fmt: fmt, data: data, frames: Math.floor(data.len / fmt.align) };
}
function writeWav(file, w, from, to) {
    var body = w.buf.slice(w.data.start + from * w.fmt.align, w.data.start + to * w.fmt.align);
    var fmt = w.fmt.raw, head = Buffer.alloc(20 + fmt.length + 8);
    head.write('RIFF', 0, 'ascii'); head.writeUInt32LE(head.length - 8 + body.length, 4); head.write('WAVE', 8, 'ascii');
    head.write('fmt ', 12, 'ascii'); head.writeUInt32LE(fmt.length, 16); fmt.copy(head, 20);
    head.write('data', 20 + fmt.length, 'ascii'); head.writeUInt32LE(body.length, 24 + fmt.length);
    fs.writeFileSync(file, Buffer.concat([head, body]));
}
// loudness (dB) per 20 ms, mixed down to mono
function loudness(w) {
    var hop = Math.round(w.fmt.rate / 50), n = Math.floor(w.frames / hop), db = new Float32Array(n);
    var b = w.buf, ch = w.fmt.ch, al = w.fmt.align, st = w.data.start;
    for (var i = 0; i < n; i++) {
        var sum = 0;
        for (var f = i * hop; f < (i + 1) * hop; f += 2) {
            var o = st + f * al, v = 0;
            for (var c = 0; c < ch; c++) v += b.readInt16LE(o + c * 2);
            v /= ch * 32768; sum += v * v;
        }
        db[i] = 10 * Math.log10(sum / (hop / 2) + 1e-10);
    }
    return db;
}
// Pieces [{from,to}] in 20 ms steps. speech: [{from,to}] from the voice detector (null = whole file).
// Nearby speech is grouped up to maxLen; longer stretches are cut at the quietest moment after minLen.
function speechPieces(db, speech, minLen, maxLen) {
    var n = db.length;
    var sm = new Float32Array(n), W = 10;    // 400 ms smoothing so a cut lands in a real pause
    for (var i = 0; i < n; i++) { var s = 0, k = 0; for (var j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) { s += db[j]; k++; } sm[i] = s / k; }
    var groups = [];
    // a short blip far from any other speech is music or a noise; whisper turns it into made-up words
    if (speech) speech = speech.filter(function (sp, i) {
        var gapL = i ? sp.from - speech[i - 1].to : 1e9, gapR = i < speech.length - 1 ? speech[i + 1].from - sp.to : 1e9;
        return sp.to - sp.from >= 40 || Math.min(gapL, gapR) < 100;
    });
    (speech || [{ from: 0, to: n }]).forEach(function (sp) {
        var g = groups[groups.length - 1];
        if (g && sp.to - g.from <= maxLen && sp.from - g.to < 100) g.to = sp.to;
        else groups.push({ from: sp.from, to: sp.to });
    });
    var pieces = [];
    groups.forEach(function (g) {
        var start = g.from;
        while (g.to - start > maxLen) {
            var cut = start + minLen, low = 1e9;
            for (var c = start + minLen; c < start + maxLen; c++) if (sm[c] < low) { low = sm[c]; cut = c; }
            pieces.push({ from: start, to: cut });
            start = cut;
        }
        pieces.push({ from: start, to: g.to });
    });
    // a little air around the voice, without running into the next piece
    return pieces.map(function (p, i) {
        var lo = i ? pieces[i - 1].to : 0, hi = i < pieces.length - 1 ? pieces[i + 1].from : n;
        return { from: Math.max(lo, p.from - 12), to: Math.min(hi, p.to + 12) };
    });
}

// Speech stretches from whisper.cpp's voice detector (Silero, 0.9 MB), in 20 ms steps; null when the
// detector or its model is missing, then the audio is cut by loudness only.
Engine.prototype.vadPath = function () { return path.join(this.dirs.models, VAD.file); };
Engine.prototype.hasVad = function () { return fileOk(this.vadPath(), 500000) || (this.lib && fileOk(libFind(this.lib, VAD.file, 500000), 500000)); };
Engine.prototype.installVad = function () {
    if (this.hasVad()) return Promise.resolve();
    var lib = this.lib && libFind(this.lib, VAD.file, 500000);
    if (lib && fileOk(lib, 500000)) return Promise.resolve();
    return download(VAD.url, this.vadPath()).catch(function () { /* optional: loudness cutting still works */ });
};
Engine.prototype.speech = function (exe, wavFile, threads) {
    var self = this;
    var vexe = path.join(path.dirname(exe), 'whisper-vad-speech-segments' + (IS_MAC ? '' : '.exe'));
    var model = fileOk(this.vadPath(), 500000) ? this.vadPath() : (this.lib ? libFind(this.lib, VAD.file, 500000) : '');
    if (!fs.existsSync(vexe) || !fileOk(model, 500000)) return Promise.resolve(null);
    return new Promise(function (resolve) {
        var child = cp.execFile(vexe, ['-vm', model, '-f', wavFile, '-t', String(threads || 4), '-np'], { cwd: path.dirname(vexe), windowsHide: true, maxBuffer: 16 << 20 }, function (err, out) {
            self.child = null;
            if (err && !out) { resolve(null); return; }
            var list = [], re = /start\s*=\s*([\d.]+),\s*end\s*=\s*([\d.]+)/g, m;
            // the tool prints centiseconds; a 20 ms step is 2 of them
            while ((m = re.exec(String(out)))) list.push({ from: Math.floor(parseFloat(m[1]) / 2), to: Math.ceil(parseFloat(m[2]) / 2) });
            resolve(err ? null : list);
        });
        self.child = child;
        try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { /* not permitted */ }
    });
};

// opts: {wav, model, lang ('en'|'bn'|'hi'|'auto'), translate, threads, prompt, processor ('auto'|'cpu'|'gpu')}
// resolves to {words:[{t,s,e}], device:'GPU'|'CPU'}
Engine.prototype.transcribe = function (opts, onProgress) {
    var self = this;
    self.cancelled = false;
    if (!this.hasModel(opts.model)) return Promise.reject(new Error('Model not downloaded (Settings tab).'));
    var multi = !/\.en-/.test(opts.model);
    if (!multi && (opts.lang !== 'en' || opts.translate)) return Promise.reject(new Error('This language needs a multilingual model. Pick one in Settings.'));

    var wantGpu = opts.processor === 'gpu' || (opts.processor === 'auto' && self.has(self.gpuVariant()));
    var gpuExe = wantGpu ? self.exePath(self.gpuVariant()) : '';
    var cpuExe = self.exePath('cpu');
    if (!gpuExe && !cpuExe) return Promise.reject(new Error('Speech engine not installed (Settings tab).'));

    var english = !multi || opts.lang === 'en';
    var info = MODELS.filter(function (m) { return m.id === opts.model; })[0] || {};
    var work = path.join(this.dirs.temp, 'bc_' + Date.now());
    try { fs.mkdirSync(work); } catch (e) { /* exists */ }
    var pieces = [];
    function cut(speech) {
        if (self.cancelled) throw new Error('Cancelled');
        var wav = null;
        try { wav = readWav(opts.wav); } catch (e) { wav = null; }
        if (!wav) { pieces = [{ wav: opts.wav, out: path.join(work, 'p0'), at: 0, dur: 1e9 }]; return; }
        var hop = Math.round(wav.fmt.rate / 50);
        // English keeps long pieces (more context); Bangla/Hindi/auto need short ones
        pieces = speechPieces(loudness(wav), speech, english ? 500 : 200, opts.maxPiece || (english ? 1400 : info.notimestamps ? 1000 : 600)).map(function (p, i) {
            var f = path.join(work, 'p' + i + '.wav');
            writeWav(f, wav, p.from * hop, Math.min(wav.frames, p.to * hop));
            return { wav: f, out: path.join(work, 'p' + i), at: p.from * 0.02, dur: (p.to - p.from) * 0.02 };
        });
    }

    var args = ['-m', this.modelPath(opts.model), '-pp', '-sns', '-t', String(opts.threads || 4), '-l', multi ? (opts.lang || 'auto') : 'en'];
    // word times: one segment per word (-ml 1), or for models trained without timestamps DTW token times
    // (DTW needs flash attention off)
    if (info.notimestamps) args.push('-ojf', '-nt', '-dtw', 'medium', '-nfa');
    else args.push('-oj', '-ml', '1', '-sow');
    // Bangla/Hindi: greedy decoding is both more complete and ~5x faster than beam search with
    // temperature fallback, which keeps re-decoding the same piece; loops are cleaned up afterwards
    if (opts.decode) args = args.concat(opts.decode);
    else if (!english) args.push('-bs', '1', '-bo', '1', '-nf');
    if (opts.translate) args.push('-tr');
    if (opts.prompt) args.push('--prompt', opts.prompt);

    function cleanup() {
        try { fs.readdirSync(work).forEach(function (f) { fs.unlinkSync(path.join(work, f)); }); fs.rmdirSync(work); } catch (e) { /* in use */ }
    }
    var BATCH = 40;
    function attempt(exe, extra, device) {
        var words = [], batches = [];
        // the Windows command line is limited, so very long sequences run in a few batches
        for (var i = 0; i < pieces.length; i += BATCH) batches.push(pieces.slice(i, i + BATCH));
        return batches.reduce(function (p, list, bi) {
            return p.then(function () {
                var a = args.concat(extra);
                list.forEach(function (pc) { a.push('-f', pc.wav, '-of', pc.out); });
                var done = bi * BATCH, idx = 0;
                return run(self, exe, a, function (f, file) {
                    if (file !== undefined) idx = file;
                    if (onProgress) onProgress(Math.min(1, (done + idx + (f || 0)) / pieces.length));
                }).then(function (r) {
                    if (self.cancelled) throw new Error('Cancelled');
                    list.forEach(function (pc) {
                        var jf = pc.out + '.json';
                        if (!fs.existsSync(jf)) {
                            var e = new Error('Engine error: ' + r.log.split('\n').slice(-3).join(' '));
                            e.engineLog = r.log;
                            throw e;
                        }
                        var j = readJson(jf);
                        (info.notimestamps ? parseTokens(j, pc.dur) : parseWhisper(j)).forEach(function (w) { w.s += pc.at; w.e += pc.at; words.push(w); });
                        fs.unlinkSync(jf);
                    });
                });
            });
        }, Promise.resolve()).then(function () { return { words: cleanLoops(words), device: device }; });
    }
    var job = self.speech(cpuExe || gpuExe, opts.wav, opts.threads).then(cut).then(function () {
        if (!pieces.length) return { words: [], device: gpuExe ? 'GPU' : 'CPU' };
        return gpuExe ? attempt(gpuExe, [], 'GPU').catch(function (e) {
            // driver too old, card not supported, out of memory ...: try the CPU build
            if (self.cancelled || !cpuExe) throw e;
            if (onProgress) onProgress(0);
            return attempt(cpuExe, ['-ng'], 'CPU').then(function (r) { r.fellBack = true; return r; });
        }) : attempt(cpuExe, ['-ng'], 'CPU');
    });
    return job.then(function (r) { cleanup(); return r; }, function (e) { cleanup(); throw e; });
};

// whisper cuts Bangla/Hindi letters (3 bytes each in UTF-8) between segments, which shows up as "�".
// Read the file byte for byte (latin1) and only decode once the pieces of a word are joined.
function readJson(file) {
    return JSON.parse(fs.readFileSync(file).toString('latin1'));
}
function utf8(bytes) { return Buffer.from(bytes, 'latin1').toString('utf8'); }

// whisper -ml 1 -sow gives one segment per word; glue stray punctuation to the previous word.
// Segment text is a byte string (see readJson).
function parseWhisper(j) {
    var words = [];
    (j.transcription || []).forEach(function (seg) {
        var raw = String(seg.text || '');
        var t = raw.trim(), shown = utf8(t);
        if (!t || /^\[.*\]$|^\(.*\)$|^\*.*\*$/.test(shown)) return;
        var s = seg.offsets.from / 1000, e = seg.offsets.to / 1000;
        var prev = words[words.length - 1];
        // a segment without a leading space continues the previous word
        if (prev && (/^[.,!?;:%'")\]।]+$/.test(shown) || !/^\s/.test(raw))) {
            prev.t += t;
            prev.e = Math.max(prev.e, e);
            return;
        }
        words.push({ t: t, s: s, e: Math.max(e, s + 0.05) });
    });
    words.forEach(function (w) {
        // U+09B5 is not a Bangla letter; whisper writes it for ভ ("঵িডিও")
        w.t = utf8(w.t).replace(/�/g, '').replace(/঵/g, 'ভ').normalize('NFC');
    });
    return words;
}

// Models trained without timestamps (Bangla Pro) run with -nt and DTW token times (-ojf): words are
// built from tokens (a leading space starts a word), each word starts at its first token's DTW time.
function parseTokens(j, dur) {
    var words = [], cur = null;
    (j.transcription || []).forEach(function (seg) {
        (seg.tokens || []).forEach(function (tk) {
            var raw = String(tk.text || '');
            if (/^<\|.*\|>$|^\[_/.test(raw)) return;
            var t = tk.t_dtw >= 0 ? tk.t_dtw / 100 : (cur ? cur.e : 0);
            var shown = utf8(raw.trim());
            if (cur && (!/^\s/.test(raw) || /^[.,!?;:%'")\]।]+$/.test(shown))) { cur.t += raw; cur.e = Math.max(cur.e, t); return; }
            if (!raw.trim()) return;
            cur = { t: raw.replace(/^\s+/, ''), s: t, e: t };
            words.push(cur);
        });
    });
    words.forEach(function (w, i) {
        var next = words[i + 1];
        w.e = Math.max(w.s + 0.08, next ? next.s : Math.min(dur, w.e + 0.35));
        w.t = utf8(w.t).trim().replace(/�/g, '').replace(/঵/g, 'ভ').normalize('NFC');
    });
    return words.filter(function (w) { return w.t; });
}

function plain(t) { return String(t).toLowerCase().replace(/[^0-9a-zà-ɏऀ-ॿঀ-৿]/g, ''); }
// Whisper sometimes loops on low-resource languages: "ন্ন্ন্ন্", "সান সান সান ...", "༼ ༼ ༼",
// or writes the same phrase twice, the copy squeezed into a few milliseconds.
function cleanLoops(words) {
    // a burst of 3+ words sharing one tiny time slot is a hallucinated copy
    words = words.filter(function (w, i) {
        var same = 0;
        for (var j = Math.max(0, i - 3); j <= Math.min(words.length - 1, i + 3); j++) {
            if (Math.abs(words[j].s - w.s) < 0.02 && words[j].e - words[j].s < 0.1) same++;
        }
        return same < 3;
    });
    var out = [], run = 0;
    words.forEach(function (w) {
        w.t = w.t.replace(/(.{1,8}?)\1{2,}/g, '$1');
        var prev = out[out.length - 1];
        if (prev && plain(prev.t) === plain(w.t)) {
            run++;
            if (run >= 2) { prev.e = Math.max(prev.e, w.e); return; }
        } else run = 0;
        out.push(w);
    });
    // a phrase of 3-8 words said again right away (mostly the same words): keep one copy
    for (var k = 8; k >= 3; k--) {
        for (var i = 0; i + 2 * k <= out.length; i++) {
            var hit = 0;
            for (var m = 0; m < k; m++) if (plain(out[i + m].t) === plain(out[i + k + m].t)) hit++;
            if (hit >= Math.ceil(k * 0.75)) {
                out[i + k - 1].e = Math.max(out[i + k - 1].e, out[i + 2 * k - 1].e);
                out.splice(i + k, k);
                i--;
            }
        }
    }
    // a word that is only symbols (no letters or digits) is noise
    return out.filter(function (w) { return /[0-9A-Za-zÀ-ɏऀ-ॿঀ-৿]/.test(w.t); });
}

module.exports = { Engine: Engine, MODELS: MODELS, VARIANTS: VARIANTS, download: download, parseWhisper: parseWhisper, cleanLoops: cleanLoops, readJson: readJson, variantOfZip: variantOfZip, modelIdOf: modelIdOf };
