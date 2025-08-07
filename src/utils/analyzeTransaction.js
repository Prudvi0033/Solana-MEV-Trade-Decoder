import { DEX_PROGRAM_IDS } from "../constants.js";
import { decodedTradePath } from "../lib/decodedTradePath.js";
import { estimatePnL } from "../lib/estimatePnL.js";
import { getInitiatorWallet } from "../lib/getInitiatorWallet.js";

export const analyzeTransaction = async (transaction) => {
  const message = transaction?.transaction?.message;
  const instructions = message?.instructions;
  const accountKeys = message?.accountKeys;
  const meta = transaction?.meta;

  if (!instructions || !accountKeys || !message || !meta) {
    return null;
  }
  
  const usedDexes = new Set();
  const programCalls = [];
  const allProgramIds = new Set();

  instructions.forEach((ix, index) => {
    const programId = accountKeys[ix.programIdIndex]?.toString();
    allProgramIds.add(programId);
    
    if (DEX_PROGRAM_IDS[programId]) {
      const dexName = DEX_PROGRAM_IDS[programId];
      // Skip system/token programs for DEX classification
      if (!['System Program', 'Token Program', 'Token Program 2022', 'Associated Token Program'].includes(dexName)) {
        usedDexes.add(dexName);
        programCalls.push({
          dex: dexName,
          type: "main",
          index,
        });
      }
    }
  });

  // Analyze inner instructions
  let totalInnerInstructions = 0;
  const innerInstructions = meta?.innerInstructions || [];

  innerInstructions.forEach((group, groupIndex) => {
    totalInnerInstructions += group.instructions.length;

    group.instructions.forEach((innerIx, innerIndex) => {
      const programId = innerIx.programId
        ? innerIx.programId.toString()
        : accountKeys[innerIx.programIdIndex]?.toString();

      allProgramIds.add(programId);

      if (DEX_PROGRAM_IDS[programId]) {
        const dexName = DEX_PROGRAM_IDS[programId];
        // Skip system/token programs for DEX classification
        if (!['System Program', 'Token Program', 'Token Program 2022', 'Associated Token Program'].includes(dexName)) {
          usedDexes.add(dexName);
          programCalls.push({
            dex: dexName,
            type: "inner",
            groupIndex,
            innerIndex,
          });
        }
      }
    });
  });

  // If no DEX programs found but there are token balance changes, it might be a DEX we don't recognize
  if (usedDexes.size === 0 && (meta.preTokenBalances?.length || 0) > 0) {
    // Log unknown program IDs for debugging
    // console.log('Unknown DEX transaction detected. Program IDs:', Array.from(allProgramIds));
    
    const hasTokenSwap = meta.preTokenBalances?.length > 0 && meta.postTokenBalances?.length > 0;
    if (hasTokenSwap) {
      usedDexes.add('Unknown DEX');
      programCalls.push({
        dex: 'Unknown DEX',
        type: "unknown",
        index: 0,
      });
    }
  }

  if (usedDexes.size === 0) {
    if ((meta.preTokenBalances?.length || 0) === 0 && (meta.postTokenBalances?.length || 0) === 0) {
      return null; 
    } else {
      usedDexes.add('Native SOL Transfer');
    }
  }

  const initiatorWallet = getInitiatorWallet(transaction);
  const tradePath = decodedTradePath(transaction, accountKeys);

  return {
    signature: transaction.transaction.signatures[0],
    slot: transaction.slot,
    blockTime: transaction.blockTime,
    dexes: Array.from(usedDexes),
    programCalls,
    tradePath,
    initiatorWallet,
    profitNLoss: estimatePnL(meta),
    success: meta.err === null,
    fee: meta.fee,
    mainInstructions: instructions.length,
    innerInstructions: totalInnerInstructions,
    hasTokenChanges: (meta.preTokenBalances?.length || 0) > 0,
    tokenBalanceCount: (meta.preTokenBalances?.length || 0) + (meta.postTokenBalances?.length || 0),
    computeUnits: meta.computeUnitsConsumed || null,
    complexity:
      usedDexes.size > 1
        ? "high"
        : totalInnerInstructions > 10
        ? "medium"
        : "low",
  };
};