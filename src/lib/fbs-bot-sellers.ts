export const FBS_BOT_SELLERS = [
  { sellerId: 'zubakhina', sellerDisplayName: 'Зубахина' },
  { sellerId: 'zubakhin-andrey', sellerDisplayName: 'Зубахин Андрей' },
  { sellerId: 'maslyakov-aa', sellerDisplayName: 'Масляков А.А.' },
  { sellerId: 'burago', sellerDisplayName: 'Бураго' },
  { sellerId: 'maslyakov-lev', sellerDisplayName: 'Масляков Лев' },
] as const

export type FbsBotSellerIdentity = (typeof FBS_BOT_SELLERS)[number]
export type FbsBotSellerId = FbsBotSellerIdentity['sellerId']

export const FBS_BOT_SELLER_IDS = FBS_BOT_SELLERS.map(seller => seller.sellerId)

export const FBS_BOT_SELLER_DISPLAY_NAMES = Object.fromEntries(
  FBS_BOT_SELLERS.map(seller => [seller.sellerId, seller.sellerDisplayName]),
) as Record<FbsBotSellerId, FbsBotSellerIdentity['sellerDisplayName']>
