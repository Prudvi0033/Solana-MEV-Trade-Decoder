import { DEX_PROGRAM_IDS } from '../constants.js';

export const decodedTradePath = (transaction, accountKeys) => {
    const path = [];
    const instructions = transaction?.transaction?.message?.instructions || [];

    instructions.forEach((ix) => {
        const programId = accountKeys[ix.programIdIndex]?.toString();

        // Only process if it's a real DEX program in our mapping
        const dexName = DEX_PROGRAM_IDS[programId];
        if (dexName) {
            // Check if instruction has accounts
            if (ix.accounts && ix.accounts.length > 1) {
                const firstAccount = accountKeys[ix.accounts[0]]?.toString();
                const lastAccount = accountKeys[ix.accounts[ix.accounts.length - 1]]?.toString();

                if (firstAccount && lastAccount && firstAccount !== lastAccount) {
                    path.push(`${firstAccount.substring(0, 8)}... → ${lastAccount.substring(0, 8)}... via ${dexName}`);
                }
            }
        }
    });
    
    return path.length > 0 ? path.join(" -> ") : "No trade path detected";
};