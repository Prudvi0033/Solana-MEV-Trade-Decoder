export function detectMEV(swapTransaction, allBlockSwaps = [], txIndex = -1) {
  const result = {
    isMev: false,
    mevType: null,
    confidence: 0,
    details: null,
  };

  if (!swapTransaction.swapDetected) {
    return result;
  }

  // 1.Sandwich Attack (95%+ confidence)
  if (allBlockSwaps.length >= 3 && txIndex >= 1 && txIndex < allBlockSwaps.length - 1) {
    const sandwichResult = detectSandwich(swapTransaction, allBlockSwaps, txIndex);
    if (sandwichResult.detected) {
      result.isMev = true;
      result.mevType = "sandwich";
      result.confidence = sandwichResult.confidence;
      result.details = { sandwich: sandwichResult.details };
    }
  }

  // 2. Front/Back Running (90%+ confidence)
  if (allBlockSwaps.length >= 2 && txIndex !== -1) {
    const runningResult = detectFrontBackRun(swapTransaction, allBlockSwaps, txIndex);
    if (runningResult.detected) {
      result.isMev = true;
      result.mevType = result.mevType ? "multiple" : runningResult.type;
      result.confidence = Math.max(result.confidence, runningResult.confidence);
      result.details = { ...result.details, running: runningResult.details };
    }
  }

  return result;
}

function detectSandwich(targetSwap, allBlockSwaps, txIndex) {
  //get immidiate neighbours
  const beforeTx = allBlockSwaps[txIndex - 1];
  const afterTx = allBlockSwaps[txIndex + 1];

  // Same wallet before and after, different from target
  if (beforeTx.initiatorWallet !== afterTx.initiatorWallet || 
      targetSwap.initiatorWallet === beforeTx.initiatorWallet) {
    return { detected: false };
  }

  const targetTokensIn = targetSwap.swapDetails.tokensIn.map(t => t.mint);
  const targetTokensOut = targetSwap.swapDetails.tokensOut.map(t => t.mint);
  const beforeTokensIn = beforeTx.swapDetails.tokensIn.map(t => t.mint);
  const beforeTokensOut = beforeTx.swapDetails.tokensOut.map(t => t.mint);
  const afterTokensIn = afterTx.swapDetails.tokensIn.map(t => t.mint);
  const afterTokensOut = afterTx.swapDetails.tokensOut.map(t => t.mint);

  const isSandwich = 
    targetTokensOut.some(t => beforeTokensOut.includes(t)) &&  // Both buy same token
    targetTokensOut.some(t => afterTokensIn.includes(t)) &&    // After sells what target bought
    targetTokensIn.some(t => beforeTokensIn.includes(t));      // Both use same input token

  if (isSandwich) {
    return {
      detected: true,
      confidence: 97,
      details: {
        reason: "Sandwich attack detected",
        attackerWallet: beforeTx.initiatorWallet.slice(0, 8) + "...",
        victimWallet: targetSwap.initiatorWallet.slice(0, 8) + "..."
      }
    };
  }

  return { detected: false };
}

function detectFrontBackRun(targetSwap, allBlockSwaps, txIndex) {
  const targetTokensIn = targetSwap.swapDetails.tokensIn.map(t => t.mint);
  const targetTokensOut = targetSwap.swapDetails.tokensOut.map(t => t.mint);

  // front-running
  if (txIndex > 0) {
    const beforeTx = allBlockSwaps[txIndex - 1];
    
    if (beforeTx.initiatorWallet !== targetSwap.initiatorWallet) {
      const beforeTokensIn = beforeTx.swapDetails.tokensIn.map(t => t.mint);
      const beforeTokensOut = beforeTx.swapDetails.tokensOut.map(t => t.mint);

      // same token mints
      const sameTrade = 
        targetTokensIn.every(t => beforeTokensIn.includes(t)) &&
        targetTokensOut.every(t => beforeTokensOut.includes(t));

      if (sameTrade && isSuspiciousTiming(beforeTx, targetSwap)) {
        const botPattern = allBlockSwaps.filter(tx => 
          tx.initiatorWallet === beforeTx.initiatorWallet
        ).length >= 2;

        if (botPattern) {
          return {
            detected: true,
            type: "frontrun",
            confidence: 92,
            details: {
              reason: "Front-running detected",
              attackerWallet: beforeTx.initiatorWallet.slice(0, 8) + "..."
            }
          };
        }
      }
    }
  }

  //back-running
  if (txIndex < allBlockSwaps.length - 1) {
    const afterTx = allBlockSwaps[txIndex + 1];
    
    if (afterTx.initiatorWallet !== targetSwap.initiatorWallet) {
      const afterTokensIn = afterTx.swapDetails.tokensIn.map(t => t.mint);
      const afterTokensOut = afterTx.swapDetails.tokensOut.map(t => t.mint);

      // opposite direction with same tokens
      const reverseTrade = 
        targetTokensIn.some(t => afterTokensOut.includes(t)) &&
        targetTokensOut.some(t => afterTokensIn.includes(t));

      if (reverseTrade && isSuspiciousTiming(targetSwap, afterTx)) {
        const arbitragePattern = allBlockSwaps.filter(tx => 
          tx.initiatorWallet === afterTx.initiatorWallet
        ).length >= 2;

        if (arbitragePattern) {
          return {
            detected: true,
            type: "backrun",
            confidence: 94,
            details: {
              reason: "Back-running detected",
              attackerWallet: afterTx.initiatorWallet.slice(0, 8) + "..."
            }
          };
        }
      }
    }
  }

  return { detected: false };
}

function isSuspiciousTiming(tx1, tx2) {
  // Check timing gap
  if (tx1.timestamp && tx2.timestamp) {
    const timingGap = Math.abs(tx2.timestamp - tx1.timestamp);
    if (timingGap < 5000) return true; // Within 5 seconds
  }

  // Check gas price manipulation
  if (tx1.gasPrice && tx2.gasPrice) {
    const ratio = Math.max(tx1.gasPrice, tx2.gasPrice) / Math.min(tx1.gasPrice, tx2.gasPrice);
    if (ratio > 1.1) return true; // 10%+ gas difference
  }

  // Check transaction position proximity
  if (tx1.transactionIndex !== undefined && tx2.transactionIndex !== undefined) {
    const positionGap = Math.abs(tx2.transactionIndex - tx1.transactionIndex);
    if (positionGap <= 2) return true; // Within 2 positions
  }

  return false;
}

export function getMEVDescription(mevType) {
  const descriptions = {
    "sandwich": "Sandwich attack - manipulating price around user transaction",
    "frontrun": "Front-running - copying user trade with higher priority",
    "backrun": "Back-running - following user trade to extract arbitrage",
    "multiple": "Multiple MEV strategies detected"
  };
  
  return descriptions[mevType] || "Unknown MEV type";
}