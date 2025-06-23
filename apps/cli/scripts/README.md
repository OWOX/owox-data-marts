# CLI Development Scripts

This directory contains utility scripts for monitoring and testing the OWOX CLI application.

## Scripts

### 🔍 `monitor.sh`

Monitors OWOX processes in real-time, showing only processes related to the OWOX application.

**Usage:**

```bash
./scripts/monitor.sh
```

**Features:**

- Shows process tree for OWOX
- Displays resource usage (CPU, RAM)
- Monitors port 3000 usage
- Filters out unrelated processes (Cursor, etc.)

### 🛑 `test-shutdown.sh`

Tests graceful shutdown functionality to ensure no zombie processes are left behind.

**Usage:**

```bash
# Step 1: Check processes before shutdown
./scripts/test-shutdown.sh

# Step 2: Stop owox serve (Ctrl+C)

# Step 3: Verify clean shutdown
./scripts/test-shutdown.sh check
```

**Features:**

- Verifies all processes are properly terminated
- Checks that port 3000 is released
- Detects zombie processes

## Development Workflow

1. **Start OWOX:** `owox serve`
2. **Monitor processes:** `./scripts/monitor.sh`
3. **Test shutdown:** `./scripts/test-shutdown.sh` → Ctrl+C → `./scripts/test-shutdown.sh check`

## Requirements

- macOS with `pstree` installed: `brew install pstree`
- `lsof` (usually pre-installed on macOS)
