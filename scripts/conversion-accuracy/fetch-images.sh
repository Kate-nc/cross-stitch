#!/bin/sh
# Downloads the ten test photos used by reports/photo-conversion-accuracy-review.md
# into scripts/conversion-accuracy/img/ (git-ignored).
set -e
cd "$(dirname "$0")"
mkdir -p img
SK=https://raw.githubusercontent.com/scikit-image/scikit-image/v0.24.0/skimage/data
for f in astronaut.png chelsea.png coffee.png rocket.jpg; do curl -sSf -o "img/$f" "$SK/$f"; done
KD=https://raw.githubusercontent.com/MohamedBakrAli/Kodak-Lossless-True-Color-Image-Suite/master/PhotoCD_PCD0992
for n in 03 05 07 15 20 23; do curl -sSf -o "img/kodim$n.png" "$KD/$n.png"; done
echo "Fetched $(ls img | wc -l) images."
