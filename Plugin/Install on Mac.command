#!/bin/bash
# Bunnys Caption installer for Mac - by Bunnys Framelab (instagram.com/bunnysframelab)
# Copies the panel into Premiere's extensions folder and allows unsigned panels.

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.bunnysframelab.caption"

echo ""
echo "  Bunnys Caption installer"
echo "  ------------------------"
echo "  Installing to: $DEST"
echo ""

if [ ! -f "$SRC/mogrt/Bunnys Caption.mogrt" ]; then
  echo "  ERROR: mogrt/Bunnys Caption.mogrt is missing next to this installer."
  read -n 1 -s -r -p "  Press any key to close."
  exit 1
fi

mkdir -p "$DEST"
rsync -a --delete --exclude "*.bat" --exclude "*.command" --exclude "*.log" --exclude "dev" --exclude "tools" "$SRC/" "$DEST/"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null

# Unsigned panels need PlayerDebugMode (CEP 11-13 = Premiere Pro / After Effects 2022-2026)
for v in 11 12 13; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done

echo "  Plugin installed."
echo ""

# Fonts the Lyrics styles use (Fonts folder next to the Plugin folder)
if [ -d "$SRC/../Fonts" ]; then
  mkdir -p "$HOME/Library/Fonts"
  for f in "$SRC/../Fonts/"*.ttf "$SRC/../Fonts/"*.otf; do
    [ -f "$f" ] || continue
    t="$HOME/Library/Fonts/$(basename "$f")"
    [ -f "$t" ] || cp "$f" "$t"
  done
  echo "  Fonts for the Lyrics styles installed."
  echo ""
fi

# Speech engine (and translator) come from Homebrew on Mac
if command -v brew >/dev/null 2>&1; then
  if ! command -v whisper-cli >/dev/null 2>&1; then
    read -r -p "  Install the speech engine now (brew install whisper-cpp)? [Y/n] " a
    if [ "$a" != "n" ] && [ "$a" != "N" ]; then brew install whisper-cpp; fi
  else
    echo "  Speech engine: already installed."
  fi
  if ! command -v llama-server >/dev/null 2>&1; then
    read -r -p "  Install the translator engine too (only for Bangla/Hindi to English, brew install llama.cpp)? [y/N] " t
    if [ "$t" = "y" ] || [ "$t" = "Y" ]; then brew install llama.cpp; fi
  fi
else
  echo "  Homebrew is not installed. To get the speech engine:"
  echo "    1. Install Homebrew from https://brew.sh"
  echo "    2. Run:  brew install whisper-cpp"
fi

echo ""
echo "  All done! Restart Premiere Pro or After Effects, then open:"
echo "    Window > Extensions > Bunnys Caption"
echo ""
read -n 1 -s -r -p "  Press any key to close."
echo ""
