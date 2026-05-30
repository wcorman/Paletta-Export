# Payload Portfolio Ready seed script

This folder contains a portable seed script for importing `collections/Portfolio Ready` into a Payload CMS project.

Copy `seed-portfolio-ready.mjs` into the Payload repo, then copy the `collections/Portfolio Ready` data folder into that repo, for example:

```text
data/portfolio-ready/
  Dance/
  Interior Design/
  Visual Art/
```

## Expected Payload collections

The script assumes the target Payload app has:

1. A media upload collection, default slug `media`.
2. A portfolio collection, default slug `portfolioItems`.

The portfolio collection should include the normalized metadata fields, plus media relationship fields if you want local images uploaded:

```ts
{
  name: 'featuredImage',
  type: 'upload',
  relationTo: 'media',
}

{
  name: 'gallery',
  type: 'array',
  fields: [
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
    },
  ],
}
```

If your target collection uses different field names, set the environment variables below.

## Run

From the Payload repo:

```sh
PORTFOLIO_READY_DIR="data/portfolio-ready" \
PAYLOAD_CONFIG_PATH="src/payload.config.ts" \
pnpm tsx path/to/seed-portfolio-ready.mjs
```

For a no-write check:

```sh
DRY_RUN=true \
PORTFOLIO_READY_DIR="data/portfolio-ready" \
pnpm tsx path/to/seed-portfolio-ready.mjs
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORTFOLIO_READY_DIR` | `collections/Portfolio Ready` if present, else `data/portfolio-ready` | Data folder to import. |
| `PAYLOAD_CONFIG_PATH` | none | Path to the Payload config file. Usually `src/payload.config.ts`. |
| `PAYLOAD_CONFIG_MODULE` | none | Module specifier alternative, for example `@payload-config`. |
| `PORTFOLIO_COLLECTION` | `portfolioItems` | Payload collection slug for portfolio items. |
| `MEDIA_COLLECTION` | `media` | Payload upload collection slug. |
| `FEATURED_IMAGE_FIELD` | `featuredImage` | Portfolio upload relationship field for the featured image. |
| `GALLERY_FIELD` | `gallery` | Portfolio array field for gallery images. |
| `GALLERY_IMAGE_FIELD` | `image` | Upload field inside each gallery row. |
| `KEEP_REMOTE_URL_FIELDS` | `true` | Keep `featuredImageUrl` and `galleryUrls` in the portfolio doc. Set `false` if your schema only stores media relationships. |
| `UPLOAD_MEDIA` | `true` | Upload local image files to the media collection. |
| `DRY_RUN` | `false` | Read and validate data without writing to Payload. |

## What the script does

- Reads every `metadata.json` under the Portfolio Ready category folders.
- Finds local image files inside the same item folder.
- Matches featured and gallery images by decoding the filenames from `featuredImageUrl` and `galleryUrls`.
- Uploads local images to Payload's media collection using the Local API `filePath` option.
- Creates or updates portfolio docs.
- Uses `migration.webflowItemId` first, then `slug`, to find existing portfolio docs.
- Reuses existing media docs by filename to reduce duplicate uploads on repeated runs.

Review `buildPortfolioData()` in the script before running it in production. That is the main place to adjust field names or remove fields that your target Payload collection does not define.
