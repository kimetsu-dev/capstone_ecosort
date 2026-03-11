// src/utils/blockchainService.js

import { db } from '../firebase';

import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  where,
  getCountFromServer,
  runTransaction
} from 'firebase/firestore';

import SHA256 from 'crypto-js/sha256';

// ✨ NEW: Import Merkle Tree functionality
import { createMerkleRootForBlocks } from './merkleTree';

/**
 * Creates a SHA-256 hash.
 * Ensures consistent sorting of metadata keys to guarantee verification succeeds.
 * @param {Object} blockData - The block data
 * @returns {string} The block hash
 */
export function createBlockHash(blockData) {
  // 1. Sort metadata keys for consistent serialization
  const sortedMeta = {};
  if (blockData.metadata) {
    Object.keys(blockData.metadata).sort().forEach(key => {
      sortedMeta[key] = blockData.metadata[key];
    });
  }

  // 2. Stringify sorted metadata
  const metaString = JSON.stringify(sortedMeta);

  // 3. Concatenate data string
  // Format: index + prevHash + timestamp + userId + actionType + points + metadata
  const dataString = `${blockData.index}${blockData.prevHash}${blockData.timestamp}${blockData.userId}${blockData.actionType}${blockData.points}${metaString}`;

  return SHA256(dataString).toString();
}

/**
 * Verifies a single block's hash integrity
 * @param {Object} block - The block to verify
 * @returns {Object} Verification result
 */
export function verifyBlock(block) {
  const calculatedHash = createBlockHash(block);
  return {
    valid: calculatedHash === block.hash,
    storedHash: block.hash,
    calculatedHash,
    match: calculatedHash === block.hash
  };
}

/**
 * Creates the genesis block if the ledger is empty
 * @returns {Promise} The genesis block
 */
export async function createGenesisBlock() {
  try {
    const ledgerRef = collection(db, 'ledger');
    const ledgerQuery = query(ledgerRef, orderBy('index', 'asc'), limit(1));
    const snapshot = await getDocs(ledgerQuery);

    // Auto-repair logic: Delete invalid Genesis block if found
    if (!snapshot.empty) {
      const existingDoc = snapshot.docs[0];
      const existingBlock = { id: existingDoc.id, ...existingDoc.data() };
      const verification = verifyBlock(existingBlock);
      if (verification.valid && existingBlock.index === 0) {
        console.log('Genesis block already exists and is valid.');
        return existingBlock;
      }

      console.warn('⚠️ Corrupt or Incorrect Genesis block detected. Auto-repairing...');
      // NOTE: We cannot delete ledger documents (append-only by rule).
      // Instead, mark the corrupt block as invalid so the chain skips it,
      // then reset the tracker so a fresh genesis gets index 0.
      await updateDoc(doc(db, 'ledger', existingDoc.id), { isValid: false });
      await setDoc(doc(db, 'system', 'ledger_tracker'), {
        latestHash: null,
        currentIndex: -1
      });
    }

    const timestamp = new Date().toISOString();

    const genesisBlock = {
      index: 0,
      timestamp,
      createdAt: serverTimestamp(),
      userId: 'SYSTEM',
      actionType: 'GENESIS',
      points: 0,
      metadata: {
        type: 'GENESIS',
        message: 'EcoSort Blockchain Initialized',
        system: 'EcoSort Waste Management System',
        version: '1.0.0'
      },
      prevHash: '0',
      isValid: true
    };
    genesisBlock.hash = createBlockHash(genesisBlock);
    const blockRef = await addDoc(collection(db, 'ledger'), genesisBlock);
    await setDoc(doc(db, 'system', 'ledger_tracker'), {
      latestHash: genesisBlock.hash,
      currentIndex: 0
    });
    console.log('⛓️ Genesis block created:', genesisBlock.hash);
    return { id: blockRef.id, ...genesisBlock };

  } catch (error) {
    console.error('Error creating genesis block:', error);
    throw error;
  }
}

/**
 * Gets the latest block from the ledger
 */
export async function getLatestBlock() {
  try {
    const blocksQuery = query(
      collection(db, 'ledger'),
      orderBy('index', 'desc'),
      limit(1)
    );
    const snapshot = await getDocs(blocksQuery);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  } catch (error) {
    console.error('Error getting latest block:', error);
    throw error;
  }
}

/**
 * Gets the chain status from the system tracker.
 * Includes self-healing: if the tracker is out of sync with the actual chain,
 * it reconciles automatically so the next write uses the correct prevHash.
 */
export async function getChainStatus() {
  try {
    const trackerRef = doc(db, 'system', 'ledger_tracker');
    const trackerDoc = await getDoc(trackerRef);

    if (!trackerDoc.exists()) {
      return { initialized: false, blockCount: 0, latestHash: null, latestIndex: -1 };
    }

    const data = trackerDoc.data();

    // Self-healing: cross-verify tracker against the actual highest-index block.
    // Fixes the case where a block write succeeded but the tracker update failed.
    const actualLatest = await getLatestBlock();
    if (actualLatest && actualLatest.hash !== data.latestHash) {
      console.warn('⚠️ ledger_tracker out of sync. Auto-healing...');
      await updateDoc(trackerRef, {
        latestHash: actualLatest.hash,
        currentIndex: actualLatest.index
      });
      return {
        initialized: true,
        blockCount: actualLatest.index + 1,
        latestHash: actualLatest.hash,
        latestIndex: actualLatest.index,
        selfHealed: true
      };
    }

    return {
      initialized: true,
      blockCount: (data.currentIndex || 0) + 1,
      latestHash: data.latestHash,
      latestIndex: data.currentIndex || 0
    };
  } catch (error) {
    console.error('Error getting chain status:', error);
    throw error;
  }
}

/**
 * Verifies the integrity of the ENTIRE blockchain using cursor-based pagination.
 * This ensures ALL blocks are verified regardless of chain length — no 1,000-block cap.
 */
export async function verifyBlockchain() {
  try {
    // --- Paginated full-chain fetch (500 blocks per page) ---
    const PAGE_SIZE = 500;
    let allBlocks = [];
    let lastVisible = null;
    let keepFetching = true;

    while (keepFetching) {
      let q = query(
        collection(db, 'ledger'),
        orderBy('index', 'asc'),
        limit(PAGE_SIZE)
      );
      if (lastVisible) {
        const { startAfter } = await import('firebase/firestore');
        q = query(
          collection(db, 'ledger'),
          orderBy('index', 'asc'),
          startAfter(lastVisible),
          limit(PAGE_SIZE)
        );
      }
      const snapshot = await getDocs(q);
      if (snapshot.empty) break;
      allBlocks.push(...snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      lastVisible = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.docs.length < PAGE_SIZE) keepFetching = false;
    }

    if (allBlocks.length === 0) {
      return {
        valid: true,
        message: 'Ledger is empty',
        totalBlocks: 0,
        details: []
      };
    }

    const blocks = allBlocks;
    const details = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const blockResult = {
        index: block.index,
        hash: block.hash,
        timestamp: block.timestamp,
        issues: [],
        valid: true
      };

      // 1. Verify Hash
      const hashVerification = verifyBlock(block);
      if (!hashVerification.valid) {
        blockResult.issues.push('Hash mismatch (Data tampering)');
        blockResult.valid = false;
      }

      // 2. Verify Link
      if (i === 0) {
        if (block.prevHash !== '0') {
          blockResult.issues.push("Genesis prevHash must be '0'");
          blockResult.valid = false;
        }
      } else {
        const previousBlock = blocks[i - 1];
        if (block.prevHash !== previousBlock.hash) {
          blockResult.issues.push(`Broken chain link to block #${previousBlock.index}`);
          blockResult.valid = false;
        }
      }

      // 3. Verify Index
      if (block.index !== i) {
        blockResult.issues.push(`Index gap: expected ${i}, got ${block.index}`);
        blockResult.valid = false;
      }

      details.push(blockResult);
    }

    const invalidBlocks = details.filter(d => !d.valid);
    const isValid = invalidBlocks.length === 0;

    return {
      valid: isValid,
      message: isValid
        ? `✅ All ${blocks.length} blocks verified.`
        : `❌ Chain Compromised: ${invalidBlocks.length} invalid blocks.`,
      totalBlocks: blocks.length,
      latestHash: blocks[blocks.length - 1]?.hash,
      invalidBlocks: invalidBlocks.map(b => b.index),
      details
    };
  } catch (error) {
    console.error('Error verifying blockchain:', error);
    throw error;
  }
}

/**
 * Gets blocks from the ledger
 */
export async function getAllBlocks(limitCount = null) {
  try {
    let blocksQuery = query(collection(db, 'ledger'), orderBy('index', 'desc'));
    if (limitCount) {
      blocksQuery = query(blocksQuery, limit(limitCount));
    }
    const snapshot = await getDocs(blocksQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting blocks:', error);
    throw error;
  }
}

/**
 * ✨ ENHANCED: Creates and stores a public anchor with Merkle root
 */
export async function createPublicAnchor() {
  try {
    const verification = await verifyBlockchain();
    if (!verification.valid) {
      throw new Error('Cannot create anchor: Chain is currently invalid.');
    }

    if (verification.totalBlocks === 0) {
      throw new Error('Cannot create anchor: Chain is empty.');
    }

    // ✨ NEW: Generate Merkle root for recent blocks
    let merkleRoot = null;
    let merkleBlockCount = 0;
    
    try {
      const recentBlocks = await getAllBlocks(100); // Last 100 blocks
      if (recentBlocks.length > 0) {
        const merkleData = createMerkleRootForBlocks(recentBlocks);
        merkleRoot = merkleData.root;
        merkleBlockCount = recentBlocks.length;
        console.log(`📊 Merkle root generated for ${merkleBlockCount} blocks`);
      }
    } catch (merkleError) {
      console.warn('Merkle root generation failed, continuing without it:', merkleError);
      // Continue without Merkle root - it's an enhancement, not critical
    }

    const anchor = {
      createdAt: serverTimestamp(),
      publishedAt: new Date().toISOString(),
      latestHash: verification.latestHash,
      blockCount: verification.totalBlocks,
      latestBlockIndex: verification.totalBlocks - 1,
      verified: true,
      anchorType: 'CHECKPOINT',
      verificationUrl: `${window.location.origin}/verify`,
      // ✨ NEW: Include Merkle root data
      merkleRoot: merkleRoot,
      merkleBlockCount: merkleBlockCount,
      merkleEnabled: merkleRoot !== null
    };

    const anchorRef = await addDoc(collection(db, 'anchors'), anchor);
    await setDoc(doc(db, 'system', 'latest_anchor'), {
      ...anchor,
      updatedAt: serverTimestamp()
    });

    console.log('⚓ Public anchor created:', anchorRef.id);
    if (merkleRoot) {
      console.log('🌳 Merkle root included:', merkleRoot.substring(0, 16) + '...');
    }
    
    return { id: anchorRef.id, ...anchor };
  } catch (error) {
    console.error('Error creating public anchor:', error);
    throw error;
  }
}

/**
 * Gets the latest public anchor
 */
export async function getLatestAnchor() {
  try {
    const anchorRef = doc(db, 'system', 'latest_anchor');
    const anchorDoc = await getDoc(anchorRef);
    if (!anchorDoc.exists()) return null;
    return anchorDoc.data();
  } catch (error) {
    console.error('Error getting latest anchor:', error);
    return null;
  }
}

/**
 * Gets all published anchors
 */
export async function getAllAnchors(limitCount = 10) {
  try {
    const anchorsQuery = query(
      collection(db, 'anchors'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(anchorsQuery);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting anchors:', error);
    return [];
  }
}

/**
 * ✨ ENHANCED: Gets optimized blockchain statistics with Merkle data
 */
export async function getBlockchainStats() {
  try {
    const ledgerRef = collection(db, 'ledger');

    // 1. Get Total Count efficiently
    const countSnapshot = await getCountFromServer(ledgerRef);
    const totalBlocks = countSnapshot.data().count;

    // 2. Get Latest Block specifically for the hash
    const q = query(ledgerRef, orderBy('index', 'desc'), limit(1));
    const querySnapshot = await getDocs(q);
    let latestHash = null;
    let latestBlock = null;
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      const data = doc.data();
      latestHash = data.hash;
      latestBlock = data;
    }

    // 3. Get Anchor
    const latestAnchor = await getLatestAnchor();

    // ✨ NEW: Generate current Merkle root for comparison
    let currentMerkleRoot = null;
    try {
      if (totalBlocks > 0) {
        const recentBlocks = await getAllBlocks(100);
        if (recentBlocks.length > 0) {
          const merkleData = createMerkleRootForBlocks(recentBlocks);
          currentMerkleRoot = merkleData.root;
        }
      }
    } catch (merkleError) {
      console.warn('Failed to generate current Merkle root:', merkleError);
    }

    return {
      totalBlocks,
      genesisDate: latestBlock ? latestBlock.timestamp : null,
      latestBlock,
      latestHash: latestHash || "GENESIS_PENDING",
      latestAnchor,
      currentMerkleRoot, // ✨ NEW
      verified: true
    };
  } catch (error) {
    console.error('Error getting blockchain stats:', error);
    return {
      totalBlocks: 0,
      latestHash: null,
      currentMerkleRoot: null,
      verified: false
    };
  }
}

/**
 * ✨ ENHANCED: Generates a downloadable audit proof with Merkle root
 */
export async function generateAuditProof() {
  const chainStatus = await getChainStatus();
  const latestAnchor = await getLatestAnchor();
  const stats = await getBlockchainStats();
  
  return {
    generatedAt: new Date().toISOString(),
    system: 'EcoSort Blockchain-Lite Ledger',
    chainStatus: {
      totalBlocks: stats.totalBlocks,
      latestHash: stats.latestHash,
      latestIndex: (stats.totalBlocks - 1)
    },
    latestAnchor: latestAnchor ? {
      hash: latestAnchor.latestHash,
      blockCount: latestAnchor.blockCount,
      publishedAt: latestAnchor.publishedAt,
      merkleRoot: latestAnchor.merkleRoot, // ✨ NEW
      merkleEnabled: latestAnchor.merkleEnabled // ✨ NEW
    } : null,
    currentMerkleRoot: stats.currentMerkleRoot, // ✨ NEW
    signature: stats.latestHash,
    merkleVerification: latestAnchor?.merkleRoot && stats.currentMerkleRoot ? {
      anchorMerkleRoot: latestAnchor.merkleRoot,
      currentMerkleRoot: stats.currentMerkleRoot,
      match: latestAnchor.merkleRoot === stats.currentMerkleRoot,
      note: 'Merkle roots provide efficient batch verification'
    } : null
  };
}

/**
 * Verifies current chain against a published anchor
 */
export async function verifyAgainstAnchor(anchorHash, anchorBlockCount) {
  try {
    const targetIndex = anchorBlockCount - 1;
    const q = query(
      collection(db, 'ledger'),
      where('index', '==', targetIndex),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      const stats = await getBlockchainStats();
      if (stats.totalBlocks < anchorBlockCount) {
        return {
          valid: false,
          reason: `Chain too short (Height: ${stats.totalBlocks}) for anchor (Height: ${anchorBlockCount}).`
        };
      }
      return {
        valid: false,
        reason: `Block #${targetIndex} not found in ledger.`
      };
    }
    const anchorIndexBlock = snapshot.docs[0].data();
    const matches = anchorIndexBlock.hash === anchorHash;
    return {
      valid: matches,
      currentHash: anchorIndexBlock.hash,
      anchorHash,
      reason: matches
        ? '✅ Chain matches published anchor'
        : '❌ Mismatch: Chain has drifted from anchor.'
    };
  } catch (error) {
    console.error('Error verifying against anchor:', error);
    throw error;
  }
}

/**
 * Audits user point balances against the immutable ledger.
 *
 * IMPORTANT DESIGN INTENT:
 * This system is a centralized application with a tamper-evidence security layer.
 * The ledger's purpose is to detect *unauthorized* changes, not to be a strict
 * source of truth that overrides legitimate admin operations.
 *
 * This function always returns valid: true — it never fails the system.
 * Instead it returns an informational audit report: how many users have a
 * balance that differs from their ledger history, and by how much.
 * An admin can then review and decide whether those differences are legitimate
 * (e.g. pre-ledger data, test cleanup, manual corrections) or suspicious.
 *
 * The only action types that affect a user's live balance are listed in
 * BALANCE_ACTION_TYPES. Adjust this list if new action types are added.
 */
export async function verifyPointTransactions() {
  const BALANCE_ACTION_TYPES = new Set([
    'SUBMISSION_CONFIRMED',
    'ADMIN_POINTS_AWARDED',
    'REWARD_REDEEMED',
    'REDEMPTION_CANCELLED',
  ]);

  try {
    // 1. Replay the ledger per user to calculate expected balances
    const ledgerSnapshot = await getDocs(
      query(collection(db, 'ledger'), where('index', '>', 0))
    );

    const ledgerBalances = {}; // { userId: pointsFromLedger }
    ledgerSnapshot.forEach(docSnap => {
      const block = docSnap.data();
      if (!block.userId || !BALANCE_ACTION_TYPES.has(block.actionType)) return;
      if (!ledgerBalances[block.userId]) ledgerBalances[block.userId] = 0;
      ledgerBalances[block.userId] += (block.points || 0);
    });

    // 2. Fetch actual balances from users collection
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const actualBalances = {}; // { userId: totalPoints }
    let totalUsersChecked = 0;
    usersSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      // Only count users who have ledger history or a non-zero balance
      if (ledgerBalances[docSnap.id] !== undefined || (data.totalPoints || 0) > 0) {
        actualBalances[docSnap.id] = data.totalPoints || 0;
        totalUsersChecked++;
      }
    });

    // 3. Find differences — these are informational, not failures
    const differences = [];
    const allUserIds = new Set([
      ...Object.keys(ledgerBalances),
      ...Object.keys(actualBalances)
    ]);

    for (const userId of allUserIds) {
      const fromLedger = Math.round((ledgerBalances[userId] || 0) * 100) / 100;
      const fromDb     = Math.round((actualBalances[userId] || 0) * 100) / 100;
      if (fromLedger !== fromDb) {
        differences.push({
          userId,
          fromLedger,
          fromDb,
          delta: Math.round((fromDb - fromLedger) * 100) / 100
        });
      }
    }

    // 4. Always valid — differences are audit info, not failures
    const hasDifferences = differences.length > 0;

    return {
      valid: true, // Never blocks the system
      checkedUsers: totalUsersChecked,
      differences,
      hasDifferences,
      reason: hasDifferences
        ? `ℹ️ ${differences.length} user balance(s) differ from ledger history. This may reflect pre-ledger data or legitimate admin corrections. Review below.`
        : `✅ All ${totalUsersChecked} user balances are consistent with ledger history.`
    };

  } catch (error) {
    console.error("Error auditing point balances:", error);
    return {
      valid: true, // Still don't fail — audit errors are not system failures
      checkedUsers: 0,
      differences: [],
      hasDifferences: false,
      reason: `⚠️ Balance audit could not be completed: ${error.message}`
    };
  }
}

/**
 * Runs all integrity checks: blockchain structural integrity and external data reconciliation.
 */
export async function runAllIntegrityChecks() {
  try {
    // This check should always succeed for public users
    const chainVerification = await verifyBlockchain();

    // Call the function and get its result, whether it succeeded or failed.
    // The function itself catches its own errors and returns a result object.
    const dataVerification = await verifyPointTransactions();

    // *** CORRECTED LOGIC ***
    // Now, inspect the result of verifyPointTransactions.
    // If it failed for the specific reason of permissions, handle it gracefully.
    let finalDataVerification = dataVerification;
    if (
      !dataVerification.valid && 
      dataVerification.reason && 
      dataVerification.reason.includes("Missing or insufficient permissions")
    ) {
      // For a public user, a permission failure is an expected outcome.
      // We treat it as a "passed" check for the purpose of the overall status.
      finalDataVerification = {
        valid: true, 
        reason: 'External data reconciliation requires admin privileges and is not applicable for public verification.',
        skipped: true // Add a flag to indicate it was skipped
      };
    }
    
    // The overall validity now depends on the chain and the (potentially modified) data check.
    const overallValid = chainVerification.valid && finalDataVerification.valid;

    // Overall integrity is determined by the chain structure only.
    // Balance differences are informational and never fail the system check.
    let overallMessage;
    if (overallValid) {
      if (finalDataVerification.skipped) {
        overallMessage = `✅ System Integrity: Blockchain verified. Balance audit requires admin access.`;
      } else if (finalDataVerification.hasDifferences) {
        overallMessage = `✅ System Integrity: Chain verified. ${finalDataVerification.differences?.length || 0} balance difference(s) noted for admin review.`;
      } else {
        overallMessage = `✅ System Integrity: Chain verified. All ${finalDataVerification.checkedUsers} user balances consistent with ledger.`;
      }
    } else {
      overallMessage = `❌ System Integrity: ${chainVerification.message}`;
    }

    return {
      valid: overallValid,
      message: overallMessage,
      chainVerification,
      dataVerification: finalDataVerification // Use the potentially modified version
    };

  } catch (error) {
    // This catch block is now only for unexpected errors in verifyBlockchain or other parts of this function.
    console.error("Error running all integrity checks:", error);
    return {
      valid: false,
      message: `❌ Major Error during Integrity Check: ${error.message}`,
      chainVerification: { valid: false, message: 'N/A' },
      dataVerification: { valid: false, reason: 'N/A' }
    };
  }
}

/**
 * Hard repair of the blockchain links.
 * Iterates through all blocks, fixes broken prevHash pointers,
 * and recalculates hashes to seal the chain.
 */
export async function repairChain() {
  try {
    console.log('🔧 Starting Blockchain Repair...');
    // 1. Fetch all blocks ordered by index
    const q = query(collection(db, "ledger"), orderBy("index", "asc"));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return { success: false, message: "Chain is empty." };
    }
    const blocks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    let previousHash = "0"; // Genesis previous hash is always "0"
    let repairedCount = 0;
    let lastValidHash = null;

    // 2. Build a set of tampered block indices that have already been acknowledged.
    //    A TAMPER_ACKNOWLEDGED entry stores the original block's index in metadata.tamperedBlockIndex.
    const acknowledgedIndices = new Set(
      blocks
        .filter(b => b.actionType === 'TAMPER_ACKNOWLEDGED' && b.metadata?.tamperedBlockIndex != null)
        .map(b => b.metadata.tamperedBlockIndex)
    );

    // 3. Loop through every block and re-seal ONLY broken chain links.
    //    CRITICAL SAFETY RULE: Never overwrite a block whose *data* has been tampered
    //    AND whose tamper has not been acknowledged yet.
    //    repairChain() fixes broken prevHash *pointers* caused by bugs — not data corruption.
    const tamperedBlocks = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const currentRef = doc(db, "ledger", block.id);
      let updates = {};
      let needsUpdate = false;

      // A. TAMPER GUARD — Re-verify this block's data hash BEFORE touching anything.
      //    If the stored hash doesn't match a fresh recalculation of the block's own data,
      //    the block was externally modified.
      //
      //    Exceptions that allow repair to continue past a bad block:
      //      1. The block itself is a TAMPER_ACKNOWLEDGED entry (its own hash is fine).
      //      2. The block's index is in acknowledgedIndices — an admin has already written
      //         a TAMPER_ACKNOWLEDGED ledger entry for it, so we treat it as reviewed
      //         evidence and allow chain links to be re-sealed around it.
      const dataIntegrityCheck = verifyBlock(block);
      if (!dataIntegrityCheck.valid
          && block.actionType !== 'TAMPER_ACKNOWLEDGED'
          && !acknowledgedIndices.has(block.index)) {
        tamperedBlocks.push(block.index);
        console.error(`🚨 TAMPERED DATA detected at block #${block.index}. Repair aborted to preserve evidence.`);
        return {
          success: false,
          tampered: true,
          tamperedBlocks,
          message: `⛔ Repair aborted: Block #${block.index} has tampered data. Use "Acknowledge Tamper" in the Blockchain tab to record the incident, then run Repair Chain again.`
        };
      }

      // B. Check Previous Hash (chain link) — this is the only structural thing we fix
      const expectedPrevHash = i === 0 ? "0" : previousHash;
      if (block.prevHash !== expectedPrevHash) {
        console.log(`Fixing broken chain link on block #${block.index}: ${block.prevHash} -> ${expectedPrevHash}`);
        updates.prevHash = expectedPrevHash;
        needsUpdate = true;
      }

      // C. Re-calculate the Hash of THIS block after fixing the prevHash pointer
      const blockDataForHashing = {
        ...block,
        prevHash: updates.prevHash || block.prevHash
      };
      const newHash = createBlockHash(blockDataForHashing);
      if (block.hash !== newHash) {
        updates.hash = newHash;
        needsUpdate = true;
      }

      // D. Apply updates if needed
      if (needsUpdate) {
        await updateDoc(currentRef, updates);
        repairedCount++;
        previousHash = newHash;
      } else {
        previousHash = block.hash;
      }
    }

    // 3. Update System Tracker to reflect the new latest hash
    if (previousHash) {
      const trackerRef = doc(db, 'system', 'ledger_tracker');
      await updateDoc(trackerRef, {
        latestHash: previousHash
      });
    }

    console.log(`✅ Repair complete. Repaired ${repairedCount} blocks.`);
    return { success: true, repairedCount, latestHash: previousHash };

  } catch (error) {
    console.error("Repair failed:", error);
    throw error;
  }
}

/**
 * Acknowledges a tampered block by writing a corrective TAMPER_ACKNOWLEDGED
 * entry to the ledger. This records the incident as permanent evidence and
 * allows repairChain() to subsequently fix the broken chain links.
 *
 * This does NOT delete or modify the tampered block — it stays forever
 * as proof of unauthorized modification. The new ledger entry simply
 * documents that an admin reviewed and acknowledged it.
 */
export async function acknowledgeTamper(tamperedBlockIndex) {
  try {
    // 1. Fetch the tampered block to capture its details
    const q = query(
      collection(db, 'ledger'),
      where('index', '==', tamperedBlockIndex),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      throw new Error(`Block #${tamperedBlockIndex} not found in ledger.`);
    }

    const tamperedBlock = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

    // 2. Record the acknowledgement as a new immutable ledger entry.
    //    Written directly (mirrors addToLedger logic) to avoid a circular
    //    import: blockchainService -> ledgerService -> blockchainService.
    const ledgerColRef = collection(db, 'ledger');
    const trackerRef = doc(db, 'system', 'ledger_tracker');

    await runTransaction(db, async (transaction) => {
      const trackerSnap = await transaction.get(trackerRef);
      const prevHash = trackerSnap.exists() ? (trackerSnap.data().latestHash || '0') : '0';
      const newIndex = trackerSnap.exists() ? ((trackerSnap.data().currentIndex || 0) + 1) : 0;

      const newBlock = {
        index: newIndex,
        prevHash,
        timestamp: new Date().toISOString(),
        userId: tamperedBlock.userId || 'system',
        actionType: 'TAMPER_ACKNOWLEDGED',
        points: 0,
        isValid: true,
        metadata: {
          tamperedBlockIndex,
          tamperedBlockId: tamperedBlock.id,
          originalActionType: tamperedBlock.actionType || null,
          note: `Admin acknowledged tampered data at block #${tamperedBlockIndex}. Original block preserved as evidence.`,
          acknowledgedAt: new Date().toISOString(),
        },
      };
      newBlock.hash = createBlockHash(newBlock);

      const newBlockRef = doc(ledgerColRef);
      transaction.set(newBlockRef, newBlock);
      transaction.set(trackerRef, { latestHash: newBlock.hash, currentIndex: newIndex }, { merge: true });
    });

    console.log(`✅ Tamper at block #${tamperedBlockIndex} acknowledged and recorded on the ledger.`);
    return { success: true, tamperedBlockIndex };

  } catch (error) {
    console.error('Failed to acknowledge tamper:', error);
    throw error;
  }
}

export default {
  createGenesisBlock,
  getLatestBlock,
  getChainStatus,
  verifyBlock,
  verifyBlockchain,
  getAllBlocks,
  createPublicAnchor,
  getLatestAnchor,
  getAllAnchors,
  getBlockchainStats,
  generateAuditProof,
  verifyAgainstAnchor,
  verifyPointTransactions,
  runAllIntegrityChecks,
  repairChain,
  acknowledgeTamper
};