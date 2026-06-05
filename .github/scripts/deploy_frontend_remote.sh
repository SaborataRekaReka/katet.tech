#!/usr/bin/env bash
set -euo pipefail

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "[deploy] Missing required variable: ${name}" >&2
    exit 1
  fi
}

normalize_value() {
  local raw="$1"
  local normalized
  normalized="$(printf '%s' "${raw}" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

  # Strip wrapping quotes in case the secret was pasted with quotes.
  if [[ "${normalized}" =~ ^".*"$ ]] || [[ "${normalized}" =~ ^'.*'$ ]]; then
    normalized="${normalized:1:${#normalized}-2}"
  fi

  printf '%s' "${normalized}"
}

require_var DEPLOY_ARCHIVE_PATH
require_var DEPLOY_APP_DIR
require_var DEPLOY_SERVICE_NAME

SERVICE_NAME="$(normalize_value "${DEPLOY_SERVICE_NAME}")"
if [[ -z "${SERVICE_NAME}" ]]; then
  echo "[deploy] DEPLOY_SERVICE_NAME is empty after normalization" >&2
  exit 1
fi

BACKUP_DIR="${DEPLOY_BACKUP_DIR:-/opt/katet/backups}"
RELEASES_DIR="${DEPLOY_RELEASES_DIR:-/opt/katet/releases}"
LOGS_DIR="${DEPLOY_LOGS_DIR:-/opt/katet/logs}"
TIMESTAMP="$(date +%F-%H%M%S)"
DEPLOY_LABEL="${DEPLOY_LABEL:-manual}"
BUILD_LOG_PATH="${LOGS_DIR}/frontend-build.log"

mkdir -p "${BACKUP_DIR}" "${RELEASES_DIR}" "${LOGS_DIR}" "${DEPLOY_APP_DIR}"

TARGET_FRONTEND_DIR="${DEPLOY_APP_DIR}/frontend"
if [[ -d "${TARGET_FRONTEND_DIR}" ]]; then
  tar -czf "${BACKUP_DIR}/frontend-${TIMESTAMP}.tgz" -C "${DEPLOY_APP_DIR}" frontend
  echo "[deploy] Backup created: ${BACKUP_DIR}/frontend-${TIMESTAMP}.tgz"
fi

RELEASE_DIR="${RELEASES_DIR}/frontend-${DEPLOY_LABEL}-${TIMESTAMP}"
mkdir -p "${RELEASE_DIR}"
tar -xzf "${DEPLOY_ARCHIVE_PATH}" -C "${RELEASE_DIR}"

if ! command -v rsync >/dev/null 2>&1; then
  echo "[deploy] rsync is required on server" >&2
  exit 1
fi

mkdir -p "${TARGET_FRONTEND_DIR}"
rsync -a --delete --exclude '.env.local' "${RELEASE_DIR}/frontend/" "${TARGET_FRONTEND_DIR}/"
echo "[deploy] Frontend files synced to ${TARGET_FRONTEND_DIR}"

if [[ -n "${FRONTEND_ENV_LOCAL_B64:-}" ]]; then
  printf '%s' "${FRONTEND_ENV_LOCAL_B64}" | base64 -d > "${TARGET_FRONTEND_DIR}/.env.local"
  chmod 600 "${TARGET_FRONTEND_DIR}/.env.local"
  echo "[deploy] frontend/.env.local updated from FRONTEND_ENV_LOCAL_B64"
else
  echo "[deploy] FRONTEND_ENV_LOCAL_B64 is empty; keeping existing frontend/.env.local"
fi

cd "${TARGET_FRONTEND_DIR}"
echo "[deploy] Running npm ci"
npm ci --no-audit --no-fund

echo "[deploy] Running npm run build (log: ${BUILD_LOG_PATH})"
: > "${BUILD_LOG_PATH}"
npm run build > "${BUILD_LOG_PATH}" 2>&1 &
BUILD_PID=$!

# Stream remote build log back to GitHub Actions in real time.
tail -n +1 -f "${BUILD_LOG_PATH}" &
TAIL_PID=$!

set +e
wait "${BUILD_PID}"
BUILD_STATUS=$?
set -e

kill "${TAIL_PID}" >/dev/null 2>&1 || true
wait "${TAIL_PID}" 2>/dev/null || true

if [[ "${BUILD_STATUS}" -ne 0 ]]; then
  echo "[deploy] Build failed. Last lines from ${BUILD_LOG_PATH}:" >&2
  tail -n 200 "${BUILD_LOG_PATH}" >&2 || true
  exit 1
fi

if ! systemctl list-unit-files --type=service --all --no-legend | awk '{print $1}' | grep -Fxq "${SERVICE_NAME}"; then
  echo "[deploy] Service unit not found: ${SERVICE_NAME}" >&2
  echo "[deploy] Hint: check DEPLOY_SERVICE_NAME secret (no extra spaces/newlines)." >&2
  systemctl list-unit-files --type=service --all --no-legend | grep -Ei 'katet|frontend' >&2 || true
  exit 1
fi

echo "[deploy] Restarting service: ${SERVICE_NAME}"
if ! systemctl restart "${SERVICE_NAME}"; then
  echo "[deploy] Service restart failed: ${SERVICE_NAME}" >&2
  systemctl status "${SERVICE_NAME}" --no-pager >&2 || true
  journalctl -u "${SERVICE_NAME}" -n 120 --no-pager >&2 || true
  exit 1
fi

if ! systemctl is-active --quiet "${SERVICE_NAME}"; then
  echo "[deploy] Service is not active after restart: ${SERVICE_NAME}" >&2
  systemctl status "${SERVICE_NAME}" --no-pager >&2 || true
  journalctl -u "${SERVICE_NAME}" -n 120 --no-pager >&2 || true
  exit 1
fi

systemctl is-active "${SERVICE_NAME}"
echo "[deploy] Service restarted: ${SERVICE_NAME}"

rm -f "${DEPLOY_ARCHIVE_PATH}"
echo "[deploy] Done"
