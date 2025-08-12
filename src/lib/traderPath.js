const IGNORED_PROGRAM_IDS = new Set([
  // Core Solana Programs
  "ComputeBudget111111111111111111111111111111", // Compute Budget Program
  "AddressLookupTab1e1111111111111111111111111", // Address Lookup Table Program
  "11111111111111111111111111111111", // System Program

  // Token Programs (we check these separately)
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token Program
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // Token Extensions Program (Token-2022)
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", // Associated Token Account Program

  // Common Utility Programs
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", // Memo Program
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo", // Memo Program v1
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV", // Noop Program

  // Rent and Staking
  "SysvarRent111111111111111111111111111111111", // Rent Sysvar
  "SysvarC1ock11111111111111111111111111111111", // Clock Sysvar
  "SysvarRecentB1ockHashes11111111111111111111", // Recent Blockhashes Sysvar
  "SysvarS1otHashes111111111111111111111111111", // Slot Hashes Sysvar
  "Stake11111111111111111111111111111111111111", // Stake Program
  "Vote111111111111111111111111111111111111111", // Vote Program

  // Metaplex (NFT-related, usually not DEX activity)
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s", // Metaplex Token Metadata
  "p1exdMJcjVao65QdewkaZRUnU6VPSXhus9n2GzWfh98", // Metaplex Token Vault
  "auctxRXPeJoc4817jDhf4HbjnhEcr1cCXenosMhK5R8", // Metaplex Auction House

  // Pyth Oracle (price feeds, not swaps)
  "FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH", // Pyth Oracle
  "gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s", // Pyth Push Oracle
]);

const TOKEN_SYMBOLS = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
  "So11111111111111111111111111111111111111112": "SOL",
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": "mSOL",
  "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1": "bSOL",
  "7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn": "JSOL",
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "JUP",
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "RAY",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH",
  "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E": "BTC",
};

export function decodeTradePath(tx, DEX_PROGRAM_IDS) {
  if (!tx?.meta?.preTokenBalances || !tx?.meta?.postTokenBalances) {
    return null;
  }

  const swaps = [];
  const platforms = new Set();

  const getTokenName = (mint) => TOKEN_SYMBOLS[mint] || mint.slice(0, 6);
  const accountKeys =
    tx.transaction?.message?.accountKeys?.map((k) => k.toString()) || [];

  const processIxGroup = (ixs) => {
    ixs.forEach((ix) => {
      const pid = accountKeys[ix.programIdIndex];

      // Skip ignored programs
      if (IGNORED_PROGRAM_IDS.has(pid)) return;

      const dexName = DEX_PROGRAM_IDS[pid] || pid.slice(0, 6);
      platforms.add(dexName);

      // Identify token mints involved
      const involvedMints = new Set();
      if (ix.accounts) {
        ix.accounts.forEach((accIndex) => {
          const mintBalancePre = tx.meta.preTokenBalances.find(
            (b) => b.accountIndex === accIndex
          );
          const mintBalancePost = tx.meta.postTokenBalances.find(
            (b) => b.accountIndex === accIndex
          );
          const mint = mintBalancePre?.mint || mintBalancePost?.mint;
          if (mint) involvedMints.add(mint);
        });
      }

      if (involvedMints.size >= 2) {
        const [tokenA, tokenB] = [...involvedMints];
        swaps.push({
          from: getTokenName(tokenA),
          to: getTokenName(tokenB),
          dex: dexName,
        });
      }
    });
  };

  // Outer instructions
  processIxGroup(tx.transaction?.message?.instructions || []);
  // Inner instructions
  (tx.meta?.innerInstructions || []).forEach((ixGroup) => {
    processIxGroup(ixGroup.instructions || []);
  });

  if (swaps.length === 0) return null;

  const pathParts = [];
  swaps.forEach((swap, idx) => {
    if (idx === 0) {
      pathParts.push(`${swap.from} → ${swap.to} on ${swap.dex}`);
    } else {
      const prevToken = swaps[idx - 1].to;
      if (swap.from !== prevToken) {
        pathParts.push(`(${swap.from}) → ${swap.to} on ${swap.dex}`);
      } else {
        pathParts.push(`→ ${swap.to} on ${swap.dex}`);
      }
    }
  });

  return {
    path: pathParts.join(", "), // comma separates multiple hops
    platforms: Array.from(platforms),
  };
}
