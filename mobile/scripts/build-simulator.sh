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
echo "Simulator app built in public/simulator/app"
