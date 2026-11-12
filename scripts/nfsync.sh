#!/usr/bin/env bash
# NightForge sync helper.
#
# Why this exists: /sdcard on this device is a bind mount that does NOT support
# symlinks, and npm needs symlinks to build node_modules/.bin. So the source of
# truth lives on /sdcard (persistent, visible to Jay) and a runnable mirror
# lives in the Linux filesystem, where npm works. This script moves code between
# them. It uses tar because rsync is not installed in this image.
#
# Usage:
#   bash scripts/nfsync.sh push    # /sdcard source -> /root mirror (code only)
#   bash scripts/nfsync.sh pull    # /root mirror DB -> /sdcard backups
#   bash scripts/nfsync.sh run     # push, then boot the server on 127.0.0.1:3000
#   bash scripts/nfsync.sh test    # push, then run the e2e suite

set -u
SRC="/sdcard/NightForge/projects/redx-tourney-platform"
DST="/root/redx-platform"

push() {
  mkdir -p "$DST"
  # code only: keep node_modules + data (DB) on the mirror side
  cd "$SRC" || exit 1
  tar cf - --exclude=node_modules --exclude=data --exclude=.git --exclude=*.log . \
    | (cd "$DST" && tar xf -)
  echo "pushed: $SRC -> $DST"
}

pull_db() {
  mkdir -p "$SRC/data/backups"
  if [ -f "$DST/data/redx.db" ]; then
    cp "$DST/data/redx.db" "$SRC/data/backups/redx-$(date +%Y%m%d-%H%M%S).db"
    echo "db backed up into $SRC/data/backups/"
  else
    echo "no db yet at $DST/data/redx.db"
  fi
}

case "${1:-push}" in
  push) push ;;
  pull) pull_db ;;
  run)  push && cd "$DST" && npm start ;;
  test) push && cd "$DST" && node tests/e2e.test.js ;;
  *) echo "usage: $0 {push|pull|run|test}"; exit 1 ;;
esac