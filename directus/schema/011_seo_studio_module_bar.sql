-- Enables Directus modules for SEO Studio + Visual Editor in the module bar.
-- Also sets default project_url for Visual Editor if it is empty.
-- Also seeds visual_editor_urls if empty so /admin/visual does not land on no-url.
-- Safe to re-run: always rewrites module_bar to intended defaults.

UPDATE directus_settings
SET module_bar =
  '[
    {"type":"module","id":"content","enabled":true},
    {"type":"module","id":"visual","enabled":true},
    {"type":"module","id":"users","enabled":true},
    {"type":"module","id":"files","enabled":true},
    {"type":"module","id":"insights","enabled":true},
    {"type":"module","id":"katet-seo-studio-link","enabled":true},
    {"type":"module","id":"deployments","enabled":false},
    {"type":"link","id":"docs","enabled":true,"name":"$t:documentation","icon":"help","url":"https://docs.directus.io"},
    {"type":"module","id":"settings","enabled":true,"locked":true}
  ]'::json,
  project_url = CASE
    WHEN project_url IS NULL OR btrim(project_url) = '' THEN 'https://katet.tech'
    ELSE project_url
  END,
  visual_editor_urls = CASE
    WHEN visual_editor_urls IS NULL
      OR visual_editor_urls = 'null'::json
      OR visual_editor_urls = '[]'::json
      THEN '["https://katet.tech/"]'::json
    ELSE visual_editor_urls
  END
WHERE id = 1;
