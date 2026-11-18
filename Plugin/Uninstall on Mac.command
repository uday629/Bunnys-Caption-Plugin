#!/bin/bash
# Removes the Bunnys Caption panel. Saved styles in ~/Library/Application Support/BunnysFramelab are kept.
rm -rf "$HOME/Library/Application Support/Adobe/CEP/extensions/com.bunnysframelab.caption"
echo "Bunnys Caption removed. Saved styles are still in:"
echo "  ~/Library/Application Support/BunnysFramelab/BunnysCaption"
read -n 1 -s -r -p "Press any key to close."
echo ""
