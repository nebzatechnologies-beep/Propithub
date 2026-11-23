#!/usr/bin/env bash
# Builds the browser simulator (real app + in-memory demo backend) into ../public/simulator/app.
# Run from the mobile/ folder, then commit public/simulator.
set -euo pipefail
cd "$(dirname "$0")/.."
cp app.json /tmp/app.json.bak
trap 'mv /tmp/app.json.bak app.json' EXIT
node -e "
const fs=require('fs');const j=JSON.parse(fs.readFileSync('app.json','utf8'));
j.expo.experiments={...(j.expo.experiments||{}),baseUrl:'/simulator/app'};
fs.writeFileSync('app.json',JSON.stringify(j,null,2));"
rm -rf ../public/simulator/app
EXPO_PUBLIC_DEMO_BACKEND=1 npx expo export -p web --output-dir ../public/simulator/app
OUT=../public/simulator/app
# Firebase Hosting never serves anything under a node_modules folder, so move the icon fonts out of it.
mv "$OUT/assets/node_modules" "$OUT/assets/vendor"
grep -rl "assets/node_modules" "$OUT" | xargs sed -i 's#assets/node_modules#assets/vendor#g'
cp assets/pwa/icon-180.png assets/pwa/icon-192.png assets/pwa/icon-512.png "$OUT/"
cat > "$OUT/manifest.json" <<'JSON'
{"name":"Propithub Demo","short_name":"Propithub","start_url":"/simulator/app/","scope":"/simulator/app/","display":"standalone","background_color":"#ffffff","theme_color":"#059669","icons":[{"src":"/simulator/app/icon-192.png","sizes":"192x192","type":"image/png"},{"src":"/simulator/app/icon-512.png","sizes":"512x512","type":"image/png"}]}
JSON
# Make the page installable on iPhone/Android home screens
python3 - "$OUT/index.html" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
tags=('<link rel="manifest" href="/simulator/app/manifest.json">'
 '<link rel="apple-touch-icon" href="/simulator/app/icon-180.png">'
 '<meta name="apple-mobile-web-app-capable" content="yes">'
 '<meta name="mobile-web-app-capable" content="yes">'
 '<meta name="apple-mobile-web-app-status-bar-style" content="default">'
 '<meta name="apple-mobile-web-app-title" content="Propithub">'
 '<meta name="theme-color" content="#059669">')
s=s.replace('</head>',tags+'</head>',1)
if 'viewport-fit' not in s:
    s=s.replace('<meta name="viewport" content="','<meta name="viewport" content="viewport-fit=cover, ',1)
open(p,'w').write(s)
PY
echo "Simulator app built in public/simulator/app"
