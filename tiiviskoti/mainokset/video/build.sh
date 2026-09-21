#!/usr/bin/env bash
# TiivisKoti — mainosvideon tekstitasojen polttaminen "ei tekstiä" -versioon.
#
#   ./build.sh <lähdekansio> <kohdekansio>
#
# Lähdekansiossa on oltava Driven "ei tekstiä" -tiedostot nimillä
# notext_9x16.mov ja notext_4x5.mov. Tekstitasot tulevat out/-kansiosta
# (aja ensin render-overlays.mjs ja make-patch.py).
#
# ISKUJEN AJAT on mitattu alkuperäisestä videosta vertaamalla teksti- ja
# tekstitöntä versiota kuva kuvalta, joten uusi teksti osuu samoihin
# leikkauskohtiin kuin vanha eikä leikkauksen rytmi tai ääni siirry.
set -euo pipefail
SRC="${1:?lähdekansio puuttuu}"; DST="${2:?kohdekansio puuttuu}"
HERE="$(cd "$(dirname "$0")" && pwd)"; O="$HERE/out"
mkdir -p "$DST"

# isku:  alku  loppu   (sekuntia)
B1_IN=4.75;  B1_OUT=9.25
B2_IN=11.25; B2_OUT=15.75
B3_IN=18.75; B3_OUT=23.00
FADE=0.40
# Lopputaulun tausta on asettunut 37,7 s kohdalla ja poltettu hintarivi
# ilmestyy vasta 37,8 s — siksi paikka voidaan kytkeä päälle ilman ristiin
# häivytystä, se on pikselilleen sama kuin alla oleva tausta.
PATCH_AT=37.75

build () {
  local ratio="$1" src="$2" py="$3" ty="$4" out="$5"
  # Lähteen kesto on luettava ja annettava -t:llä. Tekstitasot tuodaan
  # `-loop 1`:llä, jolloin ne ovat päättymättömiä virtoja; ilman -t:tä ffmpeg
  # jatkaa pakkaamista lähdevideon loputtua eikä kirjoita tiedostoa koskaan
  # valmiiksi. (Kävi kerran: 41 s videosta tuli 23 min eikä se auennut, koska
  # MP4:n moov-atomi kirjoitetaan vasta lopussa.)
  local dur; dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
  ffmpeg -v error -stats \
    -i "$src" \
    -loop 1 -i "$O/beat1-$ratio.png" \
    -loop 1 -i "$O/beat2-$ratio.png" \
    -loop 1 -i "$O/beat3-$ratio.png" \
    -loop 1 -i "$O/patch-$ratio.png" \
    -loop 1 -i "$O/outro-hinnat.png" \
    -filter_complex "
      [1:v]format=rgba,fade=t=in:st=$B1_IN:d=$FADE:alpha=1,fade=t=out:st=$(echo "$B1_OUT-$FADE"|bc):d=$FADE:alpha=1[o1];
      [2:v]format=rgba,fade=t=in:st=$B2_IN:d=$FADE:alpha=1,fade=t=out:st=$(echo "$B2_OUT-$FADE"|bc):d=$FADE:alpha=1[o2];
      [3:v]format=rgba,fade=t=in:st=$B3_IN:d=$FADE:alpha=1,fade=t=out:st=$(echo "$B3_OUT-$FADE"|bc):d=$FADE:alpha=1[o3];
      [0:v][o1]overlay=0:0:enable='between(t,$B1_IN,$B1_OUT)'[a];
      [a][o2]overlay=0:0:enable='between(t,$B2_IN,$B2_OUT)'[b];
      [b][o3]overlay=0:0:enable='between(t,$B3_IN,$B3_OUT)'[c];
      [c][4:v]overlay=0:$py:enable='gte(t,$PATCH_AT)'[d];
      [d][5:v]overlay=0:$ty:enable='gte(t,$PATCH_AT)'[v]" \
    -map '[v]' -map 0:a \
    -c:v libx264 -crf 20 -preset fast -pix_fmt yuv420p -profile:v high \
    -c:a aac -b:a 192k -movflags +faststart \
    -t "$dur" \
    "$DST/$out" -y
  echo "✓ $out"
}

build 916 "$SRC/notext_9x16.mov" 1118 1116 tiiviskoti-ikkuna-9x16.mp4
build 45  "$SRC/notext_4x5.mov"   852  851 tiiviskoti-ikkuna-4x5.mp4
