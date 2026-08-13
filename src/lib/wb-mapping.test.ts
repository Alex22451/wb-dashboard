import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ARTICLE_OVERRIDES,
  classifyFbsProduct,
  FBS_CLASSIFICATION_SEMANTICS_VERSION,
  findSubjectTypes,
  getWbMappingVersion,
  mapWbOrderToProductKey,
  mapWbOrderToType,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './wb-mapping.ts'

const LEGACY_UNSIZED_PILLOW_MAPPING_VERSION = 'ec945d7e2f076023643242ef35f2a0b666e7419db072e77c954ba24cf0a7553f'

const CURRENT_PRIMARY_MAPPINGS: Array<[string, string]> = [
  ['Подушки внутренние', 'подушка внутренняя'],
  ['Подушки декоративные', 'подушка декоративная'],
  ['Подушки', 'подушка декоративная'],
  ['Наволочки декоративные', 'наволочка декоративная'],
  ['Наволочки', 'наволочка декоративная'],
  ['Карнавальные маски', 'маски'],
  ['Чехлы для бутылей', 'чехлы для бутылей'],
  ['Чехлы для чемоданов', 'чехлы на чемодан'],
  ['Фартуки кухонные', 'фартуки'],
  ['Флаги', 'флаги'],
  ['Коврики пляжные', 'пляжные коврики'],
  ['Декор для одежды', 'шевроны'],
  ['Мешки для обуви', 'мешки для обуви'],
  ['Коврики для мыши', 'коврики для мыши'],
  ['Колышки и скобы садовые', 'колышки для пляжных ковриков'],
  ['Колышки для палаток', 'колышки для пляжных ковриков'],
  ['Брелоки', 'ремувки'],
  ['Пеналы', 'пеналы'],
  ['Гобелены', 'гобелен'],
  ['Аксессуары для фотосессий', 'аксессуары для фотосессии'],
  ['Аксессуары для фотосессии', 'аксессуары для фотосессии'],
  ['Постеры', 'постеры'],
  ['Фотофоны', 'фотофоны'],
  ['Фотофон', 'фотофоны'],
  ['Коврики для намаза', 'коврики для намаза'],
  ['Сумки пляжные', 'сумки пляжные'],
  ['Сумки хозяйственные', 'сумки хозяйственные (шоппер)'],
  ['Сумки-шопперы', 'сумки хозяйственные (шоппер)'],
  ['Сумки', 'сумки пляжные'],
  ['Скатерти', 'скатерти'],
  ['Салфетки', 'салфетки'],
  ['Дорожки кухонные', 'дорожки'],
  ['Снуды', 'снуды'],
  ['Пледы для животных', 'пледы для животных'],
  ['Пледы', 'плед'],
  ['Мягкие игрушки', 'мягкие игрушки'],
  ['Игрушки антистресс', 'игрушки антистресс'],
  ['Кольца для салфеток', 'кольца для салфеток'],
  ['Ткань', 'ткань'],
  ['Ткани для рукоделия', 'ткань'],
]

test('animal blankets use their specific WB category mapping', () => {
  assert.deepEqual(findSubjectTypes('Пледы для животных'), [
    'пледы для животных',
    'плед для животных',
  ])
  assert.equal(
    mapWbOrderToProductKey('Пледы для животных', 'ПледДляЖивотных_100х70', 'Любой бренд'),
    'пледы для животных 100х70',
  )
})

test('animal blanket mapping wins over the partial regular blanket subject', () => {
  assert.equal(
    mapWbOrderToType('Пледы для животных большие', 'animal_blanket', ''),
    'пледы для животных',
  )
})

test('regular blankets map identically for any entrepreneur brand', () => {
  assert.equal(mapWbOrderToType('Пледы', 'Плед_150х200', 'Бренд Бураго'), 'плед')
  assert.equal(mapWbOrderToType('Пледы', 'Плед_150х200', 'Бренд другого ИП'), 'плед')
  assert.deepEqual(findSubjectTypes('Пледы'), ['плед', 'пледы', 'плед флисовый'])
})

test('Burago photo-session accessory subjects keep their own report category', () => {
  assert.deepEqual(findSubjectTypes('Аксессуары для фотосессий'), ['аксессуары для фотосессии'])
  assert.deepEqual(findSubjectTypes('Аксессуары для фотосессии'), ['аксессуары для фотосессии'])
  assert.equal(
    mapWbOrderToProductKey('Аксессуары для фотосессий', 'Фотофон_150х100', 'Бренд Бураго'),
    'аксессуары для фотосессии 150х100',
  )
})

test('posters and photo backgrounds remain separate report categories', () => {
  assert.equal(mapWbOrderToType('Постеры', 'Постер_60х90', 'Бренд Бураго'), 'постеры')
  assert.equal(mapWbOrderToType('Фотофон', 'Фотофон_100х150', 'Бренд Бураго'), 'фотофоны')
  assert.equal(mapWbOrderToType('Фотофоны', 'Фотофон_100х150', 'Бренд Бураго'), 'фотофоны')
  assert.equal(mapWbOrderToType('Неизвестная категория', 'Фотофон_100х150', 'Бренд Бураго'), null)
})

test('pencil cases keep their own report category', () => {
  assert.deepEqual(findSubjectTypes('Пеналы'), ['пеналы'])
  assert.equal(mapWbOrderToType('Пеналы', 'Пенал_20х5', 'Бренд Бураго'), 'пеналы')
  assert.equal(
    mapWbOrderToProductKey('Пеналы школьные', 'Пенал_20х5', 'Бренд Бураго'),
    'пеналы 20х5',
  )
})

test('FBS classification preserves every non-pillow primary subject mapping', () => {
  for (const [subject, productType] of CURRENT_PRIMARY_MAPPINGS) {
    if (productType.startsWith('подушка ')) continue
    const result = classifyFbsProduct({ subject, article: 'обычный артикул', brand: '' })
    assert.equal(result.kind, 'eligible', subject)
    if (result.kind === 'eligible') assert.equal(result.productType, productType, subject)
  }
})

test('FBS classification normalizes decorative pillow size separators', () => {
  for (const article of ['ДЮСПО_40х40', 'ДЮСПО_40x40', 'ДЮСПО_40*40']) {
    assert.deepEqual(
      classifyFbsProduct({ subject: 'Подушки декоративные', article, brand: '' }),
      {
        kind: 'eligible',
        productType: 'подушка декоративная 40х40',
        productDisplayName: 'Подушка декоративная 40х40',
      },
      article,
    )
  }
})

test('FBS classification keeps inner and decorative pillow keys distinct', () => {
  assert.deepEqual(
    classifyFbsProduct({ subject: 'Подушки внутренние', article: 'ДЮСПО_45х45', brand: '' }),
    {
      kind: 'eligible',
      productType: 'подушка внутренняя 45х45',
      productDisplayName: 'Подушка внутренняя 45х45',
    },
  )
  assert.deepEqual(
    classifyFbsProduct({ subject: 'Подушки декоративные', article: 'ДЮСПО_45х45', brand: '' }),
    {
      kind: 'eligible',
      productType: 'подушка декоративная 45х45',
      productDisplayName: 'Подушка декоративная 45х45',
    },
  )
})

test('FBS classification converts pillow short codes and deduplicates equal sizes', () => {
  assert.deepEqual(
    classifyFbsProduct({ subject: 'Подушки внутренние', article: 'ДЮСПО_150_П_', brand: '' }),
    {
      kind: 'eligible',
      productType: 'подушка внутренняя 150х50',
      productDisplayName: 'Подушка внутренняя 150х50',
    },
  )
  assert.deepEqual(
    classifyFbsProduct({ subject: 'Подушки декоративные', article: 'ДЮСПО_40х40_40x40', brand: '' }),
    {
      kind: 'eligible',
      productType: 'подушка декоративная 40х40',
      productDisplayName: 'Подушка декоративная 40х40',
    },
  )
})

test('FBS classification blocks pillows with ambiguous or missing sizes', () => {
  assert.deepEqual(
    classifyFbsProduct({ subject: 'Подушки внутренние', article: 'ДЮСПО_40х40_50х50', brand: '' }),
    { kind: 'blocked_unknown_size' },
  )
  assert.deepEqual(
    classifyFbsProduct({ subject: 'Подушки декоративные', article: 'ДЮСПО', brand: '' }),
    { kind: 'blocked_unknown_size' },
  )
})

test('FBS classification ignores normalized blacklist containment before category mapping', () => {
  assert.deepEqual(
    classifyFbsProduct({ subject: '  КАРТИНЫ ПО НОМЕРАМ большие  ', article: 'Постер_60х90', brand: '' }),
    { kind: 'ignored_blacklist' },
  )
})

test('FBS classification fails closed for empty and implausibly short subjects', () => {
  assert.deepEqual(
    classifyFbsProduct({ subject: '   ', article: 'ДЮСПО_40х40', brand: '' }),
    { kind: 'blocked_unknown_category' },
  )
  assert.deepEqual(
    classifyFbsProduct({ subject: 'По', article: 'Постер_60х90', brand: '' }),
    { kind: 'blocked_unknown_category' },
  )
})

test('FBS classification blocks unknown subjects', () => {
  assert.deepEqual(
    classifyFbsProduct({ subject: 'Совершенно новая категория', article: 'Артикул', brand: '' }),
    { kind: 'blocked_unknown_category' },
  )
})

test('FBS classification uses a readable default label and the approved tapestry label', () => {
  assert.deepEqual(
    classifyFbsProduct({ subject: 'Пледы', article: 'Плед_150х200', brand: '' }),
    { kind: 'eligible', productType: 'плед', productDisplayName: 'Плед' },
  )
  assert.deepEqual(
    classifyFbsProduct({ subject: 'Гобелены', article: 'Гобелен_100х150', brand: '' }),
    { kind: 'eligible', productType: 'гобелен', productDisplayName: 'Гобелены' },
  )
})

test('mapping version is a stable SHA-256 digest for unchanged mapping tables', () => {
  const first = getWbMappingVersion()
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(getWbMappingVersion(), first)
})

test('mapping version covers the sized-pillow FBS classification semantics', () => {
  assert.equal(FBS_CLASSIFICATION_SEMANTICS_VERSION, 'sized-pillows-v1')
  assert.notEqual(getWbMappingVersion(), LEGACY_UNSIZED_PILLOW_MAPPING_VERSION)
})

test('mapping version is sensitive to the actual article override order', () => {
  const before = getWbMappingVersion()
  const first = ARTICLE_OVERRIDES[0]
  const second = ARTICLE_OVERRIDES[1]

  try {
    ARTICLE_OVERRIDES[0] = second
    ARTICLE_OVERRIDES[1] = first
    assert.notEqual(getWbMappingVersion(), before)
    assert.equal(getWbMappingVersion(), getWbMappingVersion())
  } finally {
    ARTICLE_OVERRIDES[0] = first
    ARTICLE_OVERRIDES[1] = second
  }
})
