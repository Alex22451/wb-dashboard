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
