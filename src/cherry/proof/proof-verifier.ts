import { sha256CanonicalExcluding, sha256Text } from '../core/hash.ts';
import { ok, type Result } from '../core/result.ts';
import { invalid } from '../core/errors.ts';
import type { ProofReceipt } from './proof-model.ts';
import { RECEIPT_HASH_EXCLUSIONS } from './proof-model.ts';

export interface ReceiptVerification {
  receiptId: string;
  hashMatches: boolean;
  recomputedHash: string;
  storedHash: string;
  artifactChecks: Array<{ path: string; matches: boolean; recomputed: string; stored: string }>;
  eventsMonotonic: boolean;
  verdict: 'valid' | 'tampered';
  notes: string[];
}

/**
 * Recomputes the receipt hash and (optionally) artifact hashes from supplied
 * content. This is the same check `scripts/verify.mjs` performs outside the
 * browser, so an exported receipt can be validated independently.
 */
export async function verifyReceipt(
  receipt: ProofReceipt,
  artifactContents?: Map<string, string>,
): Promise<Result<ReceiptVerification>> {
  if (!receipt || typeof receipt !== 'object') return invalid('Receipt is not an object');
  if (receipt.schemaVersion !== '1.0.0') return invalid(`Unsupported receipt schema version ${String(receipt.schemaVersion)}`);
  if (receipt.canonicalization.algorithm !== 'JCS-RFC8785' || receipt.canonicalization.hashAlgorithm !== 'SHA-256') {
    return invalid('Receipt declares an unsupported canonicalization');
  }
  const declaredExclusions = receipt.canonicalization.exclusions;
  if (
    !Array.isArray(declaredExclusions)
    || declaredExclusions.length !== RECEIPT_HASH_EXCLUSIONS.length
    || declaredExclusions.some((entry, index) => entry !== RECEIPT_HASH_EXCLUSIONS[index])
  ) {
    return invalid('Receipt declares unsupported hash exclusions');
  }

  const recomputedHash = await sha256CanonicalExcluding(
    receipt as unknown as Record<string, unknown>,
    RECEIPT_HASH_EXCLUSIONS,
  );
  const hashMatches = recomputedHash === receipt.receiptHash;

  const artifactChecks: ReceiptVerification['artifactChecks'] = [];
  if (artifactContents) {
    for (const artifact of receipt.artifacts) {
      const content = artifactContents.get(artifact.path);
      if (content === undefined) {
        artifactChecks.push({
          path: artifact.path,
          matches: false,
          recomputed: '',
          stored: artifact.sha256,
        });
        continue;
      }
      const recomputed = await sha256Text(content);
      artifactChecks.push({
        path: artifact.path,
        matches: recomputed === artifact.sha256,
        recomputed,
        stored: artifact.sha256,
      });
    }
  }

  let eventsMonotonic = true;
  let previous = 0;
  for (const event of receipt.events) {
    if (event.sequence <= previous) {
      eventsMonotonic = false;
      break;
    }
    previous = event.sequence;
  }

  const notes: string[] = [];
  if (!hashMatches) notes.push('Receipt hash does not match its canonical content.');
  for (const check of artifactChecks.filter((entry) => !entry.matches)) {
    notes.push(check.recomputed
      ? `Artifact ${check.path} hash mismatch.`
      : `Artifact ${check.path} was not supplied for verification.`);
  }
  if (!eventsMonotonic) notes.push('Event sequence numbers are not strictly increasing.');
  if (!artifactContents && receipt.artifacts.length > 0) notes.push('Artifact bodies were not supplied, so only the receipt snapshot was checked.');
  if (notes.length === 0) notes.push('Hash recomputation matches. The receipt is tamper-evident, not cryptographically signed.');

  const verdict: ReceiptVerification['verdict'] =
    hashMatches && eventsMonotonic && artifactChecks.every((entry) => entry.matches) ? 'valid' : 'tampered';

  return ok({
    receiptId: receipt.receiptId,
    hashMatches,
    recomputedHash,
    storedHash: receipt.receiptHash,
    artifactChecks,
    eventsMonotonic,
    verdict,
    notes,
  });
}
