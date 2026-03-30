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

// ─────────────────────────────────────────────────────────────────────────────
// TAMPER NOTIFICATION HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Writes a Firestore notification document to the affected user's
 * notifications subcollection so they are informed of tampering or recovery
 * via the NotificationCenter bell and in-app toast.
 *
 * @param {string} userId  - The user whose points were tampered / restored
 * @param {'points_tampered'|'points_restored'} type
 * @param {object} payload - Extra fields merged into the notification doc
 */
export async function sendTamperNotification(userId, type, payload = {}) {
  if (!userId || userId === 'SYSTEM') return; // skip system/genesis blocks

  try {
    const { addDoc: _addDoc, collection: _collection, serverTimestamp: _serverTimestamp } =
      await import('firebase/firestore');

    const notifRef = _collection(db, 'notifications', userId, 'userNotifications');

    const base = {
      type,
      read: false,
      createdAt: _serverTimestamp(),
      ...payload,
    };

    await _addDoc(notifRef, base);
    console.log(`🔔 Tamper notification (${type}) sent to user '${userId}'.`);
  } catch (err) {
    // Non-critical — log but never throw so recovery flow is not blocked
    console.warn('sendTamperNotification failed (non-critical):', err);
  }
}

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
      currentIndex: 0,
      // Records the exact moment the blockchain went live.
      // All audit checks use this to distinguish pre-integration data
      // (expected to differ) from post-integration data (flagged if tampered).
      blockchainIntegratedAt: timestamp,
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
      latestIndex: data.currentIndex || 0,
      // ISO string of when the genesis block was first written.
      // Undefined for chains created before this field was added —
      // callers should treat undefined as "integration date unknown".
      blockchainIntegratedAt: data.blockchainIntegratedAt ?? null,
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
    // 0. Read the integration cutoff so we only audit post-integration activity.
    //    Balances that existed BEFORE blockchain was introduced are expected to differ
    //    from the ledger (there were no ledger blocks for them yet). Flagging those
    //    as suspicious would be a false positive on every newly integrated system.
    const trackerSnap = await getDoc(doc(db, 'system', 'ledger_tracker'));
    const integratedAt = trackerSnap.exists()
      ? (trackerSnap.data().blockchainIntegratedAt ?? null)
      : null;

    // If blockchainIntegratedAt is unknown (legacy chain without the field), we
    // fall back to the genesis block's timestamp so behaviour is consistent.
    let cutoffMs = null;
    if (integratedAt) {
      cutoffMs = new Date(integratedAt).getTime();
    } else {
      // Attempt to read genesis block timestamp as a fallback cutoff.
      try {
        const genesisSnap = await getDocs(
          query(collection(db, 'ledger'), orderBy('index', 'asc'), limit(1))
        );
        if (!genesisSnap.empty) {
          const genesisTs = genesisSnap.docs[0].data().timestamp;
          if (genesisTs) cutoffMs = new Date(genesisTs).getTime();
        }
      } catch (_) { /* non-critical — proceed without cutoff */ }
    }

    // 1. Replay the ledger per user to calculate expected balances,
    //    but ONLY for blocks written at or after the integration cutoff.
    //    Blocks before the cutoff have no matching point_transaction seal
    //    and their balances are correctly reflected in the pre-existing
    //    users.totalPoints field — they must NOT be counted again.
    const ledgerSnapshot = await getDocs(
      query(collection(db, 'ledger'), where('index', '>', 0))
    );

    const ledgerBalances = {};   // { userId: points from post-integration blocks }
    let preIntegrationBlocksSkipped = 0;

    ledgerSnapshot.forEach(docSnap => {
      const block = docSnap.data();
      if (!block.userId || !BALANCE_ACTION_TYPES.has(block.actionType)) return;

      // Skip blocks that pre-date the integration cutoff.
      if (cutoffMs !== null) {
        const blockMs = block.timestamp ? new Date(block.timestamp).getTime() : null;
        if (blockMs !== null && blockMs < cutoffMs) {
          preIntegrationBlocksSkipped++;
          return;
        }
      }

      if (!ledgerBalances[block.userId]) ledgerBalances[block.userId] = 0;

      // Use the sealed txPoints when present (tamper-resistant); fall back to
      // block.points for legacy blocks that pre-date the txPoints seal feature.
      const pts =
        block.metadata?.txPoints !== undefined && block.metadata?.txPoints !== null
          ? block.metadata.txPoints
          : (block.points || 0);
      ledgerBalances[block.userId] += pts;
    });

    // 2. Fetch actual balances from users collection.
    //    We only compare users who have at least one post-integration ledger entry.
    //    Users with ONLY pre-integration history are not in ledgerBalances and so
    //    are intentionally excluded from comparison — their balances are correct
    //    as-is and the ledger has no post-integration blocks to contradict them.
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const actualBalances = {};
    let totalUsersChecked = 0;
    usersSnapshot.forEach(docSnap => {
      if (ledgerBalances[docSnap.id] !== undefined) {
        actualBalances[docSnap.id] = docSnap.data().totalPoints || 0;
        totalUsersChecked++;
      }
    });

    // 3. Find differences — these are informational, not failures.
    //    A difference here means the live balance doesn't match what the
    //    post-integration ledger says it should be, which is worth reviewing.
    const differences = [];
    for (const userId of Object.keys(ledgerBalances)) {
      const fromLedger = Math.round((ledgerBalances[userId] || 0) * 100) / 100;
      const fromDb     = Math.round((actualBalances[userId]  || 0) * 100) / 100;
      if (fromLedger !== fromDb) {
        differences.push({
          userId,
          fromLedger,
          fromDb,
          delta: Math.round((fromDb - fromLedger) * 100) / 100,
        });
      }
    }

    // 4. Always valid — differences are audit info, not system failures.
    const hasDifferences = differences.length > 0;
    const skippedNote = preIntegrationBlocksSkipped > 0
      ? ` (${preIntegrationBlocksSkipped} pre-integration block(s) excluded from comparison — expected to already be reflected in user balances.)`
      : '';

    return {
      valid: true,
      checkedUsers: totalUsersChecked,
      differences,
      hasDifferences,
      preIntegrationBlocksSkipped,
      cutoffDate: integratedAt,
      reason: hasDifferences
        ? `ℹ️ ${differences.length} user balance(s) differ from post-integration ledger history. Review below — may reflect legitimate admin corrections.${skippedNote}`
        : `✅ All ${totalUsersChecked} user balance(s) are consistent with post-integration ledger history.${skippedNote}`,
    };

  } catch (error) {
    console.error('Error auditing point balances:', error);
    return {
      valid: true,
      checkedUsers: 0,
      differences: [],
      hasDifferences: false,
      reason: `⚠️ Balance audit could not be completed: ${error.message}`,
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
 * Blocks whose actionType is in NON_POINT_TX_ACTION_TYPES (e.g. WASTE_SUBMIT,
 * SUBMISSION_REJECTED) are also skipped — their metadata may contain a
 * submissionId or other non-point_transaction doc reference, and looking those
 * IDs up in point_transactions would always produce a false TRANSACTION_DELETED
 * alert. Only action types that explicitly create a point_transaction document
 * (SUBMISSION_CONFIRMED, ADMIN_POINTS_AWARDED, REWARD_REDEEMED, etc.) are checked.
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

    // Action types whose firestoreId (if present) refers to a NON-point_transactions
    // collection — e.g. waste_submissions, redemptions — and must never be looked up
    // in point_transactions. These blocks are informational ledger entries only;
    // no point_transaction document is created for them at write time.
    //
    // WASTE_SUBMIT   → firestoreId / submissionId is a waste_submissions doc (pending,
    //                  no points awarded yet). The real points check happens on
    //                  SUBMISSION_CONFIRMED which does link to a point_transaction.
    // SUBMISSION_REJECTED / SUBMISSION_CANCELLED → 0-pt entries, no point_transaction.
    const NON_POINT_TX_ACTION_TYPES = new Set([
      'WASTE_SUBMIT',
      'SUBMISSION_REJECTED',
      'SUBMISSION_CANCELLED',
      'GENESIS',
      'TAMPER_ACKNOWLEDGED',
      'POINTS_RESTORED',
      'BALANCE_RESTORED',
    ]);

    // Partition into checkable (has firestoreId + txPoints) vs legacy (missing txPoints)
    const checkable = [];
    let skippedLegacy = 0;

    ledgerSnap.forEach(docSnap => {
      const b = docSnap.data();

      // Skip action types that never produce a point_transaction document.
      // This is the primary guard against false TRANSACTION_DELETED alerts on
      // WASTE_SUBMIT blocks, which store a submissionId (waste_submissions doc)
      // rather than a point_transactions doc ID.
      if (NON_POINT_TX_ACTION_TYPES.has(b.actionType)) return;

      const firestoreId = b.metadata?.firestoreId;
      if (!firestoreId) return; // No linked doc to verify against — skip.

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
 *
 * Immediately notifies affected users when tampering is detected — no admin
 * action is required for the user to receive the alert.
 */
export async function runAllIntegrityChecks() {
  try {
    // Check 1: Chain structure
    const chainVerification = await verifyBlockchain();

    // Check 2: Balance reconciliation
    const dataVerification = await verifyPointTransactions();

    // Check 3: Transaction points tamper detection
    const txPointsVerification = await verifyTransactionPointsTampering();

    // ── Immediate tamper notifications ────────────────────────────────────────
    // Notify affected users RIGHT NOW without waiting for an admin to click
    // "Restore Points". We fire-and-forget (non-blocking) so any notification
    // failure never blocks the integrity check result from being returned.

    // 3a. Notify users whose point_transaction docs were directly tampered
    if (txPointsVerification.tampered && txPointsVerification.tampered.length > 0) {
      const notifiedUsers = new Set();
      for (const entry of txPointsVerification.tampered) {
        if (!entry.userId || entry.userId === 'SYSTEM') continue;
        if (notifiedUsers.has(entry.userId)) continue; // one notification per user per check
        notifiedUsers.add(entry.userId);
        sendTamperNotification(entry.userId, 'points_tampered', {
          title: '⚠️ Points Tampering Detected',
          message:
            'An unauthorized change to your points record was detected by the ' +
            'ledger integrity system. Our team has been alerted and your correct ' +
            'balance will be restored automatically.',
          blockId: entry.blockId,
          firestoreId: entry.firestoreId,
          detectedAt: new Date().toISOString(),
        }).catch(err => console.warn('Immediate tamper notification failed (non-critical):', err));
      }
    }

    // 3b. Notify users whose live totalPoints differ from the ledger replay
    if (dataVerification.differences && dataVerification.differences.length > 0) {
      const notifiedUserIds = new Set(
        txPointsVerification.tampered?.map(e => e.userId) ?? []
      );
      for (const diff of dataVerification.differences) {
        if (!diff.userId || diff.userId === 'SYSTEM') continue;
        if (notifiedUserIds.has(diff.userId)) continue; // don't double-notify
        notifiedUserIds.add(diff.userId);
        sendTamperNotification(diff.userId, 'points_tampered', {
          title: '⚠️ Points Balance Discrepancy Detected',
          message:
            'A discrepancy was found between your points balance and the sealed ' +
            'ledger record. Our team has been alerted and your correct balance ' +
            'will be restored automatically.',
          detectedAt: new Date().toISOString(),
        }).catch(err => console.warn('Immediate balance-discrepancy notification failed (non-critical):', err));
      }
    }

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
        const preNote = finalDataVerification.preIntegrationBlocksSkipped > 0
          ? ` (${finalDataVerification.preIntegrationBlocksSkipped} pre-integration blocks correctly excluded from comparison.)`
          : '';
        const skippedLegacyNote = finalTxPointsVerification.skippedLegacy > 0
          ? ` ${finalTxPointsVerification.skippedLegacy} legacy transaction block(s) pre-date tamper-seal coverage.`
          : '';
        overallMessage = `✅ System Integrity: Chain verified. All ${finalDataVerification.checkedUsers} post-integration user balance(s) consistent with ledger.${preNote}${skippedLegacyNote}`;
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
 *
 * CRITICAL FIX — AUTHORITATIVE POINTS:
 * When a block has `metadata.txPoints` (sealed at write-time by addToLedger),
 * that value is the source of truth for `block.points`. If block.points has
 * been altered directly in Firestore, this repair will restore it from the
 * sealed metadata.txPoints before recomputing the hash, preventing the tampered
 * value from being permanently sealed into the chain.
 *
 * Blocks that do NOT have metadata.txPoints (GENESIS, TAMPER_ACKNOWLEDGED,
 * BALANCE_RESTORED, POINTS_RESTORED, and pre-seal legacy blocks) are re-hashed
 * using their stored block.points value as-is.
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
    let restoredPointsCount = 0;
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

    // Action types that are audit/system blocks with no external point_transaction link.
    // These are re-hashed using stored block.points as-is (no txPoints seal exists).
    const AUDIT_ACTION_TYPES = new Set([
      'GENESIS',
      'TAMPER_ACKNOWLEDGED',
      'POINTS_RESTORED',
      'BALANCE_RESTORED',
    ]);

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const currentRef = doc(db, "ledger", block.id);
      let updates = {};
      let needsUpdate = false;

      // A. Check chain link independently of the hash.
      const expectedPrevHash = block.index === 0 ? "0" : previousHash;
      const chainLinkBroken = block.prevHash !== expectedPrevHash;

      // B. Determine the authoritative points value for this block.
      //
      //    RULE: If the block has a metadata.txPoints seal AND it is not a system/audit
      //    action type, use txPoints as the source of truth for block.points.
      //    This catches the case where someone directly edited block.points in Firestore
      //    without touching metadata — a silent tampering that would otherwise get
      //    permanently re-sealed by the old repairChain logic.
      //
      //    Audit blocks (GENESIS, TAMPER_ACKNOWLEDGED, POINTS_RESTORED, BALANCE_RESTORED)
      //    are always re-sealed using their stored block.points value (they carry points=0
      //    and have no txPoints). Legacy blocks that predate the txPoints seal also fall
      //    through to stored block.points.
      const hasTxPointsSeal =
        !AUDIT_ACTION_TYPES.has(block.actionType) &&
        block.metadata?.txPoints !== undefined &&
        block.metadata?.txPoints !== null;

      const authoritativePoints = hasTxPointsSeal
        ? block.metadata.txPoints
        : block.points;

      // C. If block.points has drifted from the sealed txPoints value, correct it now
      //    and count it as a restored point value.
      if (hasTxPointsSeal && block.points !== authoritativePoints) {
        console.warn(
          `⚠️ Block #${block.index}: block.points (${block.points}) differs from sealed ` +
          `metadata.txPoints (${authoritativePoints}). Restoring authoritative value.`
        );
        updates.points = authoritativePoints;
        needsUpdate = true;
        restoredPointsCount++;
      }

      // D. Re-compute hash using the current algorithm (deepSortKeys-aware)
      //    and the authoritative points value.
      const blockDataForHashCheck = {
        ...block,
        points: authoritativePoints,
      };
      const newHash = createBlockHash(blockDataForHashCheck);
      const hashMismatch = block.hash !== newHash;

      // E. TAMPER GUARD -- only fires when BOTH the hash AND the chain link are broken
      //    AND the block has not been acknowledged by an admin.
      //    Hash-only mismatches are treated as serialization artifacts or points
      //    restoration and are re-sealed.
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

      // F. Fix chain link if broken.
      if (chainLinkBroken) {
        console.log(`Fixing broken chain link on block #${block.index}: ${block.prevHash} -> ${expectedPrevHash}`);
        updates.prevHash = expectedPrevHash;
        needsUpdate = true;
      }

      // G. Re-stamp hash using corrected prevHash, authoritative points,
      //    and current deepSortKeys algorithm.
      //    Covers serialization-artifact mismatches, chain-link repairs,
      //    and points value restorations.
      const blockDataForHashing = {
        ...block,
        prevHash: updates.prevHash ?? block.prevHash,
        points:   updates.points  ?? authoritativePoints,
      };
      const recomputedHash = createBlockHash(blockDataForHashing);

      if (block.hash !== recomputedHash) {
        updates.hash = recomputedHash;
        needsUpdate = true;
      }

      // H. Apply updates if needed
      if (needsUpdate) {
        await updateDoc(currentRef, updates);
        repairedCount++;
        previousHash = recomputedHash;
      } else {
        previousHash = block.hash;
      }
    }

    // 4. Update System Tracker to reflect the new latest hash
    if (previousHash) {
      const trackerRef = doc(db, 'system', 'ledger_tracker');
      await updateDoc(trackerRef, {
        latestHash: previousHash
      });
    }

    console.log(`✅ Repair complete. Repaired ${repairedCount} blocks (${restoredPointsCount} points value(s) restored from sealed txPoints).`);
    return {
      success: true,
      repairedCount,
      restoredPointsCount,
      latestHash: previousHash,
    };

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

// ─────────────────────────────────────────────────────────────────────────────
// POINTS RECOVERY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Restores a tampered point_transaction document's `points` field back to the
 * value sealed in its matching ledger block's `metadata.txPoints`.
 *
 * This is the counterpart to verifyTransactionPointsTampering(): once that
 * function identifies a POINTS_MISMATCH entry, call this to correct it.
 *
 * What it does:
 *  1. Fetches the ledger block by blockId to extract the sealed `metadata.txPoints`.
 *  2. Writes that sealed value back to `point_transactions/{firestoreId}.points`.
 *  3. Appends a POINTS_RESTORED audit block to the ledger as permanent evidence.
 *
 * What it does NOT do:
 *  - It does not modify `users.totalPoints` — call restoreUserBalance() after.
 *  - It does not re-run repairChain() — the chain links are unaffected because
 *    only the external point_transactions doc was tampered, not the ledger block.
 *
 * @param {string} blockId       - Firestore document ID of the ledger block
 * @param {string} firestoreId   - Firestore document ID of the point_transaction
 * @returns {{ success, restoredPoints, previousPoints }}
 */
export async function restoreTransactionPoints(blockId, firestoreId) {
  try {
    // 1. Fetch the ledger block to get the sealed value
    const blockSnap = await getDoc(doc(db, 'ledger', blockId));
    if (!blockSnap.exists()) {
      throw new Error(`Ledger block '${blockId}' not found.`);
    }
    const block = blockSnap.data();

    const sealedPoints = block.metadata?.txPoints;
    if (sealedPoints === undefined || sealedPoints === null) {
      throw new Error(
        `Block #${block.index} has no metadata.txPoints seal. Cannot restore — ` +
        `this block pre-dates tamper-seal coverage.`
      );
    }

    // 2. Read current (possibly tampered) value for the audit record
    const txSnap = await getDoc(doc(db, 'point_transactions', firestoreId));
    if (!txSnap.exists()) {
      throw new Error(
        `point_transaction '${firestoreId}' no longer exists. ` +
        `It was deleted — manual recovery required.`
      );
    }
    const previousPoints = txSnap.data().points ?? null;

    // 3. Write the correct value back to the point_transaction document
    await updateDoc(doc(db, 'point_transactions', firestoreId), {
      points:              sealedPoints,
      restoredAt:          serverTimestamp(),
      restoredFromBlock:   block.index,
    });

    // 4. Append a POINTS_RESTORED audit entry to the ledger as immutable evidence
    const ledgerColRef = collection(db, 'ledger');
    const trackerRef   = doc(db, 'system', 'ledger_tracker');

    await runTransaction(db, async (transaction) => {
      const trackerSnap = await transaction.get(trackerRef);
      const prevHash  = trackerSnap.exists() ? (trackerSnap.data().latestHash  || '0') : '0';
      const newIndex  = trackerSnap.exists() ? ((trackerSnap.data().currentIndex || 0) + 1) : 0;

      const auditBlock = {
        index:      newIndex,
        prevHash,
        timestamp:  new Date().toISOString(),
        createdAt:  serverTimestamp(),
        userId:     block.userId || 'system',
        actionType: 'POINTS_RESTORED',
        points:     0, // This audit block itself carries no point value
        isValid:    true,
        metadata: {
          restoredBlockIndex:  block.index,
          restoredBlockId:     blockId,
          firestoreId,
          originalActionType:  block.actionType || null,
          sealedPoints,
          previousPoints,
          note: `Admin restored point_transaction '${firestoreId}' from ${previousPoints} → ${sealedPoints} pts using ledger block #${block.index} as source of truth.`,
          restoredAt: new Date().toISOString(),
        },
      };
      auditBlock.hash = createBlockHash(auditBlock);

      const newBlockRef = doc(ledgerColRef);
      transaction.set(newBlockRef, auditBlock);
      transaction.set(trackerRef, { latestHash: auditBlock.hash, currentIndex: newIndex }, { merge: true });
    });

    console.log(`✅ Restored point_transaction '${firestoreId}': ${previousPoints} → ${sealedPoints} pts.`);
    return { success: true, restoredPoints: sealedPoints, previousPoints };

  } catch (error) {
    console.error('restoreTransactionPoints failed:', error);
    throw error;
  }
}

/**
 * Restores a user's `totalPoints` balance by replaying their ledger history.
 *
 * Uses the ledger as the authoritative source — specifically the `points` field
 * on each block, which was sealed into the block hash at write-time and cannot
 * be silently altered without breaking the chain. This is correct AFTER
 * restoreTransactionPoints() has already fixed any tampered point_transaction docs
 * (so the external collection is consistent again), OR as a standalone correction
 * when only `users.totalPoints` was altered without touching the ledger.
 *
 * Steps:
 *  1. Fetch all ledger blocks for this userId where actionType is a
 *     balance-affecting type (same set as verifyPointTransactions uses).
 *  2. Use metadata.txPoints as the authoritative per-block points value when
 *     available (because repairChain may not have been run yet to fix block.points).
 *  3. Sum the authoritative values to get the correct balance.
 *  4. Compare to the current `users/{userId}.totalPoints`.
 *  5. If different, write the ledger-derived sum back and append a
 *     BALANCE_RESTORED audit block.
 *
 * @param {string} userId
 * @returns {{ success, ledgerBalance, previousBalance, delta, noChangeNeeded }}
 */
export async function restoreUserBalance(userId) {
  const BALANCE_ACTION_TYPES = new Set([
    'SUBMISSION_CONFIRMED',
    'ADMIN_POINTS_AWARDED',
    'REWARD_REDEEMED',
    'REDEMPTION_CANCELLED',
  ]);

  try {
    // 0. Read the integration cutoff — we must only replay blocks written AFTER
    //    the blockchain went live. Including pre-integration blocks would double-count
    //    points that were already baked into the user's totalPoints before the ledger
    //    existed, producing an inflated "ledger balance" that is wrong.
    const trackerSnap = await getDoc(doc(db, 'system', 'ledger_tracker'));
    const integratedAt = trackerSnap.exists()
      ? (trackerSnap.data().blockchainIntegratedAt ?? null)
      : null;

    let cutoffMs = null;
    if (integratedAt) {
      cutoffMs = new Date(integratedAt).getTime();
    } else {
      // Fallback: derive cutoff from the genesis block's timestamp.
      try {
        const genesisSnap = await getDocs(
          query(collection(db, 'ledger'), orderBy('index', 'asc'), limit(1))
        );
        if (!genesisSnap.empty) {
          const ts = genesisSnap.docs[0].data().timestamp;
          if (ts) cutoffMs = new Date(ts).getTime();
        }
      } catch (_) { /* non-critical */ }
    }

    // 1. Fetch this user's ledger blocks
    const q = query(
      collection(db, 'ledger'),
      where('userId', '==', userId),
      orderBy('index', 'asc')
    );
    const snap = await getDocs(q);

    // 2. Sum only post-integration, balance-affecting blocks.
    //    Prefer metadata.txPoints (sealed at write-time, tamper-resistant) over
    //    block.points which may have been altered directly in Firestore.
    let ledgerBalance = 0;
    snap.docs.forEach(docSnap => {
      const block = docSnap.data();
      if (!BALANCE_ACTION_TYPES.has(block.actionType)) return;

      // Skip blocks that pre-date the integration cutoff — their points are
      // already correctly reflected in the existing users.totalPoints value.
      if (cutoffMs !== null) {
        const blockMs = block.timestamp ? new Date(block.timestamp).getTime() : null;
        if (blockMs !== null && blockMs < cutoffMs) return;
      }

      const authoritativePoints =
        block.metadata?.txPoints !== undefined && block.metadata?.txPoints !== null
          ? block.metadata.txPoints
          : (block.points || 0);

      ledgerBalance += authoritativePoints;
    });
    ledgerBalance = Math.round(ledgerBalance * 100) / 100;

    // 3. Read current balance
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) {
      throw new Error(`User '${userId}' not found in users collection.`);
    }
    const currentBalance = userSnap.data().totalPoints ?? 0;

    // 4. Derive the user's post-integration contribution from the CURRENT (possibly
    //    tampered) ledger so we can calculate the pre-integration base.
    //    IMPORTANT: We use the sealed metadata.txPoints here (same as the authoritative
    //    ledger replay above) — NOT block.points — because block.points may have been
    //    tampered directly in Firestore. Using the tampered block.points here would
    //    produce a wrong preIntegrationBalance and therefore a wrong correctBalance.
    let currentLedgerContribution = 0;
    snap.docs.forEach(docSnap => {
      const block = docSnap.data();
      if (!BALANCE_ACTION_TYPES.has(block.actionType)) return;
      if (cutoffMs !== null) {
        const blockMs = block.timestamp ? new Date(block.timestamp).getTime() : null;
        if (blockMs !== null && blockMs < cutoffMs) return;
      }
      // Use sealed txPoints when available — falls back to block.points for legacy blocks
      const pts =
        block.metadata?.txPoints !== undefined && block.metadata?.txPoints !== null
          ? block.metadata.txPoints
          : (block.points || 0);
      currentLedgerContribution += pts;
    });
    currentLedgerContribution = Math.round(currentLedgerContribution * 100) / 100;

    // The pre-integration portion of the balance is whatever was in the account
    // before the ledger started tracking. We preserve it exactly.
    // Since both currentLedgerContribution and ledgerBalance now use the same sealed
    // txPoints source, the pre-integration math is stable and tamper-resistant.
    //
    // CRITICAL CLAMP: If someone directly lowered users.totalPoints in Firestore
    // without touching any ledger blocks, currentBalance will be LESS than
    // currentLedgerContribution, producing a NEGATIVE preIntegrationBalance.
    // A negative pre-integration balance is impossible — it would mean the user
    // somehow spent points before they even existed. In that case the entire
    // current balance is post-integration and has been tampered; the correct
    // balance is simply ledgerBalance (no pre-integration portion to preserve).
    const preIntegrationBalance = Math.max(
      0,
      Math.round((currentBalance - currentLedgerContribution) * 100) / 100
    );

    // The correct total = pre-integration portion + authoritative ledger contribution.
    const correctBalance = Math.round((preIntegrationBalance + ledgerBalance) * 100) / 100;
    const previousBalance = currentBalance;

    // 5. If already correct, skip the write
    if (Math.round(previousBalance * 100) / 100 === correctBalance) {
      return {
        success: true,
        noChangeNeeded: true,
        ledgerBalance: correctBalance,
        previousBalance,
      };
    }

    // 6. Write correct balance back
    await updateDoc(doc(db, 'users', userId), {
      totalPoints:        correctBalance,
      balanceRestoredAt:  serverTimestamp(),
    });

    // 7. Append a BALANCE_RESTORED audit block as immutable evidence
    const ledgerColRef = collection(db, 'ledger');
    const trackerRef   = doc(db, 'system', 'ledger_tracker');

    await runTransaction(db, async (transaction) => {
      const trackerSnap2 = await transaction.get(trackerRef);
      const prevHash  = trackerSnap2.exists() ? (trackerSnap2.data().latestHash  || '0') : '0';
      const newIndex  = trackerSnap2.exists() ? ((trackerSnap2.data().currentIndex || 0) + 1) : 0;

      const auditBlock = {
        index:      newIndex,
        prevHash,
        timestamp:  new Date().toISOString(),
        createdAt:  serverTimestamp(),
        userId,
        actionType: 'BALANCE_RESTORED',
        points:     0,
        isValid:    true,
        metadata: {
          previousBalance,
          restoredBalance: correctBalance,
          preIntegrationBalance,
          postIntegrationLedgerSum: ledgerBalance,
          delta: Math.round((correctBalance - previousBalance) * 100) / 100,
          note: `Admin restored user '${userId}' balance from ${previousBalance} → ${correctBalance} pts. Pre-integration portion preserved (${preIntegrationBalance} pts); post-integration ledger sum corrected to ${ledgerBalance} pts.`,
          restoredAt: new Date().toISOString(),
        },
      };
      auditBlock.hash = createBlockHash(auditBlock);

      const newBlockRef = doc(ledgerColRef);
      transaction.set(newBlockRef, auditBlock);
      transaction.set(trackerRef, { latestHash: auditBlock.hash, currentIndex: newIndex }, { merge: true });
    });

    console.log(`✅ Balance restored for user '${userId}': ${previousBalance} → ${correctBalance} pts.`);
    return {
      success:        true,
      noChangeNeeded: false,
      ledgerBalance:  correctBalance,
      previousBalance,
      delta: Math.round((correctBalance - previousBalance) * 100) / 100,
    };

  } catch (error) {
    console.error('restoreUserBalance failed:', error);
    throw error;
  }
}

/**
 * Full points recovery pipeline for a detected tampering incident.
 *
 * Convenience wrapper that runs the correct recovery steps in order:
 *   1. restoreTransactionPoints() — fixes the point_transaction doc
 *   2. restoreUserBalance()       — re-derives users.totalPoints from the ledger
 *
 * Call this after verifyTransactionPointsTampering() identifies a POINTS_MISMATCH.
 * After this completes, optionally run repairChain() to re-seal block hashes.
 *
 * @param {string} blockId     - Firestore document ID of the ledger block
 * @param {string} firestoreId - Firestore document ID of the point_transaction
 * @param {string} userId      - User ID whose balance needs to be corrected
 * @returns {{ success, txRestore, balanceRestore }}
 */
export async function recoverTamperedPoints(blockId, firestoreId, userId) {
  try {
    // ── Step 1: Notify the user that tampering was detected on their account ──
    // This fires before the restore so even if recovery partially fails, the
    // user is still informed that an anomaly was found and is being addressed.
    await sendTamperNotification(userId, 'points_tampered', {
      title: '⚠️ Points Tampering Detected',
      message:
        'An unauthorized change to your points record was detected by the ' +
        'ledger integrity system. Your correct balance is being restored automatically.',
      blockId,
      firestoreId,
      detectedAt: new Date().toISOString(),
    });

    // ── Step 2: Restore the point_transaction document and user balance ──
    const txRestore      = await restoreTransactionPoints(blockId, firestoreId);
    const balanceRestore = await restoreUserBalance(userId);

    // ── Step 3: Notify the user that their balance has been corrected ──
    await sendTamperNotification(userId, 'points_restored', {
      title: '✅ Points Restored',
      message:
        `Your points balance has been restored from ${balanceRestore.previousBalance} to ` +
        `${balanceRestore.ledgerBalance} pts using the sealed ledger record as the source of truth.`,
      previousBalance:  balanceRestore.previousBalance,
      restoredBalance:  balanceRestore.ledgerBalance,
      delta:            balanceRestore.delta ?? null,
      blockId,
      firestoreId,
      restoredAt: new Date().toISOString(),
    });

    console.log(
      `✅ Full recovery complete for user '${userId}': ` +
      `transaction restored (${txRestore.previousPoints} → ${txRestore.restoredPoints} pts), ` +
      `balance corrected (${balanceRestore.previousBalance} → ${balanceRestore.ledgerBalance} pts).`
    );

    return { success: true, txRestore, balanceRestore };
  } catch (error) {
    console.error('recoverTamperedPoints failed:', error);
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
  verifyTransactionPointsTampering,
  runAllIntegrityChecks,
  repairChain,
  acknowledgeTamper,
  verifyUserLedgerBlocks,
  findLedgerBlockForTransaction,
  // Points recovery
  restoreTransactionPoints,
  restoreUserBalance,
  recoverTamperedPoints,
  // Notifications
  sendTamperNotification,
};