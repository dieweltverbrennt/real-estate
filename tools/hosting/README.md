# Server configuration for bitoqu.com (Hostinger)

The site's own server rules live here, not as a `.htaccess` in the website root, so that uploading the site can never
replace the `.htaccess` Hostinger may already keep in `public_html`. They are merged in by hand, once.

| File | Where it goes | How |
|---|---|---|
| `htaccess-root.snippet` | `public_html/.htaccess` | **merge** (add the block; keep everything already there) |
| `<lang>/.htaccess` (in the repo, 18 files) | `public_html/<lang>/.htaccess` | upload as they are (Hostinger creates no files inside the language folders) |

The language-folder files contain one line each, `ErrorDocument 404 /<lang>/404.html`, so a missing page under
`/ru/...` gets the Russian 404 page. The root block's other rules (redirects, headers, caching) still apply inside those
folders, because those files define no rewrite rules or headers of their own.

## Merge the root block

1. hPanel -> Websites -> bitoqu.com -> File Manager -> `public_html`.
2. **If `.htaccess` exists:** download a copy first (right click -> Download) - that is the rollback. Then open it
   (right click -> Edit) and paste the whole block from `# BEGIN BITOQU` to `# END BITOQU`:
   - **below** any lines Hostinger or a plugin added that start with `RewriteEngine`, `RewriteCond`/`RewriteRule`
     for HTTPS, or `# BEGIN LSCACHE` / `# BEGIN LiteSpeed` blocks - leave those untouched;
   - a second `RewriteEngine On` line is harmless;
   - if the existing file already sets one of the same headers (e.g. `Strict-Transport-Security`), keep only one of
     the two lines.
3. **If there is no `.htaccess`:** create one in `public_html` and paste the block.
4. Save. Changes apply immediately; if Hostinger's CDN serves an old response, purge it in hPanel (Performance -> CDN).

## Check after the merge

```sh
curl -sI https://www.bitoqu.com/ | grep -i -E '^HTTP|^location'        # 301 -> https://bitoqu.com/
curl -sI https://bitoqu.com/ru/index.html | grep -i -E '^HTTP|^location' # 301 -> https://bitoqu.com/ru/
curl -sI https://bitoqu.com/ | grep -i -E 'strict|nosniff|referrer|x-frame|permissions'
curl -s -o /dev/null -w '%{http_code}\n' https://bitoqu.com/ar/no-such-page/   # 404 (Arabic page)
curl -sI https://bitoqu.com/img/q-mark.png | grep -i cache-control             # max-age=2592000
```

A `500 Internal Server Error` after saving means a syntax problem: restore the downloaded copy.

## Tested

The block (as `public_html/.htaccess`) and the 18 language files were tested on Apache 2.4 (official `httpd:2.4` Docker
image, `AllowOverride All`, mod_rewrite and mod_headers enabled): redirects with query strings and inside language
folders, no redirect loops, localized 404s with status 404, headers on pages and on 404 responses, cache header on media
only. Hostinger runs LiteSpeed, which reads the same directives; confirm with the checks above after the merge.
