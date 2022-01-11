export const name = 'Issuance - Mintable tokens';
export const version = '0.2.1';
export const license = 'MIT';
export const description =
  'This adapter tracks issuance of SWPR token by simply querying the historical supply of' +
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
    excludeAddresses: [
        "0x519b70055af55a007110b4ff99b0ea33071c720a", // DAO's avatar address on mainnet
        "0x0000000000000000000000000000000000001234", // AddressZero
        "0x2b058af96175A847Bf3E5457B3A702F807daDdFd"
    ],
    icon: 'QmYPqFXTqYcynD5hT9sZbsoPZXbvjSfL7WWQPL7EwYAyE5', // NOT THE CORRECT ONE -> TO BE FIXED
    issuanceDescription: 'DXdao is issuing DXD token through a continuous fundraiser and exchanged for ETH following a bonding curve model.',
    website: 'https://swapr.eth.link/'
}

export async function setup(sdk: Context) {

    /* @notice calls totalSupply of the contract at a specific date
       @param address, address of the contract
       @param excludeAddresses, array of addresses
       @param date, date until which we want to get supply value
       @returns total token supply
    */
    const getSupply = async (token: string, date: string, excludeAddresses: string[] = []) => {
        const tokenContract = sdk.ethers.getERC20Contract(token)

        const [supply, excludeBalances] = await Promise.all([
            tokenContract.totalSupply({ blockTag: date }),
            Promise.all(excludeAddresses.map((address: string) => tokenContract.balanceOf(address, { blockTag: date }))),
        ])

        const decimalUnit = 1e18 // TODO: query decimals

        const excludeTotal = excludeBalances.reduce((total: number, balance: any) => total + (balance.toString() / decimalUnit), 0)

        return (supply.toString() / decimalUnit) - excludeTotal
    }

    /* @notice calculates the average of tokens minted in the supplied period
       @param address, address of the contract
       @param excludeAddresses, array of addresses
       @param coinGeckoId, id of the token in coingecko in order to retrieve the current price
       @param daysAgo, number of days we want to consider for the avg calculation, defaults to 7
       @returns average number
    */
    const getIssuanceData = (address: string, coinGeckoId: string, excludeAddresses: string[]) => async () => {
        const today = sdk.date.formatDate(new Date())
        const weekAgo = sdk.date.offsetDaysFormatted(today, -7)

        const [price, todaySupply, weekAgoSupply] = await Promise.all([
            sdk.coinGecko.getCurrentPrice(coinGeckoId),
            getSupply(address, today, excludeAddresses),
            getSupply(address, weekAgo, excludeAddresses),
        ])
        sdk.log.log(`${todaySupply}, ${weekAgoSupply}`)

        const oneWeekIssuance = todaySupply - weekAgoSupply

        const sevenDayAvg = oneWeekIssuance / 7 * price
        return sevenDayAvg
    }

    /* @notice calculates rate in which price has chaged for a specific period
       @param address, address of the contract
       @param excludeAddresses, array of addresses
       @param daysAgo, number of days we want to consider for the avg calculation, defaults to 7
       @returns rate, number
    */
    const getInflationRate = (address: string, excludeAddresses: string[]) => async () => {
        const today = sdk.date.formatDate(new Date())
        const weekAgo = sdk.date.offsetDaysFormatted(today, -7)

        const [todaySupply, weekAgoSupply] = await Promise.all([
            getSupply(address, today, excludeAddresses),
            getSupply(address, weekAgo, excludeAddresses),
        ])

        return ((todaySupply / weekAgoSupply) - 1) * 52
    }

    /* @notice total circulating tokens today
       @param address, address of the contract
       @param excludeAddresses, array of addresses
       @returns number
    */
    const getSupplyToday = (address: string, excludeAddresses: string[]) => async () => {
        const today = sdk.date.formatDate(new Date())
        return await getSupply(address, today, excludeAddresses)
    }

    sdk.register({
        id: token.id,
        queries: {
            circulatingSupply: getSupplyToday(token.address, token.excludeAddresses),
            issuance7DayAvgUSD: getIssuanceData(token.address, token.coinGeckoId, token.excludeAddresses),
            issuanceRateCurrent: getInflationRate(token.address, token.excludeAddresses),
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
