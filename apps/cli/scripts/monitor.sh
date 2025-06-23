#!/bin/bash

echo "🔍 OWOX PROCESS MONITORING"
echo "=========================="

# Find the main owox process
OWOX_PID=$(ps aux | grep -E '(owox|bin/run)' | grep -v grep | awk '{print $2}' | head -1)

if [ -n "$OWOX_PID" ]; then
    echo "✅ Found owox process with PID: $OWOX_PID"
    echo
    
    echo "🌳 OWOX PROCESS TREE:"
    echo "---------------------"
    # Use pstree without -a for macOS
    pstree -p $OWOX_PID 2>/dev/null || pstree $OWOX_PID 2>/dev/null || echo "Unable to show process tree"
    echo
    
    echo "📊 OWOX DETAILED INFORMATION:"
    echo "-----------------------------"
    ps -ef | grep $OWOX_PID | grep -v grep
    echo
    
    echo "🔗 OWOX CHILD PROCESSES:"
    echo "------------------------"
    # Collect all owox process PIDs (parent + children)
    ALL_OWOX_PIDS="$OWOX_PID"
    CHILD_PIDS=$(ps -eo pid,ppid | grep " $OWOX_PID$" | awk '{print $1}')
    
    if [ -n "$CHILD_PIDS" ]; then
        echo "Child processes of owox ($OWOX_PID):"
        for child in $CHILD_PIDS; do
            ps -p $child -o pid,command | tail -1
            ALL_OWOX_PIDS="$ALL_OWOX_PIDS $child"
        done
    else
        echo "No direct child processes"
    fi
    
    echo
    echo "🖥️  OWOX NODE.JS PROCESSES ONLY:"
    echo "--------------------------------"
    # Show only processes from our PIDs
    for pid in $ALL_OWOX_PIDS; do
        ps aux | grep "^[^ ]* *$pid " | grep -v grep
    done
    
    echo
    echo "📈 OWOX PROCESS RESOURCES:"
    echo "--------------------------"
    echo "PID     %CPU %MEM    VSZ   RSS COMMAND"
    for pid in $ALL_OWOX_PIDS; do
        ps -p $pid -o pid,%cpu,%mem,vsz,rss,command | tail -1 2>/dev/null
    done
    
else
    echo "❌ owox serve not running"
fi

echo
echo "🌐 PORT 3000 (OWOX BACKEND):"
echo "----------------------------"
PORT_INFO=$(lsof -i :3000 2>/dev/null)
if [ -n "$PORT_INFO" ]; then
    echo "$PORT_INFO"
    # Check if the process on port belongs to owox
    PORT_PID=$(echo "$PORT_INFO" | tail -1 | awk '{print $2}')
    if echo "$ALL_OWOX_PIDS" | grep -q "$PORT_PID"; then
        echo "✅ Port 3000 is used by owox process"
    else
        echo "⚠️  Port 3000 is used by NON-owox process"
    fi
else
    echo "❌ Port 3000 is free (owox backend not listening)"
fi

echo
echo "📊 SUMMARY:"
echo "-----------"
TOTAL_PROCESSES=$(echo $ALL_OWOX_PIDS | wc -w | xargs)
echo "Total owox processes: $TOTAL_PROCESSES"
echo "Process PIDs: $ALL_OWOX_PIDS"

