// Robinhood Chain watchlist registry — single source of truth for the RH tab.
// Addresses verified live against DexScreener (chainId "robinhood").
// Frontend never imports this: it receives the resolved payload from /api/robinhood-watchlist.

export const RH_CHAIN_ID = 4663;
export const RH_RPC_URLS = [
  'https://rpc.mainnet.chain.robinhood.com',
  'https://robinhood-rpc.publicnode.com',
];
export const DEXSCREENER_CHAIN = 'robinhood';
export const RH_EXPLORER = 'https://robinscan.io';

/**
 * metricSource tells the aggregator where a token's PRIMARY metric comes from:
 *   defillama:<slug>  → protocol fees/revenue/TVL from DefiLlama
 *   onchain:burn      → % of supply burned to 0x…dEaD (read over RPC)
 *   onchain:treasury  → reserve balance / circulating supply (needs treasury + reserve set)
 *   dex:liquidity     → aggregate LP depth across all pairs
 *   dex:volume        → aggregate 24h volume across all pairs
 *   social            → X follower count (via Apify)
 *   none              → no free machine-readable source; shows as "—"
 */
export const RH_TOKENS = [
  {
    symbol: 'PONS', address: '0x39dBED3a2bd333467115dE45665cC57F813C4571',
    project: 'Pons launchpad', handle: 'ponsdotfamily', type: 'Launchpad',
    conviction: 'high', llamaSlug: 'pons',
    primaryMetric: 'Protocol revenue', metricSource: 'defillama:pons',
    secondaryMetric: 'Supply burned', secondarySource: 'onchain:burn',
    note: '80% of protocol fees buy and burn PONS.',
  },
  {
    symbol: 'AI', address: '0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18',
    project: 'Long (Artificial Inu)', handle: 'longdotxyz', type: 'Meme + tokenized NVDA vault',
    conviction: 'high',
    primaryMetric: 'Vault backing / token', metricSource: 'onchain:treasury',
    secondaryMetric: 'LP depth', secondarySource: 'dex:liquidity',
    // Fill these in to light up backing-per-token: the vault contract and the asset it holds.
    treasury: null, reserveToken: null, reserveSymbol: 'NVDA',
    note: 'Backing is a fraction of mcap — the NVDA pairing is a liquidity structure, not collateral.',
  },
  {
    symbol: 'CASHCAT', address: '0x020bfC650A365f8BB26819deAAbF3E21291018b4',
    project: 'Cash Cat', handle: 'cashcat_token', type: 'Pure meme',
    conviction: 'high',
    primaryMetric: 'X followers', metricSource: 'social',
    secondaryMetric: '24h volume', secondarySource: 'dex:volume',
    note: 'No product, no revenue, no named team. Fixed 1B supply.',
  },
  {
    symbol: 'INDEX', address: '0x56910D4409F3a0C78C64DD8D0545FF0705389870',
    project: 'The Index', handle: null, type: 'Onchain index fund',
    conviction: 'high',
    primaryMetric: 'Basket value held', metricSource: 'onchain:treasury',
    secondaryMetric: 'LP depth', secondarySource: 'dex:liquidity',
    treasury: null, reserveToken: null, reserveSymbol: 'basket',
    note: '3% trade tax buys tokenized US stocks and airdrops them to holders.',
  },
  {
    symbol: 'BONER', address: '0x98096d17e191B3dA1d5f99a6D7b3584351b11E18',
    project: 'Long (Boner Coin)', handle: 'longdotxyz', type: 'Meme paired with HIMS',
    conviction: 'low',
    primaryMetric: 'LP depth', metricSource: 'dex:liquidity',
    secondaryMetric: 'Supply burned', secondarySource: 'onchain:burn',
  },
  {
    symbol: 'SLVR', address: '0x791229E3EbD6CFdC3D8157f48722684173C29aD9',
    project: 'SLVR mining', handle: null, type: 'Mining / lottery',
    conviction: 'low', llamaSlug: 'slvr',
    primaryMetric: 'TVL', metricSource: 'defillama:slvr',
    secondaryMetric: '24h volume', secondarySource: 'dex:volume',
    note: 'Daily active miners is not published; DefiLlama TVL is the closest proxy.',
  },
  {
    symbol: 'HOOKR', address: '0x18E674231A58c239Dc7DaeDcffE15Ec3A24cff5c',
    project: 'Hookr.fun', handle: 'Hookrfun', type: 'Launchpad with hooks',
    conviction: 'low',
    primaryMetric: '24h volume', metricSource: 'dex:volume',
    secondaryMetric: 'X followers', secondarySource: 'social',
    note: 'Fee revenue not tracked on DefiLlama. Volume is the proxy.',
  },
  {
    symbol: 'STONKBROKER', address: '0xe934e36A439C94017B64a3FecE66AF12099aBF50',
    project: 'Clutch Markets', handle: 'ClutchMarkets', type: 'NFT brokerage + stock suite',
    conviction: 'high', llamaSlug: 'stonkbrokers',
    primaryMetric: 'Fees / revenue', metricSource: 'defillama:stonkbrokers',
    secondaryMetric: 'LP depth', secondarySource: 'dex:liquidity',
    note: 'Real revenue capture on a tiny base. Watch the TVL trend, not the revenue.',
  },
  {
    symbol: 'NET', address: '0xCA9c78Dd337A67F6e0077F65F5E9218719d30eDf',
    project: 'NetNet', handle: 'NetNetCap', type: 'Olympus-style reserve',
    conviction: 'high', llamaSlug: 'netnet-capital-management',
    primaryMetric: 'Treasury backing / token', metricSource: 'derived:backing',
    secondaryMetric: 'Treasury (TVL)', secondarySource: 'defillama:netnet-capital-management',
    treasury: null, reserveToken: null, reserveSymbol: 'USDG',
    note: 'Hard floor of 1 USDG risk-free value per NET, enforced by contract.',
  },
  {
    symbol: 'MANCER', address: '0xc72F232a6869e6CF34dC06129AfFD07F8a2a246A',
    project: 'Mancer', handle: 'MancerXYZ', type: 'DEX aggregator',
    conviction: 'low',
    primaryMetric: '24h volume', metricSource: 'dex:volume',
    secondaryMetric: 'Supply burned', secondarySource: 'onchain:burn',
  },
  {
    symbol: 'ORBIO', address: '0xAa07A0e9209e16aC99708C3EC70159c6eF3128A3',
    project: 'Orbio.so', handle: 'orbiodotso', type: 'AI credits marketplace',
    conviction: 'low',
    primaryMetric: 'Credits sold', metricSource: 'none',
    secondaryMetric: '24h volume', secondarySource: 'dex:volume',
  },
  {
    symbol: 'TWO', address: '0x2A4a33A2163D005d8E7f1D9aC08d14c98db288d5',
    project: 'Twofold', handle: 'twofoldfi', type: 'Dual-yield LP',
    conviction: 'low', llamaSlug: 'twofold',
    primaryMetric: 'DualPool TVL', metricSource: 'defillama:twofold',
    secondaryMetric: 'LP depth', secondarySource: 'dex:liquidity',
  },
  {
    symbol: 'PROLOGUE', address: '0xb9972CA7188e511174947E3936a5315ac7073277',
    project: 'Fables', handle: 'fablesfi', type: 'Pre-governance claim',
    conviction: 'high', llamaSlug: 'fables',
    primaryMetric: 'Fables fees', metricSource: 'defillama:fables',
    secondaryMetric: 'LP depth', secondarySource: 'dex:liquidity',
    note: 'Fee income is real; value capture is not switched on yet. 1:1 claim terms unpublished.',
  },
  {
    symbol: 'STATICS', address: '0x2d8d6F4A93AcD7a916A5a654ec8b690bA3B3EAdd',
    project: 'Statics Protocol', handle: 'StaticsProtocol', type: 'Baskets + stablecoin',
    conviction: 'low',
    primaryMetric: 'LP depth', metricSource: 'dex:liquidity',
    secondaryMetric: 'X followers', secondarySource: 'social',
  },
  {
    symbol: 'ARROW', address: '0xf2915d1e3C1B0c769d0c756Ec43F1c1f6c99cD03',
    project: 'Arrow Finance', handle: 'ArrowFinanceio', type: 'Lending + launchpad',
    conviction: 'low',
    primaryMetric: 'LP depth', metricSource: 'dex:liquidity',
    secondaryMetric: '24h volume', secondarySource: 'dex:volume',
    note: 'First protocol to take tokenized equities as collateral. No DefiLlama adapter yet, so TVL/borrow utilisation is unavailable.',
  },
  {
    symbol: 'SHROOM', address: '0xab093dEF657F15dF31b33922A95e047aDd645B29',
    project: 'Shroom Network', handle: 'shroom_network', type: 'POL layer',
    conviction: 'low',
    primaryMetric: 'LP depth (POL proxy)', metricSource: 'dex:liquidity',
    secondaryMetric: '24h volume', secondarySource: 'dex:volume',
  },
  {
    symbol: 'PARE', address: '0x15d36B6A28d8327ABc7aFABF0F106AE2c9Af5C4d',
    project: 'Pare', handle: 'PareStocks', type: 'Yield split (Pendle-style)',
    conviction: 'low',
    primaryMetric: 'LP depth', metricSource: 'dex:liquidity',
    secondaryMetric: 'Supply burned', secondarySource: 'onchain:burn',
  },
  {
    symbol: 'QUOTRON', address: '0x5a86828Efd322bfb16d93cFeD16EE9BC14940D7F',
    project: 'Quotrons', handle: 'Quotrons404', type: 'NFT that holds stocks',
    conviction: 'low',
    primaryMetric: 'Floor / NAV', metricSource: 'none',
    secondaryMetric: '24h volume', secondarySource: 'dex:volume',
    note: 'NAV must be read per token. V2 is 4,444 terminals.',
  },
  {
    symbol: 'BOW', address: '0x70c4b275C6ef812565Cd8BB5ae90Bf685Ee0661C',
    project: 'Longbow', handle: 'longbowlend', type: 'Money market',
    conviction: 'high', llamaSlug: 'longbow',
    primaryMetric: 'Borrow utilisation', metricSource: 'derived:utilisation',
    secondaryMetric: 'TVL', secondarySource: 'defillama:longbow',
    note: 'Pre-product economics: TVL exists but nothing is earned on it yet.',
  },
  {
    symbol: 'MEME', address: '0x385F4f8ae47651ce5F58F5265395a669f8281e18',
    project: 'Long launch', handle: 'longdotxyz', type: 'Meme',
    conviction: 'low',
    primaryMetric: 'LP depth', metricSource: 'dex:liquidity',
    secondaryMetric: '24h volume', secondarySource: 'dex:volume',
  },
  {
    symbol: 'NUDES', address: '0xbe98b75361935b18d688409424a869a4C3dC7401',
    project: 'Long launch', handle: 'longdotxyz', type: 'Meme',
    conviction: 'low',
    primaryMetric: 'LP depth', metricSource: 'dex:liquidity',
    secondaryMetric: '24h volume', secondarySource: 'dex:volume',
  },
  {
    symbol: 'MOO', address: '0xD9dB30BB0D2b8d2eae3826A1372117E058791e18',
    project: 'Long launch', handle: 'longdotxyz', type: 'Meme',
    conviction: 'low',
    primaryMetric: 'LP depth', metricSource: 'dex:liquidity',
    secondaryMetric: '24h volume', secondarySource: 'dex:volume',
  },
];

/** Pre-token protocols on the chain worth watching (no ticker to price). */
export const RH_PROTOCOLS = [
  { slug: 'pons', name: 'Pons', token: 'PONS' },
  { slug: 'arcus-perps', name: 'Arcus Perps', token: null, note: 'dYdX JV, no token announced' },
  { slug: 'fables', name: 'Fables', token: 'PROLOGUE' },
  { slug: 'stonkbrokers', name: 'StonkBrokers', token: 'STONKBROKER' },
  { slug: 'longbow', name: 'Longbow', token: 'BOW' },
  { slug: 'lighter-robinhood-perps', name: 'Lighter Perps', token: null },
  { slug: 'noxa-fun', name: 'NOXA Fun', token: null },
  { slug: 'stonx', name: 'STONX', token: 'STONX' },
  { slug: 'netnet-capital-management', name: 'NetNet', token: 'NET' },
];

/** X handles to poll through Apify (deduped across tokens). */
export const RH_X_HANDLES = [
  ...new Set(RH_TOKENS.map(t => t.handle).filter(Boolean)),
  'EARNONHOOD',
];

export const RH_TOKEN_BY_ADDRESS = Object.fromEntries(
  RH_TOKENS.map(t => [t.address.toLowerCase(), t])
);
