import { db } from '@/lib/db'
import { forbidden, getCurrentUser, unauthorized } from '@/lib/auth'
import { isVercel } from '@/lib/entrepreneurs-config'
import { NextRequest, NextResponse } from 'next/server'

// ─── Size Extraction ────────────────────────────────────────────────
function extractExcelSize(name: string): string {
  // Match sizes like 40*40, 150х50, but also 8х5, 8х10, 8х8 (шевроны)
  const match = name.match(/(\d{1,3})\s*[*хx]\s*(\d{1,3})/i)
  if (match) {
    // Only treat as size if at least one dimension is >= 2 digits OR both >= 8
    // This avoids matching "2х3" pack descriptions etc.
    const d1 = parseInt(match[1]), d2 = parseInt(match[2])
    if (d1 >= 8 || d2 >= 8 || match[1].length >= 2 || match[2].length >= 2) {
      return `${match[1]}*${match[2]}`
    }
  }
  return ''
}

function extractWbSize(article: string, subject?: string): string {
  const subjectLower = (subject || '').toLowerCase()
  const articleNorm = article.toLowerCase().replace(/_/g, '').replace(/\s/g, '')
  const isDorozhki = subjectLower.includes('дорожки') || subjectLower.includes('дорожк')
  const isSalfetki = subjectLower.includes('салфетк')

  // Category-specific: "набор" detection for дорожки and салфетки
  if (isDorozhki || isSalfetki) {
    if (articleNorm.includes('набор')) {
      if (isSalfetki) {
        const has40x40 = /40\s*[хx*]\s*40/.test(articleNorm)
        if (has40x40) {
          const match6 = articleNorm.match(/6\s*шт/i)
          if (match6) return 'набор 6 шт'
          const match4 = articleNorm.match(/4\s*шт/i)
          if (match4) return 'набор 4 шт'
        }
      }
      return 'набор 4шт'
    }
    // Special case: салфетки 40х40 with 6шт/4шт but NO "набор" word — still a набора
    if (isSalfetki) {
      const has40x40 = /40\s*[хx*]\s*40/.test(articleNorm)
      if (has40x40) {
        const match6 = articleNorm.match(/6\s*шт/i)
        if (match6) return 'набор 6 шт'
        const match4 = articleNorm.match(/4\s*шт/i)
        if (match4) return 'набор 4 шт'
      }
    }
    // Дорожки: extract size from patterns like "_150_дорожка" or "_220_дорожка"
    if (isDorozhki) {
      const dorozhkaMatch = article.match(/_(\d{2,3})_дорожк/i)
      if (dorozhkaMatch) {
        return dorozhkaMatch[1] + ' см'
      }
    }
  }

  // Match sizes like 40х40, 150х50 (Russian х)
  const match = article.match(/(\d{1,3})\s*х\s*(\d{1,3})/i)
  if (match) {
    const d1 = parseInt(match[1]), d2 = parseInt(match[2])
    if (d1 >= 8 || d2 >= 8 || match[1].length >= 2 || match[2].length >= 2) {
      return `${match[1]}х${match[2]}`
    }
  }
  // Match sizes like 40x40, 150x50 (English x or *)
  const matchEng = article.match(/(\d{1,3})\s*[x*]\s*(\d{1,3})/i)
  if (matchEng) {
    const d1 = parseInt(matchEng[1]), d2 = parseInt(matchEng[2])
    if (d1 >= 8 || d2 >= 8 || matchEng[1].length >= 2 || matchEng[2].length >= 2) {
      return `${matchEng[1]}х${matchEng[2]}`
    }
  }
  const shortNav = article.match(/_(\d{2,3})_[Нн]_/)
  if (shortNav) {
    const w = shortNav[1]
    if (w === '150') return '150х50'
    if (w === '120') return '120х40'
    if (w === '90') return '90х30'
    return `${w}х${w}`
  }
  const shortPil = article.match(/_(\d{2,3})_[Пп]_/)
  if (shortPil) {
    const w = shortPil[1]
    if (w === '150') return '150х50'
    if (w === '120') return '120х40'
    if (w === '90') return '90х30'
    return `${w}х${w}`
  }
  return ''
}

function normalizeSize(size: string): string {
  return size.replace(/[*x]/g, 'х').toLowerCase().trim()
}

function extractPackQty(name: string): string {
  const match = name.match(/(\d+)\s*шт/i)
  return match ? match[1] : ''
}

// ─── WB Subject → Excel Type Mapping ──────────────────────────────
// Returns ALL possible Excel typeKeys for a given WB subject, in order of priority.
// The matching step will pick the best one based on size/pack qty.
// IMPORTANT: More specific keys MUST come before less specific ones
// (e.g., "Сумки-шопперы" before "Сумки")
const SUBJECT_TO_EXCEL_TYPES: Array<{ subject: string; types: string[] }> = [
  // More specific subjects first (to avoid partial matching issues)
  { subject: 'Подушки внутренние', types: ['подушка внутренняя', 'подушка декоративная'] },
  { subject: 'Подушки декоративные', types: ['подушка декоративная', 'подушка внутренняя'] },
  { subject: 'Подушки', types: ['подушка декоративная', 'подушка внутренняя'] },
  { subject: 'Наволочки декоративные', types: ['наволочка декоративная', 'наволочки декоративные', 'наволочки под сублимацию'] },
  { subject: 'Наволочки', types: ['наволочка декоративная', 'наволочки декоративные', 'наволочки под сублимацию'] },
  { subject: 'Карнавальные маски', types: ['маски'] },
  { subject: 'Чехлы для бутылей', types: ['чехлы для бутылей'] },
  { subject: 'Чехлы для чемоданов', types: ['чехлы на чемодан'] },
  { subject: 'Фартуки кухонные', types: ['фартуки'] },
  { subject: 'Флаги', types: ['флаги'] },
  { subject: 'Коврики пляжные', types: ['пляжные коврики'] },
  // "Декор для одежды" → ALWAYS шевроны (clothing patches/decorations)
  // Even for brand "Ремувикс": their products in "Декор для одежды" are шевроны,
  // their ремувки are in the "Брелоки" subject instead
  { subject: 'Декор для одежды', types: ['шевроны'] },
  { subject: 'Мешки для обуви', types: ['мешки для обуви', 'чехол для обуви', 'шоппер для обуви'] },
  { subject: 'Коврики для мыши', types: ['коврики для мыши'] },
  { subject: 'Колышки и скобы садовые', types: ['колышки для пляжных ковриков'] },
  { subject: 'Колышки для палаток', types: ['колышки для пляжных ковриков'] },
  // "Брелоки" → mostly ремувки in this business, but also actual брелоки possible
  { subject: 'Брелоки', types: ['ремувки', 'брелоки'] },
  { subject: 'Гобелены', types: ['гобелен', 'фотофоны'] },
  { subject: 'Фотофоны', types: ['фотофоны', 'гобелен'] },
  { subject: 'Коврики для намаза', types: ['коврики для намаза'] },
  { subject: 'Сумки пляжные', types: ['сумки пляжные'] },
  { subject: 'Сумки хозяйственные', types: ['сумки хозяйственные (шоппер)'] },
  { subject: 'Сумки-шопперы', types: ['сумки хозяйственные (шоппер)', 'шоппер для обуви'] },
  { subject: 'Сумки', types: ['сумки пляжные', 'сумки хозяйственные (шоппер)', 'шоппер для обуви'] },
  { subject: 'Скатерти', types: ['скатерти', 'дорожки'] },
  { subject: 'Салфетки', types: ['салфетки', 'салфетки с вышивкой'] },
  { subject: 'Дорожки кухонные', types: ['дорожки'] },
  { subject: 'Снуды', types: ['снуды'] },
  // Исключены: Наборы для создания слепков, Наборы для рисования, Стаканы — нет в Excel
  // Эти категории перенесены в EXCLUDED_WB_SUBJECTS ниже
  { subject: 'Пледы', types: ['плед', 'плед флисовый'] },
  { subject: 'Мягкие игрушки', types: ['мягкие игрушки', 'игрушки антистресс'] },
  { subject: 'Игрушки антистресс', types: ['игрушки антистресс', 'мягкие игрушки'] },
  { subject: 'Кольца для салфеток', types: ['кольца для салфеток'] },
  { subject: 'Ткань', types: ['ткань'] },
  { subject: 'Ткани для рукоделия', types: ['ткань'] },
]

// WB subject categories to exclude from comparison entirely
const EXCLUDED_WB_SUBJECTS: string[] = [
  'Картины по номерам',
  'Картины',
  'Алмазная мозаика',
  'Конструкторы',
  'Костюмы маскировочные',
  'Термокомплекты',
  'Анальные пробки',
  'Помпы для воды',
  'Вибраторы',
  'Портупеи эротик',
  'Портупеи',
  'Ошейники',
  'Маски эротик',
  'Рюкзаки',
  'Дождевики',
  // Нет в Excel — исключены по результатам аудита:
  'Наборы для создания слепков',
  'Наборы для рисования',
  'Стаканы',
  'Мочалки',
]

// ─── Article/Brand Keyword Overrides ──────────────────────────────────
// When a WB article's supplierArticle contains specific keywords,
// or the brand matches, we can narrow down to a specific Excel type.
// Priority: highest first. First match wins.
interface ArticleOverride {
  subjectContains: string
  articlePattern: RegExp
  brandPattern?: RegExp  // Optional brand check (if not provided, brand is not checked)
  exactSubject?: boolean // If true, only match EXACT subject (case-insensitive), not partial
  excelType: string      // Override: ONLY this type (if it exists in Excel)
  priority: number
}

const ARTICLE_OVERRIDES: ArticleOverride[] = [
  // ═══ "Декор для одежды" subject → always шевроны ═══
  // Brand "Ремувикс" has BOTH шевроны and ремувки:
  //   - Шевроны are in WB subject "Декор для одежды" → Excel type "шевроны"
  //   - Ремувки are in WB subject "Брелоки" → Excel type "ремувки"
  // So "Декор для одежды" should always map to "шевроны", regardless of brand.
  // Article contains "шеврон" → шевроны (explicit, high priority)
  { subjectContains: 'декор для одежды', articlePattern: /шеврон/i, excelType: 'шевроны', priority: 110 },
  // Default for "Декор для одежды": шевроны (this subject IS clothing patches)
  { subjectContains: 'декор для одежды', articlePattern: /./i, excelType: 'шевроны', priority: 30 },

  // ═══ "Брелоки" subject → split by brand ═══
  // Brand "Ремувикс" → ремувки (eraser keychains sold as keychains)
  { subjectContains: 'брелоки', articlePattern: /./i, brandPattern: /ремувикс|ремув/i, excelType: 'ремувки', priority: 120 },
  // Default: ремувки if available (most items are ремувки)
  { subjectContains: 'брелоки', articlePattern: /./i, excelType: 'ремувки', priority: 30 },

  // ═══ "Мешки для обуви" subject → split by article keyword ═══
  { subjectContains: 'мешки для обуви', articlePattern: /чехол/i, excelType: 'чехол для обуви', priority: 110 },
  { subjectContains: 'мешки для обуви', articlePattern: /шоппер.*обув|обув.*шоппер/i, excelType: 'шоппер для обуви', priority: 111 },
  { subjectContains: 'мешки для обуви', articlePattern: /шоппер/i, excelType: 'шоппер для обуви', priority: 100 },
  // "мешок" keyword → мешки для обуви (explicit mapping)
  { subjectContains: 'мешки для обуви', articlePattern: /мешок/i, excelType: 'мешки для обуви', priority: 105 },
  // Default for "Мешки для обуви": мешки (most common type)
  { subjectContains: 'мешки для обуви', articlePattern: /./i, excelType: 'мешки для обуви', priority: 20 },

  // ═══ "Салфетки" subject (EXACT match only!) → split by ВЫШИВКА keyword ═══
  { subjectContains: 'салфетки', articlePattern: /салфеткавышивк|вышивк/i, excelType: 'салфетки с вышивкой', priority: 110, exactSubject: true },
  // "ВКорзину" articles → regular салфетки
  { subjectContains: 'салфетки', articlePattern: /салфеткавкорзин|вкорзин/i, excelType: 'салфетки', priority: 105, exactSubject: true },
  // Default for "Салфетки": regular салфетки
  { subjectContains: 'салфетки', articlePattern: /./i, excelType: 'салфетки', priority: 20, exactSubject: true },

  // ═══ "Сумки-шопперы" subject → split by article keyword ═══
  { subjectContains: 'сумки-шопперы', articlePattern: /обувь/i, excelType: 'шоппер для обуви', priority: 110 },
  { subjectContains: 'сумки-шопперы', articlePattern: /шоппер.*обув|обув.*шоппер/i, excelType: 'шоппер для обуви', priority: 111 },
  // Default for "Сумки-шопперы": regular шоппер
  { subjectContains: 'сумки-шопперы', articlePattern: /./i, excelType: 'сумки хозяйственные (шоппер)', priority: 20 },

  // ═══ "Скатерти" subject → split by article keyword ═══
  { subjectContains: 'скатерти', articlePattern: /дорожк/i, excelType: 'дорожки', priority: 110, exactSubject: true },
  // Default for "Скатерти": скатерти
  { subjectContains: 'скатерти', articlePattern: /./i, excelType: 'скатерти', priority: 20, exactSubject: true },

  // ═══ "Сумки" subject (EXACT match only!) → split by article keyword ═══
  { subjectContains: 'сумки', articlePattern: /сумкапляж|пляжоксфорд|сумкапляжоксфорд|сумкапляждвунитк/i, excelType: 'сумки пляжные', priority: 110, exactSubject: true },
  { subjectContains: 'сумки', articlePattern: /шоппер.*обув|обув.*шоппер/i, excelType: 'шоппер для обуви', priority: 109, exactSubject: true },
  // Default for "Сумки" (exact): пляжные (most common)
  { subjectContains: 'сумки', articlePattern: /./i, excelType: 'сумки пляжные', priority: 20, exactSubject: true },

  // ═══ "Гобелены" subject → always гобелен ═══
  { subjectContains: 'гобелены', articlePattern: /./i, excelType: 'гобелен', priority: 20 },
  // ═══ "Фотофоны" subject → check article for гобелен keyword ═══
  // If article contains "гобелен" but subject is "Фотофоны", check which Excel types exist
  { subjectContains: 'фотофоны', articlePattern: /гобелен/i, excelType: 'гобелен', priority: 110 },
  { subjectContains: 'фотофоны', articlePattern: /./i, excelType: 'фотофоны', priority: 20 },

  // ═══ "Подушки" subjects → disambiguate ═══
  // "Подушки внутренние" → внутренняя by default (always correct for this subject)
  { subjectContains: 'подушки внутренние', articlePattern: /./i, excelType: 'подушка внутренняя', priority: 20 },
  // "Подушки декоративные" → внутренняя if article says so
  { subjectContains: 'подушки декоративные', articlePattern: /внутренняя/i, excelType: 'подушка внутренняя', priority: 110 },
  { subjectContains: 'подушки декоративные', articlePattern: /./i, excelType: 'подушка декоративная', priority: 20 },
  // NO default for "Подушки" — need size matching to distinguish types

  // ═══ "Наволочки" subjects → disambiguate ═══
  // "Наволочки декоративные" → сублимация if article says so
  { subjectContains: 'наволочки декоративные', articlePattern: /подсублим|сублим/i, excelType: 'наволочки под сублимацию', priority: 110 },
  { subjectContains: 'наволочки декоративные', articlePattern: /./i, excelType: 'наволочка декоративная', priority: 20 },
  // NO default for "Наволочки" — need size matching to distinguish types

  // ═══ "Игрушки" subjects → disambiguate ═══
  { subjectContains: 'игрушки антистресс', articlePattern: /антистресс/i, excelType: 'игрушки антистресс', priority: 100 },
  { subjectContains: 'игрушки антистресс', articlePattern: /./i, excelType: 'игрушки антистресс', priority: 20 },
  { subjectContains: 'мягкие игрушки', articlePattern: /./i, excelType: 'мягкие игрушки', priority: 20 },

  // Убраны: 'набор для слепков' и 'набор для рисования' — этих категорий нет в Excel
]

// ─── Find matching subject types ──────────────────────────────────
// Uses exact matching first, then longest partial match
function findSubjectTypes(wbSubject: string): string[] {
  const subjectLower = wbSubject.toLowerCase()

  // 1. Try exact match (case-insensitive)
  const exactMatch = SUBJECT_TO_EXCEL_TYPES.find(e => e.subject.toLowerCase() === subjectLower)
  if (exactMatch) return exactMatch.types

  // 2. Try longest partial match (most specific subject first)
  let bestMatch: string[] = []
  let bestLen = 0
  for (const entry of SUBJECT_TO_EXCEL_TYPES) {
    const entryLower = entry.subject.toLowerCase()
    if (subjectLower.includes(entryLower) || entryLower.includes(subjectLower)) {
      if (entry.subject.length > bestLen) {
        bestLen = entry.subject.length
        bestMatch = entry.types
      }
    }
  }
  return bestMatch
}

// ─── Fuzzy match helper ──────────────────────────────────────────────
// Check if a typeKey matches a target type (exact or partial)
function typeKeyMatches(typeKey: string, targetType: string): boolean {
  if (typeKey === targetType) return true
  if (typeKey.includes(targetType) || targetType.includes(typeKey)) return true
  return false
}

// ─── Context-Aware Excel Type Determination ──────────────────────────
// Returns ALL possible Excel typeKeys for this WB article,
// narrowed by article/brand keyword overrides and available Excel types.
function determineExcelTypes(
  subject: string,
  article: string,
  brand: string,
  availableExcelTypes: Set<string>,
): string[] {
  const subjectLower = subject.toLowerCase()
  const articleNorm = article.toLowerCase().replace(/_/g, '').replace(/\s/g, '')
  const brandLower = (brand || '').toLowerCase()

  // 1. Get all possible types from subject mapping
  let possibleTypes = findSubjectTypes(subject)

  if (possibleTypes.length === 0) return []

  // 2. Check article/brand keyword overrides (only if target type exists in Excel)
  // Brand-aware overrides take highest priority
  const matchingOverrides = ARTICLE_OVERRIDES
    .filter(rule => rule.exactSubject ? subjectLower === rule.subjectContains : subjectLower.includes(rule.subjectContains))
    .filter(rule => rule.articlePattern.test(articleNorm))
    .filter(rule => !rule.brandPattern || rule.brandPattern.test(brandLower))
    .filter(rule => {
      // Check if target type exists in Excel (exact or fuzzy match)
      if (availableExcelTypes.has(rule.excelType)) return true
      // Fuzzy: check if any available type contains or is contained by the target
      for (const t of availableExcelTypes) {
        if (typeKeyMatches(t, rule.excelType)) return true
      }
      return false
    })
    .sort((a, b) => b.priority - a.priority)

  if (matchingOverrides.length > 0) {
    return [matchingOverrides[0].excelType]
  }

  // 3. Filter possible types to only those that exist in Excel (exact or fuzzy)
  const availableTypes = possibleTypes.filter(t => {
    if (availableExcelTypes.has(t)) return true
    // Fuzzy match
    for (const at of availableExcelTypes) {
      if (typeKeyMatches(at, t)) return true
    }
    return false
  })
  if (availableTypes.length > 0) return availableTypes

  // 4. If no Excel types match, return original possible types anyway
  // (will show as unmatched in the UI)
  return possibleTypes
}

// ─── WB API Request with Retry ──────────────────────────────────────
async function fetchWbApi(url: string, options: RequestInit, maxRetries = 5): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options)
    if (response.status === 429 || response.status === 461) {
      const waitMs = (attempt + 1) * 3000
      await new Promise(resolve => setTimeout(resolve, waitMs))
      continue
    }
    return response
  }
  return await fetch(url, options)
}

// ─── Sales Funnel API Types ──────────────────────────────────────────
interface FunnelProduct {
  product: {
    nmId: number
    title: string
    vendorCode: string
    brandName: string
    subjectId: number
    subjectName: string
    tags: string[]
    productRating: number
    feedbackRating: number
  }
  statistic: {
    selected: {
      period: { start: string; end: string }
      openCount: number
      cartCount: number
      orderCount: number
      orderSum: number
      buyoutCount: number
      buyoutSum: number
      cancelCount: number
      cancelSum: number
    }
  }
}

interface FunnelResponse {
  data: {
    products: FunnelProduct[]
  }
}

// ─── Fetch Sales Funnel data with multiple sort orders ────────────────
async function fetchSalesFunnel(
  apiKey: string,
  filterFrom: string,
  filterTo: string,
): Promise<{ products: Map<number, FunnelProduct>; error: string | null }> {
  const productMap = new Map<number, FunnelProduct>()
  let firstError: string | null = null

  const sortOrders: Array<{ field: string; mode: string }> = [
    { field: 'orderSum', mode: 'desc' },
    { field: 'orderCount', mode: 'asc' },
    { field: 'orderCount', mode: 'desc' },
  ]

  for (let i = 0; i < sortOrders.length; i++) {
    const orderBy = sortOrders[i]

    // Add 1.5 second delay between requests (not before the first one)
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 1500))
    }

    let page = 1
    let hasMore = true

    while (hasMore) {
      try {
        const url = 'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products'
        const body = {
          page,
          pageSize: 100,
          selectedPeriod: { start: filterFrom, end: filterTo },
          orderBy: { field: orderBy.field, mode: orderBy.mode },
        }

        const response = await fetchWbApi(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          const errMsg = `WB Sales Funnel API ошибка (${response.status}, orderBy=${orderBy.field}:${orderBy.mode}, page=${page}): ${errData.detail || errData.title || errData.message || 'Неизвестная ошибка'}`
          if (!firstError) firstError = errMsg
          // Stop paging on error for this sort order
          hasMore = false
          break
        }

        const data: FunnelResponse = await response.json()
        const products = data?.data?.products || []

        for (const product of products) {
          // Deduplicate by nmId — keep existing entry if already present
          if (!productMap.has(product.product.nmId)) {
            productMap.set(product.product.nmId, product)
          }
        }

        // If we got fewer than pageSize products, there's no more pages
        if (products.length < 100) {
          hasMore = false
        } else {
          page++
          // Add delay between pages too
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
      } catch (e: any) {
        if (!firstError) firstError = `Ошибка подключения к WB Sales Funnel API: ${e.message}`
        hasMore = false
        break
      }
    }
  }

  return { products: productMap, error: firstError }
}

// ─── Main Compare Logic ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()

    const { searchParams } = request.nextUrl
    const entrepreneurId = searchParams.get('entrepreneurId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const source = searchParams.get('source') || 'orders'

    if (!entrepreneurId) {
      return NextResponse.json({ error: 'entrepreneurId is required' }, { status: 400 })
    }

    const entId = Number(entrepreneurId)

    // On Vercel, the compare feature requires DailyOrder data which is not available
    // (read-only filesystem, no SQLite). Return a helpful error.
    if (isVercel()) {
      return NextResponse.json({
        error: 'Сравнение с Excel-данными недоступно на Vercel (нет доступа к базе данных DailyOrder). Используйте локальную версию для сравнения.',
        vercel: true,
      }, { status: 501 })
    }

    // Get API key
    const entResult = await db.$queryRawUnsafe<Array<{ id: number; name: string; wbApiKey: string; userId: number | null }>>(
      `SELECT id, name, wbApiKey, userId FROM Entrepreneur WHERE id = ${entId}`
    )

    if (!entResult.length || !entResult[0].wbApiKey) {
      return NextResponse.json({ error: 'API ключ не найден для данного ИП' }, { status: 404 })
    }
    if (user.role !== 'admin' && entResult[0].userId !== user.id) return forbidden()

    const entrepreneur = entResult[0]
    const apiKey = entrepreneur.wbApiKey

    // ═══ 1. Fetch Excel data ═══
    const excelConditions = [`do_q.entrepreneurId = ${entId}`, `do_q.date >= '2024-01-01'`]
    if (dateFrom) excelConditions.push(`do_q.date >= '${dateFrom}'`)
    if (dateTo) excelConditions.push(`do_q.date <= '${dateTo}'`)

    const excelDataRaw = await db.$queryRawUnsafe<Array<{
      productId: number; productName: string; dateStr: string; quantity: bigint
    }>>(
      `SELECT do_q.productId, p.name as productName, strftime('%Y-%m-%d', do_q.date) as dateStr, SUM(do_q.quantity) as quantity
       FROM DailyOrder do_q JOIN Product p ON p.id = do_q.productId
       WHERE ${excelConditions.join(' AND ')}
       GROUP BY do_q.productId, p.name, do_q.date ORDER BY do_q.date ASC`
    )
    const excelData = excelDataRaw.map((r) => ({ ...r, quantity: Number(r.quantity) }))

    // ═══ 2. Aggregate Excel data by product ═══
    const excelByProduct: Record<number, {
      name: string; size: string; packQty: string; typeKey: string; total: number
    }> = {}

    excelData.forEach((row) => {
      if (!excelByProduct[row.productId]) {
        const size = extractExcelSize(row.productName)
        const packQty = extractPackQty(row.productName)
        let typeKey = row.productName
          .replace(/\s*\d{1,3}\s*[*хx]\s*\d{1,3}/gi, '')
          .replace(/\s*\d+\s*шт/gi, '')
          .replace(/\s+/g, ' ').trim().toLowerCase()
        if (typeKey.length > 0) typeKey = typeKey.charAt(0).toLowerCase() + typeKey.slice(1)

        excelByProduct[row.productId] = { name: row.productName, size, packQty, typeKey, total: 0 }
      }
      excelByProduct[row.productId].total += row.quantity
    })

    // Build set of available Excel typeKeys for context-aware mapping
    const availableExcelTypes = new Set(Object.values(excelByProduct).map(e => e.typeKey))

    // ═══ 3. Fetch WB API data ═══
    const filterFrom = dateFrom || '2026-01-01'
    const filterTo = dateTo || new Date().toISOString().split('T')[0]

    // This is the unified structure that both data sources populate
    const wbByArticle: Record<string, {
      supplierArticle: string; subject: string; category: string; nmId: number;
      size: string; brand: string; total: number; byDate: Record<string, number>; bySize: Record<string, number>
    }> = {}

    let wbDataSource: 'funnel' | 'orders' | 'sales' = source === 'funnel' ? 'funnel' : 'orders'
    let wbError: string | null = null
    let funnelProductCount = 0

    // ── Optional diagnostic source: Sales Funnel API ──
    // Excel data is exported from "Воронка продаж", so the closest WB API source is
    // the Sales Funnel endpoint and its statistic.selected.orderCount metric.
    if (source === 'funnel') {
      try {
        const funnelResult = await fetchSalesFunnel(apiKey, filterFrom, filterTo)
        funnelProductCount = funnelResult.products.size
        if (funnelResult.error) wbError = funnelResult.error

        for (const product of funnelResult.products.values()) {
          const orderCount = product.statistic?.selected?.orderCount || 0
          if (orderCount <= 0) continue

          const article = product.product.vendorCode || 'unknown'
          const subject = product.product.subjectName || ''
          const compositeKey = `${article}__${product.product.nmId || 0}`

          wbByArticle[compositeKey] = {
            supplierArticle: article,
            subject,
            category: subject,
            nmId: product.product.nmId || 0,
            size: extractWbSize(article, subject),
            brand: product.product.brandName || '',
            total: orderCount,
            byDate: {},
            bySize: {},
          }
        }
      } catch (e: any) {
        wbError = `Ошибка подключения к WB Sales Funnel API: ${e.message}`
      }
    }

    // ── FALLBACK: Orders/Sales API ──
    // These endpoints are useful for operational daily analytics, but for period-level
    // comparison against Excel funnel exports they can drift because they are driven by
    // WB record dates/changes rather than the exact funnel aggregation.
    let wbOrders: any[] = []
    let wbSales: any[] = []

    const apiHeaders = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

    // IMPORTANT: We count ALL orders (including cancelled ones) because
    // Excel "Воронка продаж" shows total orders, not just non-cancelled.
    // This matches what the user needs: understanding production load.
    const filterToDateRange = (records: any[]) => {
      return records.filter((o: any) => {
        const rawDate = o.date || ''
        let d = rawDate.substring(0, 10)
        if (rawDate.includes('T')) {
          const parsed = new Date(rawDate).getTime()
          if (!Number.isNaN(parsed)) {
            d = new Date(parsed + 3 * 60 * 60 * 1000).toISOString().substring(0, 10)
          }
        }
        if (!d || d < filterFrom || d > filterTo) return false
        // NOTE: We do NOT filter out isCancel or saleID — we want ALL orders/records
        // to match the "Воронка продаж" data from Excel
        return true
      })
    }

    if (Object.keys(wbByArticle).length === 0) {
      // ── Fetch ORDERS (chunked to avoid 80K API limit) ──
      // The WB Orders API limits responses to ~80,000 records.
      // When requesting wide date ranges, recent data gets cut off.
      // Solution: Fetch month by month, most recent first.
      const orderChunks: Array<{ from: string; to: string }> = []
      {
        let chunkEnd = new Date(filterTo + 'T23:59:59')
        const startDate = new Date(filterFrom + 'T00:00:00')
        while (chunkEnd >= startDate) {
          const year = chunkEnd.getFullYear()
          const month = chunkEnd.getMonth()
          const monthStart = new Date(year, month, 1)
          const chunkFrom = monthStart > startDate ? monthStart : startDate
          orderChunks.push({
            from: chunkFrom.toISOString().split('T')[0],
            to: chunkEnd.toISOString().split('T')[0],
          })
          chunkEnd = new Date(year, month, 0)
          chunkEnd.setHours(23, 59, 59)
        }
      }

    const seenOrderKeys = new Set<string>()
    for (let i = 0; i < orderChunks.length; i++) {
      const chunk = orderChunks[i]
      try {
        const apiFromDate = new Date(chunk.from + 'T00:00:00')
        apiFromDate.setDate(apiFromDate.getDate() - 2)
        const apiFrom = apiFromDate.toISOString().split('T')[0]
        const ordersUrl = `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${apiFrom}&flag=0`
        const ordersResponse = await fetchWbApi(ordersUrl, { headers: apiHeaders })
        if (!ordersResponse.ok && i === 0) {
          const errData = await ordersResponse.json().catch(() => ({}))
          wbError = `WB Orders API ошибка (${ordersResponse.status}): ${errData.detail || errData.title || 'Неизвестная ошибка'}`
        } else if (ordersResponse.ok) {
          const chunkOrders = await ordersResponse.json()
          const filtered = filterToDateRange(chunkOrders)
          for (const order of filtered) {
            const key = order.odid || `${order.supplierArticle}_${order.nmId}_${order.date}_${order.techSize}`
            if (!seenOrderKeys.has(key)) {
              seenOrderKeys.add(key)
              wbOrders.push(order)
            }
          }
        }
      } catch (e: any) {
        if (i === 0) wbError = `Ошибка подключения к WB Orders API: ${e.message}`
      }
      if (i < orderChunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    // ── Fetch SALES (chunked to avoid 80K API limit) ──
    const salesChunks: Array<{ from: string; to: string }> = []
    {
      let chunkEnd = new Date(filterTo + 'T23:59:59')
      const startDate = new Date(filterFrom + 'T00:00:00')
      while (chunkEnd >= startDate) {
        const year = chunkEnd.getFullYear()
        const month = chunkEnd.getMonth()
        const monthStart = new Date(year, month, 1)
        const chunkFrom = monthStart > startDate ? monthStart : startDate
        salesChunks.push({
          from: chunkFrom.toISOString().split('T')[0],
          to: chunkEnd.toISOString().split('T')[0],
        })
        chunkEnd = new Date(year, month, 0)
        chunkEnd.setHours(23, 59, 59)
      }
    }

    const seenSaleKeys = new Set<string>()
    for (let i = 0; i < salesChunks.length; i++) {
      const chunk = salesChunks[i]
      try {
        const apiFromDate = new Date(chunk.from + 'T00:00:00')
        apiFromDate.setDate(apiFromDate.getDate() - 2)
        const apiFrom = apiFromDate.toISOString().split('T')[0]
        const salesUrl = `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${apiFrom}&flag=0`
        const salesResponse = await fetchWbApi(salesUrl, { headers: apiHeaders })
        if (salesResponse.ok) {
          const chunkSales = await salesResponse.json()
          const filtered = filterToDateRange(chunkSales)
          for (const sale of filtered) {
            const key = sale.saleID || `${sale.supplierArticle}_${sale.nmId}_${sale.date}_${sale.techSize}`
            if (!seenSaleKeys.has(key)) {
              seenSaleKeys.add(key)
              wbSales.push(sale)
            }
          }
        }
      } catch (_e: any) {
        // Sales API failure is not critical
      }
      if (i < salesChunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    // IMPORTANT: Always use Orders API as primary source (not Sales)
    // Excel "Воронка продаж" shows ORDER count, not sales count.
    // Orders API gives us total orders (matching Excel), while Sales API
    // includes both purchases and returns which would cause double-counting.
    // Only fall back to Sales if Orders API returned nothing.
    const wbData = wbOrders.length > 0 ? wbOrders : wbSales
    wbDataSource = wbOrders.length > 0 ? 'orders' : 'sales'

    // Aggregate Orders/Sales data into wbByArticle
    wbData.forEach((order: any) => {
      const article = order.supplierArticle || 'unknown'
      const orderDate = order.date?.substring(0, 10) || ''
      const orderSize = order.techSize || order.size || ''
      if (!orderDate) return

      const compositeKey = `${article}__${order.nmId || 0}`

      if (!wbByArticle[compositeKey]) {
        wbByArticle[compositeKey] = {
          supplierArticle: article, subject: order.subject || '',
          category: '', nmId: order.nmId || 0,
          size: extractWbSize(article, order.subject || ''), brand: order.brand || '', total: 0, byDate: {}, bySize: {},
        }
      }

      if (!wbByArticle[compositeKey].subject && order.subject) {
        wbByArticle[compositeKey].subject = order.subject
      }
      if (!wbByArticle[compositeKey].brand && order.brand) {
        wbByArticle[compositeKey].brand = order.brand
      }

      wbByArticle[compositeKey].total += 1
      wbByArticle[compositeKey].byDate[orderDate] = (wbByArticle[compositeKey].byDate[orderDate] || 0) + 1
      if (orderSize) {
        wbByArticle[compositeKey].bySize[orderSize] = (wbByArticle[compositeKey].bySize[orderSize] || 0) + 1
      }
    })
    }

    // Exclude unwanted subjects
    for (const key of Object.keys(wbByArticle)) {
      const wbItem = wbByArticle[key]
      const subjectLower = wbItem.subject.toLowerCase()
      if (EXCLUDED_WB_SUBJECTS.some(excl => subjectLower.includes(excl.toLowerCase()))) {
        delete wbByArticle[key]
      }
    }

    // ═══ 4. Smart mapping: WB article → Excel product ═══
    const articleToProduct: Record<string, { productId: number; method: string } | null> = {}
    const wbArticleKeys = Object.keys(wbByArticle)

    for (const compositeKey of wbArticleKeys) {
      const wbItem = wbByArticle[compositeKey]
      let matchedProductId: number | null = null
      let matchMethod = ''

      const article = wbItem.supplierArticle
      const wbSizeNorm = normalizeSize(wbItem.size)

      // ── Step 1: Get all possible Excel types (context-aware) ──
      const targetExcelTypes = determineExcelTypes(wbItem.subject, article, wbItem.brand, availableExcelTypes)

      if (targetExcelTypes.length === 0) {
        articleToProduct[compositeKey] = null
        continue
      }

      // ── Step 2: Find ALL matching Excel products across all possible types ──
      // Try exact typeKey match first
      let candidates = Object.entries(excelByProduct).filter(([_, excel]) =>
        targetExcelTypes.some((t) => excel.typeKey === t)
      )

      // If no exact matches, fall back to partial/fuzzy matches
      if (candidates.length === 0) {
        candidates = Object.entries(excelByProduct).filter(([_, excel]) =>
          targetExcelTypes.some((t) => typeKeyMatches(excel.typeKey, t))
        )
      }

      if (candidates.length === 0) {
        articleToProduct[compositeKey] = null
        continue
      }

      // ── Step 3: Among candidates, find the best match by size ──
      if (wbSizeNorm) {
        // Try to find a candidate with matching size
        const sizeMatches = candidates.filter(([_, excel]) => {
          const excelSizeNorm = normalizeSize(excel.size)
          return excelSizeNorm && excelSizeNorm === wbSizeNorm
        })

        if (sizeMatches.length === 1) {
          matchedProductId = Number(sizeMatches[0][0])
          matchMethod = 'subject+size'
        } else if (sizeMatches.length > 1) {
          // Multiple size matches - try pack qty
          const articlePackQty = extractPackQty(article)
          if (articlePackQty) {
            const qtyMatch = sizeMatches.find(([_, excel]) => excel.packQty === articlePackQty)
            if (qtyMatch) {
              matchedProductId = Number(qtyMatch[0])
              matchMethod = 'subject+size+qty'
            }
          }
          if (!matchedProductId) {
            // Prefer non-2-pack (base product)
            const baseMatch = sizeMatches.find(([_, excel]) => !excel.packQty)
            if (baseMatch) {
              matchedProductId = Number(baseMatch[0])
              matchMethod = 'subject+size (base)'
            } else {
              matchedProductId = Number(sizeMatches[0][0])
              matchMethod = 'subject+size (first)'
            }
          }
        } else {
          // No size match - WB has size but no Excel product at that size
          // Try candidates without size (no size in Excel)
          const noSizeInExcel = candidates.filter(([_, excel]) => !excel.size)
          if (noSizeInExcel.length === 1) {
            matchedProductId = Number(noSizeInExcel[0][0])
            matchMethod = 'subject (no size in Excel)'
          } else if (noSizeInExcel.length > 1) {
            // Multiple size-less candidates - prefer PRIMARY type (first in list)
            const primaryTypeMatch = noSizeInExcel.find(([_, excel]) =>
              typeKeyMatches(excel.typeKey, targetExcelTypes[0])
            )
            if (primaryTypeMatch) {
              matchedProductId = Number(primaryTypeMatch[0])
              matchMethod = 'subject (primary type, no size in Excel)'
            }
            // Then try pack qty
            if (!matchedProductId) {
              const articlePackQty = extractPackQty(article)
              if (articlePackQty) {
                const qtyMatch = noSizeInExcel.find(([_, excel]) => excel.packQty === articlePackQty)
                if (qtyMatch) {
                  matchedProductId = Number(qtyMatch[0])
                  matchMethod = 'subject+qty (no size)'
                }
              }
            }
            if (!matchedProductId) {
              const baseMatch = noSizeInExcel.find(([_, excel]) => !excel.packQty)
              if (baseMatch) {
                matchedProductId = Number(baseMatch[0])
                matchMethod = 'subject (no size, base)'
              }
            }
          }
          // If still no match, try 2-pack candidates at this size
          if (!matchedProductId) {
            const pack2AtSize = candidates.filter(([_, excel]) =>
              excel.packQty === '2' && normalizeSize(excel.size) === wbSizeNorm
            )
            if (pack2AtSize.length === 1) {
              matchedProductId = Number(pack2AtSize[0][0])
              matchMethod = 'subject+size (2-pack)'
            }
          }
          // If still no match, try ANY candidate at this size (fuzzy size)
          if (!matchedProductId) {
            // Check if any candidate's typeKey matches primary type (even with different size)
            const primaryCandidates = candidates.filter(([_, excel]) =>
              targetExcelTypes[0] && typeKeyMatches(excel.typeKey, targetExcelTypes[0])
            )
            if (primaryCandidates.length > 0) {
              matchedProductId = Number(primaryCandidates[0][0])
              matchMethod = 'subject (type match, size diff)'
            }
          }
        }
      }

      // ── Step 4: No size in WB - match without size ──
      if (!matchedProductId) {
        const noSizeExcel = candidates.filter(([_, excel]) => !excel.size)
        if (noSizeExcel.length === 1) {
          matchedProductId = Number(noSizeExcel[0][0])
          matchMethod = 'subject (no size)'
        } else if (noSizeExcel.length > 1) {
          // Multiple candidates without size - try pack qty
          const articlePackQty = extractPackQty(article)
          if (articlePackQty) {
            const qtyMatch = noSizeExcel.find(([_, excel]) => excel.packQty === articlePackQty)
            if (qtyMatch) {
              matchedProductId = Number(qtyMatch[0])
              matchMethod = 'subject+qty (no size)'
            }
          }
          if (!matchedProductId) {
            // Prefer products from the PRIMARY typeKey (first in list)
            const firstTypeMatch = noSizeExcel.find(([_, excel]) =>
              typeKeyMatches(excel.typeKey, targetExcelTypes[0])
            )
            if (firstTypeMatch) {
              matchedProductId = Number(firstTypeMatch[0])
              matchMethod = 'subject (primary type)'
            }
          }
          if (!matchedProductId) {
            const baseProduct = noSizeExcel.find(([_, excel]) => !excel.packQty)
            if (baseProduct) {
              matchedProductId = Number(baseProduct[0])
              matchMethod = 'subject (no size, base)'
            }
          }
        } else {
          // All candidates have sizes but WB doesn't
          // Try 2-pack candidates at any size
          const pack2Candidates = candidates.filter(([_, excel]) => excel.packQty === '2')
          if (pack2Candidates.length === 1) {
            matchedProductId = Number(pack2Candidates[0][0])
            matchMethod = 'subject (2-pack fallback)'
          } else if (candidates.length > 0) {
            matchedProductId = Number(candidates[0][0])
            matchMethod = 'subject (size not matched)'
          }
        }
      }

      // ── Step 5: Fallback - article keyword matching ──
      if (!matchedProductId) {
        const articleNorm = article.toLowerCase().replace(/_/g, '').replace(/\s/g, '')
        const KEYWORD_MAP: [string, string][] = [
          ['салфеткавышивка', 'салфетки с вышивкой'],
          ['салфеткавкорзину', 'салфетки'],
          ['салфетка', 'салфетки'],
          ['сумкапляждвунитк', 'сумки пляжные'],
          ['сумкапляжоксфорд', 'сумки пляжные'],
          ['сумкапляж', 'сумки пляжные'],
          ['чехолначемодан', 'чехлы на чемодан'],
          ['чехолбутыл', 'чехлы для бутылей'],
          ['чехолкулер', 'чехлы для бутылей'],
          ['коврикдлянамаза', 'коврики для намаза'],
          ['коврикпляжный', 'пляжные коврики'],
          ['подушка', 'подушка декоративная'],
          ['наволочк', 'наволочка декоративная'],
          ['маска', 'маски'],
          ['фартук', 'фартуки'],
          ['флаг', 'флаги'],
          ['коврик', 'коврики для мыши'],
          ['мешок', 'мешки для обуви'],
          ['чехол', 'чехол для обуви'],
          ['шоппер', 'сумки хозяйственные (шоппер)'],
          ['колышки', 'колышки для пляжных ковриков'],
          ['шеврон', 'шевроны'],
          ['ремувк', 'ремувки'],
          ['гобелен', 'гобелен'],
          ['фотофон', 'фотофоны'],
          ['дорожк', 'дорожки'],
          ['скатерт', 'скатерти'],
          ['ткань', 'ткань'],
          ['набор', 'набор'],
          ['плед', 'плед'],
          ['игрушк', 'мягкие игрушки'],
        ]

        for (const [keyword, excelType] of KEYWORD_MAP) {
          if (articleNorm.includes(keyword)) {
            const candidate = Object.entries(excelByProduct).find(([_, excel]) => {
              if (!availableExcelTypes.has(excel.typeKey)) return false
              return typeKeyMatches(excel.typeKey, excelType)
            })
            if (candidate) {
              if (wbSizeNorm) {
                const sizeMatch = Object.entries(excelByProduct).find(([_, excel]) => {
                  if (!availableExcelTypes.has(excel.typeKey)) return false
                  const typeMatch = typeKeyMatches(excel.typeKey, excelType)
                  return typeMatch && normalizeSize(excel.size) === wbSizeNorm
                })
                if (sizeMatch) {
                  matchedProductId = Number(sizeMatch[0])
                  matchMethod = 'keyword+size'
                }
              }
              if (!matchedProductId) {
                matchedProductId = Number(candidate[0])
                matchMethod = 'keyword'
              }
              if (matchedProductId) break
            }
          }
        }
      }

      // ── Step 6: Special handling for колышки ──
      if (!matchedProductId) {
        const subjectLower = wbItem.subject.toLowerCase()
        if (subjectLower.includes('колышк') || article.toLowerCase().includes('колышк')) {
          const kolyshkiCandidates = Object.entries(excelByProduct).filter(([_, excel]) =>
            excel.typeKey.includes('колышк')
          )
          if (kolyshkiCandidates.length > 0) {
            matchedProductId = Number(kolyshkiCandidates[0][0])
            matchMethod = 'subject (колышки)'
          }
        }
      }

      articleToProduct[compositeKey] = matchedProductId ? { productId: matchedProductId, method: matchMethod } : null
    }

    // ═══ 5. Build comparison result ═══
    const productWbAgg: Record<number, {
      totalOrders: number; articles: string[]; bySize: Record<string, number>;
      subjects: Set<string>; categories: Set<string>; methods: Set<string>
    }> = {}

    for (const [compositeKey, matchInfo] of Object.entries(articleToProduct)) {
      if (!matchInfo) continue
      const productId = matchInfo.productId
      const wbItem = wbByArticle[compositeKey]
      if (!productWbAgg[productId]) {
        productWbAgg[productId] = {
          totalOrders: 0, articles: [], bySize: {},
          subjects: new Set(), categories: new Set(), methods: new Set(),
        }
      }
      productWbAgg[productId].totalOrders += wbItem.total
      productWbAgg[productId].articles.push(wbItem.supplierArticle)
      for (const [size, count] of Object.entries(wbItem.bySize)) {
        productWbAgg[productId].bySize[size] = (productWbAgg[productId].bySize[size] || 0) + count
      }
      if (wbItem.subject) productWbAgg[productId].subjects.add(wbItem.subject)
      if (wbItem.category) productWbAgg[productId].categories.add(wbItem.category)
      productWbAgg[productId].methods.add(matchInfo.method)
    }

    // Build product summary
    const productSummary: Array<{
      productId: number | null; productName: string; excelSize: string;
      wbSize: string; wbBySize: Record<string, number>; wbSubject: string;
      wbCategory: string; excelTotal: number; wbTotal: number; diff: number;
      diffPercent: string; isMatched: boolean; wbArticleCount: number; matchMethod: string
    }> = []

    const processedProducts = new Set<number>()

    for (const [pid, agg] of Object.entries(productWbAgg)) {
      const productId = Number(pid)
      processedProducts.add(productId)
      const excelItem = excelByProduct[productId]
      if (!excelItem) continue

      const diff = agg.totalOrders - excelItem.total
      const diffPct = excelItem.total > 0 ? ((diff / excelItem.total) * 100).toFixed(1) : '—'

      productSummary.push({
        productId, productName: excelItem.name, excelSize: excelItem.size,
        wbSize: excelItem.size, wbBySize: agg.bySize,
        wbSubject: [...agg.subjects].join(', '),
        wbCategory: [...agg.categories].join(', ') || [...agg.subjects].join(', '),
        excelTotal: excelItem.total, wbTotal: agg.totalOrders, diff, diffPercent: diffPct,
        isMatched: true, wbArticleCount: agg.articles.length,
        matchMethod: [...agg.methods].join(', '),
      })
    }

    for (const [pid, excelItem] of Object.entries(excelByProduct)) {
      if (!processedProducts.has(Number(pid))) {
        productSummary.push({
          productId: Number(pid), productName: excelItem.name, excelSize: excelItem.size,
          wbSize: '', wbBySize: {}, wbSubject: '', wbCategory: '',
          excelTotal: excelItem.total, wbTotal: 0, diff: -excelItem.total, diffPercent: '—',
          isMatched: false, wbArticleCount: 0, matchMethod: '',
        })
      }
    }

    // Build unmatched WB articles by subject
    const unmatchedKeys = wbArticleKeys.filter((k) => articleToProduct[k] === null)
    const unmatchedBySubject: Array<{
      subject: string; articleCount: number; totalOrders: number; examples: string[]
    }> = []

    if (unmatchedKeys.length > 0) {
      const bySubject: Record<string, { count: number; total: number; examples: string[] }> = {}
      for (const key of unmatchedKeys) {
        const wbItem = wbByArticle[key]
        const subj = wbItem.subject || '(без предмета)'
        if (!bySubject[subj]) bySubject[subj] = { count: 0, total: 0, examples: [] }
        bySubject[subj].count++
        bySubject[subj].total += wbItem.total
        if (bySubject[subj].examples.length < 3) bySubject[subj].examples.push(wbItem.supplierArticle)
      }
      for (const [subject, info] of Object.entries(bySubject)) {
        unmatchedBySubject.push({ subject, articleCount: info.count, totalOrders: info.total, examples: info.examples })
      }
      unmatchedBySubject.sort((a, b) => b.totalOrders - a.totalOrders)
    }

    productSummary.sort((a, b) => {
      if (a.isMatched && !b.isMatched) return -1
      if (!a.isMatched && b.isMatched) return 1
      return a.productName.localeCompare(b.productName)
    })

    const excelGrandTotal = Object.values(excelByProduct).reduce((s, v) => s + v.total, 0)
    const wbGrandTotal = Object.values(wbByArticle).reduce((s, v) => s + v.total, 0)
    const matchedProducts = productSummary.filter((p) => p.isMatched)
    const matchedExcelTotal = matchedProducts.reduce((s, c) => s + c.excelTotal, 0)
    const matchedWbTotal = matchedProducts.reduce((s, c) => s + c.wbTotal, 0)

    return NextResponse.json({
      entrepreneur: { id: entrepreneur.id, name: entrepreneur.name },
      dateRange: { from: filterFrom, to: filterTo },
      dataSource: wbDataSource,
      funnelProductCount,
      wbError,
      totals: {
        excelTotal: excelGrandTotal, wbTotal: wbGrandTotal,
        matchedExcelTotal, matchedWbTotal,
        totalDiff: wbGrandTotal - excelGrandTotal,
        matchedDiff: matchedWbTotal - matchedExcelTotal,
      },
      productSummary,
      unmatchedBySubject,
    })
  } catch (error) {
    console.error('WB compare API error:', error)
    return NextResponse.json({ error: 'Failed to compare data' }, { status: 500 })
  }
}
