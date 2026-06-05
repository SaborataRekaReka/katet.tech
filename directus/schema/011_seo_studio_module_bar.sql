-- Enables custom Directus module 'katet-seo-studio-link' in the module bar.
-- Safe to re-run: always rewrites module_bar to the intended defaults + SEO Studio link.

UPDATE directus_settings
SET module_bar =
  '[
    {"type":"module","id":"content","enabled":true},
    {"type":"module","id":"visual","enabled":false},
    {"type":"module","id":"users","enabled":true},
    {"type":"module","id":"files","enabled":true},
    {"type":"module","id":"insights","enabled":true},
    {"type":"module","id":"katet-seo-studio-link","enabled":true},
    {"type":"module","id":"deployments","enabled":false},
    {"type":"link","id":"docs","enabled":true,"name":"$t:documentation","icon":"help","url":"https://docs.directus.io"},
    {"type":"module","id":"settings","enabled":true,"locked":true}
  ]'::json
WHERE id = 1;
