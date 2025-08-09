const TOKEN_SYMBOLS = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  So11111111111111111111111111111111111111112: "SOL",
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "mSOL",
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: "bSOL",
  "7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn": "JSOL",
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP",
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "RAY",
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "BONK",
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
      const dexName = DEX_PROGRAM_IDS[pid] || pid.slice(0, 6);

      if (DEX_PROGRAM_IDS[pid]) {
        platforms.add(dexName); // Collect platform name
      }

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
    path: pathParts.join(" "),
    platforms: Array.from(platforms) // Convert Set to array
  };
}

