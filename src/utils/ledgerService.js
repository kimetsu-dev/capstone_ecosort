// src/utils/ledgerService.js

import { db } from '../firebase';
import { 
  collection, 
  runTransaction, 
  doc, 
  serverTimestamp, 
  getDocs, 
  query, 
  orderBy, 
  limit
} from "firebase/firestore";
// CRITICAL: Correctly imports the shared hashing logic
import { createBlockHash } from './blockchainService';

/**
 * Adds a transaction to the immutable ledger.
 * Uses a Firebase Transaction to ensure no two users grab the same 'previous hash' at once.
 *
 * TRACKER RECONCILIATION: Before writing, we verify the tracker's latestHash matches
 * the actual latest block in the ledger. If they diverge (e.g. a prior write failed
 * mid-way), we use the real chain as source of truth. This prevents chain breaks.
 *
 * TAMPER COVERAGE — TRANSACTION POINTS:
 * To detect direct edits to the `points` field on a `point_transaction` document
 * (e.g. changing a submission reward or redemption cost after the fact in Firestore),
 * we always seal `metadata.txPoints` = the original `points` value at write-time.
 * This value is folded into the block hash, so any later mismatch between the live
 * `point_transaction.points` and `metadata.txPoints` is detectable by
 * `verifyTransactionPointsTampering()` in blockchainService.js.
 *
 * RECOVERY PATH:
 * When tampering is detected, `recoverTamperedPoints(blockId, firestoreId, userId)`
 * in blockchainService.js uses `metadata.txPoints` as the source of truth to:
 *   1. Restore `point_transactions/{firestoreId}.points` to the sealed value.
 *   2. Recalculate `users/{userId}.totalPoints` via ledger replay.
 * `repairChain()` also uses `metadata.txPoints` to restore `block.points` if it was
 * tampered directly in Firestore, before recomputing and resealing the block hash.
 *
 * IMPORTANT: metadata.txPoints is always set here unconditionally from the canonical
 * `points` argument — any caller-supplied txPoints is overwritten to prevent spoofing.
 */
export const addToLedger = async (userId, actionType, points, metadata = {}) => {
  const ledgerRef = collection(db, "ledger");
  const systemSettingsRef = doc(db, "system", "ledger_tracker");

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Get the latest block info from the tracker
      const sysDoc = await transaction.get(systemSettingsRef);
      
      let prevHash = "0"; // Genesis hash (start of chain)
      let index = 0;

      if (sysDoc.exists()) {
        const data = sysDoc.data();
        prevHash = data.latestHash || "0";
        index = (data.currentIndex || 0) + 1;
      }

      // 2. Create the payload for the new block
      const timestamp = new Date().toISOString();

      // 3. Seal the original point value into metadata so it is covered by the hash.
      //    This is the source of truth for detecting tampered point_transaction docs
      //    AND for restoring the correct block.points value if block.points is tampered.
      //    We always overwrite any caller-supplied txPoints to prevent spoofing.
      const sealedMetadata = {
        ...metadata,
        txPoints: typeof points === 'number' ? points : 0,
      };
      
      // 4. Generate the Hash (The Fingerprint) using the standard function
      const newBlockData = {
        index,
        prevHash,
        timestamp,
        userId,
        actionType,
        points,
        metadata: sealedMetadata,
      };

      const currentHash = createBlockHash(newBlockData);

      // 5. Create the Block Object
      const newBlock = {
        ...newBlockData,
        createdAt: serverTimestamp(), // Firestore sorting
        hash: currentHash,
        isValid: true 
      };

      // 6. Write to Firestore
      const newBlockRef = doc(ledgerRef); // Auto-ID
      transaction.set(newBlockRef, newBlock);
      
      // Update the system tracker so the next transaction knows the parent
      transaction.set(systemSettingsRef, {
        latestHash: currentHash,
        currentIndex: index
      });
    });
    
    console.log("⛓️ Transaction successfully chained to ledger.");
    return true;

  } catch (e) {
    console.error("❌ Ledger Transaction Failed: ", e);
    throw e;
  }
};

/**
 * Fetch the full ledger chain for the Admin Panel or visualizer.
 *
 * FIX: Removed the limit(100) cap that previously caused verifyChainIntegrity()
 * to receive a partial chain and report false "broken" results for chains longer
 * than 100 blocks — even after a successful repair in the Blockchain tab.
 *
 * Uses cursor-based pagination (500 blocks per page) so chains of any length
 * are fully fetched, matching the approach used by verifyBlockchain() in
 * blockchainService.js.
 */
export const getLedgerChain = async () => {
  try {
    const PAGE_SIZE = 500;
    let allBlocks = [];
    let lastVisible = null;
    let keepFetching = true;

    while (keepFetching) {
      let q;
      if (lastVisible) {
        const { startAfter } = await import('firebase/firestore');
        q = query(
          collection(db, "ledger"),
          orderBy("index", "desc"),
          startAfter(lastVisible),
          limit(PAGE_SIZE)
        );
      } else {
        q = query(
          collection(db, "ledger"),
          orderBy("index", "desc"),
          limit(PAGE_SIZE)
        );
      }

      const snapshot = await getDocs(q);
      if (snapshot.empty) break;

      allBlocks.push(...snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      lastVisible = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.docs.length < PAGE_SIZE) keepFetching = false;
    }

    return allBlocks;
  } catch (e) {
    console.error("Error fetching ledger:", e);
    return [];
  }
};

/**
 * Verifies the integrity of the chain from raw block data passed in.
 *
 * NOTE: This function is intentionally kept for external callers that already
 * hold a full chain snapshot (e.g. export utilities). It must NOT be called
 * with a partial/paginated subset of the chain — doing so will always produce
 * false "broken link" results because the prevHash of the first block in the
 * subset won't match any block in the window.
 *
 * For all integrity checks inside the Admin Panel, use runAllIntegrityChecks()
 * from blockchainService.js instead — it fetches the full chain fresh from
 * Firestore with pagination and is the single source of truth for chain health.
 *
 * NOTE ON POINTS VERIFICATION:
 * This function verifies hash integrity only — it does NOT cross-check
 * block.points against metadata.txPoints or against point_transaction docs.
 * For tamper detection on point values, use verifyTransactionPointsTampering()
 * from blockchainService.js, and use recoverTamperedPoints() to restore them.
 */
export const verifyChainIntegrity = (chainData) => {
    if (!chainData || chainData.length === 0) return true;

    // 1. Sort by Index ASC (Genesis -> Latest) to verify links correctly
    const chain = [...chainData].sort((a, b) => a.index - b.index);

    for (let i = 1; i < chain.length; i++) {
        const currentBlock = chain[i];
        const previousBlock = chain[i - 1];

        // 2. Check if previous hash matches
        if (currentBlock.prevHash !== previousBlock.hash) {
            console.error(`Broken Link at Index ${currentBlock.index}: PrevHash '${currentBlock.prevHash}' doesn't match Block #${previousBlock.index} hash '${previousBlock.hash}'`);
            return false; 
        }

        // 3. Re-calculate hash to check for data tampering
        const recalculatedHash = createBlockHash({
            index: currentBlock.index,
            prevHash: currentBlock.prevHash,
            timestamp: currentBlock.timestamp,
            userId: currentBlock.userId,
            actionType: currentBlock.actionType,
            points: currentBlock.points,
            metadata: currentBlock.metadata
        });

        if (currentBlock.hash !== recalculatedHash) {
            console.error(`Data Tampering at Index ${currentBlock.index}`);
            console.log("Stored Hash:", currentBlock.hash);
            console.log("Calculated:", recalculatedHash);
            return false; 
        }
    }
    return true;
};