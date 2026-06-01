# Инструкция по деплою katet.tech по SSH

## 1. Контур прода (как сейчас настроено)

- Сервер: `159.194.204.135`
- Сайт: `katet.tech`, `www.katet.tech`
- Frontend: Next.js в `/opt/katet/app/frontend`
- Запуск frontend: systemd-сервис `katet-frontend.service`
- Nginx проксирует:
  - `https://katet.tech/` -> `127.0.0.1:3000` (Next.js)
  - `https://katet.tech/directus/` -> `127.0.0.1:18055/` (Directus)
- Directus и Postgres работают в Docker (`katet-directus`, `katet-directus-postgres`)

## 2. Что нужно перед деплоем

- Локально: Node.js и npm
- Доступ по SSH к серверу
- Права на перезапуск systemd и чтение логов
- Актуальные значения в `frontend/.env.local` на сервере

Критично для лидов в CRM:

- `CRM_SITE_SECRET` на сайте должен совпадать с `INTEGRATION_SITE_SECRET` в CRM
- Иначе получите `403 Invalid integration signature`

## 3. Быстрый чек SSH

```bash
ssh -o StrictHostKeyChecking=accept-new root@159.194.204.135 "echo ok"
```

Если видите `Permission denied (publickey,password)`, настройте SSH-ключ или используйте интерактивный вход по паролю.

## 4. Преддеплой-проверка локально

Из корня репозитория:

```powershell
npm --prefix .\frontend run lint
npm --prefix .\frontend run build
```

Если сборка/линт падают, на сервер не выкатываем.

## 5. Бэкап перед выкладкой

```bash
ssh root@159.194.204.135 "mkdir -p /opt/katet/backups && cd /opt/katet/app && tar -czf /opt/katet/backups/frontend-$(date +%F-%H%M%S).tgz frontend"
```

## 6. Варианты выкладки кода

### Вариант A (предпочтительно): через git на сервере

```bash
ssh root@159.194.204.135 "cd /opt/katet/app && git pull --ff-only"
```

### Вариант B: загрузка каталога frontend по SCP

Сначала архив локально (PowerShell):

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
tar -czf frontend-$stamp.tgz --exclude="frontend/node_modules" --exclude="frontend/.next" -C . frontend
```

Затем передача и распаковка:

```bash
scp frontend-YYYYMMDD-HHMMSS.tgz root@159.194.204.135:/opt/katet/
ssh root@159.194.204.135 "cd /opt/katet && tar -xzf frontend-YYYYMMDD-HHMMSS.tgz -C /opt/katet/app"
```

## 7. Проверка/обновление env на сервере

```bash
ssh root@159.194.204.135 "cd /opt/katet/app/frontend && grep -E '^(CRM_SITE_INGEST_URL|CRM_SITE_EXTERNAL_ID_PREFIX|CRM_SITE_ALLOW_UNSIGNED)=' .env.local"
```

Минимальный набор для CRM-интеграции:

```env
CRM_SITE_INGEST_URL=https://crm.katet.tech/api/v1/integrations/events/ingest
CRM_SITE_SECRET=<тот же секрет, что INTEGRATION_SITE_SECRET в CRM>
CRM_SITE_EXTERNAL_ID_PREFIX=katet.tech
CRM_SITE_ALLOW_UNSIGNED=false
```

## 8. Сборка и перезапуск frontend

```bash
ssh root@159.194.204.135 "cd /opt/katet/app/frontend && npm run build >/opt/katet/logs/frontend-build.log 2>&1 && systemctl restart katet-frontend.service && systemctl is-active katet-frontend.service"
```

Ожидаемое состояние: `active`.

## 9. Smoke-check после деплоя

### 9.1. Доступность сайта

```bash
curl -I https://katet.tech/
curl -I https://katet.tech/directus/server/health
```

### 9.2. Проверка отправки лида в CRM через сайт

Для PowerShell используйте `curl.exe`, чтобы не попасть на алиас `Invoke-WebRequest`.

Отправка тестовой формы:

```bash
curl.exe -i -X POST https://katet.tech/api/leads/ \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'phone=+79990000000&name=Deploy+Probe&form_name=Deploy+Probe&message=smoke'
```

Ожидаемо: редирект `303` на `/thankyou/`.

Проверка статуса форварда в БД сайта:

```bash
ssh root@159.194.204.135 "docker exec -e PGPASSWORD=katet_directus_password katet-directus-postgres psql -U katet_directus -d katet_directus -At -c \"select created_at, form_name, phone, payload->>'crm_forwarded', payload->>'crm_skipped', payload->>'crm_reason' from leads order by created_at desc limit 5\""
```

Ожидаемо для успешной интеграции:

- `crm_forwarded = true`
- `crm_skipped = false`
- `crm_reason` пустой

## 10. Откат

```bash
ssh root@159.194.204.135 "cd /opt/katet/app && tar -xzf /opt/katet/backups/frontend-<TIMESTAMP>.tgz -C /opt/katet/app && systemctl restart katet-frontend.service"
```

Если делали деплой через git, можно откатиться на предыдущий коммит:

```bash
ssh root@159.194.204.135 "cd /opt/katet/app && git log --oneline -n 5"
ssh root@159.194.204.135 "cd /opt/katet/app && git checkout <PREV_COMMIT> && systemctl restart katet-frontend.service"
```

## 11. Типовые проблемы из практики

1. `Host key verification failed`
   - Добавьте ключ хоста: `ssh -o StrictHostKeyChecking=accept-new ...`

2. `403 Invalid integration signature` при отправке лидов
   - Проверьте совпадение `CRM_SITE_SECRET` и `INTEGRATION_SITE_SECRET`
   - Проверьте, что в коде подпись строится по JSON-нормализованному payload

3. Картинки не грузятся через Next Image
   - Убедитесь, что `frontend/next.config.ts` разрешает `https://katet.tech/directus/assets/**` и `https://www.katet.tech/directus/assets/**`

4. После деплоя сервис не стартует
   - Смотрите логи сборки: `/opt/katet/logs/frontend-build.log`
   - Проверяйте статус: `systemctl status katet-frontend.service`

Публичный SSH-ключ для вставки в Beget:

ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDtJErQJB8IKwlm52das2AQ83UEG6X4uuzOHUUFaMAlOjzodcHTitcScMwrM1XUXF5gA3EM/NyPYNNtkqw6dIX6moTSUqF/ZXlwCF+/6O8AVLU6FQQjA/9i+g7ZGWKTC5Zl3xiLd8UhytmOgcePgFiA+8N3RNgM5IePdE5nNZivBKyxqNCXcZASb8A7GIvqQ57dStLmBxCJIexxbuMDK+gAFaBmgjPMGMHmVczK0LsGKIx50L4FFMVpa4uQHbcLTg6JxffP9D5A7xRAL/cRKSJBn63TtXCXP+mkD1x1fvbMuUUnjEo2TKBbB/TR8WOTdS1KvcbcNx7lcwgyhKYvWUWq7rkf8uitLZjEKKe5GZjVCwr6vfxwTxXK6rpEkYrK+fzBFVqaNk70wBnK4imiCqs5tNeNHGO0SKkhy5sL74TOSxBY2/gBbM7CLmMn0zqLc06bXR8TQ+a3b9W9bW16znBvjDHb40ewYkHrZNBUblTZEwsnitoxa/JEOHOJdnL9o23vV0/4I5H2YxNDWMzhNXuwfKGMXnYu05n05hKIlejaYjdRrwzFVvnhnsQWiIvr2zL/7jZjwLQWTwYc+LeSTI2Aq9otQYvQ5POcvpcCkiROtmvJVK0bZL0278wkVM5ykgvazWGpgZZLZSLrh+qiwtnCfVya2+yYJxiQBy3K6I5ZaQ== katet-vps-20260531-144909