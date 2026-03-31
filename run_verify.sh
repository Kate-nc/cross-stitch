#!/bin/bash
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 2

python3 /home/jules/verification/verify_pdf_import.py

kill $SERVER_PID
