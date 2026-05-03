{pkgs}: {
  deps = [
    pkgs.gdk-pixbuf
    pkgs.cairo
    pkgs.pango
    pkgs.glib
    pkgs.libxkbcommon
    pkgs.alsa-lib
    pkgs.libdrm
    pkgs.expat
    pkgs.mesa
    pkgs.xorg.libxcb
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libX11
    pkgs.dbus
    pkgs.cups
    pkgs.atk
    pkgs.nspr
    pkgs.nss
    pkgs.chromium
  ];
}
