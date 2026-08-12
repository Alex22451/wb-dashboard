export type FbsBotStatusClientErrorCode = 'forbidden' | 'invalid_response'

const SAFE_ERROR_MESSAGES: Record<FbsBotStatusClientErrorCode, string> = {
  forbidden: 'Недостаточно прав для просмотра статуса FBS-бота.',
  invalid_response: 'Сервер вернул некорректный статус FBS-бота.',
}

const GENERIC_ERROR_MESSAGE = 'Не удалось обновить статус FBS-бота.'

export class FbsBotStatusClientError extends Error {
  readonly code: FbsBotStatusClientErrorCode

  constructor(code: FbsBotStatusClientErrorCode) {
    super(code)
    this.name = 'FbsBotStatusClientError'
    this.code = code
  }
}

export function toSafeFbsBotStatusErrorMessage(error: unknown): string {
  return error instanceof FbsBotStatusClientError
    ? SAFE_ERROR_MESSAGES[error.code]
    : GENERIC_ERROR_MESSAGE
}
