# Katet Headless Frontend

Next.js frontend for the headless `katet.tech` migration. It reads migrated WordPress content from the local Directus/PostgreSQL database and preserves legacy URL paths with trailing slashes.

## Local Run

From the project root:

```powershell
docker compose --project-directory .\directus up -d
npm --prefix .\frontend install
npm --prefix .\frontend run dev -- --port 3000
```

Local URLs:

- Frontend: `http://localhost:3000`
- Directus: `http://localhost:8055`
- WordPress reference: `http://localhost:8081`

## Environment

Copy `.env.example` to `.env.local` if you need to override defaults:

```powershell
Copy-Item .\frontend\.env.example .\frontend\.env.local
```

Defaults expect local Directus Postgres at `127.0.0.1:55432`.

Validate environment before running checks/build:

```powershell
npm --prefix .\frontend run check:env
```

## Implemented Routes

- `/`
- `/arenda/`
- `/arenda/{slug}/`
- `/arenda_spetstekhniki/`
- `/arenda_spetstekhniki/{slug}/`
- `/brand/` and `/brand/{slug}/`
- `/tipy-rabot/` and `/tipy-rabot/{slug}/`
- `/blog/`
- root blog/page URLs like `/{slug}/`
- `/category/{slug}/`
- `/author/{slug}/`
- `/reviews/{slug}/`
- `/zapros/{slug}/` redirects to `/arenda_spetstekhniki/` because the legacy `zapros` taxonomy is not a public content entity anymore
- `/robots.txt`
- `/sitemap.xml`
- `/api/leads/` for lead form submission into the Directus `leads` table

## Validation

Build:

```powershell
npm --prefix .\frontend run build
```

URL inventory smoke test:

```powershell
$rows = Import-Csv .\katet-url-inventory.csv
$results = foreach ($row in $rows) {
  $url = 'http://localhost:3000' + $row.path
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 15 -MaximumRedirection 0
    [pscustomobject]@{ Path=$row.path; Status=[int]$response.StatusCode }
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    [pscustomobject]@{ Path=$row.path; Status=$status }
  }
}
$results | Group-Object Status | Sort-Object Name | Select-Object Name,Count | Format-Table -AutoSize
```

Current local result: `351/351` inventory URLs return `200`.

## Notes

- `next.config.ts` enables `dangerouslyAllowLocalIP` so Next Image can optimize local Directus assets from `localhost:8055`.
- Directus public read permissions must be applied with `directus/schema/005_public_read_permissions.sql`; restart Directus after applying direct SQL permission changes.
- HTML content is rewritten server-side from legacy `/wp-content/uploads/...` URLs to imported Directus `/assets/{id}` URLs when a matching `media_assets.source_path` exists.
- Lead forms submit to `/api/leads/`, insert into the Directus/PostgreSQL `leads` table, then redirect to `/thankyou/`.
- Visual implementation intentionally follows the current Elementor hierarchy first. Pixel-perfect Elementor inline sections are still a follow-up migration layer.
