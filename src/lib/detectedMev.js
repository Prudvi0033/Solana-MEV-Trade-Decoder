import { DEX_PROGRAM_IDS } from "../constants.js";
import { detectArbitrage } from "./detectArbitrage.js";

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

  const swapDetails = swapTransaction.swapDetails;

  // 1. Check for Arbitrage
  const arbitrageCheck = detectArbitrage(swapTransaction);
  if (arbitrageCheck.detected) {
    result.isMev = true;
    result.mevType = "arbitrage";
    result.confidence = arbitrageCheck.confidence;
    result.details = arbitrageCheck.details;
  }

  // 2. Check for Sandwich Attack
  if (allBlockSwaps.length > 1 && txIndex !== -1) {
    const sandwichCheck = detectSandwich(swapTransaction, allBlockSwaps, txIndex);
    if (sandwichCheck.detected) {
      result.isMev = true;
      result.mevType = result.mevType ? "multiple" : "sandwich";
      result.confidence = Math.max(result.confidence, sandwichCheck.confidence);
      result.details = { ...result.details, sandwich: sandwichCheck.details };
    }
  }

  // 3. Check for Front/Back running
  if (allBlockSwaps.length > 1 && txIndex !== -1) {
    const runningCheck = detectFrontBackRun(swapTransaction, allBlockSwaps, txIndex);
    if (runningCheck.detected) {
      result.isMev = true;
      result.mevType = result.mevType ? "multiple" : runningCheck.type;
      result.confidence = Math.max(result.confidence, runningCheck.confidence);
      result.details = { ...result.details, running: runningCheck.details };
    }
  }

  // 4. Check for suspicious patterns
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
const arbitrageCheck = detectArbitrage(swapTransaction, DEX_PROGRAM_IDS);
  if (arbitrageCheck.detected) {
    result.isMev = true;
    result.mevType = "arbitrage";
    result.confidence = arbitrageCheck.confidence;
    result.details = arbitrageCheck.details;
  }

/**
 * Detect sandwich attacks
 */
function detectSandwich(targetSwap, allBlockSwaps, txIndex) {
  const targetDetails = targetSwap.swapDetails;
  const targetTokensIn = targetDetails.tokensIn.map(t => t.mint);
  const targetTokensOut = targetDetails.tokensOut.map(t => t.mint);

  const beforeTx = txIndex > 0 ? allBlockSwaps[txIndex - 1] : null;
  const afterTx = txIndex < allBlockSwaps.length - 1 ? allBlockSwaps[txIndex + 1] : null;

  if (!beforeTx || !afterTx) {
    return { detected: false };
  }

  const beforeTokensIn = beforeTx.swapDetails.tokensIn.map(t => t.mint);
  const beforeTokensOut = beforeTx.swapDetails.tokensOut.map(t => t.mint);
  const afterTokensIn = afterTx.swapDetails.tokensIn.map(t => t.mint);
  const afterTokensOut = afterTx.swapDetails.tokensOut.map(t => t.mint);

  const sameTokenPair = 
    targetTokensIn.some(t => beforeTokensOut.includes(t)) &&
    targetTokensOut.some(t => afterTokensIn.includes(t));

  if (sameTokenPair) {
    return {
      detected: true,
      confidence: 85,
      details: {
        reason: "Sandwich attack pattern detected",
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
 * Detect front-running and back-running
 */
function detectFrontBackRun(targetSwap, allBlockSwaps, txIndex) {
  const targetTokensIn = targetSwap.swapDetails.tokensIn.map(t => t.mint);
  const targetTokensOut = targetSwap.swapDetails.tokensOut.map(t => t.mint);

  if (txIndex > 0) {
    const beforeTokensIn = allBlockSwaps[txIndex - 1].swapDetails.tokensIn.map(t => t.mint);
    const beforeTokensOut = allBlockSwaps[txIndex - 1].swapDetails.tokensOut.map(t => t.mint);

    const samePair = 
      targetTokensIn.some(t => beforeTokensIn.includes(t)) &&
      targetTokensOut.some(t => beforeTokensOut.includes(t));

    if (samePair) {
      return {
        detected: true,
        type: "frontrun",
        confidence: 65,
        details: { reason: "Front-running detected - same trade executed first" }
      };
    }
  }

  if (txIndex < allBlockSwaps.length - 1) {
    const afterTokensIn = allBlockSwaps[txIndex + 1].swapDetails.tokensIn.map(t => t.mint);
    const afterTokensOut = allBlockSwaps[txIndex + 1].swapDetails.tokensOut.map(t => t.mint);

    const oppositeTrade = 
      targetTokensIn.some(t => afterTokensOut.includes(t)) &&
      targetTokensOut.some(t => afterTokensIn.includes(t));

    if (oppositeTrade) {
      return {
        detected: true,
        type: "backrun",
        confidence: 60,
        details: { reason: "Back-running detected - arbitrage after user trade" }
      };
    }
  }

  return { detected: false };
}

/**
 * Detect suspicious patterns
 */
function detectSuspiciousPatterns(swapTx) {
  const patterns = [];
  let confidenceBoost = 0;

  const totalSwaps = swapTx.swapDetails.totalGains + swapTx.swapDetails.totalLosses;
  if (totalSwaps > 4) {
    patterns.push("complex_multi_swap");
    confidenceBoost += 10;
  }

  if (swapTx.platforms && swapTx.platforms.length > 2) {
    patterns.push("multiple_dex_usage");
    confidenceBoost += 15;
  }

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
    "arbitrage": "Arbitrage - profiting from price differences across markets",
    "sandwich": "Sandwich attack - manipulating price around user transaction",
    "frontrun": "Front-running - copying user trade with higher priority",
    "backrun": "Back-running - following user trade to extract arbitrage",
    "multiple": "Multiple MEV strategies detected"
  };
  
  return descriptions[mevType] || "Unknown MEV type";
}
