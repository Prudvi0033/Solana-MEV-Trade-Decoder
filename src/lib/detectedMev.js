import { DEX_PROGRAM_IDS } from "../constants.js";

export function detectMEV(swapTransaction, allBlockSwaps = [], txIndex = -1) {
  const result = {
    isMev: false,
    mevType: null,
    confidence: 0, // 0-100
    details: null,
  };

  // Skip if not a swap
  if (!swapTransaction.swapDetected) {
    return result;
  }

  // 1. Check for High-Confidence Arbitrage (95%+ certainty)
  const userTransactions = allBlockSwaps.filter(tx => 
    tx.initiatorWallet === swapTransaction.initiatorWallet
  );
  
  if (userTransactions.length >= 3) { // Need at least 3 transactions for high confidence
    const arbitrageCheck = checkHighConfidenceArbitrage(userTransactions);
    if (arbitrageCheck.detected && arbitrageCheck.confidence >= 95) {
      result.isMev = true;
      result.mevType = "arbitrage";
      result.confidence = arbitrageCheck.confidence;
      result.details = arbitrageCheck.details;
    }
  }

  // 2. Check for Clear Sandwich Attack (95%+ certainty)
  if (allBlockSwaps.length >= 3 && txIndex >= 1 && txIndex < allBlockSwaps.length - 1) {
    const sandwichCheck = detectHighConfidenceSandwich(swapTransaction, allBlockSwaps, txIndex);
    if (sandwichCheck.detected && sandwichCheck.confidence >= 95) {
      result.isMev = true;
      result.mevType = result.mevType ? "multiple" : "sandwich";
      result.confidence = Math.max(result.confidence, sandwichCheck.confidence);
      result.details = { ...result.details, sandwich: sandwichCheck.details };
    }
  }

  // 3. Check for Obvious Front/Back running (90%+ certainty)
  if (allBlockSwaps.length >= 2 && txIndex !== -1) {
    const runningCheck = detectObviousFrontBackRun(swapTransaction, allBlockSwaps, txIndex);
    if (runningCheck.detected && runningCheck.confidence >= 90) {
      result.isMev = true;
      result.mevType = result.mevType ? "multiple" : runningCheck.type;
      result.confidence = Math.max(result.confidence, runningCheck.confidence);
      result.details = { ...result.details, running: runningCheck.details };
    }
  }

  return result;
}

/**
 * Check for high-confidence arbitrage - very strict criteria
 */
function checkHighConfidenceArbitrage(userTransactions) {
  // Must have at least 3 transactions
  if (userTransactions.length < 3) {
    return { detected: false };
  }

  // Check for multiple DEX usage
  const platformsUsed = new Set();
  userTransactions.forEach(tx => {
    if (tx.platforms && tx.platforms.length > 0) {
      tx.platforms.forEach(platform => platformsUsed.add(platform));
    }
  });

  // Must use at least 3 different platforms for high confidence
  if (platformsUsed.size < 3) {
    return { detected: false };
  }

  // Check for round-trip trading
  const tokenInteractions = new Map();
  userTransactions.forEach(swapTx => {
    if (swapTx.swapDetails) {
      // Track tokens bought (tokensOut)
      swapTx.swapDetails.tokensOut?.forEach(token => {
        const mint = token.mint;
        if (!tokenInteractions.has(mint)) {
          tokenInteractions.set(mint, { buys: 0, sells: 0 });
        }
        tokenInteractions.get(mint).buys++;
      });

      // Track tokens sold (tokensIn)
      swapTx.swapDetails.tokensIn?.forEach(token => {
        const mint = token.mint;
        if (!tokenInteractions.has(mint)) {
          tokenInteractions.set(mint, { buys: 0, sells: 0 });
        }
        tokenInteractions.get(mint).sells++;
      });
    }
  });

  // Find round-trip tokens
  const roundTripTokens = [];
  tokenInteractions.forEach((interactions, tokenMint) => {
    if (interactions.buys >= 2 && interactions.sells >= 2) { // More strict: at least 2 buys AND 2 sells
      roundTripTokens.push({
        mint: tokenMint,
        buyCount: interactions.buys,
        sellCount: interactions.sells
      });
    }
  });

  // High confidence arbitrage: 3+ platforms, 2+ round-trip tokens, 4+ transactions
  if (platformsUsed.size >= 3 && roundTripTokens.length >= 2 && userTransactions.length >= 4) {
    return {
      detected: true,
      confidence: 98,
      details: {
        reason: "High-confidence arbitrage: multiple DEXes + extensive round-trip trading",
        platformCount: platformsUsed.size,
        roundTripTokens: roundTripTokens.length,
        transactionCount: userTransactions.length
      }
    };
  }

  // Medium-high confidence: 3+ platforms, 1+ round-trip, 3+ transactions
  if (platformsUsed.size >= 3 && roundTripTokens.length >= 1 && userTransactions.length >= 3) {
    return {
      detected: true,
      confidence: 95,
      details: {
        reason: "Multi-DEX arbitrage with round-trip trading",
        platformCount: platformsUsed.size,
        roundTripTokens: roundTripTokens.length,
        transactionCount: userTransactions.length
      }
    };
  }

  return { detected: false };
}

/**
 * Detect high-confidence sandwich attacks - very strict
 */
function detectHighConfidenceSandwich(targetSwap, allBlockSwaps, txIndex) {
  const targetDetails = targetSwap.swapDetails;
  const targetWallet = targetSwap.initiatorWallet;
  
  const beforeTx = allBlockSwaps[txIndex - 1];
  const afterTx = allBlockSwaps[txIndex + 1];

  // Must have same wallet for before and after (classic sandwich pattern)
  if (beforeTx.initiatorWallet !== afterTx.initiatorWallet) {
    return { detected: false };
  }

  // Target must be different wallet
  if (targetWallet === beforeTx.initiatorWallet) {
    return { detected: false };
  }

  const targetTokensIn = targetDetails.tokensIn.map(t => t.mint);
  const targetTokensOut = targetDetails.tokensOut.map(t => t.mint);
  
  const beforeTokensIn = beforeTx.swapDetails.tokensIn.map(t => t.mint);
  const beforeTokensOut = beforeTx.swapDetails.tokensOut.map(t => t.mint);
  const afterTokensIn = afterTx.swapDetails.tokensIn.map(t => t.mint);
  const afterTokensOut = afterTx.swapDetails.tokensOut.map(t => t.mint);

  // Perfect sandwich: before buys what target buys, after sells what target bought
  const perfectSandwich = 
    targetTokensOut.some(t => beforeTokensOut.includes(t)) &&  // Both buy same token
    targetTokensOut.some(t => afterTokensIn.includes(t)) &&    // After sells what target bought
    targetTokensIn.some(t => beforeTokensIn.includes(t));      // Both start with same token

  if (perfectSandwich) {
    return {
      detected: true,
      confidence: 97,
      details: {
        reason: "Perfect sandwich attack: same wallet before/after, opposite trades",
        sandwichWallet: beforeTx.initiatorWallet.slice(0, 8) + "...",
        victimWallet: targetWallet.slice(0, 8) + "...",
        tokenPair: {
          in: targetTokensIn[0]?.slice(0, 8) + "...",
          out: targetTokensOut[0]?.slice(0, 8) + "..."
        }
      }
    };
  }

  return { detected: false };
}

/**
 * Detect obvious front/back running - very strict
 */
function detectObviousFrontBackRun(targetSwap, allBlockSwaps, txIndex) {
  const targetTokensIn = targetSwap.swapDetails.tokensIn.map(t => t.mint);
  const targetTokensOut = targetSwap.swapDetails.tokensOut.map(t => t.mint);
  const targetWallet = targetSwap.initiatorWallet;

  // Check for front-running (same trade executed immediately before by different wallet)
  if (txIndex > 0) {
    const beforeTx = allBlockSwaps[txIndex - 1];
    
    // Must be different wallet
    if (beforeTx.initiatorWallet === targetWallet) {
      return { detected: false };
    }

    const beforeTokensIn = beforeTx.swapDetails.tokensIn.map(t => t.mint);
    const beforeTokensOut = beforeTx.swapDetails.tokensOut.map(t => t.mint);

    // Exact same trade (same input and output tokens)
    const exactSameTrade = 
      targetTokensIn.length === beforeTokensIn.length &&
      targetTokensOut.length === beforeTokensOut.length &&
      targetTokensIn.every(t => beforeTokensIn.includes(t)) &&
      targetTokensOut.every(t => beforeTokensOut.includes(t));

    if (exactSameTrade) {
      // Check if the front-runner used multiple previous transactions (pattern of MEV bot)
      const frontRunnerTxs = allBlockSwaps.filter(tx => 
        tx.initiatorWallet === beforeTx.initiatorWallet
      );

      if (frontRunnerTxs.length >= 2) { // MEV bot pattern
        return {
          detected: true,
          type: "frontrun",
          confidence: 92,
          details: { 
            reason: "Obvious front-running: exact same trade by different wallet with bot pattern",
            frontrunnerWallet: beforeTx.initiatorWallet.slice(0, 8) + "...",
            frontrunnerTxCount: frontRunnerTxs.length
          }
        };
      }
    }
  }

  // Check for back-running (immediate arbitrage after user trade)
  if (txIndex < allBlockSwaps.length - 1) {
    const afterTx = allBlockSwaps[txIndex + 1];
    
    // Must be different wallet
    if (afterTx.initiatorWallet === targetWallet) {
      return { detected: false };
    }

    const afterTokensIn = afterTx.swapDetails.tokensIn.map(t => t.mint);
    const afterTokensOut = afterTx.swapDetails.tokensOut.map(t => t.mount);

    // Perfect opposite trade (reverse the user's trade)
    const perfectReverse = 
      targetTokensIn.some(t => afterTokensOut.includes(t)) &&
      targetTokensOut.some(t => afterTokensIn.includes(t));

    if (perfectReverse) {
      // Check if back-runner is using multiple DEXes (arbitrage pattern)
      const backRunnerTxs = allBlockSwaps.filter(tx => 
        tx.initiatorWallet === afterTx.initiatorWallet
      );

      const platforms = new Set();
      backRunnerTxs.forEach(tx => {
        if (tx.platforms) {
          tx.platforms.forEach(p => platforms.add(p));
        }
      });

      if (platforms.size >= 2 && backRunnerTxs.length >= 2) {
        return {
          detected: true,
          type: "backrun",
          confidence: 94,
          details: { 
            reason: "Obvious back-running: immediate reverse trade with multi-DEX arbitrage",
            backrunnerWallet: afterTx.initiatorWallet.slice(0, 8) + "...",
            platformCount: platforms.size
          }
        };
      }
    }
  }

  return { detected: false };
}

/**
 * Helper function to get MEV type description
 */
export function getMEVDescription(mevType) {
  const descriptions = {
    "arbitrage": "Arbitrage - profiting from price differences across markets",
    "sandwich": "Sandwich attack - manipulating price around user transaction",
    "frontrun": "Front-running - copying user trade with higher priority",
    "backrun": "Back-running - following user trade to extract arbitrage",
    "multiple": "Multiple MEV strategies detected"
  };
  
  return descriptions[mevType] || "Unknown MEV type";
}