#!/usr/bin/env node

import { access, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
])

const env = {
  dataDir: process.env.PORTFOLIO_READY_DIR,
  payloadConfigPath: process.env.PAYLOAD_CONFIG_PATH,
  payloadConfigModule: process.env.PAYLOAD_CONFIG_MODULE,
  portfolioCollection: process.env.PORTFOLIO_COLLECTION || 'portfolioItems',
  mediaCollection: process.env.MEDIA_COLLECTION || 'media',
  featuredImageField: process.env.FEATURED_IMAGE_FIELD || 'featuredImage',
  galleryField: process.env.GALLERY_FIELD || 'gallery',
  galleryImageField: process.env.GALLERY_IMAGE_FIELD || 'image',
  keepRemoteUrlFields: process.env.KEEP_REMOTE_URL_FIELDS !== 'false',
  uploadMedia: process.env.UPLOAD_MEDIA !== 'false',
  dryRun: process.env.DRY_RUN === 'true',
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveDataDir() {
  if (env.dataDir) {
    return path.resolve(env.dataDir)
  }

  const localExportDir = path.resolve('collections', 'Portfolio Ready')
  if (await exists(localExportDir)) {
    return localExportDir
  }

  return path.resolve('data', 'portfolio-ready')
}

async function loadPayload() {
  if (env.dryRun) {
    return null
  }

  const { getPayload } = await import('payload')
  const config = await loadPayloadConfig()
  return getPayload({ config })
}

async function loadPayloadConfig() {
  if (env.payloadConfigPath) {
    const configPath = path.resolve(env.payloadConfigPath)
    const configModule = await import(pathToFileURL(configPath).href)
    return configModule.default || configModule.config
  }

  if (env.payloadConfigModule) {
    const configModule = await import(env.payloadConfigModule)
    return configModule.default || configModule.config
  }

  throw new Error(
    'Set PAYLOAD_CONFIG_PATH=src/payload.config.ts or PAYLOAD_CONFIG_MODULE=@payload-config',
  )
}

async function listMetadataFiles(dataDir) {
  const categories = await readdir(dataDir, { withFileTypes: true })
  const files = []

  for (const category of categories) {
    if (!category.isDirectory()) {
      continue
    }

    const categoryDir = path.join(dataDir, category.name)
    const items = await readdir(categoryDir, { withFileTypes: true })

    for (const item of items) {
      if (!item.isDirectory()) {
        continue
      }

      const metadataPath = path.join(categoryDir, item.name, 'metadata.json')
      if (await exists(metadataPath)) {
        files.push(metadataPath)
      }
    }
  }

  return files.sort()
}

async function readPortfolioItem(metadataPath) {
  const raw = await readFile(metadataPath, 'utf8')
  const item = JSON.parse(raw)
  return {
    item,
    itemDir: path.dirname(metadataPath),
  }
}

async function listImageFiles(itemDir) {
  const allFiles = await listFilesRecursive(itemDir)
  return allFiles
    .filter((filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .sort()
}

async function listFilesRecursive(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(entryPath)))
      continue
    }

    if (entry.isFile() && entry.name !== 'metadata.json') {
      files.push(entryPath)
    }
  }

  return files
}

function filenameFromUrl(url) {
  if (!url) {
    return null
  }

  try {
    const parsed = new URL(url)
    const filename = path.basename(parsed.pathname)
    return decodeURIComponent(filename)
  } catch {
    return null
  }
}

function imageFileByName(imageFiles) {
  const lookup = new Map()

  for (const filePath of imageFiles) {
    lookup.set(path.basename(filePath), filePath)
  }

  return lookup
}

function resolveItemImages(item, imageFiles) {
  const byName = imageFileByName(imageFiles)
  const featuredName = filenameFromUrl(item.featuredImageUrl)
  const featuredImagePath = featuredName ? byName.get(featuredName) : null

  const galleryImagePaths = []
  const seen = new Set()

  for (const url of item.galleryUrls || []) {
    const filename = filenameFromUrl(url)
    const filePath = filename ? byName.get(filename) : null
    if (filePath && !seen.has(filePath)) {
      galleryImagePaths.push(filePath)
      seen.add(filePath)
    }
  }

  // Keep every local image with its item, even if it was not listed in galleryUrls.
  for (const filePath of imageFiles) {
    if (filePath !== featuredImagePath && !seen.has(filePath)) {
      galleryImagePaths.push(filePath)
      seen.add(filePath)
    }
  }

  return {
    featuredImagePath: featuredImagePath || imageFiles[0] || null,
    galleryImagePaths,
  }
}

async function findExistingDoc(payload, collection, where) {
  const result = await payload.find({
    collection,
    where,
    limit: 1,
    depth: 0,
  })

  return result.docs?.[0] || null
}

async function findExistingPortfolioItem(payload, item) {
  const webflowItemId = item.migration?.webflowItemId

  if (webflowItemId) {
    const byWebflowId = await findExistingDoc(payload, env.portfolioCollection, {
      'migration.webflowItemId': {
        equals: webflowItemId,
      },
    })

    if (byWebflowId) {
      return byWebflowId
    }
  }

  return findExistingDoc(payload, env.portfolioCollection, {
    slug: {
      equals: item.slug,
    },
  })
}

async function uploadOrFindMedia(payload, filePath, item, role) {
  await stat(filePath)
  const filename = path.basename(filePath)
  const existing = await findExistingDoc(payload, env.mediaCollection, {
    filename: {
      equals: filename,
    },
  })

  if (existing) {
    return existing
  }

  const data = {
    alt: `${item.title}${role ? ` - ${role}` : ''}`,
  }

  return payload.create({
    collection: env.mediaCollection,
    data,
    filePath,
  })
}

async function uploadItemMedia(payload, item, itemDir) {
  const imageFiles = await listImageFiles(itemDir)
  const { featuredImagePath, galleryImagePaths } = resolveItemImages(item, imageFiles)

  if (env.dryRun || !env.uploadMedia) {
    return {
      featuredImage: null,
      galleryImages: [],
      imageFiles,
      featuredImagePath,
      galleryImagePaths,
    }
  }

  const featuredImage = featuredImagePath
    ? await uploadOrFindMedia(payload, featuredImagePath, item, 'featured image')
    : null

  const galleryImages = []
  for (const galleryImagePath of galleryImagePaths) {
    const mediaDoc = await uploadOrFindMedia(payload, galleryImagePath, item, 'gallery image')
    galleryImages.push(mediaDoc)
  }

  return {
    featuredImage,
    galleryImages,
    imageFiles,
    featuredImagePath,
    galleryImagePaths,
  }
}

function buildPortfolioData(item, uploadedMedia) {
  const data = {
    title: item.title,
    slug: item.slug,
    portfolioCategory: item.portfolioCategory,
    sourceCollection: item.sourceCollection,
    header: item.header,
    description: item.description,
    shortDescription: item.shortDescription,
    highlight: item.highlight,
    archived: item.archived,
    draft: item.draft,
    createdOn: item.createdOn,
    updatedOn: item.updatedOn,
    publishedOn: item.publishedOn,
    categoryData: item.categoryData,
    migration: item.migration,
    originalData: item.originalData,
  }

  if (env.keepRemoteUrlFields) {
    data.featuredImageUrl = item.featuredImageUrl
    data.galleryUrls = item.galleryUrls
  }

  if (env.uploadMedia) {
    data[env.featuredImageField] = uploadedMedia.featuredImage?.id || null
    data[env.galleryField] = uploadedMedia.galleryImages.map((mediaDoc) => ({
      [env.galleryImageField]: mediaDoc.id,
    }))
  }

  return data
}

async function createOrUpdatePortfolioItem(payload, item, portfolioData) {
  const existing = await findExistingPortfolioItem(payload, item)

  if (existing) {
    return {
      action: 'updated',
      doc: await payload.update({
        collection: env.portfolioCollection,
        id: existing.id,
        data: portfolioData,
      }),
    }
  }

  return {
    action: 'created',
    doc: await payload.create({
      collection: env.portfolioCollection,
      data: portfolioData,
    }),
  }
}

function assertNormalizedItem(item, metadataPath) {
  const requiredStringFields = ['title', 'slug', 'portfolioCategory', 'sourceCollection']
  for (const field of requiredStringFields) {
    if (typeof item[field] !== 'string' || !item[field].trim()) {
      throw new Error(`${metadataPath}: missing required string field "${field}"`)
    }
  }

  if (!Array.isArray(item.galleryUrls)) {
    throw new Error(`${metadataPath}: galleryUrls must be an array`)
  }

  if (!item.migration || typeof item.migration !== 'object') {
    throw new Error(`${metadataPath}: migration must be an object`)
  }
}

async function main() {
  const dataDir = await resolveDataDir()
  const metadataFiles = await listMetadataFiles(dataDir)
  const payload = await loadPayload()

  let created = 0
  let updated = 0
  let imagesFound = 0
  let featuredMatched = 0
  let galleryMatched = 0

  console.log(`Portfolio Ready directory: ${dataDir}`)
  console.log(`Metadata files found: ${metadataFiles.length}`)
  if (env.dryRun) {
    console.log('DRY_RUN=true: no Payload writes will be performed.')
  }

  for (const metadataPath of metadataFiles) {
    const { item, itemDir } = await readPortfolioItem(metadataPath)
    assertNormalizedItem(item, metadataPath)

    const uploadedMedia = await uploadItemMedia(payload, item, itemDir)
    const portfolioData = buildPortfolioData(item, uploadedMedia)

    imagesFound += uploadedMedia.imageFiles.length
    if (uploadedMedia.featuredImagePath) {
      featuredMatched += 1
    }
    galleryMatched += uploadedMedia.galleryImagePaths.length

    if (env.dryRun) {
      console.log(
        `[dry-run] ${item.slug}: ${uploadedMedia.imageFiles.length} local image(s), ` +
          `${uploadedMedia.galleryImagePaths.length} gallery image(s)`,
      )
      continue
    }

    const result = await createOrUpdatePortfolioItem(payload, item, portfolioData)
    if (result.action === 'created') {
      created += 1
    } else {
      updated += 1
    }

    console.log(`${result.action}: ${item.slug}`)
  }

  console.log('\nDone.')
  console.log(`Created: ${created}`)
  console.log(`Updated: ${updated}`)
  console.log(`Local images found: ${imagesFound}`)
  console.log(`Items with featured image match/fallback: ${featuredMatched}`)
  console.log(`Gallery image entries prepared: ${galleryMatched}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
