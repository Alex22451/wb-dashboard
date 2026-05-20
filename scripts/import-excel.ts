import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const db = new PrismaClient({ log: ['warn', 'error'] })

const ENTREPRENEUR_SHEETS = [
  'Бураго Т.В.',
  'Боев Ф.В.',
  'Масляков Л.А.',
  'Масляков В.А.',
  'Масляков А.А.',
  'Зубахин А.В.',
  'Зубахина Н.В.',
]

function parseDate(val: any, XLSX: any): Date | null {
  if (val instanceof Date) return val
  if (typeof val === 'number' && val > 40000) {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }
  return null
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function main() {
  const uploadDir = path.join(process.cwd(), 'upload')
  const files = fs.readdirSync(uploadDir).filter(f => f.endsWith('.xlsx'))
  if (files.length === 0) {
    console.error('No .xlsx files found')
    process.exit(1)
  }
  const filePath = path.join(uploadDir, files[0])
  console.log(`Loading: ${files[0]}`)

  const xlsxModule = await import('xlsx')
  const XLSX = (xlsxModule as any).default ?? xlsxModule
  const wb = XLSX.readFile(filePath)
  
  const allProductNames = new Set<string>()
  const sheetData: Record<string, { dates: Date[]; products: { name: string; quantities: (number | null)[] }[] }> = {}
  
  for (const sheetName of ENTREPRENEUR_SHEETS) {
    console.log(`Parsing: ${sheetName}`)
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
    if (data.length < 4) continue
    
    const dateRow = data[1] || []
    const dates: Date[] = []
    for (let c = 1; c < dateRow.length; c++) {
      const d = parseDate(dateRow[c], XLSX)
      if (d) dates.push(d)
    }
    
    const products: { name: string; quantities: (number | null)[] }[] = []
    for (let r = 3; r < data.length; r++) {
      const row = data[r]
      if (!row || !row[0]) continue
      const name = String(row[0]).trim()
      if (!name || name === 'ИТОГО' || name === 'Наименование') continue
      
      allProductNames.add(name)
      const quantities: (number | null)[] = []
      for (let c = 0; c < dates.length; c++) {
        const val = row[c + 1]
        if (val === null || val === undefined || val === '' || val === '\xa0' || val === '\u00a0') {
          quantities.push(null)
        } else if (typeof val === 'number') {
          quantities.push(val)
        } else {
          quantities.push(null)
        }
      }
      products.push({ name, quantities })
    }
    
    sheetData[sheetName] = { dates, products }
    console.log(`  ${dates.length} dates, ${products.length} products`)
  }
  
  console.log(`Total unique products: ${allProductNames.size}`)

  await db.$executeRawUnsafe(`ALTER TABLE Entrepreneur ADD COLUMN wbPromotionApiKey TEXT`).catch(() => null)

  let existingKeys: Array<{ name: string; wbApiKey: string | null; wbPromotionApiKey: string | null }>
  try {
    existingKeys = await db.$queryRaw<Array<{ name: string; wbApiKey: string | null; wbPromotionApiKey: string | null }>>`
      SELECT name, wbApiKey, wbPromotionApiKey FROM Entrepreneur WHERE wbApiKey IS NOT NULL OR wbPromotionApiKey IS NOT NULL
    `
  } catch {
    const legacyKeys = await db.$queryRaw<Array<{ name: string; wbApiKey: string | null }>>`
      SELECT name, wbApiKey FROM Entrepreneur WHERE wbApiKey IS NOT NULL AND wbApiKey != ''
    `
    existingKeys = legacyKeys.map((row) => ({ ...row, wbPromotionApiKey: null }))
  }
  const apiKeyByName = new Map(existingKeys.map((row) => [row.name, row.wbApiKey]))
  const promotionApiKeyByName = new Map(existingKeys.map((row) => [row.name, row.wbPromotionApiKey]))
  
  // Clear existing data using raw SQL (fast)
  console.log('Clearing existing data...')
  await db.$executeRawUnsafe(`DELETE FROM DailyOrder`)
  await db.$executeRawUnsafe(`DELETE FROM AdSpend`)
  await db.$executeRawUnsafe(`DELETE FROM Product`)
  await db.$executeRawUnsafe(`DELETE FROM Entrepreneur`)
  
  // Reset autoincrement
  await db.$executeRawUnsafe(`DELETE FROM sqlite_sequence`)
  
  // Seed entrepreneurs using raw SQL
  console.log('Seeding entrepreneurs...')
  const entrepreneurMap: Record<string, number> = {}
  for (let i = 0; i < ENTREPRENEUR_SHEETS.length; i++) {
    const name = ENTREPRENEUR_SHEETS[i]
    const apiKey = apiKeyByName.get(name)
    const promotionApiKey = promotionApiKeyByName.get(name)
    if (apiKey || promotionApiKey) {
      await db.$executeRaw`INSERT INTO Entrepreneur (id, name, wbApiKey, wbPromotionApiKey) VALUES (${i + 1}, ${name}, ${apiKey || null}, ${promotionApiKey || null})`
    } else {
      await db.$executeRaw`INSERT INTO Entrepreneur (id, name) VALUES (${i + 1}, ${name})`
    }
    entrepreneurMap[name] = i + 1
  }
  
  // Seed products using raw SQL
  console.log('Seeding products...')
  const productNames = Array.from(allProductNames)
  const productMap: Record<string, number> = {}
  for (let i = 0; i < productNames.length; i++) {
    const name = productNames[i]
    await db.$executeRawUnsafe(`INSERT INTO Product (id, name) VALUES (${i + 1}, '${name.replace(/'/g, "''")}')`)
    productMap[name] = i + 1
  }
  
  // Seed daily orders using raw SQL bulk INSERT (much faster)
  console.log('Seeding daily orders...')
  let totalOrders = 0
  const BATCH_SIZE = 5000
  let values: string[] = []
  
  for (const sheetName of ENTREPRENEUR_SHEETS) {
    const sData = sheetData[sheetName]
    if (!sData) continue
    const entId = entrepreneurMap[sheetName]
    
    for (const product of sData.products) {
      const prodId = productMap[product.name]
      if (!prodId) continue
      
      for (let i = 0; i < sData.dates.length; i++) {
        const qty = product.quantities[i]
        if (qty === null || qty === 0) continue
        
        values.push(`(${entId}, ${prodId}, '${formatDate(sData.dates[i])}', ${qty})`)
        
        if (values.length >= BATCH_SIZE) {
          await db.$executeRawUnsafe(`INSERT INTO DailyOrder (entrepreneurId, productId, date, quantity) VALUES ${values.join(',')}`)
          totalOrders += values.length
          console.log(`  Inserted ${totalOrders} orders...`)
          values = []
        }
      }
    }
  }
  
  if (values.length > 0) {
    await db.$executeRawUnsafe(`INSERT INTO DailyOrder (entrepreneurId, productId, date, quantity) VALUES ${values.join(',')}`)
    totalOrders += values.length
  }
  
  console.log(`Seeded ${totalOrders} daily orders`)
  
  // Seed ad spend
  console.log('Seeding ad spend...')
  const adSpendSheet = wb.Sheets['Расходы на рекламу']
  if (adSpendSheet) {
    const adData: any[][] = XLSX.utils.sheet_to_json(adSpendSheet, { header: 1, defval: null })
    
    const adSpendMap: Record<string, string> = {
      'Бураго': 'Бураго Т.В.',
      'Зубахин': 'Зубахин А.В.',
      'Масляков Алексей': 'Масляков А.А.',
      'Масляков Василий': 'Масляков В.А.',
      'Масляков Лев': 'Масляков Л.А.',
      'Зубахина Наталья': 'Зубахина Н.В.',
    }
    
    const adValues: string[] = []
    
    for (let r = 1; r < adData.length; r++) {
      const row = adData[r]
      if (!row) continue
      const shortName = String(row[3] || '').trim()
      const budget = row[2]
      const fullEntName = adSpendMap[shortName]
      if (!fullEntName) continue
      const entId = entrepreneurMap[fullEntName]
      if (!entId) continue
      
      for (let m = 0; m < 12; m++) {
        const actual = row[4 + m]
        if (actual && typeof actual === 'number' && actual > 0) {
          const budgetVal = typeof budget === 'number' ? budget : 'NULL'
          adValues.push(`(${entId}, 2025, ${m + 1}, ${budgetVal}, ${actual})`)
        }
      }
    }
    
    if (adValues.length > 0) {
      await db.$executeRawUnsafe(`INSERT INTO AdSpend (entrepreneurId, year, month, budget, actual) VALUES ${adValues.join(',')}`)
      console.log(`Seeded ${adValues.length} ad spend records`)
    }
  }
  
  console.log('Done!')
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
