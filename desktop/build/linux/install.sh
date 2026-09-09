#!/bin/sh
# Installs VDM for the current user.
#
# The binary alone cannot show an app icon on Linux: GTK4 dropped runtime window
# icons, so the window manager resolves the icon through the installed .desktop
# entry (matched to the window by StartupWMClass). This script installs all three
# pieces into ~/.local so that works.
#
# Runs from the release archive (vdm, vdm.png, vdm.desktop next to this script)
# and from a repository checkout (build/linux/install.sh after a build).
set -e

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SRC_DIR/vdm" ]; then           # release archive layout
  BINARY="$SRC_DIR/vdm"
  ICON="$SRC_DIR/vdm.png"
  ENTRY="$SRC_DIR/vdm.desktop"
elif [ -f "$SRC_DIR/../../bin/vdm" ]; then  # repository layout
  BINARY="$SRC_DIR/../../bin/vdm"
  ICON="$SRC_DIR/../appicon.png"
  ENTRY="$SRC_DIR/desktop"
else
  echo "error: vdm binary not found. Build it first: wails3 task linux:build" >&2
  exit 1
fi

BIN_DIR="${HOME}/.local/bin"
APP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/128x128/apps"

mkdir -p "$BIN_DIR" "$APP_DIR" "$ICON_DIR"

install -m 755 "$BINARY" "$BIN_DIR/vdm"
install -m 644 "$ICON" "$ICON_DIR/vdm.png"
sed "s|^Exec=.*|Exec=$BIN_DIR/vdm %u|" "$ENTRY" > "$APP_DIR/vdm.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "${HOME}/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

echo "Installed:"
echo "  binary        $BIN_DIR/vdm"
echo "  desktop entry $APP_DIR/vdm.desktop"
echo "  icon          $ICON_DIR/vdm.png"
echo
echo "Launch it from your application menu, or run: $BIN_DIR/vdm"
echo "Uninstall: rm -f $BIN_DIR/vdm $APP_DIR/vdm.desktop $ICON_DIR/vdm.png"
