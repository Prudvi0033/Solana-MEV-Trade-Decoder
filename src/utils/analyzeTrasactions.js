import { getInitiatorWallet } from "../lib/getInitiatorWallet.js";
import { decodeTradePath } from "../lib/traderPath.js";

export function detectSwapTransaction(tx, DEX_PROGRAM_IDS) {
  const allProgramIds = new Set();

  let accountKeys = [];
  let instructions = [];

  if (tx.transaction?.message?.accountKeys) {
    accountKeys = tx.transaction.message.accountKeys.map((k) => k.toString());
    instructions = tx.transaction.message.instructions || [];
  } else if (tx.message?.accountKeys) {
    accountKeys = tx.message.accountKeys.map((k) => k.toString());
    instructions = tx.message.instructions || [];
  } else {
    return {
      isKnownDexSwap: false,
      isProbableSwap: false,
      swapDetected: false,
      swapDetails: null,
    };
  }

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

  const TOKEN_PROGRAM_IDS = [
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  ];

  function isRelevantTokenInstruction(ix) {
    const pid = accountKeys[ix.programIdIndex];
    if (TOKEN_PROGRAM_IDS.includes(pid)) {
      if (!ix.data) return false;
      const decodedFirstByte = Buffer.from(ix.data, "base64")[0];
      return decodedFirstByte === 3 || decodedFirstByte === 12;
    }
    if (DEX_PROGRAM_IDS[pid]) {
      if (
        ix.parsed?.type &&
        ["swap", "exchange", "transfer"].includes(ix.parsed.type.toLowerCase())
      ) {
        return true;
      }
    }
    return false;
  }

  instructions.forEach((ix) => {
    const pid = accountKeys[ix.programIdIndex];
    if (!IGNORED_PROGRAM_IDS.has(pid)) {
      allProgramIds.add(pid);
    }
  });

  if (tx.meta?.innerInstructions) {
    tx.meta.innerInstructions.forEach((ixGroup) => {
      ixGroup.instructions.forEach((ix) => {
        const pid = accountKeys[ix.programIdIndex];
        if (!IGNORED_PROGRAM_IDS.has(pid)) {
          allProgramIds.add(pid);
        }
      });
    });
  }

  // --- SWAP DETECTION LOGIC ---
  function detectSwapPattern() {
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    // Debug logging (reduced verbosity)
    if (preBalances.length === 0 && postBalances.length === 0) {
      return { isSwap: false, reason: "No token balance data" };
    }

    // Create balance change map: {account_mint_key: {pre, post, change, owner}}
    const balanceChanges = new Map();

    // Process pre-balances
    preBalances.forEach((balance) => {
      const key = `${balance.accountIndex}_${balance.mint}`;
      balanceChanges.set(key, {
        accountIndex: balance.accountIndex,
        mint: balance.mint,
        owner: balance.owner,
        pre: parseFloat(balance.uiTokenAmount?.uiAmountString || 0), // ✅ FIXED: added ? operator
        post: 0,
        change: 0,
      });
    });

    // Process post-balances and calculate changes
    postBalances.forEach((balance) => {
      const key = `${balance.accountIndex}_${balance.mint}`;
      const existing = balanceChanges.get(key);
      if (existing) {
        existing.post = parseFloat(balance.uiTokenAmount?.uiAmountString || 0); 
        existing.change = existing.post - existing.pre;
      } else {
        // New token account created during transaction
        balanceChanges.set(key, {
          accountIndex: balance.accountIndex,
          mint: balance.mint,
          owner: balance.owner,
          pre: 0,
          post: parseFloat(balance.uiTokenAmount?.uiAmountString || 0),
          change: parseFloat(balance.uiTokenAmount?.uiAmountString || 0), 
        });
      }
    });

    // Only log for potential swaps
    const hasSignificantChanges = balanceChanges.size > 0;

    // Group by owner to detect swap patterns
    const ownerChanges = new Map();
    balanceChanges.forEach((change) => {
      if (!ownerChanges.has(change.owner)) {
        ownerChanges.set(change.owner, []);
      }
      if (Math.abs(change.change) > 0.000001) {
        // Ignore dust
        ownerChanges.get(change.owner).push(change);
      }
    });

    // Detect swap patterns for each owner
    for (const [owner, changes] of ownerChanges) {
      if (changes.length >= 2) {
        const uniqueMints = new Set(changes.map((c) => c.mint));

        // Check if owner has both gains and losses in different tokens
        const gains = changes.filter((c) => c.change > 0);
        const losses = changes.filter((c) => c.change < 0);

        if (gains.length >= 1 && losses.length >= 1 && uniqueMints.size >= 2) {
          const gainMints = new Set(gains.map((g) => g.mint));
          const lossMints = new Set(losses.map((l) => l.mint));

          // Check if gained and lost different tokens (classic swap pattern)
          const swappedDifferentTokens =
            [...gainMints].some((mint) => !lossMints.has(mint)) &&
            [...lossMints].some((mint) => !gainMints.has(mint));

          if (swappedDifferentTokens) {
            return {
              isSwap: true,
              owner,
              tokensIn: losses.map((l) => ({
                mint: l.mint,
                amount: Math.abs(l.change),
              })),
              tokensOut: gains.map((g) => ({ mint: g.mint, amount: g.change })),
              swapDetails: {
                uniqueMintsInvolved: uniqueMints.size,
                totalGains: gains.length,
                totalLosses: losses.length,
              },
            };
          }
        }
      }
    }

    return { isSwap: false };
  }

  // --- Run all detection logic ---
  const knownDex = [...allProgramIds].some((pid) => DEX_PROGRAM_IDS[pid]);

  const hasRelevantTokenOp =
    instructions.some(isRelevantTokenInstruction) ||
    (tx.meta?.innerInstructions || []).some((ixGroup) =>
      ixGroup.instructions.some(isRelevantTokenInstruction)
    );

  const swapPattern = detectSwapPattern();

  // Enhanced detection combining program detection + balance pattern
  const isDefiniteSwap = swapPattern.isSwap && (knownDex || hasRelevantTokenOp);
  const isProbableSwap = swapPattern.isSwap && !knownDex; // Pattern exists but unknown DEX

  const tradePathData = decodeTradePath(tx, DEX_PROGRAM_IDS);

  const tradePath = tradePathData ? tradePathData.path : null;
  const platforms = tradePathData ? tradePathData.platforms || [] : [];

  const result = {
    signature: tx.transaction?.signatures?.[0] || "N/A",
    isKnownDexSwap: knownDex && swapPattern.isSwap,
    isProbableSwap: isProbableSwap,
    swapDetected: isDefiniteSwap || isProbableSwap,
    swapDetails: swapPattern.isSwap ? swapPattern : null,
    matchedProgramIds: [...allProgramIds].filter((pid) => DEX_PROGRAM_IDS[pid]),
    unknownButSuspicious: isProbableSwap ? [...allProgramIds] : [],
    hasRelevantTokenOp,
    initiatorWallet: getInitiatorWallet(tx),
    tradePath: tradePath,
    platforms: platforms,
    isKnownDex: knownDex,
    isDexLike: isDefiniteSwap || isProbableSwap,
  };

  return result;
}
