#!/bin/bash
# ./shot.sh name "index.html?auto=walk" [w,h] -> shots/name.png and prints AUTO / STATS / console lines
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cd "$(dirname "$0")"; mkdir -p shots
name="$1"; url="$2"; size="${3:-1600,900}"; w="${size%,*}"; h="${size#*,}"
"$CH" --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader --hide-scrollbars --virtual-time-budget=20000 --enable-logging=stderr --v=0 --user-data-dir="/tmp/offbook-chrome-$name" --window-size=$w,$((h+120)) --screenshot=shots/_tmp_$name.png "http://localhost:8766/$url" 2> shots/_log_$name.txt &
pid=$!; n=0
while kill -0 $pid 2>/dev/null; do sleep 1; n=$((n+1)); if [ $n -gt 90 ]; then kill -9 $pid 2>/dev/null; echo "[$name] TIMEOUT"; break; fi; done
grep -E "CONSOLE" shots/_log_$name.txt | grep -v "GL Driver" | sed -E 's/^.*CONSOLE(:[0-9]+|\([0-9]+\))\] //; s/", source: .*$//; s/^"//' | cut -c1-230
[ -f shots/_tmp_$name.png ] && python3 -c "
from PIL import Image
Image.open('shots/_tmp_$name.png').crop((0,0,$w,$h)).save('shots/$name.png')" && rm -f shots/_tmp_$name.png
