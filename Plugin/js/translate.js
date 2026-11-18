// Offline Bangla / Hindi -> English for captions.
// The speech is first written down in its own language (that is accurate), then a small local language model
// translates it line by line: llama.cpp (MIT) with Qwen3-4B (Apache-2.0). Nothing leaves the PC.
// Each line keeps its time span; the English words are spread over it by length.
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var http = require('http');
var os = require('os');

var BUILD = 'b11803';
var REL = 'https://github.com/ggml-org/llama.cpp/releases/download/' + BUILD + '/';
var VARIANTS = {
    cpu: { zip: 'llama-' + BUILD + '-bin-win-cpu-x64.zip', mb: 22 },
    cuda12: { zip: 'llama-' + BUILD + '-bin-win-cuda-12.4-x64.zip', mb: 259 }
};
var MODEL = { file: 'Qwen3-4B-Q4_K_M.gguf', mb: 2382, url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/bc640142c66e1fdd12af0bd68f40445458f3869b/Qwen3-4B-Q4_K_M.gguf' };

function fileOk(p, min) { try { return fs.statSync(p).size > (min || 1000000); } catch (e) { return false; } }
function findExe(dir, name, depth) {
    if ((depth || 0) > 3) return '';
    var items = [];
    try { items = fs.readdirSync(dir); } catch (e) { return ''; }
    for (var i = 0; i < items.length; i++) if (items[i].toLowerCase() === name) return path.join(dir, items[i]);
    for (var j = 0; j < items.length; j++) {
        var p = path.join(dir, items[j]);
        try { if (fs.statSync(p).isDirectory()) { var f = findExe(p, name, (depth || 0) + 1); if (f) return f; } } catch (e) { /* skip */ }
    }
    return '';
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

// dirs: the plugin's folders (engine, models, temp); lib: the offline files folder (optional)
function Translator(dirs, lib) { this.dirs = dirs; this.lib = lib || ''; this.child = null; }
Translator.prototype.dir = function (v) { return path.join(this.dirs.engine, 'llama-' + v); };
var IS_MAC = process.platform === 'darwin';
// Mac: the translator engine comes from Homebrew (brew install llama.cpp)
function brewServer() {
    var c = ['/opt/homebrew/bin/llama-server', '/usr/local/bin/llama-server'];
    for (var i = 0; i < c.length; i++) { try { if (fs.statSync(c[i]).isFile()) return c[i]; } catch (e) { /* not here */ } }
    return '';
}
Translator.prototype.exe = function (v) {
    if (IS_MAC) return v === 'cpu' ? brewServer() : '';
    return findExe(this.dir(v), 'llama-server.exe');
};
Translator.prototype.libFile = function (name) {
    if (!this.lib) return '';
    return libFind(this.lib, name, 100000);
};
Translator.prototype.modelPath = function () {
    var own = path.join(this.dirs.models, MODEL.file);
    if (fileOk(own, MODEL.mb * 1000000 * 0.95)) return own;
    var l = this.libFile(MODEL.file);
    return l && fileOk(l, MODEL.mb * 1000000 * 0.95) ? l : own;
};
Translator.prototype.ready = function () { return !!(this.exe('cpu') || this.exe('cuda12')) && fileOk(this.modelPath(), MODEL.mb * 1000000 * 0.95); };
// what is still needed: [{what, mb, fromLib}]
Translator.prototype.missing = function (gpu) {
    var need = [];
    var v = gpu ? 'cuda12' : 'cpu';
    if (!this.exe(v)) need.push({ what: 'engine-' + v, mb: VARIANTS[v].mb, fromLib: !!this.libFile(VARIANTS[v].zip) });
    if (!fileOk(this.modelPath(), MODEL.mb * 1000000 * 0.95)) need.push({ what: 'model', mb: MODEL.mb, fromLib: false });
    return need;
};

function unzip(zip, dest) {
    return new Promise(function (resolve, reject) {
        var q = function (s) { return "'" + s.replace(/'/g, "''") + "'"; };
        cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath ' + q(zip) + ' -DestinationPath ' + q(dest) + ' -Force'],
            { windowsHide: true, maxBuffer: 1 << 20 }, function (err) { if (err) reject(new Error('Could not unzip ' + path.basename(zip))); else resolve(); });
    });
}
// download(url, dest, onProgress) comes from the speech engine (curl with resume)
Translator.prototype.install = function (gpu, download, onStep) {
    if (IS_MAC && !brewServer()) return Promise.reject(new Error('On Mac the translator engine comes from Homebrew. Open Terminal and run: brew install llama.cpp'));
    if (IS_MAC) gpu = false;
    var self = this, v = gpu ? 'cuda12' : 'cpu', job = Promise.resolve();
    if (!self.exe(v)) {
        job = job.then(function () {
            var local = self.libFile(VARIANTS[v].zip);
            if (local) { if (onStep) onStep('Installing the translator', -1); return local; }
            var zip = path.join(self.dirs.temp, VARIANTS[v].zip);
            return download(REL + VARIANTS[v].zip, zip, function (f) { if (onStep) onStep('Downloading the translator engine', f); }).then(function () { return zip; });
        }).then(function (zip) { return unzip(zip, self.dir(v)); }).then(function () {
            // the GPU build needs the CUDA 12 runtime: the speech engine's GPU build already has it
            if (v !== 'cuda12') return;
            var dst = path.dirname(self.exe(v)), src = path.dirname(findExe(path.join(self.dirs.engine, 'cuda12'), 'whisper-cli.exe') || '');
            if (!src) return;
            fs.readdirSync(src).filter(function (f) { return /^(cudart|cublas|cublasLt)64_12\.dll$/i.test(f); }).forEach(function (f) {
                if (!fs.existsSync(path.join(dst, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
            });
        });
    }
    if (!fileOk(self.modelPath(), MODEL.mb * 1000000 * 0.95)) {
        job = job.then(function () {
            return download(MODEL.url, path.join(self.dirs.models, MODEL.file), function (f) { if (onStep) onStep('Downloading the translator model', f); });
        });
    }
    return job;
};

// ---------- lines ----------
// Speech words -> lines: a new line after sentence punctuation (from the words or w.end), after a pause,
// or after max words (14 without punctuation, 30 with it).
function lines(words, max) {
    var out = [], cur = null;
    max = max || 14;
    words.forEach(function (w, i) {
        var prev = words[i - 1];
        if (!cur || (prev && w.s - prev.e > 0.6) || cur.w.length >= max || (prev && (prev.end || /[।.?!]$/.test(prev.t)))) {
            cur = { w: [], s: w.s, e: w.e };
            out.push(cur);
        }
        cur.w.push(w);
        cur.e = Math.max(cur.e, w.e);
    });
    return out.map(function (l) { return { s: l.s, e: l.e, text: l.w.map(function (w) { return w.t + (w.end && !/[।.?!]$/.test(w.t) ? w.end : ''); }).join(' ') }; });
}
function bare(t) { return String(t).replace(/[\s।.,?!;:'"()\-]/g, ''); }
// The model's punctuated copy of the words: sentence ends are taken over only if the words are the same
// (in the same order); returns how many sentence ends were found, or -1 when the copy does not match.
function takePunct(words, text) {
    var toks = String(text).split(/\s+/).filter(function (t) { return bare(t).length; });
    if (toks.length !== words.length) return -1;
    var same = 0;
    toks.forEach(function (t, i) { if (bare(t) === bare(words[i].t)) same++; });
    if (same < words.length * 0.9) return -1;
    var n = 0;
    toks.forEach(function (t, i) { var m = t.match(/[।.?!]+$/); if (m) { words[i].end = m[0].charAt(0) === '.' ? '।' : m[0].charAt(0); n++; } });
    return n;
}
// English text of a line -> timed words over the line's span (longer words get more time)
function spread(line, text) {
    var toks = String(text).split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    var weight = toks.map(function (t) { return t.replace(/[^\w']/g, '').length + 2; });
    var total = weight.reduce(function (a, b) { return a + b; }, 0), dur = Math.max(0.2, line.e - line.s), t = line.s;
    return toks.map(function (tok, i) {
        var d = dur * weight[i] / total, w = { t: tok, s: t, e: t + d };
        t += d;
        return w;
    });
}

// ---------- the model ----------
function freePort() {
    return new Promise(function (resolve, reject) {
        var srv = require('net').createServer();
        srv.listen(0, '127.0.0.1', function () { var p = srv.address().port; srv.close(function () { resolve(p); }); });
        srv.on('error', reject);
    });
}
function post(port, body, timeout) {
    return new Promise(function (resolve, reject) {
        var data = Buffer.from(JSON.stringify(body), 'utf8');
        var req = http.request({ host: '127.0.0.1', port: port, path: '/v1/chat/completions', method: 'POST', timeout: timeout,
            headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, function (res) {
            var chunks = [];
            res.on('data', function (c) { chunks.push(c); });
            res.on('end', function () {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new Error('Translator gave no answer')); }
            });
        });
        req.on('timeout', function () { req.destroy(new Error('Translator timed out')); });
        req.on('error', reject);
        req.end(data);
    });
}
function waitReady(port, child, ms) {
    var t0 = Date.now();
    return new Promise(function (resolve, reject) {
        (function poll() {
            if (child.exitCode !== null) { reject(new Error('Translator engine stopped (' + child.exitCode + ')')); return; }
            var req = http.get({ host: '127.0.0.1', port: port, path: '/health', timeout: 2000 }, function (res) {
                res.resume();
                if (res.statusCode === 200) resolve(); else retry();
            });
            req.on('error', retry);
            req.on('timeout', function () { req.destroy(); });
            function retry() { if (Date.now() - t0 > ms) reject(new Error('Translator engine did not start')); else setTimeout(poll, 400); }
        })();
    });
}

var SYSTEM = 'You translate spoken {LANG} from video captions into natural, simple English. ' +
    'Words that were already spoken in English stay in English. Keep the meaning and the tone, do not explain, do not add anything. ' +
    'The transcript can contain small speech-recognition mistakes: translate what the speaker most likely meant.';

// words: [{t,s,e}] in Bangla/Hindi. opts: {lang:'bn'|'hi', gpu:bool, threads}. Resolves to English [{t,s,e}].
Translator.prototype.translate = function (words, opts, onProgress) {
    var self = this;
    self.cancelled = false;
    var gpu = !!opts.gpu && !!self.exe('cuda12');
    var exe = gpu ? self.exe('cuda12') : self.exe('cpu');
    if (!exe) return Promise.reject(new Error('Translator not installed.'));
    if (!words.length) return Promise.resolve([]);
    var lang = opts.lang === 'hi' ? 'Hindi' : 'Bangla';
    var port, ls = [];
    // work on copies: the sentence marks are only for splitting
    words = words.map(function (w) { return { t: w.t, s: w.s, e: w.e }; });
    return freePort().then(function (p) {
        port = p;
        var args = ['-m', self.modelPath(), '--host', '127.0.0.1', '--port', String(port), '-c', '8192', '-t', String(opts.threads || 4), '--jinja', '--no-webui', '--reasoning-budget', '0'];
        args.push('-ngl', gpu ? '99' : '0');
        var child = cp.spawn(exe, args, { cwd: path.dirname(exe), windowsHide: true });
        self.child = child;
        try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { /* not permitted */ }
        child.stderr.on('data', function () { /* logs */ });
        child.stdout.on('data', function () { /* logs */ });
        return waitReady(port, child, 120000);
    }).then(function () {
        // 1. sentence punctuation on the transcript (speech recognition writes none), 150 words at a time
        var parts = [];
        for (var i = 0; i < words.length; i += 150) parts.push(words.slice(i, i + 150));
        var found = 0;
        return parts.reduce(function (pr, part) {
            return pr.then(function () {
                if (self.cancelled) throw new Error('Cancelled');
                return post(port, {
                    messages: [{ role: 'system', content: 'You add punctuation to ' + lang + ' speech transcripts. Never change, add, remove or reorder a word: only add । , ? ! marks.' },
                        { role: 'user', content: 'Add sentence punctuation. Answer with the text only.\n\n' + part.map(function (w) { return w.t; }).join(' ') }],
                    temperature: 0, max_tokens: 8 * part.length + 100, chat_template_kwargs: { enable_thinking: false }
                }, 600000).then(function (r) {
                    var txt = ((((r.choices || [])[0] || {}).message || {}).content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                    var n = takePunct(part, txt);
                    if (n > 0) found += n;
                });
            });
        }, Promise.resolve()).then(function () {
            ls = lines(words, found ? 30 : 14);
            if (onProgress) onProgress(0.15);
        });
    }).then(function () {
        // batches of 25 lines; the previous lines go along as context
        var out = new Array(ls.length), B = 25, batches = [];
        for (var i = 0; i < ls.length; i += B) batches.push(i);
        return batches.reduce(function (pr, start, bi) {
            return pr.then(function () {
                if (self.cancelled) throw new Error('Cancelled');
                var part = ls.slice(start, start + B);
                var ctx = ls.slice(Math.max(0, start - 4), start).map(function (l) { return l.text; }).join(' ');
                var user = (ctx ? 'Earlier in the video: ' + ctx + '\n\n' : '') +
                    'Translate each numbered line to English. Answer with exactly ' + part.length + ' numbered lines, same numbers, English only.\n\n' +
                    part.map(function (l, n) { return (n + 1) + '. ' + l.text; }).join('\n');
                return post(port, {
                    messages: [{ role: 'system', content: SYSTEM.replace('{LANG}', lang) }, { role: 'user', content: user }],
                    temperature: 0.2, top_p: 0.9, max_tokens: 60 * part.length + 200,
                    chat_template_kwargs: { enable_thinking: false }
                }, 600000).then(function (r) {
                    var txt = (((r.choices || [])[0] || {}).message || {}).content || '';
                    txt = txt.replace(/<think>[\s\S]*?<\/think>/g, '');
                    var got = {};
                    txt.split(/\r?\n/).forEach(function (ln) { var m = ln.match(/^\s*(\d+)[.)\]:-]\s*(.+)$/); if (m) got[+m[1]] = m[2].trim(); });
                    part.forEach(function (l, n) { out[start + n] = got[n + 1] || ''; });
                    if (onProgress) onProgress(0.15 + 0.85 * (bi + 1) / batches.length);
                });
            });
        }, Promise.resolve()).then(function () {
            var res = [];
            ls.forEach(function (l, n) { res = res.concat(spread(l, out[n] || '')); });
            return res;
        });
    }).then(function (r) { self.stop(); return r; }, function (e) { self.stop(); throw e; });
};
Translator.prototype.stop = function () {
    if (this.child) { try { this.child.kill(); } catch (e) { /* gone */ } this.child = null; }
};
Translator.prototype.cancel = function () { this.cancelled = true; this.stop(); };

module.exports = { Translator: Translator, lines: lines, spread: spread, takePunct: takePunct, MODEL: MODEL, VARIANTS: VARIANTS };
