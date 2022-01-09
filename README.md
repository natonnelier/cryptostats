# cryptostats

This is an adapter for https://moneyprinter.info/. It tracks issuance of SWAPR token by simply querying the historical supply of the token (default 7 days prior) and comparing it to the current supply.

## Usage

Copy the contents of cryptostats.ts and paste them in cryptostats editor: https://cryptostats.community/editor
- ERC20 token being tracked is configurable via `token` Object
- `getSupply` function retrieves the total issuance of tokens up to a specific date
- `getIssuanceData` calculates the average value of supply taken place in a specific period of time (defaults to one week)
- `getInflationRate` calculates the average variations of price in a specific period of time (defaults to one week)
