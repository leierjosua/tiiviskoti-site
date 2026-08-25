#!/bin/bash
# Renderöi kaikki korttivideot ja muksaa äänen. Aja video/-kansiosta.
set -e
cd "$(dirname "$0")"
for n in kortti-koti kortti-veto kortti-hinta kortti-saasto kortti-taloyhtio kortti-taloyhtio-kartoitus; do
  (cd remotion && npx remotion render src/index-kortti.ts "$n" "out/$n.mp4" --crf=18 >/dev/null 2>&1)
  ffmpeg -loglevel error -y -i "remotion/out/$n.mp4" -i "sfx/$n.wav" \
    -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest "remotion/out/$n-valmis.mp4"
  echo "valmis: $n  $(ffprobe -v error -show_entries format=duration -of csv=p=0 "remotion/out/$n-valmis.mp4" | cut -c1-5) s"
done
