#!/bin/bash

echo "🛑 GRACEFUL SHUTDOWN TEST"
echo "========================="

echo "1️⃣ Processes BEFORE stopping owox:"
ps aux | grep -E "(9587|9590)" | grep -v grep

echo
echo "2️⃣ Port 3000 BEFORE shutdown:"
lsof -i :3000 2>/dev/null || echo "Port is free"

echo
echo "⏳ Now stop owox serve (Ctrl+C) and run:"
echo "   ./test_shutdown.sh check"

if [ "$1" = "check" ]; then
    echo
    echo "3️⃣ Processes AFTER stopping owox:"
    ps aux | grep -E "(9587|9590)" | grep -v grep || echo "✅ All processes stopped"
    
    echo
    echo "4️⃣ Port 3000 AFTER shutdown:"
    lsof -i :3000 2>/dev/null || echo "✅ Port is free"
    
    echo
    echo "5️⃣ Zombie processes:"
    ps aux | grep -E "(defunct|<zombie>)" | grep -v grep || echo "✅ No zombie processes"
fi
