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

upsert_env_var() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  local tmp_file

  tmp_file="$(mktemp)"
  if [[ -f "${env_file}" ]]; then
    grep -Ev "^${key}=" "${env_file}" > "${tmp_file}" || true
  fi
  printf '%s=%s\n' "${key}" "${value}" >> "${tmp_file}"
  mv "${tmp_file}" "${env_file}"
}

apply_frontend_env_overrides() {
  local env_file="$1"
  local applied_count=0
  local key
  local value
  local -a keys=(
    NEXT_PUBLIC_SITE_URL
    YANDEX_WEBMASTER_HOST_URL
    YANDEX_WEBMASTER_FEED_URL
    YANDEX_WEBMASTER_FEED_TYPE
    YANDEX_WEBMASTER_FEED_REGION_IDS
    YANDEX_WEBMASTER_TIMEOUT_MS
    YANDEX_WEBMASTER_OAUTH_TOKEN
    YANDEX_WEBMASTER_CLIENT_ID
    YANDEX_WEBMASTER_CLIENT_SECRET
    YANDEX_WEBMASTER_REFRESH_TOKEN
  )

  touch "${env_file}"

  for key in "${keys[@]}"; do
    value="${!key-}"
    if [[ -z "${value}" ]]; then
      continue
    fi
    value="$(normalize_value "${value}")"
    if [[ -z "${value}" ]]; then
      continue
    fi
    upsert_env_var "${env_file}" "${key}" "${value}"
    applied_count=$((applied_count + 1))
  done

  if [[ "${applied_count}" -gt 0 ]]; then
    chmod 600 "${env_file}"
    echo "[deploy] Updated ${env_file} with ${applied_count} values from workflow secrets"
  else
    echo "[deploy] No workflow env overrides provided for frontend/.env.local"
  fi
}

parse_non_negative_int() {
  local raw="$1"
  local fallback="$2"

  if [[ "${raw}" =~ ^[0-9]+$ ]]; then
    printf '%s' "${raw}"
  else
    printf '%s' "${fallback}"
  fi
}

available_kb() {
  local target="$1"
  df -Pk "${target}" | awk 'NR==2 {print $4}'
}

report_disk_usage() {
  local target="$1"
  echo "[deploy] Disk usage for ${target}:"
  df -h "${target}" | awk 'NR==1 || NR==2'
}

prune_old_backups() {
  local keep="$1"
  local -a backups
  local idx

  mapfile -t backups < <(ls -1dt "${BACKUP_DIR}"/frontend-*.tgz 2>/dev/null || true)
  for ((idx=keep; idx<${#backups[@]}; idx++)); do
    rm -f "${backups[idx]}"
  done
}

prune_old_releases() {
  local keep="$1"
  local -a releases
  local idx

  mapfile -t releases < <(ls -1dt "${RELEASES_DIR}"/frontend-* 2>/dev/null || true)
  for ((idx=keep; idx<${#releases[@]}; idx++)); do
    rm -rf "${releases[idx]}"
  done
}

cleanup_disk_space() {
  echo "[deploy] Running disk cleanup"
  prune_old_backups "${BACKUP_KEEP}"
  prune_old_releases "${RELEASE_KEEP}"
  find "${LOGS_DIR}" -maxdepth 1 -type f -name '*.log' -mtime +"${LOG_KEEP_DAYS}" -delete || true
  rm -rf "${TARGET_FRONTEND_DIR}/.next" || true
  find /tmp -maxdepth 1 -type f -name 'frontend-*.tgz' -mtime +1 -delete || true
  npm cache clean --force >/dev/null 2>&1 || true
  report_disk_usage "${DEPLOY_APP_DIR}"
}

ensure_min_free_space() {
  local min_free_mb="$1"
  local min_free_kb=$((min_free_mb * 1024))
  local current_kb

  current_kb="$(available_kb "${DEPLOY_APP_DIR}")"
  if [[ -z "${current_kb}" ]]; then
    echo "[deploy] Failed to read available disk space" >&2
    return 1
  fi

  if (( current_kb >= min_free_kb )); then
    return 0
  fi

  echo "[deploy] Free space is low (${current_kb} KB), required at least ${min_free_kb} KB"
  cleanup_disk_space
  current_kb="$(available_kb "${DEPLOY_APP_DIR}")"

  if (( current_kb < min_free_kb )); then
    echo "[deploy] Not enough disk space after cleanup (${current_kb} KB available)" >&2
    return 1
  fi

  return 0
}

run_build_with_live_log() {
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

  return "${BUILD_STATUS}"
}

resolve_service_name() {
  local requested="$1"
  local compact
  local with_suffix
  local unit
  local -a units
  local -a matched

  mapfile -t units < <(systemctl list-unit-files --type=service --all --no-legend | awk '{print $1}')

  for unit in "${units[@]}"; do
    if [[ "${unit}" == "${requested}" ]]; then
      printf '%s' "${unit}"
      return 0
    fi
  done

  if [[ "${requested}" != *.service ]]; then
    with_suffix="${requested}.service"
    for unit in "${units[@]}"; do
      if [[ "${unit}" == "${with_suffix}" ]]; then
        printf '%s' "${unit}"
        return 0
      fi
    done
  fi

  compact="$(printf '%s' "${requested}" | tr -d '[:space:]' | sed "s/[\"']//g")"
  compact="$(printf '%s' "${compact}" | tr -cd '[:alnum:]._-')"
  if [[ -n "${compact}" ]]; then
    if [[ "${compact}" == *.service ]]; then
      with_suffix="${compact}"
    else
      with_suffix="${compact}.service"
    fi

    for unit in "${units[@]}"; do
      if [[ "${unit}" == "${with_suffix}" ]]; then
        printf '%s' "${unit}"
        return 0
      fi
    done

    for unit in "${units[@]}"; do
      if [[ "${unit,,}" == "${with_suffix,,}" ]]; then
        printf '%s' "${unit}"
        return 0
      fi
    done
  fi

  for with_suffix in "katet-frontend.service" "katet.frontend.service"; do
    for unit in "${units[@]}"; do
      if [[ "${unit}" == "${with_suffix}" ]]; then
        printf '%s' "${unit}"
        return 0
      fi
    done
  done

  mapfile -t matched < <(printf '%s\n' "${units[@]}" | grep -Ei 'katet.*frontend|frontend.*katet' || true)
  if [[ ${#matched[@]} -eq 1 ]]; then
    printf '%s' "${matched[0]}"
    return 0
  fi

  return 1
}

require_var DEPLOY_ARCHIVE_PATH
require_var DEPLOY_APP_DIR
require_var DEPLOY_SERVICE_NAME

SERVICE_NAME="$(normalize_value "${DEPLOY_SERVICE_NAME}")"
if [[ -z "${SERVICE_NAME}" ]]; then
  echo "[deploy] DEPLOY_SERVICE_NAME is empty after normalization" >&2
  exit 1
fi

RESOLVED_SERVICE_NAME="$(resolve_service_name "${SERVICE_NAME}" || true)"
if [[ -z "${RESOLVED_SERVICE_NAME}" ]]; then
  echo "[deploy] Service unit not found: ${SERVICE_NAME}" >&2
  echo "[deploy] Hint: check DEPLOY_SERVICE_NAME secret (no extra spaces/newlines)." >&2
  systemctl list-unit-files --type=service --all --no-legend | grep -Ei 'katet|frontend' >&2 || true
  exit 1
fi

if [[ "${RESOLVED_SERVICE_NAME}" != "${SERVICE_NAME}" ]]; then
  echo "[deploy] Requested service '${SERVICE_NAME}' resolved to '${RESOLVED_SERVICE_NAME}'"
fi

BACKUP_DIR="${DEPLOY_BACKUP_DIR:-/opt/katet/backups}"
RELEASES_DIR="${DEPLOY_RELEASES_DIR:-/opt/katet/releases}"
LOGS_DIR="${DEPLOY_LOGS_DIR:-/opt/katet/logs}"
TIMESTAMP="$(date +%F-%H%M%S)"
DEPLOY_LABEL="${DEPLOY_LABEL:-manual}"
BUILD_LOG_PATH="${LOGS_DIR}/frontend-build.log"
BACKUP_KEEP="$(parse_non_negative_int "${DEPLOY_BACKUP_KEEP:-5}" 5)"
RELEASE_KEEP="$(parse_non_negative_int "${DEPLOY_RELEASE_KEEP:-5}" 5)"
LOG_KEEP_DAYS="$(parse_non_negative_int "${DEPLOY_LOG_KEEP_DAYS:-14}" 14)"
MIN_BUILD_FREE_MB="$(parse_non_negative_int "${DEPLOY_MIN_BUILD_FREE_MB:-1536}" 1536)"

mkdir -p "${BACKUP_DIR}" "${RELEASES_DIR}" "${LOGS_DIR}" "${DEPLOY_APP_DIR}"

TARGET_FRONTEND_DIR="${DEPLOY_APP_DIR}/frontend"
report_disk_usage "${DEPLOY_APP_DIR}"
cleanup_disk_space

if ! ensure_min_free_space "${MIN_BUILD_FREE_MB}"; then
  echo "[deploy] Aborting deploy due to low free space before backup/build" >&2
  exit 1
fi

if [[ -d "${TARGET_FRONTEND_DIR}" ]]; then
  available_before_backup_kb="$(available_kb "${DEPLOY_APP_DIR}")"
  frontend_size_kb="$(du -sk "${TARGET_FRONTEND_DIR}" | awk '{print $1}')"
  required_for_backup_kb=$((frontend_size_kb + 256000))

  if (( available_before_backup_kb > required_for_backup_kb )); then
    backup_path="${BACKUP_DIR}/frontend-${TIMESTAMP}.tgz"
    if tar \
      --warning=no-file-changed \
      --ignore-failed-read \
      --exclude='frontend/.next' \
      --exclude='frontend/node_modules' \
      -czf "${backup_path}" \
      -C "${DEPLOY_APP_DIR}" frontend; then
      echo "[deploy] Backup created: ${backup_path}"
    else
      echo "[deploy] Backup finished with warnings; continuing deploy" >&2
      if [[ -f "${backup_path}" ]]; then
        echo "[deploy] Backup artifact (possibly partial): ${backup_path}" >&2
      fi
    fi
  else
    echo "[deploy] Skipping backup due to low free space (${available_before_backup_kb} KB available)"
  fi
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

apply_frontend_env_overrides "${TARGET_FRONTEND_DIR}/.env.local"

cd "${TARGET_FRONTEND_DIR}"
echo "[deploy] Running npm ci"
npm ci --no-audit --no-fund

if ! ensure_min_free_space "${MIN_BUILD_FREE_MB}"; then
  echo "[deploy] Aborting build due to low free space after npm ci" >&2
  exit 1
fi

echo "[deploy] Running npm run build (log: ${BUILD_LOG_PATH})"
if ! run_build_with_live_log; then
  if grep -Eqi 'No space left on device|StorageFull|ENOSPC' "${BUILD_LOG_PATH}"; then
    echo "[deploy] Build failed due to disk pressure, retrying once after cleanup"
    cleanup_disk_space
    if ! ensure_min_free_space "${MIN_BUILD_FREE_MB}"; then
      echo "[deploy] Still not enough free space for build retry" >&2
      tail -n 200 "${BUILD_LOG_PATH}" >&2 || true
      exit 1
    fi
    if ! run_build_with_live_log; then
      echo "[deploy] Build retry failed. Last lines from ${BUILD_LOG_PATH}:" >&2
      tail -n 200 "${BUILD_LOG_PATH}" >&2 || true
      exit 1
    fi
  else
    echo "[deploy] Build failed. Last lines from ${BUILD_LOG_PATH}:" >&2
    tail -n 200 "${BUILD_LOG_PATH}" >&2 || true
    exit 1
  fi
fi

echo "[deploy] Restarting service: ${RESOLVED_SERVICE_NAME}"
if ! systemctl restart "${RESOLVED_SERVICE_NAME}"; then
  echo "[deploy] Service restart failed: ${RESOLVED_SERVICE_NAME}" >&2
  systemctl status "${RESOLVED_SERVICE_NAME}" --no-pager >&2 || true
  journalctl -u "${RESOLVED_SERVICE_NAME}" -n 120 --no-pager >&2 || true
  exit 1
fi

if ! systemctl is-active --quiet "${RESOLVED_SERVICE_NAME}"; then
  echo "[deploy] Service is not active after restart: ${RESOLVED_SERVICE_NAME}" >&2
  systemctl status "${RESOLVED_SERVICE_NAME}" --no-pager >&2 || true
  journalctl -u "${RESOLVED_SERVICE_NAME}" -n 120 --no-pager >&2 || true
  exit 1
fi

systemctl is-active "${RESOLVED_SERVICE_NAME}"
echo "[deploy] Service restarted: ${RESOLVED_SERVICE_NAME}"

rm -f "${DEPLOY_ARCHIVE_PATH}"
echo "[deploy] Done"
