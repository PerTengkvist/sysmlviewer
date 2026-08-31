#!/usr/bin/env bash
# SysML Viewer process manager: start/stop backend (+ optional Vite dev).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION_FILE="$ROOT/running-session.json"
LOG_DIR="$ROOT/logs"
SERVER_PORT=5174
DEV_PORT=5173

BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
DIST_DIR="$FRONTEND_DIR/dist"
BACKEND_VENV="$BACKEND_DIR/.venv"

usage() {
  cat <<EOF
Usage: $(basename "$0") <start|stop|status> [options]

  start   Start SysML Viewer
          Default (prod): one server on :$SERVER_PORT (UI + /api)
          Options:
            --build             Run npm run build before prod start
            --dev               Vite dev server (:$DEV_PORT) + API (:$SERVER_PORT)
            -f, --folder PATH   Open workspace folder
            -p, --project PATH  Open project.json (parent = workspace)
  stop    Stop processes recorded in running-session.json
  status  Show whether a session is running
EOF
}

die() {
  echo "error: $*" >&2
  exit 1
}

ensure_backend() {
  if [[ ! -x "$BACKEND_VENV/bin/python" ]]; then
    die "backend venv missing. Run: cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -e \".[dev]\""
  fi
}

ensure_dist() {
  if [[ ! -f "$DIST_DIR/index.html" ]]; then
    die "frontend/dist missing. Run: $(basename "$0") start --build  OR  cd frontend && npm run build"
  fi
}

ensure_node_for_build() {
  if ! command -v npm >/dev/null 2>&1; then
    die "npm not found — install Node.js to build the frontend"
  fi
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "installing frontend dependencies…"
    (cd "$FRONTEND_DIR" && npm install)
  fi
}

run_frontend_build() {
  ensure_node_for_build
  echo "building frontend → $DIST_DIR"
  (cd "$FRONTEND_DIR" && npm run build)
  ensure_dist
}

ensure_node_for_dev() {
  if ! command -v npm >/dev/null 2>&1; then
    die "npm not found — install Node.js for --dev mode"
  fi
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    die "frontend deps missing. Run: cd frontend && npm install"
  fi
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

kill_tree() {
  local pid="$1"
  if ! pid_alive "$pid"; then
    return 0
  fi
  local child
  while read -r child; do
    [[ -n "$child" ]] && kill_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" 2>/dev/null || true
  sleep 0.3
  if pid_alive "$pid"; then
    kill -9 "$pid" 2>/dev/null || true
  fi
}

read_session_field() {
  local field="$1"
  python3 - "$SESSION_FILE" "$field" <<'PY'
import json, sys
path, field = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
print(data.get(field) or "")
PY
}

write_session() {
  python3 - "$@" <<'PY'
import json, sys
from datetime import datetime, timezone

path = sys.argv[1]
payload = json.loads(sys.argv[2])
payload["startedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
payload["root"] = sys.argv[3]
with open(path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
PY
}

start_backend() {
  local -a backend_extra=()
  if [[ $# -gt 0 ]]; then
    backend_extra=("$@")
  fi
  (
    cd "$BACKEND_DIR"
    # shellcheck disable=SC1091
    source "$BACKEND_VENV/bin/activate"
    export PYTHONPATH="$BACKEND_DIR/src${PYTHONPATH:+:$PYTHONPATH}"
    export SYSMLVIEWER_STATIC_DIR="$DIST_DIR"
    if [[ ${#backend_extra[@]} -gt 0 ]]; then
      exec python -m cli --host 127.0.0.1 --port "$SERVER_PORT" --reload "${backend_extra[@]}"
    else
      exec python -m cli --host 127.0.0.1 --port "$SERVER_PORT" --reload
    fi
  ) >"$LOG_DIR/backend.log" 2>&1 &
  echo $!
}

cmd_start() {
  local mode="prod"
  local do_build=0
  local -a backend_extra=()
  shift || true

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --build)
        do_build=1
        shift
        ;;
      --dev)
        mode="dev"
        shift
        ;;
      -f|--folder)
        [[ $# -ge 2 ]] || die "-f requires a path"
        backend_extra+=(-f "$(python3 -c 'import sys; from pathlib import Path; print(Path(sys.argv[1]).expanduser().resolve())' "$2")")
        shift 2
        ;;
      -p|--project)
        [[ $# -ge 2 ]] || die "-p requires a path"
        backend_extra+=(-p "$(python3 -c 'import sys; from pathlib import Path; print(Path(sys.argv[1]).expanduser().resolve())' "$2")")
        shift 2
        ;;
      *)
        die "unknown start option: $1"
        ;;
    esac
  done

  if [[ "$do_build" -eq 1 && "$mode" == "dev" ]]; then
    die "--build and --dev cannot be combined"
  fi

  if [[ -f "$SESSION_FILE" ]]; then
    local server_pid backend_pid frontend_pid
    server_pid="$(read_session_field serverPid)"
    backend_pid="$(read_session_field backendPid)"
    frontend_pid="$(read_session_field frontendPid)"
    if pid_alive "$server_pid" || pid_alive "$backend_pid" || pid_alive "$frontend_pid"; then
      die "session already running (see $SESSION_FILE). Run: $(basename "$0") stop"
    fi
    rm -f "$SESSION_FILE"
  fi

  ensure_backend

  if [[ "$do_build" -eq 1 ]]; then
    run_frontend_build
  fi

  if [[ "$mode" == "prod" ]]; then
    ensure_dist
  else
    ensure_node_for_dev
  fi

  if port_in_use "$SERVER_PORT"; then
    die "port $SERVER_PORT is already in use"
  fi
  if [[ "$mode" == "dev" ]] && port_in_use "$DEV_PORT"; then
    die "port $DEV_PORT is already in use"
  fi

  mkdir -p "$LOG_DIR"

  if [[ "$mode" == "prod" ]]; then
    local server_pid
    server_pid="$(start_backend "${backend_extra[@]}")"
    sleep 1
    if ! pid_alive "$server_pid"; then
      die "server failed to start — see $LOG_DIR/backend.log"
    fi
    write_session "$SESSION_FILE" "{\"mode\":\"prod\",\"serverPid\":$server_pid,\"serverPort\":$SERVER_PORT}" "$ROOT"
    echo "started (prod)"
    echo "  UI:      http://127.0.0.1:$SERVER_PORT/"
    echo "  API:     http://127.0.0.1:$SERVER_PORT/api/docs"
    echo "  session: $SESSION_FILE"
    echo "  logs:    $LOG_DIR/"
    return 0
  fi

  local backend_pid frontend_pid
  backend_pid="$(start_backend "${backend_extra[@]}")"
  (
    cd "$FRONTEND_DIR"
    exec npm run dev -- --host 127.0.0.1 --port "$DEV_PORT"
  ) >"$LOG_DIR/frontend.log" 2>&1 &
  frontend_pid=$!

  sleep 1
  if ! pid_alive "$backend_pid"; then
    kill_tree "$frontend_pid" || true
    die "backend failed to start — see $LOG_DIR/backend.log"
  fi
  if ! pid_alive "$frontend_pid"; then
    kill_tree "$backend_pid" || true
    die "frontend failed to start — see $LOG_DIR/frontend.log"
  fi

  write_session "$SESSION_FILE" "{\"mode\":\"dev\",\"backendPid\":$backend_pid,\"frontendPid\":$frontend_pid,\"backendPort\":$SERVER_PORT,\"frontendPort\":$DEV_PORT}" "$ROOT"
  echo "started (dev)"
  echo "  UI:      http://127.0.0.1:$DEV_PORT/"
  echo "  API:     http://127.0.0.1:$SERVER_PORT/api/docs"
  echo "  session: $SESSION_FILE"
  echo "  logs:    $LOG_DIR/"
}

cmd_stop() {
  if [[ ! -f "$SESSION_FILE" ]]; then
    echo "no running-session.json — nothing to stop"
    exit 0
  fi

  local mode server_pid backend_pid frontend_pid
  mode="$(read_session_field mode)"
  server_pid="$(read_session_field serverPid)"
  backend_pid="$(read_session_field backendPid)"
  frontend_pid="$(read_session_field frontendPid)"

  echo "stopping session…"
  if [[ "$mode" == "dev" || -n "$frontend_pid" ]]; then
    kill_tree "$frontend_pid"
  fi
  if [[ -n "$server_pid" ]]; then
    kill_tree "$server_pid"
  fi
  if [[ -n "$backend_pid" ]]; then
    kill_tree "$backend_pid"
  fi

  rm -f "$SESSION_FILE"
  echo "stopped"
}

cmd_status() {
  if [[ ! -f "$SESSION_FILE" ]]; then
    echo "status: stopped (no session file)"
    exit 0
  fi

  local mode server_pid backend_pid frontend_pid server_port backend_port frontend_port
  mode="$(read_session_field mode)"
  server_pid="$(read_session_field serverPid)"
  backend_pid="$(read_session_field backendPid)"
  frontend_pid="$(read_session_field frontendPid)"
  server_port="$(read_session_field serverPort)"
  backend_port="$(read_session_field backendPort)"
  frontend_port="$(read_session_field frontendPort)"

  if [[ "$mode" == "prod" ]]; then
    local state=dead
    pid_alive "$server_pid" && state=running
    echo "status: prod session"
    echo "  server pid=$server_pid port=${server_port:-$SERVER_PORT} ($state)"
    if [[ "$state" == dead ]]; then
      echo "  hint: stale session — run: $(basename "$0") stop"
    fi
    return 0
  fi

  local bstate=dead fstate=dead
  pid_alive "$backend_pid" && bstate=running
  pid_alive "$frontend_pid" && fstate=running
  echo "status: dev session"
  echo "  backend  pid=$backend_pid port=${backend_port:-$SERVER_PORT} ($bstate)"
  echo "  frontend pid=$frontend_pid port=${frontend_port:-$DEV_PORT} ($fstate)"
  if [[ "$bstate" == dead && "$fstate" == dead ]]; then
    echo "  hint: stale session — run: $(basename "$0") stop"
  fi
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    start) cmd_start "$@" ;;
    stop) cmd_stop ;;
    status) cmd_status ;;
    -h|--help|help|"") usage; [[ -n "$cmd" ]] || exit 1 ;;
    *) usage; die "unknown command: $cmd" ;;
  esac
}

main "$@"
