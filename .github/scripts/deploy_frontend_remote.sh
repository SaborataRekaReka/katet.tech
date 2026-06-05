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
npm ci
npm run build > "${LOGS_DIR}/frontend-build.log" 2>&1

systemctl restart "${DEPLOY_SERVICE_NAME}"
systemctl is-active "${DEPLOY_SERVICE_NAME}"
echo "[deploy] Service restarted: ${DEPLOY_SERVICE_NAME}"

rm -f "${DEPLOY_ARCHIVE_PATH}"
echo "[deploy] Done"
