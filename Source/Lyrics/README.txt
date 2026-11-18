Bunnys Caption Lyrics styles - how they are built
=================================================
The 22 Lyrics styles in Plugin/mogrt/Lyrics were built in After Effects from the lyric source
project (comps "TXT 1" to "TXT 22") with build_lyrics_mogrts.jsx.

Each MOGRT = a wrapper comp "Bunnys Caption Lyrics nn" holding the original comp (time-remapped for Speed),
plus Glow, CC Light Sweep and Drop Shadow, all driven by a "BC Controls" null.
Essential Graphics fields: Line 1-3, Speed (50 = original), Custom Colors, Line N Color,
Glow + Glow Color, Light Sweep + Sweep Color, Shadow + Shadow Color, Opacity.

Rebuild: set AEP / BASE at the top of build_lyrics_mogrts.jsx, open After Effects, then
File > Scripts > Run Script File > build_lyrics_mogrts.jsx. The .mogrt files go to BASE/mogrt.
Fonts needed: the Fonts folder of this package.

dump_lyrics.jsx  writes every layer, keyframe and expression of the source project to JSON.
rz.js            small zip reader (node) to look inside a .mogrt.
aewin.ps1        Windows helper that captures After Effects dialogs while scripting.
