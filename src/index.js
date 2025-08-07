import { getAnalyzedDexTransactions } from "./utils/getDexTransactions.js"

const main = async () => {
  const analyzedTransactions = await getAnalyzedDexTransactions();

  console.log(`Analysis Results: ${analyzedTransactions.length} DEX Transactions`);
  
  analyzedTransactions.forEach((tx, index) => {
    console.log(`\n${index + 1}. 📄 Signature: ${tx.signature}`);
    console.log(`   ⏳ Slot: ${tx.slot}`);
    console.log(`   🕒 BlockTime: ${tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : 'N/A'}`);
    console.log(`   📊 DEXes: ${tx.dexes.join(", ")}`);
    console.log(`   🔁 Program Calls: ${tx.programCalls.length} calls`);
    console.log(`   👤 Initiator: ${tx.initiatorWallet}`); // Fixed typo
    console.log(`   🧾 Trade Path: ${tx.tradePath || 'No path detected'}`); // Fixed - tradePath is a string, not array
    console.log(`   ✅ Success: ${tx.success}`);
    console.log(`   💸 Fee: ${tx.fee} lamports`);
    console.log(`   🧩 Instructions: Main = ${tx.mainInstructions}, Inner = ${tx.innerInstructions}`);
    console.log(`   🔄 Token Changes: ${tx.hasTokenChanges} | Token Balance Count: ${tx.tokenBalanceCount}`);
    console.log(`   ⚙️ Compute Units: ${tx.computeUnits || 'N/A'}`);
    console.log(`   📉 Complexity: ${tx.complexity}`);
  })
}

main()