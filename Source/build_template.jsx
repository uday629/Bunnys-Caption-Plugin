// Bunnys Caption - After Effects template builder.
// Builds the universal caption composition and exports it as a MOGRT.
// Run from AE: File > Scripts > Run Script File, or: AfterFX.exe -r build_template.jsx
// Writes a log next to this file (build_template.log).

(function () {
    // BC_ROOT can be set by a wrapper (AfterFX -r does not always provide $.fileName)
    var ROOT = $.global.BC_ROOT ? new Folder($.global.BC_ROOT) : File($.fileName).parent.parent;
    var HERE = new Folder(ROOT.fsName + "/tools");
    var LOGF = new File(HERE.fsName + "/build_template.log");
    // exportAsMotionGraphicsTemplate takes a folder and writes "<template name>.mogrt" into it
    var OUT_DIR = new Folder(ROOT.fsName + "/mogrt");
    var OUT = new File(OUT_DIR.fsName + "/Bunnys Caption.mogrt");
    var AEP = new File(HERE.fsName + "/bunnys_caption_template.aep"); // kept on E, next to this script
    var LOG = [];
    function log(s) { LOG.push(String(s)); }

    var W = 1920, H = 1080, FPS = 30, DUR = 30;
    var CTRL = "BC_CTRL", DATA = "BC_DATA", GROUP = "BC_GROUP";

    // ---------- expression snippets (JS engine, ES5 only) ----------
    var X_C = 'var C=thisComp.layer("' + CTRL + '");';
    function ctl(name) { return 'C.effect("' + name + '")(1)'; }
    // DATA text: "flags#duration#s,e|s,e|..."
    var X_TXT = 'function T(l){return String(l.text.sourceText.value.text!==undefined?l.text.sourceText.value.text:l.text.sourceText.value);}';
    var X_WC = 'function WC(s){var a=s.split(/\\s+/),n=0;for(var i=0;i<a.length;i++)if(a[i].length)n++;return n;}';

    var EX_ACTIVE = X_TXT +
        'var s=T(thisComp.layer("' + DATA + '"));var p=s.split("#");var a=(p[2]||"").split("|");var cur=-1;' +
        'for(var i=0;i<a.length;i++){var q=a[i].split(",");if(q.length<2)continue;if(parseFloat(q[0])<=time+0.0005)cur=i;else break;}cur;';
    var EX_N1 = X_TXT + X_WC + 'WC(T(thisComp.layer("MAIN")));';
    var EX_DUR = X_TXT + 'var p=T(thisComp.layer("' + DATA + '")).split("#");var d=parseFloat(p[1]);isNaN(d)?thisComp.duration:d;';
    // fade factor 0..100 (fade in by animation type, optional fade out)
    var EX_FADE = X_C +
        'var a=Math.round(' + ctl("Animation") + ');var sp=Math.max(1,' + ctl("Anim Speed") + ')*thisComp.frameDuration;' +
        'var f=1;if(a==3||a==4||a==6)f=Math.min(1,Math.max(0,time/sp));if(a==2||a==5)f=Math.min(1,Math.max(0,time/(sp*0.5)));' +
        // 7-12 animate per letter (Entry / Glitch animators), so no whole-caption fade here
        
        'if(' + ctl("Fade Out") + '>0){var d=' + ctl("BC Dur") + ';f*=Math.min(1,Math.max(0,(d-time)/sp));}f*100;';

    // selector amount for a text layer; off = word offset of this layer in the whole caption
    function exHighlight(isPunch) {
        return X_C + X_TXT +
            'var off=' + (isPunch ? 'Math.round(' + ctl("BC N1") + ')' : '0') + ';var i=textIndex-1+off;' +
            'var m=Math.round(' + ctl("Highlight Mode") + ');var act=Math.round(' + ctl("BC Active") + ');' +
            'var p=T(thisComp.layer("' + DATA + '")).split("#");var fl=p[0]||"";var k=fl.charAt(i)=="1";' +
            'var on=false;if(m==2)on=(i==act);else if(m==3)on=k;else if(m==4)on=(k&&i<=act);else if(m==5)on=(i<=act);' +
            'var v=0;if(on){v=100;var a=(p[2]||"").split("|");var q=(a[i]||"").split(",");var st=parseFloat(q[0]);' +
            'if(m!=3&&!isNaN(st)){var e=Math.min(1,Math.max(0,(time-st)/0.09));v=100*e;}}v;';
    }
    function exUnspoken(isPunch) {
        return X_C +
            'var off=' + (isPunch ? 'Math.round(' + ctl("BC N1") + ')' : '0') + ';var i=textIndex-1+off;' +
            'var act=Math.round(' + ctl("BC Active") + ');(' + ctl("Unspoken Opacity") + '<100&&i>act)?100:0;';
    }
    // Per-character entry (Animation 7-12). Characters are ordered across both lines (caption, then emphasis).
    function exEntry(isPunch) {
        return X_C + X_TXT +
            'var a=Math.round(' + ctl("Animation") + ');var v=0;' +
            'if(a>=7&&a!=11){' +
            'var D=Math.max(0.3,' + ctl("Anim Speed") + '*thisComp.frameDuration*4);' +
            'var mc=T(thisComp.layer("MAIN")).length,pc=T(thisComp.layer("PUNCH")).length;' +
            'var n=Math.max(1,mc+pc),i=textIndex-1' + (isPunch ? '+mc' : '') + ';' +
            'seedRandom(i+7,true);var r=random();var u,ti;' +
            'if(a==7){ti=r*D*0.85;if(time<ti)v=100;else if(time<ti+0.14){var fr=Math.floor((time-ti)/thisComp.frameDuration);v=fr%2==0?70:25;}}' +
            'else if(a==8){ti=i/n*D;u=Math.min(1,Math.max(0,(time-ti)/0.14));v=100*Math.pow(1-u,3);}' +
            'else if(a==9){ti=i/n*D;v=time<ti?100:0;}' +
            'else if(a==10){ti=r*D*0.5;u=Math.min(1,Math.max(0,(time-ti)/(D*0.5)));v=100*Math.pow(1-u,2);}' +
            'else if(a==12){ti=i/n*D*0.7;u=Math.min(1,Math.max(0,(time-ti)/0.22));var c1=1.70158,c3=c1+1;v=100*(-c3*Math.pow(u-1,3)-c1*Math.pow(u-1,2));}' +
            '}v;';
    }
    function exHasText(name) { return X_TXT + 'T(thisComp.layer("' + name + '")).replace(/\\s/g,"").length>0'; }

    // measure layers: rebuild a substring of the active word's line with the source layer style
    function exMeasure(kind) {
        // no nested ternary here: ExtendScript mis-evaluates chained ?: in string building
        var pick = 'lw.join(" ")';
        if (kind === "PW") pick = 'lw.slice(0,pos+1).join(" ")';
        else if (kind === "W") pick = '(lw[pos]||"")';
        // only needed for Box Mode 3 (box behind the active word): otherwise one space, no parsing
        return X_C + X_TXT +
            'var L=thisComp.layer("MAIN"),out=" ";' +
            'if(Math.round(' + ctl("Box Mode") + ')==3){' +
            'var act=Math.round(' + ctl("BC Active") + ');var n1=Math.round(' + ctl("BC N1") + ');' +
            'L=act<n1?thisComp.layer("MAIN"):thisComp.layer("PUNCH");var wi=act<n1?act:act-n1;if(wi<0)wi=0;' +
            'var lines=T(L).split(/[\\r\\n\\u0003]/);var li=0,pos=0,k=wi,lw=[];' +
            'for(var j=0;j<lines.length;j++){var w=[],ws=lines[j].split(/\\s+/);for(var x=0;x<ws.length;x++)if(ws[x].length)w.push(ws[x]);' +
            'if(k<w.length){li=j;pos=k;lw=w;break;}k-=w.length;}' +
            'out=' + pick + ';}' +
            'L.text.sourceText.style.setText(out.length?out:" ");';
    }

    // box rectangle in comp space. Box Mode (1-based dropdown): 2 whole caption, 3 active word, 4 emphasis line
    var X_BOXCALC = X_C + X_TXT +
        'function has(l){return T(l).replace(/\\s/g,"").length>0;}' +
        'function R(l){var r=l.sourceRectAtTime(0,false);var a=l.toComp([r.left,r.top]),b=l.toComp([r.left+r.width,r.top+r.height]);' +
        'return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];}' +
        'var M=thisComp.layer("MAIN"),P=thisComp.layer("PUNCH");var mode=Math.round(' + ctl("Box Mode") + ');var pad=' + ctl("Box Padding") + ';' +
        'var bx=null;' +
        'if(mode==3){var act=Math.round(' + ctl("BC Active") + ');var n1=Math.round(' + ctl("BC N1") + ');' +
        ' var hm=Math.round(' + ctl("Highlight Mode") + ');var fl=(T(thisComp.layer("' + DATA + '")).split("#")[0]||"");' +
        ' var show=act>=0;if(hm==3){act=fl.indexOf("1");show=act>=0;}else if(hm==4){show=show&&fl.charAt(act)=="1";}' +
        ' if(show){var L=act<n1?M:P;var wi=act<n1?act:act-n1;' +
        '  var lines=T(L).split(/[\\r\\n\\u0003]/);var nl=0,li=0,k=wi,found=false;' +
        '  for(var j=0;j<lines.length;j++){var c=0,ws=lines[j].split(/\\s+/);for(var x=0;x<ws.length;x++)if(ws[x].length)c++;if(c==0)continue;' +
        '   if(!found&&k<c){li=nl;found=true;}else if(!found)k-=c;nl++;}' +
        '  var r=L.sourceRectAtTime(0,false);var lh=r.height/Math.max(1,nl);' +
        '  var wl=thisComp.layer("BC_M_LINE").sourceRectAtTime(time,false).width;var wpw=thisComp.layer("BC_M_PW").sourceRectAtTime(time,false).width;' +
        '  var ww=thisComp.layer("BC_M_W").sourceRectAtTime(time,false).width;' +
        '  var x0=-wl/2+wpw-ww,x1=-wl/2+wpw,y0=r.top+li*lh,y1=y0+lh;' +
        '  var a=L.toComp([x0,y0]),b=L.toComp([x1,y1]);bx=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];}}' +
        'else if(mode==2){if(has(M))bx=R(M);if(has(P)){var q=R(P);bx=bx?[Math.min(bx[0],q[0]),Math.min(bx[1],q[1]),Math.max(bx[2],q[2]),Math.max(bx[3],q[3])]:q;}}' +
        'else if(mode==4){if(has(P))bx=R(P);}' +
        'if(bx){bx=[bx[0]-pad,bx[1]-pad*0.6,bx[2]+pad,bx[3]+pad*0.6];}';
    var EX_BOX_SIZE = X_BOXCALC + 'bx?[bx[2]-bx[0],bx[3]-bx[1]]:[0,0];';
    var EX_BOX_POS = X_BOXCALC + 'bx?[(bx[0]+bx[2])/2,(bx[1]+bx[3])/2]:[0,0];';

    // group transform (entry animations)
    var X_ANIM = X_C + 'var a=Math.round(' + ctl("Animation") + ');var sp=Math.max(1,' + ctl("Anim Speed") + ')*thisComp.frameDuration;var t=Math.max(0,time);var u=Math.min(1,t/sp);';
    var EX_GROUP_SCALE = X_ANIM +
        'var s=100;' +
        'if(a==2){var c1=1.70158,c3=c1+1;s=100*(1+c3*Math.pow(u-1,3)+c1*Math.pow(u-1,2));s=40+0.6*s;}' +
        'else if(a==5){s=t>=sp*2?100:100+30*Math.exp(-6*t/sp)*Math.cos(9*t/sp)*-1;if(t<0.001)s=70;}' +
        'else if(a==6){s=130-30*(1-Math.pow(1-u,3));}' +
        '[s,s];';
    var EX_GROUP_POS = X_ANIM + 'var y=0;if(a==4)y=60*Math.pow(1-u,3);value+[0,y];';

    var X_LAYOUT = X_TXT +
        'function has(l){return T(l).replace(/\\s/g,"").length>0;}' +
        'var M=thisComp.layer("MAIN"),P=thisComp.layer("PUNCH");var C=thisComp.layer("' + CTRL + '");' +
        'var mh=has(M)?M.sourceRectAtTime(0,false).height:0;' +
        'var ph=has(P)?P.sourceRectAtTime(0,false).height*P.transform.scale[1]/100:0;' +
        'var gap=(mh>0&&ph>0)?C.effect("Line Gap")(1):0;var tot=mh+gap+ph;';

    // ---------- helpers ----------
    function ctl2(name) { return 'thisComp.layer("' + CTRL + '").effect("' + name + '")(1)'; }
    function fxAdd(layer, match, name) {
        var fx = layer.property("ADBE Effect Parade").addProperty(match);
        if (name) fx.name = name;
        return fx;
    }
    // effect property by display name (indices differ between effects and versions); logged when missing
    function named(fx, name) {
        for (var i = 1; i <= fx.numProperties; i++) if (fx.property(i).name === name) return fx.property(i);
        log("no property '" + name + "' on " + fx.name);
        return null;
    }
    function setNamed(fx, name, v, what) { var p = named(fx, name); if (p) { try { p.setValue(v); } catch (e) { log((what || name) + ": " + e); } } }
    function exprNamed(fx, name, ex) { var p = named(fx, name); if (p) expr(p, ex, fx.name + " " + name); }
    function slider(layer, name, v) { var f = fxAdd(layer, "ADBE Slider Control", name); f.property(1).setValue(v); return f; }
    function color(layer, name, rgb) { var f = fxAdd(layer, "ADBE Color Control", name); f.property(1).setValue(rgb); return f; }
    function check(layer, name, v) { var f = fxAdd(layer, "ADBE Checkbox Control", name); f.property(1).setValue(v ? 1 : 0); return f; }
    function dropdown(layer, name, items, v) {
        var f = fxAdd(layer, "ADBE Dropdown Control", name);
        // setPropertyParameters returns the new Menu property; the old reference becomes invalid
        var menu = f.property(1).setPropertyParameters(items);
        f = menu.parentProperty;
        f.name = name;
        f.property(1).setValue(v);
        return f;
    }
    function hex(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255]; }
    function expr(prop, e, label) {
        try { prop.expression = e; }
        catch (err) { log("EXPR SET FAIL [" + (label || (prop.parentProperty ? prop.parentProperty.name + "/" : "") + prop.name) + "]: " + err); }
    }
    var exprList = [];

    function setFont(l, font) {
        var st = l.property("ADBE Text Properties").property("ADBE Text Document");
        var td = st.value;
        td.font = font;
        st.setValue(td);
    }
    function makeText(comp, name, txt, font, size) {
        var l = comp.layers.addText(txt);
        l.name = name;
        var st = l.property("ADBE Text Properties").property("ADBE Text Document");
        var td = st.value;
        td.resetCharStyle();
        td.font = font;
        td.fontSize = size;
        td.applyFill = true;
        td.fillColor = [1, 1, 1];
        td.applyStroke = true;
        td.strokeColor = [0, 0, 0];
        td.strokeWidth = 1;
        td.strokeOverFill = false;
        td.justification = ParagraphJustification.CENTER_JUSTIFY;
        st.setValue(td);
        log(name + " font requested " + font + " -> " + st.value.font);
        return l;
    }

    function buildOne(NAME, PRO) {
        var proj = app.project;
        for (var ri = proj.numItems; ri >= 1; ri--) { if (proj.item(ri).name === NAME) proj.item(ri).remove(); }
        var comp = proj.items.addComp(NAME, W, H, 1, DUR, FPS);
        comp.bgColor = [0.03, 0.03, 0.04];

        // ----- DATA -----
        var D = comp.layers.addText("00010#2.4#0,0.4|0.4,0.8|0.8,1.2|1.2,1.6|1.6,2.4");
        D.name = DATA;
        D.enabled = false;
        setFont(D, "ArialMT");

        // ----- CTRL null with all controls -----
        var C = comp.layers.addNull(DUR);
        C.name = CTRL;
        C.enabled = false;
        var ctrlDefs = {};
        ctrlDefs["Text Color"] = color(C, "Text Color", [1, 1, 1]);
        ctrlDefs["Emphasis Color"] = color(C, "Emphasis Color", hex("#FFD400"));
        ctrlDefs["Highlight Color"] = color(C, "Highlight Color", hex("#FFD400"));
        ctrlDefs["Highlight Mode"] = dropdown(C, "Highlight Mode", ["Off", "Active Word", "Keywords", "Keywords When Spoken", "Fill As Spoken"], 2);
        ctrlDefs["Highlight Pop"] = slider(C, "Highlight Pop", 12);
        ctrlDefs["Unspoken Opacity"] = slider(C, "Unspoken Opacity", 100);
        ctrlDefs["Stroke Color"] = color(C, "Stroke Color", [0, 0, 0]);
        ctrlDefs["Stroke Width"] = slider(C, "Stroke Width", 8);
        ctrlDefs["Shadow"] = slider(C, "Shadow", 60);
        ctrlDefs["Glow Color"] = color(C, "Glow Color", hex("#1F6BFF"));
        ctrlDefs["Glow"] = slider(C, "Glow", 0);
        ctrlDefs["Emphasis Glow"] = slider(C, "Emphasis Glow", 0);
        ctrlDefs["Box Mode"] = dropdown(C, "Box Mode", ["Off", "Whole Caption", "Active Word", "Emphasis Line", "Strike Through"], 1);
        ctrlDefs["Box Color"] = color(C, "Box Color", hex("#1F6BFF"));
        ctrlDefs["Box Opacity"] = slider(C, "Box Opacity", 100);
        ctrlDefs["Box Padding"] = slider(C, "Box Padding", 18);
        ctrlDefs["Box Roundness"] = slider(C, "Box Roundness", 14);
        ctrlDefs["Animation"] = dropdown(C, "Animation", ["None", "Pop", "Fade", "Slide Up", "Bounce", "Zoom Out",
            "Flicker Reveal", "Letter Slam", "Typewriter", "Blur In", "Glitch", "Word Drop"], 2);
        ctrlDefs["Anim Speed"] = slider(C, "Anim Speed", 6);
        ctrlDefs["Fade Out"] = check(C, "Fade Out", false);
        ctrlDefs["Emphasis Size"] = slider(C, "Emphasis Size", 0);
        ctrlDefs["Line Gap"] = slider(C, "Line Gap", 6);
        ctrlDefs["Letter Spacing"] = slider(C, "Letter Spacing", 0);
        // faux styles and caps (applied in the Source Text expression of MAIN / PUNCH)
        check(C, "Bold", false); check(C, "Italic", false);
        check(C, "Emphasis Bold", false); check(C, "Emphasis Italic", false);
        check(C, "All Caps", false); check(C, "Small Caps", false);
        // glow on top of the letters (AE Glow, original behind); radius 0 when off, so it costs nothing
        slider(C, "Glow Over", 0); slider(C, "Glow Over Size", 20); color(C, "Glow Over Color", [1, 1, 1]);
        // internal (not exposed)
        if (PRO) {
            slider(C, "Gradient", 0); slider(C, "Emphasis Gradient", 0);
            // up to 5 colours: Top = first stop, Bottom = last stop, Mid 1-3 at 25 / 50 / 75 %
            color(C, "Gradient Top", hex("#FFF3B0")); color(C, "Gradient Bottom", hex("#C9922E"));
            color(C, "Gradient Mid 1", hex("#F5D98A")); color(C, "Gradient Mid 2", hex("#E8BE64")); color(C, "Gradient Mid 3", hex("#D9A848"));
            dropdown(C, "Gradient Type", ["Linear", "Radial", "Angular"], 1);
            slider(C, "Gradient Angle", 90);
            dropdown(C, "Gradient Target", ["All Text", "Normal Words", "Highlighted Words"], 1);
            slider(C, "Inner Glow Size", 20); slider(C, "Inner Glow Choke", 0);
            color(C, "Inner Shadow Color", [0, 0, 0]); slider(C, "Inner Shadow Distance", 6);
            slider(C, "Inner Shadow Angle", 120); slider(C, "Inner Shadow Size", 12);
            color(C, "Sweep Color", hex("#FFF8F0")); slider(C, "Sweep Width", 40); slider(C, "Sweep Angle", -25); slider(C, "Sweep Speed", 2.4);
            slider(C, "Deep Glow", 0); slider(C, "Deep Glow Radius", 40); color(C, "Deep Glow Color", hex("#1F6BFF"));
            slider(C, "Bevel", 0); slider(C, "Inner Glow", 0); color(C, "Inner Glow Color", hex("#FFFFFF"));
            slider(C, "Inner Shadow", 0); slider(C, "Depth", 0); color(C, "Depth Color", hex("#3A2508"));
            slider(C, "Light Sweep", 0);
            slider(C, "Ghost", 0);
        }
        expr(slider(C, "BC Active", -1).property(1), EX_ACTIVE, "BC Active");
        expr(slider(C, "BC N1", 0).property(1), EX_N1, "BC N1");
        expr(slider(C, "BC Dur", 2).property(1), EX_DUR, "BC Dur");
        expr(slider(C, "BC Fade", 100).property(1), EX_FADE, "BC Fade");


        // ----- angular gradient source (Pro, hidden): a cone around the comp centre -----
        // Effects that read another layer see that layer's source without its effects, so the cone is built
        // in its own comp and used here as a (hidden) layer.
        if (PRO) {
            var cname = NAME + " Conic";
            for (var ci = proj.numItems; ci >= 1; ci--) { if (proj.item(ci).name === cname) proj.item(ci).remove(); }
            // square as big as the comp diagonal, so the cone still covers every corner when rotated
            var DS = Math.ceil(Math.sqrt(W * W + H * H) / 2) * 2;
            var cc = proj.items.addComp(cname, W, H, 1, DUR, FPS);
            var CS = cc.layers.addSolid([0, 0, 0], "Cone", DS, DS, 1, DUR);
            var cr = fxAdd(CS, "ADBE Ramp", "BC Conic Ramp");
            cr.property(1).setValue([0, DS / 2]);
            cr.property(2).setValue([0, 0, 0, 1]);
            cr.property(3).setValue([DS, DS / 2]);
            cr.property(4).setValue([1, 1, 1, 1]);
            // rect to polar: left-right becomes the angle around the centre
            var cp = fxAdd(CS, "ADBE Polar Coordinates", "BC Conic Polar");
            cp.property(1).setValue(1);      // 100 % (scripting uses 0..1 here)
            cp.property(2).setValue(1);
            var CN = comp.layers.add(cc);
            CN.name = "BC_CONIC";
            CN.enabled = false;
            // Gradient Angle also turns the angular cone (clockwise, 0 = starts at 12 o'clock).
            // Blend reads BC_CONIC's source and ignores that layer's transform, and an expression inside the
            // conic comp cannot read this comp's controls at render time. So the cone turns with time inside its
            // comp (CONE_T seconds = one full turn) and BC_CONIC's time remap picks the moment for the angle.
            var CONE_T = 28;
            expr(CS.property("ADBE Transform Group").property("ADBE Rotate Z"), 'time*' + (360 / CONE_T) + ';', "conic rotation");
            CN.timeRemapEnabled = true;
            expr(CN.property("ADBE Time Remapping"),
                'var c=thisComp.layer("' + CTRL + '");var a=Math.round(c.effect("Gradient Type")(1))==3?c.effect("Gradient Angle")(1):0;' +
                'a=((a%360)+360)%360;a/360*' + CONE_T + ';', "conic time");
        }

        // ----- GROUP null -----
        var G = comp.layers.addNull(DUR);
        G.name = GROUP;
        G.enabled = false;
        G.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2]);
        G.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([50, 50]); // null solid is 100x100
        expr(G.property("ADBE Transform Group").property("ADBE Scale"), EX_GROUP_SCALE, "group scale");
        expr(G.property("ADBE Transform Group").property("ADBE Position"), EX_GROUP_POS, "group pos");

        // ----- text layers -----
        var MAIN = makeText(comp, "MAIN", "BUNNYS CAPTION", "Montserrat-Black", 80);
        var PUNCH = makeText(comp, "PUNCH", "LOOKS GREAT", "Montserrat-Black", 80);
        // Font by PostScript name, typed in a plain text field ("Caption Font" / "Emphasis Font").
        // This works in every Premiere version, unlike the MOGRT font menu. Empty = template font.
        var fonts = [["BC_FONT_MAIN", MAIN], ["BC_FONT_PUNCH", PUNCH]];
        for (var fi = 0; fi < fonts.length; fi++) {
            var fl = comp.layers.addText(" ");
            fl.name = fonts[fi][0];
            fl.enabled = false;
            setFont(fl, "ArialMT");
            var pre = fi ? "Emphasis " : "";
            expr(fonts[fi][1].property("ADBE Text Properties").property("ADBE Text Document"), X_TXT +
                'var f=T(thisComp.layer("' + fonts[fi][0] + '")).replace(/\\s/g,"");var r=value;' +
                'var hasF=false;if(f.length){try{r=text.sourceText.style.setFont(f);hasF=true;}catch(e){r=value;}}' +
                'var c=thisComp.layer("' + CTRL + '");' +
                'var b=c.effect("' + pre + 'Bold")(1)>0,it=c.effect("' + pre + 'Italic")(1)>0,ac=c.effect("All Caps")(1)>0,sc=c.effect("Small Caps")(1)>0;' +
                'if(b||it||ac||sc){try{var st=hasF?r:text.sourceText.style;' +
                'if(b)st=st.setFauxBold(true);if(it)st=st.setFauxItalic(true);if(ac)st=st.setAllCaps(true);else if(sc)st=st.setSmallCaps(true);r=st;}catch(e2){}}r;');
        }

        function setupText(L, isPunch) {
            L.parent = G;
            var tr = L.property("ADBE Transform Group");
            // parenting compensates for the group's animated scale at t=0; reset to 100%
            tr.property("ADBE Scale").setValue([100, 100]);
            expr(tr.property("ADBE Anchor Point"), 'var r=sourceRectAtTime(0,false);[0,r.top+r.height/2];', L.name + " anchor");
            if (isPunch) {
                expr(tr.property("ADBE Position"), X_LAYOUT + '[50,50+tot/2-ph/2];', L.name + " pos");
                expr(tr.property("ADBE Scale"), 'var v=100+1.5*thisComp.layer("' + CTRL + '").effect("Emphasis Size")(1);[v,v];', L.name + " scale");
            } else {
                expr(tr.property("ADBE Position"), X_LAYOUT + '[50,50-tot/2+mh/2];', L.name + " pos");
            }
            expr(tr.property("ADBE Opacity"), 'thisComp.layer("' + CTRL + '").effect("BC Fade")(1);', L.name + " opacity");

            var tp = L.property("ADBE Text Properties");
            // anchor grouping: word, so highlight pop scales each word around its own center
            var mo = tp.property("ADBE Text More Options");
            try { mo.property("ADBE Text Anchor Point Option").setValue(2); } catch (eA) { log("grouping: " + eA); }
            try { mo.property("ADBE Text Anchor Point Align").setValue([0, -30]); } catch (eB) { log("align: " + eB); }

            var anims = tp.property("ADBE Text Animators");
            // Base
            var a1 = anims.addProperty("ADBE Text Animator");
            a1.name = "Base";
            var p1 = a1.property("ADBE Text Animator Properties");
            expr(p1.addProperty("ADBE Text Fill Color"), 'thisComp.layer("' + CTRL + '").effect("' + (isPunch ? "Emphasis Color" : "Text Color") + '")(1);', L.name + " fill");
            expr(p1.addProperty("ADBE Text Stroke Color"), 'thisComp.layer("' + CTRL + '").effect("Stroke Color")(1);', L.name + " stroke color");
            expr(p1.addProperty("ADBE Text Stroke Width"), 'thisComp.layer("' + CTRL + '").effect("Stroke Width")(1);', L.name + " stroke width");
            expr(p1.addProperty("ADBE Text Tracking Amount"), 'thisComp.layer("' + CTRL + '").effect("Letter Spacing")(1);', L.name + " tracking");
            // Highlight
            var a2 = anims.addProperty("ADBE Text Animator");
            a2.name = "Highlight";
            var p2 = a2.property("ADBE Text Animator Properties");
            expr(p2.addProperty("ADBE Text Fill Color"), 'thisComp.layer("' + CTRL + '").effect("Highlight Color")(1);', L.name + " hl fill");
            expr(p2.addProperty("ADBE Text Scale 3D"), 'var v=100+thisComp.layer("' + CTRL + '").effect("Highlight Pop")(1);[v,v,100];', L.name + " hl scale");
            var s2 = a2.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
            try { s2.property("ADBE Text Range Type2").setValue(3); } catch (eC) { log("basedOn: " + eC); }
            expr(s2.property("ADBE Text Expressible Amount"), exHighlight(isPunch), L.name + " hl amount");
            // Unspoken words
            var a3 = anims.addProperty("ADBE Text Animator");
            a3.name = "Unspoken";
            var p3 = a3.property("ADBE Text Animator Properties");
            expr(p3.addProperty("ADBE Text Opacity"), 'thisComp.layer("' + CTRL + '").effect("Unspoken Opacity")(1);', L.name + " unspoken op");
            var s3 = a3.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
            try { s3.property("ADBE Text Range Type2").setValue(3); } catch (eD) { log("basedOn2: " + eD); }
            expr(s3.property("ADBE Text Expressible Amount"), exUnspoken(isPunch), L.name + " unspoken amount");

            // letter-level entry animations
            var a4 = anims.addProperty("ADBE Text Animator");
            a4.name = "Entry";
            var p4 = a4.property("ADBE Text Animator Properties");
            p4.addProperty("ADBE Text Opacity").setValue(0);
            var ANI = 'var a=Math.round(thisComp.layer("' + CTRL + '").effect("Animation")(1));';
            expr(p4.addProperty("ADBE Text Scale 3D"), ANI + 'var v=a==8?260:(a==10?135:100);[v,v,100];');
            expr(p4.addProperty("ADBE Text Blur"), ANI + 'a==8?[40,40]:(a==10?[55,55]:[0,0]);');
            expr(p4.addProperty("ADBE Text Position 3D"), ANI + 'a==12?[0,-90,0]:[0,0,0];');
            var s4 = a4.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
            s4.property("ADBE Text Range Type2").setValue(1);
            expr(s4.property("ADBE Text Expressible Amount"), exEntry(isPunch));
            // glitch: random per-letter jitter, strong while entering, light afterwards
            var a5 = anims.addProperty("ADBE Text Animator");
            a5.name = "Glitch";
            var p5 = a5.property("ADBE Text Animator Properties");
            p5.addProperty("ADBE Text Position 3D").setValue([26, 14, 0]);
            p5.addProperty("ADBE Text Rotation").setValue(12);
            var w5 = a5.property("ADBE Text Selectors").addProperty("ADBE Text Wiggly Selector");
            var GL = ANI + 'var D=Math.max(0.3,thisComp.layer("' + CTRL + '").effect("Anim Speed")(1)*thisComp.frameDuration*4);var g=a==11?(time<D?100:14):0;';
            expr(w5.property("ADBE Text Wiggly Max Amount"), GL + 'g;');
            expr(w5.property("ADBE Text Wiggly Min Amount"), GL + '-g;');
            w5.property("ADBE Text Range Type2").setValue(1);
            w5.property("ADBE Text Temporal Freq").setValue(12);
            w5.property("ADBE Text Character Correlation").setValue(0);

            if (PRO) {
                // overlay with only the highlighted words (same text, animators and transforms), for Gradient Target
                var O = L.duplicate();
                O.name = L.name + "_HL";
                // only needed for "normal words" / "highlighted words": otherwise one space, so its letter expressions cost nothing
                expr(O.property("ADBE Text Properties").property("ADBE Text Document"),
                    'var m=Math.round(' + ctl2("Gradient Target") + ');var on=m>1&&' + ctl2(isPunch ? "Emphasis Gradient" : "Gradient") + '>0;' +
                    'var t=thisComp.layer("' + L.name + '").text.sourceText;on?t:t.style.setText(" ");', O.name + " text");
                var oa = O.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
                oa.name = "Highlighted Only";
                oa.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity").setValue(0);
                var os = oa.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
                try { os.property("ADBE Text Range Type2").setValue(3); } catch (eO) { log("overlay basedOn: " + eO); }
                expr(os.property("ADBE Text Expressible Amount"), exHighlight(isPunch).replace(/v;$/, '100-v;'), O.name + " mask");
                expr(O.property("ADBE Transform Group").property("ADBE Opacity"),
                    'var m=Math.round(' + ctl2("Gradient Target") + ');(m>1&&' + ctl2(isPunch ? "Emphasis Gradient" : "Gradient") + '>0)?' + ctl2("BC Fade") + ':0;', O.name + " opacity");
                addPro(O, isPunch, "hl");
                addPro(L, isPunch, "main");
                O.moveBefore(L);
            }
            // glow over the letters (the text itself lights up); radius 0 when off
            var go = fxAdd(L, "ADBE Glo2", "BC Glow Over");
            var GO = ctl2("Glow Over");
            setNamed(go, "Glow Based On", 1, "glow over based on");
            setNamed(go, "Glow Threshold", 0, "glow over threshold");
            exprNamed(go, "Glow Radius", GO + '>0?Math.max(1,' + ctl2("Glow Over Size") + '):0;');
            exprNamed(go, "Glow Intensity", GO + '/100*3;');
            setNamed(go, "Composite Original", 2, "glow over composite");   // 2 = letters behind the glow
            setNamed(go, "Glow Operation", 5, "glow over operation");     // Screen: lights the letters up without burning them white
            setNamed(go, "Glow Colors", 2, "glow over colors");
            exprNamed(go, "Color A", ctl2("Glow Over Color") + ';');
            exprNamed(go, "Color B", ctl2("Glow Over Color") + ';');
            // glow then shadow (both drop shadows: cheap on low-end machines)
            var gl = fxAdd(L, "ADBE Drop Shadow", "BC Glow");
            expr(gl.property(1), 'thisComp.layer("' + CTRL + '").effect("Glow Color")(1);', L.name + " glow color");
            expr(gl.property(2), 'Math.min(255,2.55*1.6*thisComp.layer("' + CTRL + '").effect("' + (isPunch ? "Emphasis Glow" : "Glow") + '")(1));', L.name + " glow op");
            gl.property(4).setValue(0);
            // softness 0 when the glow is off, so the shadow pass costs nothing
            expr(gl.property(5), 'var g=thisComp.layer("' + CTRL + '").effect("' + (isPunch ? "Emphasis Glow" : "Glow") + '")(1);g>0?12+0.6*g:0;', L.name + " glow soft");
            var sh = fxAdd(L, "ADBE Drop Shadow", "BC Shadow");
            sh.property(1).setValue([0, 0, 0]);
            expr(sh.property(2), 'Math.min(255,2.55*thisComp.layer("' + CTRL + '").effect("Shadow")(1));', L.name + " shadow op");
            sh.property(3).setValue(135);
            sh.property(4).setValue(5);
            sh.property(5).setValue(14);
        }
        setupText(MAIN, false);
        setupText(PUNCH, true);
        if (PRO) { addStyles(comp, comp.layer("MAIN")); addStyles(comp, comp.layer("PUNCH")); }

        // ----- measure layers (hidden) -----
        var mNames = { "BC_M_PW": "PW", "BC_M_W": "W", "BC_M_LINE": "LINE" };
        for (var mn in mNames) {
            var ml = comp.layers.addText("x");
            ml.name = mn;
            ml.enabled = false;
            setFont(ml, "ArialMT");
            expr(ml.property("ADBE Text Properties").property("ADBE Text Document"), exMeasure(mNames[mn]), mn);
        }

        // ----- box (shape layer, comp space) -----
        var B = comp.layers.addShape();
        B.name = "BC_BOX";
        var bg = B.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        bg.name = "Box";
        var bc = bg.property("ADBE Vectors Group");
        bc.addProperty("ADBE Vector Shape - Rect");
        bc.addProperty("ADBE Vector Graphic - Fill");
        // adding a property invalidates sibling references, so fetch both afterwards
        bc = B.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
        var rect = bc.property(1);
        var fill = bc.property(2);
        expr(rect.property("ADBE Vector Rect Size"), EX_BOX_SIZE, "box size");
        expr(rect.property("ADBE Vector Rect Position"), EX_BOX_POS, "box pos");
        expr(rect.property("ADBE Vector Rect Roundness"), 'thisComp.layer("' + CTRL + '").effect("Box Roundness")(1);', "box round");
        expr(fill.property("ADBE Vector Fill Color"), 'thisComp.layer("' + CTRL + '").effect("Box Color")(1);', "box color");
        expr(fill.property("ADBE Vector Fill Opacity"), 'thisComp.layer("' + CTRL + '").effect("Box Opacity")(1);', "box fill op");
        B.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
        B.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
        expr(B.property("ADBE Transform Group").property("ADBE Opacity"), 'thisComp.layer("' + CTRL + '").effect("BC Fade")(1);', "box opacity");
        B.moveToEnd();

        // ----- strike-through line (above the text) -----
        var K = comp.layers.addShape();
        K.name = "BC_STRIKE";
        var kg = K.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        kg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        kg.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        var kc = K.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group");
        // nothing is measured unless Box Mode is 5 (strike-through)
        var KS = X_C + X_TXT + 'function has(l){return T(l).replace(/\\s/g,"").length>0;}' +
            'var on=Math.round(' + ctl("Box Mode") + ')==5;var a=[0,0],b=[0,0],h=0,pad=0;' +
            'if(on){var M=thisComp.layer("MAIN"),P=thisComp.layer("PUNCH");var L=has(P)?P:M;var r=L.sourceRectAtTime(0,false);' +
            'a=L.toComp([r.left,r.top+r.height*0.5]);b=L.toComp([r.left+r.width,r.top+r.height*0.5]);' +
            'h=Math.max(6,r.height*0.13*L.transform.scale[1]/100);pad=' + ctl("Box Padding") + '*0.5;}';
        expr(kc.property(1).property("ADBE Vector Rect Size"), KS + 'on?[Math.abs(b[0]-a[0])+pad*2,h]:[0,0];');
        expr(kc.property(1).property("ADBE Vector Rect Position"), KS + '[(a[0]+b[0])/2,(a[1]+b[1])/2];');
        expr(kc.property(1).property("ADBE Vector Rect Roundness"), ctl2("Box Roundness") + '*0.3;');
        expr(kc.property(2).property("ADBE Vector Fill Color"), ctl2("Box Color") + ';');
        expr(kc.property(2).property("ADBE Vector Fill Opacity"), ctl2("Box Opacity") + ';');
        K.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
        K.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
        expr(K.property("ADBE Transform Group").property("ADBE Opacity"), ctl2("BC Fade") + ';');
        K.moveToBeginning();

        // ----- ghost word: the emphasis (or caption) text, huge and blurred behind everything (Pro) -----
        if (PRO) {
            var GH = comp.layers.addText("GHOST");
            GH.name = "BC_GHOST";
            GH.parent = comp.layer(GROUP);
            var gtr = GH.property("ADBE Transform Group");
            gtr.property("ADBE Scale").setValue([100, 100]);
            expr(GH.property("ADBE Text Properties").property("ADBE Text Document"), X_TXT +
                'function has(l){return T(l).replace(/\\s/g,"").length>0;}var P=thisComp.layer("PUNCH"),M=thisComp.layer("MAIN");' +
                'var L=has(P)?P:M;var on=' + ctl2("Ghost") + '>0;L.text.sourceText.style.setText(on?T(L).replace(/[\\r\\n\\u0003]+/g," "):" ");');
            expr(gtr.property("ADBE Anchor Point"), 'var r=sourceRectAtTime(0,false);[r.left+r.width/2,r.top+r.height/2];');
            gtr.property("ADBE Position").setValue([50, 50]);
            expr(gtr.property("ADBE Scale"), 'var v=200+' + ctl2("Ghost") + '*0.8;[v,v];');
            expr(gtr.property("ADBE Opacity"), ctl2("Ghost") + '*0.35*' + ctl2("BC Fade") + '/100;');
            var gb = fxAdd(GH, "ADBE Box Blur2", "BC Ghost Blur");
            // blur radius cannot take an expression; with Ghost 0 the layer holds one space, so blurring it is free
            gb.property(1).setValue(14);
            gb.property(2).setValue(2);
            var gf = fxAdd(GH, "ADBE Fill", "BC Ghost Color");
            expr(gf.property("Color"), ctl2("Emphasis Color") + ';');
            GH.moveToEnd();
        }

        // ----- probe: evaluate expressions -----
        // references collected while building are invalidated by later additions, so walk the comp
        var errs = 0, nExpr = 0;
        function walk(g, path) {
            for (var k = 1; k <= g.numProperties; k++) {
                var pp = g.property(k);
                if (pp.propertyType === PropertyType.PROPERTY) {
                    if (pp.canSetExpression && pp.expression !== "") {
                        nExpr++;
                        if (pp.expressionError) { pp.expression = pp.expression; }
                        if (pp.expressionError) { errs++; log("EXPR ERROR [" + path + "/" + pp.name + "]: " + pp.expressionError); }
                    }
                } else { walk(pp, path + "/" + pp.name); }
            }
        }
        for (var li = 1; li <= comp.numLayers; li++) walk(comp.layer(li), comp.layer(li).name);
        log("expressions: " + nExpr + ", errors: " + errs);
        C = comp.layer(CTRL); MAIN = comp.layer("MAIN"); PUNCH = comp.layer("PUNCH");

        // ----- Essential Graphics -----
        comp.motionGraphicsTemplateName = NAME;
        function eg(prop, name) {
            var ok = false;
            try { ok = prop.addToMotionGraphicsTemplateAs(comp, name); } catch (e) { log("EG fail " + name + ": " + e); }
            if (!ok) log("EG not added: " + name);
        }
        eg(MAIN.property("ADBE Text Properties").property("ADBE Text Document"), "Caption Text");
        eg(PUNCH.property("ADBE Text Properties").property("ADBE Text Document"), "Emphasis Text");
        eg(comp.layer("BC_FONT_MAIN").property("ADBE Text Properties").property("ADBE Text Document"), "Caption Font");
        eg(comp.layer("BC_FONT_PUNCH").property("ADBE Text Properties").property("ADBE Text Document"), "Emphasis Font");
        var order = ["Text Color", "Emphasis Color", "Highlight Mode", "Highlight Color", "Highlight Pop", "Unspoken Opacity",
            "Stroke Color", "Stroke Width", "Shadow", "Glow Color", "Glow", "Emphasis Glow",
            "Box Mode", "Box Color", "Box Opacity", "Box Padding", "Box Roundness",
            "Animation", "Anim Speed", "Fade Out", "Emphasis Size", "Line Gap", "Letter Spacing",
            "Bold", "Italic", "Emphasis Bold", "Emphasis Italic", "All Caps", "Small Caps", "Glow Over", "Glow Over Size", "Glow Over Color"];
        if (PRO) order = order.concat(["Gradient", "Emphasis Gradient", "Gradient Top", "Gradient Bottom",
            "Gradient Mid 1", "Gradient Mid 2", "Gradient Mid 3", "Gradient Type", "Gradient Angle", "Gradient Target",
            "Inner Glow Size", "Inner Glow Choke", "Inner Shadow Color", "Inner Shadow Distance", "Inner Shadow Angle", "Inner Shadow Size",
            "Sweep Color", "Sweep Width", "Sweep Angle", "Sweep Speed", "Deep Glow", "Deep Glow Radius", "Deep Glow Color", "Bevel",
            "Inner Glow", "Inner Glow Color", "Inner Shadow", "Depth", "Depth Color", "Light Sweep", "Ghost"]);
        for (var oi = 0; oi < order.length; oi++) {
            var ef = C.property("ADBE Effect Parade").property(order[oi]);
            eg(ef.property(1), order[oi]);
        }
        eg(D.property("ADBE Text Properties").property("ADBE Text Document"), "Timing Data");
        log(NAME + " EG controllers: " + comp.motionGraphicsTemplateControllerCount);

        proj.save(AEP);
        var out = new File(OUT_DIR.fsName + "/" + NAME + ".mogrt");
        var ok = comp.exportAsMotionGraphicsTemplate(true, OUT_DIR.fsName);
        log("export " + out.fsName + " -> " + ok + " exists=" + out.exists + " size=" + (out.exists ? out.length : 0));
    }

    // ---------- premium look (Pro template only) ----------
    function cx(name) { return 'thisComp.layer("' + CTRL + '").effect("' + name + '")(1)'; }
    // role: "main" (the text layer) or "hl" (its overlay that shows only the highlighted words).
    // Gradient Target 1 all text / 2 normal words / 3 highlighted words: the main layer takes the gradient for
    // 1 and 2, the overlay for 3 (for 2 the overlay shows the highlighted words in their plain colour on top).
    function addPro(L, isPunch, role) {
        var comp = L.containingComp;
        var line = isPunch ? "Emphasis Gradient" : "Gradient";
        var TGT = 'Math.round(' + cx("Gradient Target") + ')';
        var AMT = role === "hl" ? '(' + TGT + '==3?' + cx(line) + ':0)' : '(' + TGT + '==3?0:' + cx(line) + ')';
        // effect points on text layers are in comp space, hence toComp()
        var RECT = 'var b=sourceRectAtTime(0,false);';
        // Multi-colour gradient (checked frame by frame in AE): alpha made full, a black-to-white ramp over the
        // whole layer, bent into a cone for Angular (Polar Coordinates), cut back to the text shape (Set Matte from the layer itself), coloured with 5 tones.
        // The tones are mixed with the line's own colour by the amount; at 0 every step passes the text through.
        var ON = AMT + '>0';
        var GT = 'var gt=Math.round(' + cx("Gradient Type") + ');';
        var sc = fxAdd(L, "ADBE Shift Channels", "BC Grad Full");
        exprNamed(sc, "Take Alpha From", ON + '?9:1;');
        var rp = fxAdd(L, "ADBE Ramp", "BC Gradient");
        // linear: through the text box at the given angle (90 = top to bottom); radial: from the centre.
        // Angular comes from the hidden BC_CONIC layer (a text layer only has pixels inside its own text box,
        // too little for Polar Coordinates to make a full cone).
        var GEO = RECT + GT + 'var c=toComp([b.left+b.width/2,b.top+b.height/2]);var a=' + cx("Gradient Angle") + '*Math.PI/180;' +
            'var hw=b.width/2,hh=b.height/2;var L=Math.abs(hw*Math.cos(a))+Math.abs(hh*Math.sin(a));var d=[Math.cos(a),Math.sin(a)];';
        expr(rp.property(1), GEO + 'gt==2?c:[c[0]-d[0]*L,c[1]-d[1]*L];');
        rp.property(2).setValue([0, 0, 0, 1]);
        expr(rp.property(3), GEO + 'gt==2?[c[0]+Math.max(hw,hh),c[1]]:[c[0]+d[0]*L,c[1]+d[1]*L];');
        rp.property(4).setValue([1, 1, 1, 1]);
        expr(rp.property(5), GT + 'gt==2?2:1;');
        expr(rp.property(7), ON + '?0:100;');
        // angular: the grey comes from BC_CONIC instead (crossfade fully to it; otherwise keep the ramp)
        var bl = fxAdd(L, "ADBE Blend", "BC Grad Angular");
        try { named(bl, "Blend With Layer").setValue(comp.layer("BC_CONIC").index); } catch (eB) { log("blend layer: " + eB); }
        setNamed(bl, "Mode", 1, "blend mode");
        exprNamed(bl, "Blend With Original", GT + '(' + ON + '&&gt==3)?0:100;');
        var sm = fxAdd(L, "ADBE Set Matte3", "BC Grad Shape");
        try { sm.property(1).setValue(L.index); } catch (eM) { log("set matte layer: " + eM); }
        setNamed(sm, "Composite Matte with Original", 0, "matte composite");
        var tn = fxAdd(L, "CC Toner", "BC Grad Colors");
        setNamed(tn, "Tones", 3, "toner tones");
        var own = isPunch ? "Emphasis Color" : "Text Color";
        function tone(stop) {
            return 'var k=' + AMT + '/100;var t=' + cx(own) + ';var s=' + cx(stop) + ';[t[0]+(s[0]-t[0])*k,t[1]+(s[1]-t[1])*k,t[2]+(s[2]-t[2])*k,1];';
        }
        exprNamed(tn, "Shadows", tone("Gradient Top"));
        exprNamed(tn, "Darktones", tone("Gradient Mid 1"));
        exprNamed(tn, "Midtones", tone("Gradient Mid 2"));
        exprNamed(tn, "Brights", tone("Gradient Mid 3"));
        exprNamed(tn, "Highlights", tone("Gradient Bottom"));
        exprNamed(tn, "Blend w. Original", ON + '?0:100;');
        if (role === "hl") return;
        var bv = fxAdd(L, "ADBE Bevel Alpha", "BC Bevel");
        expr(bv.property(1), cx("Bevel") + '*0.06;');
        expr(bv.property(4), cx("Bevel") + '/100;');
        var sw = fxAdd(L, "CC Light Sweep", "BC Sweep");
        // a pass every "Sweep Speed" seconds, starting as the caption appears
        expr(sw.property(1), RECT + 'var sp=Math.max(0.3,' + cx("Sweep Speed") + ');var u=(time%sp)/sp;' +
            'toComp([b.left-b.width*0.35+u*b.width*1.7,b.top+b.height/2]);');
        expr(sw.property(2), cx("Sweep Angle") + ';');
        expr(sw.property(4), RECT + 'b.height*(0.15+' + cx("Sweep Width") + '/100*1.5);');
        expr(sw.property(5), cx("Light Sweep") + ';');
        expr(sw.property(6), cx("Light Sweep") + '*0.6;');
        expr(sw.property(8), cx("Sweep Color") + ';');
        // 6 chained hard shadows make a solid extrusion
        for (var k = 1; k <= 6; k++) {
            var d = fxAdd(L, "ADBE Drop Shadow", "BC Depth " + k);
            expr(d.property(1), cx("Depth Color") + ';');
            expr(d.property(2), cx("Depth") + '>0?255:0;');
            d.property(3).setValue(165);
            expr(d.property(4), cx("Depth") + '/6;');
            d.property(5).setValue(0);
        }
        // deep glow: a tight and a wide AE Glow on the text shape, behind the letters
        var DG = cx("Deep Glow"), DR = cx("Deep Glow Radius");
        for (var gi = 1; gi <= 2; gi++) {
            var dg = fxAdd(L, "ADBE Glo2", "BC Deep Glow " + gi);
            setNamed(dg, "Glow Based On", 1, "glow based on");
            setNamed(dg, "Glow Threshold", 0, "glow threshold");
            exprNamed(dg, "Glow Radius", DG + '>0?' + DR + '*' + (gi === 1 ? '1.2' : '4') + ':0;');
            exprNamed(dg, "Glow Intensity", DG + '/100*' + (gi === 1 ? '1.3' : '0.9') + ';');
            setNamed(dg, "Composite Original", 1, "glow composite");   // 1 = glow behind the letters (checked in frames)
            setNamed(dg, "Glow Colors", 2, "glow colors");
            exprNamed(dg, "Color A", cx("Deep Glow Color") + ';');
            exprNamed(dg, "Color B", cx("Deep Glow Color") + ';');
        }
    }
    // Layer styles have no scripting API to add; the menu commands do it on the selected layer.
    function addStyles(comp, L) {
        comp.openInViewer();
        for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
        L.selected = true;
        app.executeCommand(app.findMenuCommandId("Inner Glow"));
        app.executeCommand(app.findMenuCommandId("Inner Shadow"));
        L.selected = false;
        var ls = L.property("ADBE Layer Styles");
        var ig = ls.property("innerGlow/enabled"), ish = ls.property("innerShadow/enabled");
        expr(ig.property("innerGlow/opacity"), cx("Inner Glow") + ';');
        expr(ig.property("innerGlow/color"), cx("Inner Glow Color") + ';');
        expr(ig.property("innerGlow/blur"), cx("Inner Glow Size") + ';');
        expr(ig.property("innerGlow/chokeMatte"), cx("Inner Glow Choke") + ';');
        try { ig.property("innerGlow/glowTechnique").setValue(1); } catch (eT) { log("glow technique: " + eT); }  // softer
        expr(ish.property("innerShadow/opacity"), cx("Inner Shadow") + ';');
        expr(ish.property("innerShadow/color"), cx("Inner Shadow Color") + ';');
        expr(ish.property("innerShadow/localLightingAngle"), cx("Inner Shadow Angle") + ';');
        expr(ish.property("innerShadow/distance"), cx("Inner Shadow Distance") + ';');
        expr(ish.property("innerShadow/blur"), cx("Inner Shadow Size") + ';');
    }

    try {
        app.beginSuppressDialogs();
        // Use the open project (run in an empty project). app.newProject() can block on the Home screen.
        try { app.project.expressionEngine = "javascript-1.0"; } catch (e0) { log("engine: " + e0); }
        var which = $.global.BC_ONLY || "both";
        if (which !== "pro") buildOne("Bunnys Caption", false);
        if (which !== "lite") buildOne("Bunnys Caption Pro", true);
    } catch (err) {
        log("FATAL " + err.toString() + " @line " + err.line);
    }
    try { app.endSuppressDialogs(false); } catch (e9) {}
    LOGF.encoding = "UTF-8";
    LOGF.open("w");
    LOGF.write(LOG.join("\n"));
    LOGF.close();
})();
