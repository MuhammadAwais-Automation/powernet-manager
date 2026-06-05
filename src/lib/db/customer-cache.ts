import type { Area, Package } from '@/types/database'

let areasCache: Area[] | null = null
let packagesCache: Package[] | null = null

export function getCachedAreas() {
  return areasCache
}

export function setCachedAreas(areas: Area[]) {
  areasCache = areas
}

export function getCachedPackages() {
  return packagesCache
}

export function setCachedPackages(packages: Package[]) {
  packagesCache = packages
}
