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
- `/api/leads/` for lead form submission into Directus collection `leads` (Items API with PostgreSQL fallback)

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
- Lead forms submit to `/api/leads/`, API tries Directus `POST /items/leads` first (with `DIRECTUS_LEADS_TOKEN`), falls back to PostgreSQL insert if Directus write fails, then redirects to `/thankyou/`.
- Visual implementation intentionally follows the current Elementor hierarchy first. Pixel-perfect Elementor inline sections are still a follow-up migration layer.

## Directus Page Blocks (MVP)

Static pages rendered via `/{slug}/` can use `pages.content_blocks` in Directus.
If blocks are present, frontend renders them instead of `pages.body`.

Supported block types:

- `rich_text` (`text`, `html`, `wysiwyg` aliases)
- `cta` (`call_to_action` alias)
- `notice` (`alert`, `info` aliases)
- `checklist` (`list`, `bullets` aliases)

Minimal example for `pages.content_blocks`:

```json
[
  {
    "type": "rich_text",
    "title": "How we work",
    "html": "<p>We deliver equipment with operators in Moscow and region.</p>"
  },
  {
    "type": "checklist",
    "title": "What is included",
    "items": [
      "Equipment with operator",
      "Delivery to site",
      "Flexible shift scheduling"
    ]
  },
  {
    "type": "cta",
    "title": "Need a quick estimate?",
    "description": "Send a request and manager will call back.",
    "button_text": "Request a callback",
    "button_href": "/#lead",
    "button_variant": "accent"
  }
]
```

Optional control fields:

- `enabled` / `is_enabled`: set `false` to hide a block without deleting it.
- `type` can be defined via `type`, `kind`, `component`, `block`, `_type`.
