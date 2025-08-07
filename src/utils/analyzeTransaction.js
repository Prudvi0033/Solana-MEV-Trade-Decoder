import { DEX_PROGRAM_IDS } from "../constants.js";

export const analyzeTransaction = async (transaction) => {
  const message = transaction?.transaction?.message;
  const instructions = message?.instructions;
  const accountKeys = message?.accountKeys;
  const meta = transaction?.meta;

  if (!instructions || !accountKeys || !message) return null;

  const usedDexes = new Set();
  const programCalls = [];

  instructions.forEach((ix, index) => {
    const programId = accountKeys[ix.programIdIndex]?.toString();
    if (DEX_PROGRAM_IDS[programId]) {
      usedDexes.add(DEX_PROGRAM_IDS[programId]);
      programCalls.push({
        dex: DEX_PROGRAM_IDS[programId],
        type: "main",
        index,
      });
    }
  });

  let totalInnerInstructions = 0;
  const innerInstructions = meta?.innerInstructions || [];

  innerInstructions.forEach((group, groupIndex) => {
    totalInnerInstructions += group.instructions.length;

    group.instructions.forEach((innerIx, innerIndex) => {
      const programId = innerIx.programId
        ? innerIx.programId.toString()
        : accountKeys[innerIx.programIdIndex]?.toString();

      if (DEX_PROGRAM_IDS[programId]) {
        usedDexes.add(DEX_PROGRAM_IDS[programId]);
        programCalls.push({
          dex: DEX_PROGRAM_IDS[programId],
          type: "inner",
          groupIndex,
          innerIndex,
        });
      }
    });
  });

  if (usedDexes.size === 0) return null;

  return {
    signature: transaction.transaction.signatures[0],
    slot: transaction.slot,
    blockTime: transaction.blockTime,
    dexes: Array.from(usedDexes),
    programCalls,
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
