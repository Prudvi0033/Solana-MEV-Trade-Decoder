import { getDexTransactions } from "./utils/getDexTransactions.js"

const main = async () => {
  const dexTransactions = await getDexTransactions();

  try {
    for(const txns of dexTransactions){
      console.log(txns.signature);
      console.log(txns.dexesUsed);
    }
  } catch (error) {
    console.log("Error", error);
    
  }
}

main()