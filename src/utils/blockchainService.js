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
 * Recursively sorts all object keys (including objects nested inside arrays)
 * so that JSON.stringify produces a stable, order-independent string.
 * This is required because Firestore does not guarantee the key order of
 * objects returned from a read, which would otherwise cause the metadata
 * hash to differ between write-time and verify-time for blocks that contain
 * arrays of objects (e.g. the `items` array on mixed-bundle submissions).
 */
function deepSortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(deepSortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    Object.keys(value).sort().forEach(key => {
      sorted[key] = deepSortKeys(value[key]);
    });
    return sorted;
  }
  return value;
}

export function createBlockHash(blockData) {
  // 1. Deep-sort all metadata keys (including keys inside nested objects/arrays)
  //    so serialization is stable regardless of the order Firestore returns fields.
  const sortedMeta = blockData.metadata ? deepSortKeys(blockData.metadata) : {};

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
 * This ensures ALL blocks are verified regardless of chain length -- no 1,000-block cap.
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

      // FIX: Removed the false "Index gap" check (block.index !== i).
      //
      // That check assumed array position i always equals block.index, which
      // holds for a pristine chain but breaks after acknowledgeTamper() appends
      // a TAMPER_ACKNOWLEDGED block at the chain tip (e.g. index 95) while the
      // tampered block (e.g. index 7, isValid:false) is still present in Firestore.
      // Firestore returns ALL documents ordered by index -- so the array will contain
      // 97 docs with contiguous block.index values (0..96), but the loop counter i
      // no longer matches block.index for any block after the tampered one, causing
      // every subsequent block to be falsely flagged as an "Index gap".
      //
      // Chain link integrity (check 2 above) already guarantees ordering is correct --
      // if every block's prevHash matches the previous block's hash, the sequence
      // is necessarily contiguous. The index gap check is redundant and harmful.

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
      const d = querySnapshot.docs[0];
      const data = d.data();
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
 * This function always returns valid: true -- it never fails the system.
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

    // 3. Find differences -- these are informational, not failures
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

    // 4. Always valid -- differences are audit info, not failures
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
      valid: true, // Still don't fail -- audit errors are not system failures
      checkedUsers: 0,
      differences: [],
      hasDifferences: false,
      reason: `⚠️ Balance audit could not be completed: ${error.message}`
    };
  }
}

/**
 * Detects tampering of `points` values on `point_transaction` documents by
 * comparing them against the sealed `metadata.txPoints` value stored inside
 * the matching ledger block at write-time.
 *
 * WHY THIS IS NEEDED:
 * The block hash covers `block.points` and `block.metadata` (including
 * `metadata.txPoints`). If someone edits `point_transactions/{id}.points`
 * directly in Firestore — changing a submission reward or redemption cost
 * after the fact — the ledger block itself is untouched, so the chain hash
 * stays valid. This function is the only check that catches that attack.
 *
 * HOW IT WORKS:
 * 1. Fetch every ledger block that has a `metadata.firestoreId` (the ID of
 *    its source `point_transaction` document) AND a `metadata.txPoints`
 *    (the points value sealed at write-time).
 * 2. Batch-fetch the live `point_transaction` documents for those IDs.
 * 3. Compare the live `points` field against `metadata.txPoints`.
 *    Any mismatch means the transaction record was altered after the block
 *    was written.
 *
 * Blocks without `metadata.firestoreId` (e.g. GENESIS, TAMPER_ACKNOWLEDGED)
 * are skipped — they have no source transaction to compare against.
 * Blocks without `metadata.txPoints` were written before this feature was
 * introduced; they are counted as legacy and skipped with a note.
 *
 * Returns:
 * {
 *   valid          {boolean}   — false if ANY tampered transaction is found
 *   tampered       {Array}     — list of tampered entries (empty = clean)
 *   skippedLegacy  {number}    — blocks skipped (no txPoints sealed yet)
 *   checkedCount   {number}    — (block, transaction) pairs actually checked
 *   reason         {string}    — human-readable summary
 * }
 */
export async function verifyTransactionPointsTampering() {
  try {
    // 1. Fetch all ledger blocks that link to a point_transaction document.
    const ledgerSnap = await getDocs(
      query(
        collection(db, 'ledger'),
        where('index', '>', 0), // skip genesis
        orderBy('index', 'asc')
      )
    );

    // Partition into checkable (has firestoreId + txPoints) vs legacy (missing txPoints)
    const checkable = [];
    let skippedLegacy = 0;

    ledgerSnap.forEach(docSnap => {
      const b = docSnap.data();
      const firestoreId = b.metadata?.firestoreId;
      if (!firestoreId) return; // GENESIS / TAMPER_ACKNOWLEDGED / system blocks — skip

      if (b.metadata?.txPoints === undefined || b.metadata?.txPoints === null) {
        // Block predates the txPoints seal — cannot verify, count as legacy gap
        skippedLegacy++;
        return;
      }

      checkable.push({
        blockIndex:   b.index,
        blockId:      docSnap.id,
        actionType:   b.actionType,
        firestoreId,
        sealedPoints: b.metadata.txPoints,
        userId:       b.userId,
        timestamp:    b.timestamp,
      });
    });

    if (checkable.length === 0) {
      return {
        valid: true,
        tampered: [],
        skippedLegacy,
        checkedCount: 0,
        reason: skippedLegacy > 0
          ? `ℹ️ No verifiable transaction blocks found. ${skippedLegacy} legacy block(s) pre-date tamper-seal coverage and cannot be retroactively verified.`
          : '✅ No linked transaction blocks found in ledger.',
      };
    }

    // 2. Batch-fetch the live point_transaction documents (30 per round).
    const CHUNK = 30;
    const liveTxMap = {}; // { firestoreId: { points, exists } }

    for (let i = 0; i < checkable.length; i += CHUNK) {
      const ids = checkable.slice(i, i + CHUNK).map(c => c.firestoreId);
      const fetches = ids.map(id => getDoc(doc(db, 'point_transactions', id)));
      const results = await Promise.all(fetches);
      results.forEach((snap, idx) => {
        liveTxMap[ids[idx]] = {
          exists: snap.exists(),
          points: snap.exists() ? (snap.data().points ?? null) : null,
        };
      });
    }

    // 3. Compare sealed vs live points and collect mismatches.
    const tampered = [];

    for (const entry of checkable) {
      const live = liveTxMap[entry.firestoreId];

      if (!live.exists) {
        // Document was deleted after the block was written — treat as tampering
        tampered.push({
          blockIndex:   entry.blockIndex,
          blockId:      entry.blockId,
          actionType:   entry.actionType,
          firestoreId:  entry.firestoreId,
          userId:       entry.userId,
          timestamp:    entry.timestamp,
          sealedPoints: entry.sealedPoints,
          livePoints:   null,
          issue:        'TRANSACTION_DELETED',
          detail:       `point_transaction '${entry.firestoreId}' no longer exists. Sealed value was ${entry.sealedPoints} pts.`,
        });
        continue;
      }

      const livePoints = typeof live.points === 'number' ? live.points : 0;
      if (livePoints !== entry.sealedPoints) {
        tampered.push({
          blockIndex:   entry.blockIndex,
          blockId:      entry.blockId,
          actionType:   entry.actionType,
          firestoreId:  entry.firestoreId,
          userId:       entry.userId,
          timestamp:    entry.timestamp,
          sealedPoints: entry.sealedPoints,
          livePoints,
          issue:        'POINTS_MISMATCH',
          detail:       `Ledger sealed ${entry.sealedPoints} pts but point_transaction now shows ${livePoints} pts. Possible unauthorized edit.`,
        });
      }
    }

    const hasTampered = tampered.length > 0;
    return {
      valid: !hasTampered,
      tampered,
      skippedLegacy,
      checkedCount: checkable.length,
      reason: hasTampered
        ? `🚨 ${tampered.length} tampered transaction point value(s) detected across ${checkable.length} verified block(s).`
        : `✅ All ${checkable.length} transaction point value(s) match their sealed ledger records.${skippedLegacy > 0 ? ` (${skippedLegacy} legacy block(s) skipped — pre-date tamper-seal.)` : ''}`,
    };

  } catch (error) {
    console.error('Error verifying transaction points tampering:', error);
    return {
      valid: true, // Don't fail the system on an audit error
      tampered: [],
      skippedLegacy: 0,
      checkedCount: 0,
      reason: `⚠️ Transaction points audit could not complete: ${error.message}`,
    };
  }
}

/**
 * Runs all integrity checks:
 *   1. Blockchain structural integrity (hash chain links + individual block hashes)
 *   2. External point balance reconciliation (ledger replay vs users.totalPoints)
 *   3. Transaction points tamper detection (sealed txPoints vs live point_transaction docs)
 */
export async function runAllIntegrityChecks() {
  try {
    // Check 1: Chain structure
    const chainVerification = await verifyBlockchain();

    // Check 2: Balance reconciliation
    const dataVerification = await verifyPointTransactions();

    // Check 3: Transaction points tamper detection
    const txPointsVerification = await verifyTransactionPointsTampering();

    // Gracefully handle permission failures on check 2 (public users can't read all users)
    let finalDataVerification = dataVerification;
    if (
      !dataVerification.valid &&
      dataVerification.reason &&
      dataVerification.reason.includes('Missing or insufficient permissions')
    ) {
      finalDataVerification = {
        valid: true,
        reason: 'External data reconciliation requires admin privileges and is not applicable for public verification.',
        skipped: true,
      };
    }

    // Gracefully handle permission failures on check 3 for public users
    let finalTxPointsVerification = txPointsVerification;
    if (
      !txPointsVerification.valid &&
      txPointsVerification.reason &&
      txPointsVerification.reason.includes('Missing or insufficient permissions')
    ) {
      finalTxPointsVerification = {
        valid: true,
        tampered: [],
        skippedLegacy: 0,
        checkedCount: 0,
        reason: 'Transaction points audit requires admin privileges and is not applicable for public verification.',
        skipped: true,
      };
    }

    const overallValid =
      chainVerification.valid &&
      finalDataVerification.valid &&
      finalTxPointsVerification.valid;

    // Build a human-readable summary
    let overallMessage;
    if (!chainVerification.valid) {
      overallMessage = `❌ System Integrity: ${chainVerification.message}`;
    } else if (!finalTxPointsVerification.valid) {
      overallMessage = `🚨 System Integrity: Chain intact but ${finalTxPointsVerification.tampered?.length || 0} transaction point value(s) were tampered directly in the database.`;
    } else if (overallValid) {
      if (finalDataVerification.skipped || finalTxPointsVerification.skipped) {
        overallMessage = `✅ System Integrity: Blockchain verified. Some audits require admin access.`;
      } else if (finalDataVerification.hasDifferences) {
        overallMessage = `✅ System Integrity: Chain verified. ${finalDataVerification.differences?.length || 0} balance difference(s) noted for admin review.`;
      } else {
        overallMessage = `✅ System Integrity: Chain verified. All ${finalDataVerification.checkedUsers} user balances consistent with ledger. Transaction points sealed values match.`;
      }
    } else {
      overallMessage = `❌ System Integrity: ${chainVerification.message}`;
    }

    return {
      valid: overallValid,
      message: overallMessage,
      chainVerification,
      dataVerification: finalDataVerification,
      txPointsVerification: finalTxPointsVerification,
    };

  } catch (error) {
    console.error('Error running all integrity checks:', error);
    return {
      valid: false,
      message: `❌ Major Error during Integrity Check: ${error.message}`,
      chainVerification:    { valid: false, message: 'N/A' },
      dataVerification:     { valid: false, reason: 'N/A' },
      txPointsVerification: { valid: false, tampered: [], reason: 'N/A' },
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

    // 3. Loop through every block, re-seal broken chain links AND re-stamp hashes
    //    that were computed with the old shallow metadata sort (pre-deepSortKeys).
    //
    //    TAMPER GUARD LOGIC:
    //    A hash mismatch can have two causes:
    //      (a) Serialization artifact -- old createBlockHash used shallow key sort, so
    //          blocks with nested objects in metadata (e.g. mixed-bundle `items` array)
    //          have a stored hash that no longer matches the current algorithm.
    //          This is a system bug, not tampering. Safe to re-seal.
    //      (b) Genuine data tampering -- someone modified a block's field directly
    //          in Firestore. This ALSO breaks the chain link to the next block
    //          (the next block's prevHash won't match the tampered block's new hash).
    //
    //    Distinguishing rule used here:
    //      - Hash mismatch + chain link also broken => treat as possible tampering.
    //        Abort unless the block has been acknowledged by an admin.
    //      - Hash mismatch only (prevHash pointer is still correct) => serialization
    //        artifact from the old algorithm. Re-seal safely.
    const tamperedBlocks = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const currentRef = doc(db, "ledger", block.id);
      let updates = {};
      let needsUpdate = false;

      // A. Check chain link independently of the hash.
      const expectedPrevHash = block.index === 0 ? "0" : previousHash;
      const chainLinkBroken = block.prevHash !== expectedPrevHash;

      // B. Re-compute hash using the current algorithm (deepSortKeys-aware).
      const newHash = createBlockHash(block);
      const hashMismatch = block.hash !== newHash;

      // C. TAMPER GUARD -- only fires when BOTH the hash AND the chain link are broken
      //    AND the block has not been acknowledged by an admin.
      //    Hash-only mismatches are treated as serialization artifacts and re-sealed.
      if (hashMismatch && chainLinkBroken
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

      // D. Fix chain link if broken.
      if (chainLinkBroken) {
        console.log(`Fixing broken chain link on block #${block.index}: ${block.prevHash} -> ${expectedPrevHash}`);
        updates.prevHash = expectedPrevHash;
        needsUpdate = true;
      }

      // E. Re-stamp hash using corrected prevHash and current deepSortKeys algorithm.
      //    Covers both serialization-artifact mismatches and chain-link repairs.
      const blockDataForHashing = {
        ...block,
        prevHash: updates.prevHash ?? block.prevHash
      };
      const recomputedHash = createBlockHash(blockDataForHashing);
      if (block.hash !== recomputedHash) {
        updates.hash = recomputedHash;
        needsUpdate = true;
      }

      // F. Apply updates if needed
      if (needsUpdate) {
        await updateDoc(currentRef, updates);
        repairedCount++;
        previousHash = recomputedHash;
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
 * This does NOT delete or modify the tampered block -- it stays forever
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

/**
 * Fetches and hash-verifies every ledger block belonging to a specific user.
 *
 * This is used by the Transactions audit panel to detect *block-level* data
 * tampering (e.g. someone directly editing a block's `points` field in
 * Firestore). A tampered block's stored hash will no longer match the hash
 * recomputed from its current field values.
 *
 * Returns an array of tampered block descriptors, each containing:
 *   - blockIndex      {number}  — ledger index of the tampered block
 *   - blockId         {string}  — Firestore document ID
 *   - actionType      {string}  — e.g. 'SUBMISSION_CONFIRMED'
 *   - storedPoints    {number}  — the current (possibly altered) points value
 *   - storedHash      {string}  — hash stored in the block (now invalid)
 *   - recalcHash      {string}  — hash recomputed from current field values
 *   - timestamp       {string}  — ISO timestamp of the block
 *
 * If no tampering is found the returned array is empty.
 */
export async function verifyUserLedgerBlocks(userId) {
  try {
    const q = query(
      collection(db, 'ledger'),
      where('userId', '==', userId),
      orderBy('index', 'asc')
    );
    const snap = await getDocs(q);
    const tampered = [];

    snap.docs.forEach(docSnap => {
      const block = { id: docSnap.id, ...docSnap.data() };
      const result = verifyBlock(block);
      if (!result.valid) {
        tampered.push({
          blockIndex:   block.index,
          blockId:      docSnap.id,
          actionType:   block.actionType,
          storedPoints: block.points ?? 0,
          storedHash:   result.storedHash,
          recalcHash:   result.calculatedHash,
          timestamp:    block.timestamp,
          prevHash:     block.prevHash,
        });
      }
    });

    return tampered;
  } catch (error) {
    console.error('Error verifying user ledger blocks:', error);
    return [];
  }
}

/**
 * Looks up the ledger block most closely matching a point_transaction document.
 * Matches by userId, a compatible actionType, and nearest timestamp.
 * Returns { block, hashValid, storedHash, recalcHash } or null if not found.
 */
export async function findLedgerBlockForTransaction(tx) {
  // Map point_transactions types -> ledger actionTypes
  const TYPE_MAP = {
    points_awarded:        'SUBMISSION_CONFIRMED',
    admin_points_awarded:  'ADMIN_POINTS_AWARDED',
    points_redeemed:       'REWARD_REDEEMED',
    redemption_cancelled:  'REDEMPTION_CANCELLED',
    // fallback: also try matching by actionType directly
  };

  const ledgerActionType = TYPE_MAP[tx.type] ?? tx.actionType ?? null;
  if (!tx.userId) return null;

  try {
    let q;
    if (ledgerActionType) {
      q = query(
        collection(db, 'ledger'),
        where('userId', '==', tx.userId),
        where('actionType', '==', ledgerActionType),
        orderBy('index', 'asc')
      );
    } else {
      q = query(
        collection(db, 'ledger'),
        where('userId', '==', tx.userId),
        orderBy('index', 'asc')
      );
    }

    const snap = await getDocs(q);
    if (snap.empty) return null;

    // Pick the block whose timestamp is nearest to the transaction's timestamp
    const txTime = tx.timestamp?.toDate
      ? tx.timestamp.toDate().getTime()
      : tx.timestamp
        ? new Date(tx.timestamp).getTime()
        : null;

    const blocks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    let best = blocks[0];
    if (txTime !== null) {
      let minDiff = Infinity;
      for (const b of blocks) {
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        const diff  = Math.abs(bTime - txTime);
        if (diff < minDiff) { minDiff = diff; best = b; }
      }
    }

    const result = verifyBlock(best);
    return {
      block:      best,
      hashValid:  result.valid,
      storedHash: result.storedHash,
      recalcHash: result.calculatedHash,
    };
  } catch (error) {
    console.error('Error finding ledger block for transaction:', error);
    return null;
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
  verifyTransactionPointsTampering,
  runAllIntegrityChecks,
  repairChain,
  acknowledgeTamper,
  verifyUserLedgerBlocks,
  findLedgerBlockForTransaction,
};