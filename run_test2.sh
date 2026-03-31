#!/bin/bash
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 2

npx playwright test tests/pattern_keeper.spec.js

kill $SERVER_PID
