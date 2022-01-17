export const name = 'Issuance - Mintable tokens';
export const version = '0.2.1';
export const license = 'MIT';
export const description =
  'This adapter tracks issuance of SWPR token by simply querying the historical supply of' +
  'the token (default 7 days prior), and comparing it to the current supply.'

type AddressVault = {
  [key: string]: string;
};

interface AddressExcludeVault {
  [key: string]: string[];
};

const tokenAddresses: AddressVault = {
    "ethereum": "0x6cAcDB97e3fC8136805a9E7c342d866ab77D0957",    // SWAPR Mainnet
    "arbitrum-one": "0xdE903E2712288A1dA82942DDdF2c20529565aC30" // SWAPR Arbitrum One
}

const excludeAddresses: AddressExcludeVault = {
    "ethereum": [
        "0x519b70055af55a007110b4ff99b0ea33071c720a", // DAO's avatar address on mainnet
        "0x0000000000000000000000000000000000000000" // AddressZero
    ],
    "arbitrum-one": [
        "0x2B240b523f69b9aF3adb1C5924F6dB849683A394", // DAO's avatar address on arb1
        "0x3172eDDa6ff8B2b2Fa7FeD40EE1fD92F1F4dd424", // DAO's Swapr wallet scheme address on arb1
        "0x2b058af96175A847Bf3E5457B3A702F807daDdFd"
    ]
}

interface Token {
  id: string
  name: string
  address: AddressVault
  excludeAddresses: AddressExcludeVault
  coinGeckoId: string
  icon?: string
  iconType?: string
  issuanceDescription?: string
  website?: string
}

const token: Token = {
    id: 'swapr',
    name: 'Swapr',
    address: tokenAddresses,
    coinGeckoId: 'swapr',
    excludeAddresses: excludeAddresses,
    icon: 'QmYPqFXTqYcynD5hT9sZbsoPZXbvjSfL7WWQPL7EwYAyE5', // NOT THE CORRECT ONE -> TO BE FIXED
    issuanceDescription: 'DXdao is issuing DXD token through a continuous fundraiser and exchanged for ETH following a bonding curve model.',
    website: 'https://swapr.eth.link/'
}

export async function setup(sdk: Context) {

    /*  @notice calls totalSupply of the contract at a specific date
        @param token, address of the contract
        @param network, 'ethereum' or 'arbitrum-one'
        @param date, date until which we want to get supply value
        @returns total token supply
    */
    const tokenBalance = async (token: string, network: string, date: string) => {
        const tokenContract = sdk.ethers.getERC20Contract(token, network)

        const supply = await tokenContract.totalSupply({ blockTag: date })

        const decimalUnit = 1e18

        return (supply.toString() / decimalUnit)
    }

    /*  @notice calls balanceOf of a token for an array of addresses at a specific date 
        @param token, address of the contract
        @param addresses, array of addresses
        @param date, date until which we want to get supply value
        @returns sum of addresses balances
    */
    const tokenAddressesBalance = async (token: string, network: string, date: string, addresses: string[] = []) => {
        const tokenContract = sdk.ethers.getERC20Contract(token, network)

        const excludeBalances = await Promise.all(addresses.map((address: string) => tokenContract.balanceOf(address, { blockTag: date })))

        const decimalUnit = 1e18 // TODO: query decimals

        return excludeBalances.reduce((total: number, balance: any) => total + (balance.toString() / decimalUnit), 0)
    }

    /*  @notice gets totalSupply for token and substracts balances
        @param tokenAddress, addressVault with token addresses
        @param addresses, AddressExcludeVault containing array of addresses for each network
        @param date, date until which we want to get supply value
        @returns total token supply substracting balances
    */
    const getSupply = async (tokenAddress: AddressVault, date: string, addresses: AddressExcludeVault) => {
        const mainnetBalance = await tokenAddressesBalance(tokenAddress["ethereum"], "ethereum", date, addresses["ethereum"])
        const arbitrumBalance = await tokenAddressesBalance(tokenAddress["arbitrum-one"], "arbitrum-one", date, addresses["arbitrum-one"])
        const supply = await tokenBalance(tokenAddress["ethereum"], "ethereum", date)

        return supply - mainnetBalance - arbitrumBalance
    }

    /*  @notice calculates the average of tokens minted in a week period
        @param tokenAddress, addressVault with token addresses
        @param adresses, array of addresses
        @param coinGeckoId, id of the token in coingecko in order to retrieve the current price
        @returns average number
    */
    const getIssuanceData = (tokenAddress: AddressVault, coinGeckoId: string, adresses: AddressExcludeVault) => async () => {
        const today = sdk.date.formatDate(new Date())
        const weekAgo = sdk.date.offsetDaysFormatted(today, -7)

        const [price, todaySupply, weekAgoSupply] = await Promise.all([
            sdk.coinGecko.getCurrentPrice(coinGeckoId),
            getSupply(tokenAddress, today, adresses),
            getSupply(tokenAddress, weekAgo, adresses),
        ])

        const oneWeekIssuance = todaySupply - weekAgoSupply

        const sevenDayAvg = oneWeekIssuance / 7 * price
        return sevenDayAvg
    }

    /*  @notice calculates rate in which price has chaged for a specific period
        @param tokenAddress, addressVault with token addresses
        @param adresses, array of addresses
        @returns rate, number
    */
    const getInflationRate = (tokenAddress: AddressVault, addresses: AddressExcludeVault) => async () => {
        const today = sdk.date.formatDate(new Date())
        const weekAgo = sdk.date.offsetDaysFormatted(today, -7)

        const [todaySupply, weekAgoSupply] = await Promise.all([
            getSupply(tokenAddress, today, addresses),
            getSupply(tokenAddress, weekAgo, addresses),
        ])

        return ((todaySupply / weekAgoSupply) - 1) * 52
    }

    /*  @notice total circulating tokens today
        @param tokenAddress, addressVault with token addresses
        @param excludeAddresses, array of addresses
        @returns number
    */
    const getSupplyToday = (tokenAddress: AddressVault, addresses: AddressExcludeVault) => async () => {
        const today = sdk.date.formatDate(new Date())

        const mainnetBalance = await tokenAddressesBalance(tokenAddress["ethereum"], "ethereum", today, addresses["ethereum"])
        const arbitrumBalance = await tokenAddressesBalance(tokenAddress["arbitrum-one"], "arbitrum-one", today, addresses["arbitrum-one"])
        const supply = await tokenBalance(tokenAddress["ethereum"], "ethereum", today)

        return supply - mainnetBalance - arbitrumBalance
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
