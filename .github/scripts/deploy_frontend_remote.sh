#!/usr/bin/env bash
set -euo pipefail

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "[deploy] Missing required variable: ${name}" >&2
    exit 1
  fi
}

require_var DEPLOY_ARCHIVE_PATH
require_var DEPLOY_APP_DIR
require_var DEPLOY_SERVICE_NAME

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
if ! npm run build > "${BUILD_LOG_PATH}" 2>&1; then
  echo "[deploy] Build failed. Last lines from ${BUILD_LOG_PATH}:" >&2
  tail -n 200 "${BUILD_LOG_PATH}" >&2 || true
  exit 1
fi

echo "[deploy] Restarting service: ${DEPLOY_SERVICE_NAME}"
if ! systemctl restart "${DEPLOY_SERVICE_NAME}"; then
  echo "[deploy] Service restart failed: ${DEPLOY_SERVICE_NAME}" >&2
  systemctl status "${DEPLOY_SERVICE_NAME}" --no-pager >&2 || true
  journalctl -u "${DEPLOY_SERVICE_NAME}" -n 120 --no-pager >&2 || true
  exit 1
fi

if ! systemctl is-active --quiet "${DEPLOY_SERVICE_NAME}"; then
  echo "[deploy] Service is not active after restart: ${DEPLOY_SERVICE_NAME}" >&2
  systemctl status "${DEPLOY_SERVICE_NAME}" --no-pager >&2 || true
  journalctl -u "${DEPLOY_SERVICE_NAME}" -n 120 --no-pager >&2 || true
  exit 1
fi

systemctl is-active "${DEPLOY_SERVICE_NAME}"
echo "[deploy] Service restarted: ${DEPLOY_SERVICE_NAME}"

rm -f "${DEPLOY_ARCHIVE_PATH}"
echo "[deploy] Done"
