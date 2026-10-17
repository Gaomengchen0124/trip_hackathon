import manifest from '../data/thumbnail-images.json'
import { assetUrl } from './travel-ui'

export function thumbnailImage(src, base = '/') {
  // Unknown, remote and newly uploaded photos retain their original URLs.
  const key = typeof src === 'string' ? src.replace(/^\//, '') : ''
  const image = manifest[key]
  if (!image?.widths?.length) return null
  const url = width => assetUrl(`${image.prefix}-${width}.webp`, base)
  return {
    src: url(image.widths.at(-1)),
    srcset: image.widths.map(width => `${url(width)} ${width}w`).join(', '),
  }
}
