"""Post-process the MOGRT exported by build_template.jsx.

- Enables font, font size and faux style editing on the two caption text controls,
  so the font can be changed from Premiere's Essential Graphics / Effect Controls.
- Puts the controls in reading order (AE writes them reversed).
- Widens a few slider ranges past AE's default 0..100.

Usage: python patch_mogrt.py "mogrt/Bunnys Caption.mogrt" "mogrt/Bunnys Caption Pro.mogrt"
"""
import json
import sys
import zipfile
from pathlib import Path

FONT_EDITABLE = {"Caption Text", "Emphasis Text"}
RANGES = {
    "Letter Spacing": (-100, 300),
    "Line Gap": (-60, 200),
    "Box Padding": (0, 150),
    "Stroke Width": (0, 60),
    "Anim Speed": (1, 30),
    "Emphasis Size": (-40, 100),
    "Gradient Angle": (0, 360),
    "Inner Shadow Angle": (0, 360),
    "Sweep Angle": (-90, 90),
    "Sweep Speed": (0.3, 10),
    "Glow Over Size": (1, 200),
}


def ui_name(control):
    return control["uiName"]["strDB"][0]["str"]


def patch(path):
    src = Path(path)
    with zipfile.ZipFile(src) as z:
        files = {n: z.read(n) for n in z.namelist()}

    d = json.loads(files["definition.json"].decode("utf-8"))
    controls = d["clientControls"]
    if controls and ui_name(controls[0]) == "Timing Data":
        controls.reverse()
    for c in controls:
        name = ui_name(c)
        if name in FONT_EDITABLE and "fonteditinfo" in c:
            fe = c["fonteditinfo"]
            fe["capPropFontEdit"] = True
            fe["capPropFontSizeEdit"] = True
            fe["capPropFontFauxStyleEdit"] = True
        if name in RANGES and c.get("type") == 2:
            c["min"], c["max"] = RANGES[name]
    d["description"] = "Bunnys Caption by Bunnys Framelab - instagram.com/bunnysframelab"
    files["definition.json"] = json.dumps(d, ensure_ascii=False).encode("utf-8")

    tmp = src.with_suffix(".tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for n, data in files.items():
            z.writestr(n, data)
    tmp.replace(src)
    print("patched", src, [ui_name(c) for c in controls])


if __name__ == "__main__":
    for f in sys.argv[1:]:
        patch(f)
