import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findSubjectTypes,
  mapWbOrderToProductKey,
  mapWbOrderToType,
// Node's native TypeScript runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for this standalone test command.
} from './wb-mapping.ts'

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
