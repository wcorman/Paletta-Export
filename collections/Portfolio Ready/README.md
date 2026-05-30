# Portfolio Ready Collections

`collections/Portfolio Ready` groups copied portfolio item folders into three category folders:

```text
collections/
  Portfolio Ready/
    Dance/
    Interior Design/
    Visual Art/
```

## Source mapping

- `collections/portfolio-dances` -> `collections/Portfolio Ready/Dance`
- `collections/portfolio-furniture-designs` -> `collections/Portfolio Ready/Interior Design`
- `collections/portfolio-interior-designs` -> `collections/Portfolio Ready/Interior Design`
- `collections/portfolio-product-designs` -> `collections/Portfolio Ready/Interior Design`
- `collections/portfolio-stylings` -> `collections/Portfolio Ready/Interior Design`
- `collections/projects` -> `collections/Portfolio Ready/Interior Design`
- `collections/portfolio-visual-arts` -> `collections/Portfolio Ready/Visual Art`
- `collections/portfolio-graphic-designs` -> `collections/Portfolio Ready/Visual Art`

Each item folder is copied as a complete unit, preserving its `metadata.json` and any images/assets inside that item folder. The copied metadata files only add or confirm top-level `portfolioCategory`, `sourceCollection`, and `slug` values.

`index.json` is a lightweight lookup of each copied item with `title`, `slug`, `portfolioCategory`, `sourceCollection`, and `folderPath`.

## Assumptions

- Existing source collection folders remain untouched.
- Existing clear title fields in metadata are used for the index; no additional title normalization was applied.
- Duplicate destination folder names are kept as separate items by adding the source collection to the copied folder slug. This applies to the `projects` copies of `studio-al-mokattam` and `studio-al-nakhil`.
