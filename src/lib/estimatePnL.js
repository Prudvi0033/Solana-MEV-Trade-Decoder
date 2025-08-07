export const estimatePnL = (meta) => {
  if (!meta?.preTokenBalances || !meta?.postTokenBalances) {
    return null;
  }

  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  
  const usdcPre = meta.preTokenBalances.find(b => b.mint === USDC_MINT);
  const usdcPost = meta.postTokenBalances.find(b => b.mint === USDC_MINT);

  // Return "not USDC" if USDC isn't found in both pre and post balances
  if (!usdcPre && !usdcPost) {
    return "not USDC";
  }

  // If only one side has USDC, also return "not USDC" (partial match is ambiguous)
  if (!usdcPre || !usdcPost) {
    return "not USDC";
  }

  // Safety checks for token amounts
  if (!usdcPre.uiTokenAmount?.amount || !usdcPost.uiTokenAmount?.amount) {
    return null;
  }

  // Use uiAmount if available (already decimal-adjusted), otherwise calculate manually
  const preAmount = usdcPre.uiTokenAmount.uiAmount !== null 
    ? usdcPre.uiTokenAmount.uiAmount
    : Number(usdcPre.uiTokenAmount.amount) / Math.pow(10, usdcPre.uiTokenAmount.decimals);
    
  const postAmount = usdcPost.uiTokenAmount.uiAmount !== null
    ? usdcPost.uiTokenAmount.uiAmount
    : Number(usdcPost.uiTokenAmount.amount) / Math.pow(10, usdcPost.uiTokenAmount.decimals);

  // Calculate PnL (positive = profit, negative = loss)
  const pnl = postAmount - preAmount;
  
  // Round to 6 decimal places to avoid floating point precision issues
  return Math.round(pnl * 1000000) / 1000000;
};
