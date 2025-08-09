/**
 * Simple MEV Detection Module
 * Works with your existing swap detection system
 */

// Known MEV bot addresses - add more as you discover them
const KNOWN_MEV_BOTS = new Set([
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", // Example MEV bot
  "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK", // Example MEV bot
  "HfoTxFR1Tm6kGmWgYWD6J7YHVy1UwqSULUGVLXkJqaKN", // Example arbitrage bot
  // Add more known addresses here
]);

/**
 * Main MEV detection function
 * @param {Object} swapTransaction - Already analyzed swap transaction from your detectSwapTransaction
 * @param {Array} allBlockSwaps - All swap transactions from the same block
 * @param {Number} txIndex - Index of current transaction in block
 * @returns {Object} MEV detection results
 */
export function detectMEV(swapTransaction, allBlockSwaps = [], txIndex = -1) {
  const result = {
    isMev: false,
    mevType: null,
    confidence: 0, // 0-100
    details: null,
    botAddress: null
  };

  // Skip if not a swap
  if (!swapTransaction.swapDetected) {
    return result;
  }

  const swapDetails = swapTransaction.swapDetails;
  const trader = swapDetails.owner;

  // 1. Check for known MEV bot
  if (KNOWN_MEV_BOTS.has(trader)) {
    result.isMev = true;
    result.mevType = "known_bot";
    result.confidence = 90;
    result.botAddress = trader;
    result.details = { reason: "Known MEV bot address" };
    return result;
  }

  // 2. Check for Arbitrage (multiple swaps in single transaction)
  const arbitrageCheck = detectArbitrage(swapTransaction);
  if (arbitrageCheck.detected) {
    result.isMev = true;
    result.mevType = "arbitrage";
    result.confidence = arbitrageCheck.confidence;
    result.details = arbitrageCheck.details;
  }

  // 3. Check for Sandwich Attack (requires block context)
  if (allBlockSwaps.length > 1 && txIndex !== -1) {
    const sandwichCheck = detectSandwich(swapTransaction, allBlockSwaps, txIndex);
    if (sandwichCheck.detected) {
      result.isMev = true;
      result.mevType = result.mevType ? "multiple" : "sandwich";
      result.confidence = Math.max(result.confidence, sandwichCheck.confidence);
      result.details = { ...result.details, sandwich: sandwichCheck.details };
    }
  }

  // 4. Check for Front/Back running
  if (allBlockSwaps.length > 1 && txIndex !== -1) {
    const runningCheck = detectFrontBackRun(swapTransaction, allBlockSwaps, txIndex);
    if (runningCheck.detected) {
      result.isMev = true;
      result.mevType = result.mevType ? "multiple" : runningCheck.type;
      result.confidence = Math.max(result.confidence, runningCheck.confidence);
      result.details = { ...result.details, running: runningCheck.details };
    }
  }

  // 5. Check for suspicious patterns
  const suspiciousCheck = detectSuspiciousPatterns(swapTransaction);
  if (suspiciousCheck.detected) {
    result.confidence += suspiciousCheck.confidenceBoost;
    result.details = { ...result.details, suspicious: suspiciousCheck.patterns };
  }

  return result;
}

/**
 * Detect arbitrage - multiple token swaps in single transaction
 */
function detectArbitrage(swapTx) {
  const swapDetails = swapTx.swapDetails;
  
  // Check if multiple different tokens involved
  const allTokens = new Set([
    ...swapDetails.tokensIn.map(t => t.mint),
    ...swapDetails.tokensOut.map(t => t.mint)
  ]);

  // Arbitrage typically involves 3+ tokens (A->B->C->A)
  if (allTokens.size >= 3) {
    return {
      detected: true,
      confidence: 70,
      details: {
        reason: "Multiple token arbitrage detected",
        tokenCount: allTokens.size,
        tokensInvolved: Array.from(allTokens).map(t => t.slice(0, 8) + "...")
      }
    };
  }

  // Check for wrapped token arbitrage (SOL <-> WSOL)
  const solTokens = ['So11111111111111111111111111111111111111112', 'native'];
  const hasSol = swapDetails.tokensIn.some(t => solTokens.includes(t.mint)) ||
                swapDetails.tokensOut.some(t => solTokens.includes(t.mint));
  
  if (hasSol && allTokens.size >= 2) {
    return {
      detected: true,
      confidence: 60,
      details: {
        reason: "Possible wrapped token arbitrage",
        tokenCount: allTokens.size
      }
    };
  }

  return { detected: false };
}

/**
 * Detect sandwich attacks - look for same token pair before and after
 */
function detectSandwich(targetSwap, allBlockSwaps, txIndex) {
  const targetDetails = targetSwap.swapDetails;
  const targetTokensIn = targetDetails.tokensIn.map(t => t.mint);
  const targetTokensOut = targetDetails.tokensOut.map(t => t.mint);

  // Look for transactions before and after
  const beforeTx = txIndex > 0 ? allBlockSwaps[txIndex - 1] : null;
  const afterTx = txIndex < allBlockSwaps.length - 1 ? allBlockSwaps[txIndex + 1] : null;

  if (!beforeTx || !afterTx) {
    return { detected: false };
  }

  // Check if same trader did before and after
  const beforeTrader = beforeTx.swapDetails.owner;
  const afterTrader = afterTx.swapDetails.owner;
  const targetTrader = targetDetails.owner;

  if (beforeTrader === afterTrader && beforeTrader !== targetTrader) {
    // Check if they traded same token pair
    const beforeTokensIn = beforeTx.swapDetails.tokensIn.map(t => t.mint);
    const beforeTokensOut = beforeTx.swapDetails.tokensOut.map(t => t.mint);
    const afterTokensIn = afterTx.swapDetails.tokensIn.map(t => t.mint);
    const afterTokensOut = afterTx.swapDetails.tokensOut.map(t => t.mint);

    // Classic sandwich: Bot buys token -> User buys same token -> Bot sells token
    const sameTokenPair = 
      targetTokensIn.some(t => beforeTokensOut.includes(t)) &&
      targetTokensOut.some(t => afterTokensIn.includes(t));

    if (sameTokenPair) {
      return {
        detected: true,
        confidence: 85,
        details: {
          reason: "Sandwich attack pattern detected",
          botAddress: beforeTrader,
          victimAddress: targetTrader,
          tokenPair: {
            in: targetTokensIn[0]?.slice(0, 8) + "...",
            out: targetTokensOut[0]?.slice(0, 8) + "..."
          }
        }
      };
    }
  }

  return { detected: false };
}

/**
 * Detect front-running and back-running
 */
function detectFrontBackRun(targetSwap, allBlockSwaps, txIndex) {
  const targetDetails = targetSwap.swapDetails;
  const targetTokensIn = targetDetails.tokensIn.map(t => t.mint);
  const targetTokensOut = targetDetails.tokensOut.map(t => t.mint);
  const targetTrader = targetDetails.owner;

  // Check previous transaction (front-running)
  if (txIndex > 0) {
    const beforeTx = allBlockSwaps[txIndex - 1];
    const beforeDetails = beforeTx.swapDetails;
    
    if (beforeDetails.owner !== targetTrader) {
      const beforeTokensIn = beforeDetails.tokensIn.map(t => t.mint);
      const beforeTokensOut = beforeDetails.tokensOut.map(t => t.mint);

      // Same token pair, different trader = potential front-run
      const samePair = 
        targetTokensIn.some(t => beforeTokensIn.includes(t)) &&
        targetTokensOut.some(t => beforeTokensOut.includes(t));

      if (samePair) {
        return {
          detected: true,
          type: "frontrun",
          confidence: 65,
          details: {
            reason: "Front-running detected - same trade executed first",
            botAddress: beforeDetails.owner,
            victimAddress: targetTrader
          }
        };
      }
    }
  }

  // Check next transaction (back-running)
  if (txIndex < allBlockSwaps.length - 1) {
    const afterTx = allBlockSwaps[txIndex + 1];
    const afterDetails = afterTx.swapDetails;
    
    if (afterDetails.owner !== targetTrader) {
      const afterTokensIn = afterDetails.tokensIn.map(t => t.mint);
      const afterTokensOut = afterDetails.tokensOut.map(t => t.mint);

      // Opposite direction trade = potential back-run arbitrage
      const oppositeTrade = 
        targetTokensIn.some(t => afterTokensOut.includes(t)) &&
        targetTokensOut.some(t => afterTokensIn.includes(t));

      if (oppositeTrade) {
        return {
          detected: true,
          type: "backrun",
          confidence: 60,
          details: {
            reason: "Back-running detected - arbitrage after user trade",
            botAddress: afterDetails.owner,
            triggeredBy: targetTrader
          }
        };
      }
    }
  }

  return { detected: false };
}

/**
 * Detect suspicious patterns that might indicate MEV
 */
function detectSuspiciousPatterns(swapTx) {
  const patterns = [];
  let confidenceBoost = 0;

  // Check for high number of token swaps
  const totalSwaps = swapTx.swapDetails.totalGains + swapTx.swapDetails.totalLosses;
  if (totalSwaps > 4) {
    patterns.push("complex_multi_swap");
    confidenceBoost += 10;
  }

  // Check for unusual platforms combination
  if (swapTx.platforms && swapTx.platforms.length > 2) {
    patterns.push("multiple_dex_usage");
    confidenceBoost += 15;
  }

  // Check for very precise amounts (might indicate calculated arbitrage)
  const hasPreciseAmounts = [
    ...swapTx.swapDetails.tokensIn,
    ...swapTx.swapDetails.tokensOut
  ].some(token => {
    const amountStr = token.amount.toString();
    return amountStr.includes('.') && amountStr.split('.')[1]?.length > 6;
  });

  if (hasPreciseAmounts) {
    patterns.push("precise_amounts");
    confidenceBoost += 5;
  }

  return {
    detected: patterns.length > 0,
    patterns,
    confidenceBoost
  };
}

/**
 * Helper function to get MEV type description
 */
export function getMEVDescription(mevType) {
  const descriptions = {
    "known_bot": "Transaction from known MEV bot address",
    "arbitrage": "Arbitrage - profiting from price differences across markets",
    "sandwich": "Sandwich attack - manipulating price around user transaction",
    "frontrun": "Front-running - copying user trade with higher priority",
    "backrun": "Back-running - following user trade to extract arbitrage",
    "multiple": "Multiple MEV strategies detected"
  };
  
  return descriptions[mevType] || "Unknown MEV type";
}