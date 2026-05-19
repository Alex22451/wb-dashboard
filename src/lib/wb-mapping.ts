// ─── Shared WB Mapping Module ──────────────────────────────────────────
// Extracted from wb-compare/route.ts for reuse across all WB data endpoints

// ─── WB Subject → Excel Type Mapping ──────────────────────────────────
export const SUBJECT_TO_EXCEL_TYPES: Array<{ subject: string; types: string[] }> = [
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
  { subject: 'Декор для одежды', types: ['шевроны'] },
  { subject: 'Мешки для обуви', types: ['мешки для обуви', 'чехол для обуви', 'шоппер для обуви'] },
  { subject: 'Коврики для мыши', types: ['коврики для мыши'] },
  { subject: 'Колышки и скобы садовые', types: ['колышки для пляжных ковриков'] },
  { subject: 'Колышки для палаток', types: ['колышки для пляжных ковриков'] },
  { subject: 'Брелоки', types: ['ремувки', 'брелоки'] },
  { subject: 'Гобелены', types: ['гобелен', 'фотофоны'] },
  { subject: 'Фотофоны', types: ['фотофоны', 'гобелен'] },
  { subject: 'Мочалки', types: [] },
  { subject: 'Коврики для намаза', types: ['коврики для намаза'] },
  { subject: 'Сумки пляжные', types: ['сумки пляжные'] },
  { subject: 'Сумки хозяйственные', types: ['сумки хозяйственные (шоппер)'] },
  { subject: 'Сумки-шопперы', types: ['сумки хозяйственные (шоппер)', 'шоппер для обуви'] },
  { subject: 'Сумки', types: ['сумки пляжные', 'сумки хозяйственные (шоппер)', 'шоппер для обуви'] },
  { subject: 'Скатерти', types: ['скатерти', 'дорожки'] },
  { subject: 'Салфетки', types: ['салфетки', 'салфетки с вышивкой'] },
  { subject: 'Дорожки кухонные', types: ['дорожки'] },
  // Исключены: Наборы для создания слепков, Наборы для рисования, Стаканы — нет в Excel
  // Эти категории перенесены в EXCLUDED_WB_SUBJECTS
  { subject: 'Пледы', types: ['плед', 'плед флисовый'] },
  { subject: 'Мягкие игрушки', types: ['мягкие игрушки', 'игрушки антистресс'] },
  { subject: 'Игрушки антистресс', types: ['игрушки антистресс', 'мягкие игрушки'] },
  { subject: 'Кольца для салфеток', types: ['кольца для салфеток'] },
  { subject: 'Ткань', types: ['ткань'] },
  { subject: 'Ткани для рукоделия', types: ['ткань'] },
]

// WB subject categories to exclude entirely
export const EXCLUDED_WB_SUBJECTS: string[] = [
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
interface ArticleOverride {
  subjectContains: string
  articlePattern: RegExp
  brandPattern?: RegExp
  exactSubject?: boolean
  excelType: string
  priority: number
}

export const ARTICLE_OVERRIDES: ArticleOverride[] = [
  { subjectContains: 'декор для одежды', articlePattern: /шеврон/i, excelType: 'шевроны', priority: 110 },
  { subjectContains: 'декор для одежды', articlePattern: /./i, excelType: 'шевроны', priority: 30 },

  { subjectContains: 'брелоки', articlePattern: /./i, brandPattern: /ремувикс|ремув/i, excelType: 'ремувки', priority: 120 },
  { subjectContains: 'брелоки', articlePattern: /./i, excelType: 'ремувки', priority: 30 },

  { subjectContains: 'мешки для обуви', articlePattern: /чехол/i, excelType: 'чехол для обуви', priority: 110 },
  { subjectContains: 'мешки для обуви', articlePattern: /шоппер.*обув|обув.*шоппер/i, excelType: 'шоппер для обуви', priority: 111 },
  { subjectContains: 'мешки для обуви', articlePattern: /шоппер/i, excelType: 'шоппер для обуви', priority: 100 },
  { subjectContains: 'мешки для обуви', articlePattern: /мешок/i, excelType: 'мешки для обуви', priority: 105 },
  { subjectContains: 'мешки для обуви', articlePattern: /./i, excelType: 'мешки для обуви', priority: 20 },

  { subjectContains: 'салфетки', articlePattern: /салфеткавышивк|вышивк/i, excelType: 'салфетки с вышивкой', priority: 110, exactSubject: true },
  { subjectContains: 'салфетки', articlePattern: /салфеткавкорзин|вкорзин/i, excelType: 'салфетки', priority: 105, exactSubject: true },
  { subjectContains: 'салфетки', articlePattern: /./i, excelType: 'салфетки', priority: 20, exactSubject: true },

  { subjectContains: 'сумки-шопперы', articlePattern: /обувь/i, excelType: 'шоппер для обуви', priority: 110 },
  { subjectContains: 'сумки-шопперы', articlePattern: /шоппер.*обув|обув.*шоппер/i, excelType: 'шоппер для обуви', priority: 111 },
  { subjectContains: 'сумки-шопперы', articlePattern: /./i, excelType: 'сумки хозяйственные (шоппер)', priority: 20 },

  { subjectContains: 'скатерти', articlePattern: /дорожк/i, excelType: 'дорожки', priority: 110, exactSubject: true },
  { subjectContains: 'скатерти', articlePattern: /./i, excelType: 'скатерти', priority: 20, exactSubject: true },

  { subjectContains: 'сумки', articlePattern: /сумкапляж|пляжоксфорд|сумкапляжоксфорд|сумкапляждвунитк/i, excelType: 'сумки пляжные', priority: 110, exactSubject: true },
  { subjectContains: 'сумки', articlePattern: /шоппер.*обув|обув.*шоппер/i, excelType: 'шоппер для обуви', priority: 109, exactSubject: true },
  { subjectContains: 'сумки', articlePattern: /./i, excelType: 'сумки пляжные', priority: 20, exactSubject: true },

  { subjectContains: 'гобелены', articlePattern: /./i, excelType: 'гобелен', priority: 20 },
  { subjectContains: 'фотофоны', articlePattern: /гобелен/i, excelType: 'гобелен', priority: 110 },
  { subjectContains: 'фотофоны', articlePattern: /./i, excelType: 'фотофоны', priority: 20 },

  { subjectContains: 'подушки внутренние', articlePattern: /./i, excelType: 'подушка внутренняя', priority: 20 },
  { subjectContains: 'подушки декоративные', articlePattern: /внутренняя/i, excelType: 'подушка внутренняя', priority: 110 },
  { subjectContains: 'подушки декоративные', articlePattern: /./i, excelType: 'подушка декоративная', priority: 20 },

  { subjectContains: 'наволочки декоративные', articlePattern: /подсублим|сублим/i, excelType: 'наволочки под сублимацию', priority: 110 },
  { subjectContains: 'наволочки декоративные', articlePattern: /./i, excelType: 'наволочка декоративная', priority: 20 },

  { subjectContains: 'игрушки антистресс', articlePattern: /антистресс/i, excelType: 'игрушки антистресс', priority: 100 },
  { subjectContains: 'игрушки антистресс', articlePattern: /./i, excelType: 'игрушки антистресс', priority: 20 },
  { subjectContains: 'мягкие игрушки', articlePattern: /./i, excelType: 'мягкие игрушки', priority: 20 },

  // Убраны: 'набор для слепков' и 'набор для рисования' — этих категорий нет в Excel
]

// ─── Find matching subject types ──────────────────────────────────
export function findSubjectTypes(wbSubject: string): string[] {
  const subjectLower = wbSubject.toLowerCase()

  const exactMatch = SUBJECT_TO_EXCEL_TYPES.find(e => e.subject.toLowerCase() === subjectLower)
  if (exactMatch) return exactMatch.types

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
export function typeKeyMatches(typeKey: string, targetType: string): boolean {
  if (typeKey === targetType) return true
  if (typeKey.includes(targetType) || targetType.includes(typeKey)) return true
  return false
}

// ─── Extract WB size from article ──────────────────────────────────
// subject is used to apply category-specific logic (e.g. "набор" detection)
export function extractWbSize(article: string, subject?: string): string {
  const subjectLower = (subject || '').toLowerCase()
  const articleNorm = article.toLowerCase().replace(/_/g, '').replace(/\s/g, '')
  const isDorozhki = subjectLower.includes('дорожки') || subjectLower.includes('дорожк')
  const isSalfetki = subjectLower.includes('салфетк')

  // ─── Category-specific: "набор" detection for дорожки and салфетки ───
  if (isDorozhki || isSalfetki) {
    // Check for "набор" in article — these get size label "набор"
    if (articleNorm.includes('набор')) {
      // Special case: салфетки 40х40 with 6шт/4шт → "набор 6 шт" / "набор 4 шт"
      if (isSalfetki) {
        const has40x40 = /40\s*[хx*]\s*40/.test(articleNorm)
        if (has40x40) {
          const match6 = articleNorm.match(/6\s*шт/i)
          if (match6) return 'набор 6 шт'
          const match4 = articleNorm.match(/4\s*шт/i)
          if (match4) return 'набор 4 шт'
        }
      }
      // Дорожки наборы: "набор220см+6шт" → "набор 4шт" (4 изделия в заказе)
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

  // ─── General size extraction ───
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
  // Short codes for наволочки: _150_Н_ → 150х50, _90_Н_ → 90х30
  const shortNav = article.match(/_(\d{2,3})_[Нн]_/)
  if (shortNav) {
    const w = shortNav[1]
    if (w === '150') return '150х50'
    if (w === '120') return '120х40'
    if (w === '90') return '90х30'
    return `${w}х${w}`
  }
  // Short codes for подушки: _150_П_ → 150х50, _90_П_ → 90х30
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

// ─── Normalize size ────────────────────────────────────────────────
export function normalizeSize(size: string): string {
  return size.replace(/[*x]/g, 'х').toLowerCase().trim()
}

// ─── Extract pack quantity ─────────────────────────────────────────
export function extractPackQty(name: string): string {
  const match = name.match(/(\d+)\s*шт/i)
  return match ? match[1] : ''
}

// ─── Extract items multiplier for production load ───────────────────
// Determines how many physical items one order contains.
// "салфетки набор 6 шт" → 6 items per order
// "дорожки набор 4шт" → 4 items per order
// "подушка декоративная 45х45" → 1 item per order
export function extractItemsMultiplier(productName: string): number {
  const lower = productName.toLowerCase()
  // Match patterns like "6 шт", "4шт", "2 шт" in product name
  const match = lower.match(/(\d+)\s*шт/i)
  if (match) {
    const n = parseInt(match[1])
    if (n >= 1 && n <= 100) return n
  }
  // Default: 1 item per order
  return 1
}

// ─── WB API Request with minimal retry ──────────────────────────────────
// Only retry once on 429 with a long delay — do NOT aggressively retry
export async function fetchWbApi(url: string, options: RequestInit, maxRetries = 1): Promise<Response> {
  const response = await fetch(url, options)
  if (response.status === 429 || response.status === 461) {
    if (maxRetries > 0) {
      // Wait 10 seconds and try once more
      console.log(`WB API rate limited (429), waiting 10s before single retry`)
      await new Promise(resolve => setTimeout(resolve, 10000))
      return await fetch(url, options)
    }
  }
  return response
}

// ─── Filter records to date range (Moscow timezone) ──────────────────
// Converts UTC dates to Moscow time (UTC+3) before filtering,
// so orders placed at 01:00 MSK (22:00 UTC prev day) are counted for the correct MSK date.
// Also excludes cancelled orders (isCancel=true) when excludeCancelled=true.
export function filterToDateRange(records: any[], filterFrom: string, filterTo: string, excludeCancelled = false): any[] {
  const MSK_OFFSET_MS = 3 * 60 * 60 * 1000

  return records.filter((o: any) => {
    // Exclude cancelled orders (отмены и отказы)
    if (excludeCancelled && o.isCancel === true) return false

    // Convert UTC date to Moscow date
    const dateStr = o.date
    if (!dateStr) return false

    let mskDate: string
    if (dateStr.includes('T')) {
      // Parse as ISO date and shift to Moscow timezone
      const utcMs = new Date(dateStr).getTime()
      const mskMs = utcMs + MSK_OFFSET_MS
      mskDate = new Date(mskMs).toISOString().substring(0, 10)
    } else {
      // Already just a date string (YYYY-MM-DD) — assume it's already correct
      mskDate = dateStr.substring(0, 10)
    }

    if (mskDate < filterFrom || mskDate > filterTo) return false
    return true
  })
}

// ─── Simplified mapping: WB order → product type name ──────────────
// Given a WB order's subject, article, and brand,
// return the mapped product type name (like "мешки для обуви", "шевроны", etc.)
export function mapWbOrderToType(subject: string, article: string, brand: string): string | null {
  const subjectLower = subject.toLowerCase()
  const articleNorm = article.toLowerCase().replace(/_/g, '').replace(/\s/g, '')
  const brandLower = (brand || '').toLowerCase()

  // EXCLUDED subjects (Картины, Алмазная мозаика, etc.) are filtered out
  // BEFORE this function is called — see wb-data/route.ts

  // 1. Get possible types from subject mapping
  const possibleTypes = findSubjectTypes(subject)
  if (possibleTypes.length === 0) {
    // Subject not in mapping — skip this order entirely
    // Only categories explicitly listed in SUBJECT_TO_EXCEL_TYPES are allowed
    return null
  }

  // 3. Check article/brand keyword overrides (simplified - no Excel data needed)
  const matchingOverrides = ARTICLE_OVERRIDES
    .filter(rule => rule.exactSubject ? subjectLower === rule.subjectContains : subjectLower.includes(rule.subjectContains))
    .filter(rule => rule.articlePattern.test(articleNorm))
    .filter(rule => !rule.brandPattern || rule.brandPattern.test(brandLower))
    .sort((a, b) => b.priority - a.priority)

  if (matchingOverrides.length > 0) {
    return matchingOverrides[0].excelType
  }

  // 4. Return the first (primary) type from subject mapping
  return possibleTypes[0]
}

// ─── Full mapping: WB order → product key with size ──────────────
// Returns "type + size" like "подушка декоративная 45х45" or "шевроны 8х5"
// If no size extracted, returns just the type (like "коврики для намаза")
// Returns null if the subject is not in the allowed mapping
export function mapWbOrderToProductKey(subject: string, article: string, brand: string, techSize?: string): string | null {
  const productType = mapWbOrderToType(subject, article, brand)
  if (!productType) return null

  // Try to extract size from article first (most reliable)
  let size = extractWbSize(article, subject)

  // If article didn't yield a size, try techSize from WB API order data
  if (!size && techSize) {
    // techSize can be like "45х45", "150х50", or just a clothing size like "S", "M"
    const techNorm = techSize.trim()
    const techMatch = techNorm.match(/^(\d{1,3})\s*[хx*]\s*(\d{1,3})$/i)
    if (techMatch) {
      size = `${techMatch[1]}х${techMatch[2]}`
    }
  }

  if (size) {
    return `${productType} ${size}`
  }
  return productType
}
