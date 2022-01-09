export const name = 'Issuance - Mintable tokens';
export const version = '0.2.1';
export const license = 'MIT';
export const description =
  'This adapter tracks issuance of SWAPR token by simply querying the historical supply of' +
  'the token (default 7 days prior), and comparing it to the current supply.'

interface Token {
  id: string
  name: string
  address: string
  excludeAddresses?: string[]
  coinGeckoId: string
  icon?: string
  iconType?: string
  issuanceDescription?: string
  website?: string
}

const token: Token = {
    id: 'swapr',
    name: 'Swapr',
    address: '0x6cAcDB97e3fC8136805a9E7c342d866ab77D0957', // SWAPR Mainnet
    coinGeckoId: 'swapr',
    icon: 'QmYPqFXTqYcynD5hT9sZbsoPZXbvjSfL7WWQPL7EwYAyE5', // NOT THE CORRECT ONE -> TO BE FIXED
    issuanceDescription: 'DXdao is issuing DXD token through a continuous fundraiser and exchanged for ETH following a bonding curve model.',
    website: 'https://swapr.eth.link/'
}

export async function setup(sdk: Context) {

    /* @notice calls totalSupply of the contract at a specific date
       @param address, address of the contract
       @param date, date until which we want to get supply value
       @returns total token supply
    */
    const getSupply = async (address: string, date: string) => {
        const tokenContract = sdk.ethers.getERC20Contract(address)

        const supply = await tokenContract.totalSupply({ blockTag: date })

        const decimalUnit = 1e18 // TODO: query decimals

        return supply.toString() / decimalUnit
    }

    /* @notice calculates the average value of tokens minted in the supplied period
       @param address, address of the contract
       @param coinGeckoId, id of the token in coingecko in order to retrieve the current price
       @param daysAgo, number of days we want to consider for the avg calculation, defaults to 7
       @returns average number
    */
    const getIssuanceData = (address: string, coinGeckoId: string, daysAgo: number = 7) => async () => {
        const today = sdk.date.formatDate(new Date())
        const periodAgo = sdk.date.offsetDaysFormatted(today, - daysAgo)

        const [price, todaySupply, periodAgoSupply] = await Promise.all([
            sdk.coinGecko.getCurrentPrice(coinGeckoId),
            getSupply(address, today),
            getSupply(address, periodAgo),
        ])
        // sdk.log.log(`${todaySupply}, ${periodAgoSupply}`)
        // sdk.log.log(`price: ${price}`)

        const periodIssuance = todaySupply - periodAgoSupply

        const sevenDayAvg = periodIssuance / daysAgo * price
        return sevenDayAvg
    }

    /* @notice calculates rate in which price has chaged for a specific period
       @param address, address of the contract
       @param daysAgo, number of days we want to consider for the avg calculation, defaults to 7
       @returns rate, number
    */
    const getInflationRate = (address: string, daysAgo: number = 7) => async () => {
        const today = sdk.date.formatDate(new Date())
        const periodAgo = sdk.date.offsetDaysFormatted(today, - daysAgo)

        const [todaySupply, periodAgoSupply] = await Promise.all([
            getSupply(address, today),
            getSupply(address, periodAgo),
        ])

        return (todaySupply / periodAgoSupply) - 1
    }

    sdk.register({
        id: token.id,
        queries: {
            issuance7DayAvgUSD: getIssuanceData(token.address, token.coinGeckoId, 7),
            issuanceRateCurrent: getInflationRate(token.address, 7),
        },
        metadata: {
            icon: token.icon && sdk.ipfs.getDataURILoader(token.icon, token.iconType || 'image/svg+xml'),
            category: 'app',
            name: token.name,
            issuanceDescription: token.issuanceDescription || null,
            website: token.website || null,
        },
    })
}
