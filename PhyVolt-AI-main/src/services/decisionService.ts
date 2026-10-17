/**
 * PhyVolt AI - Circularity Decision Engine
 * Transparent, safety-first routing logic with reviewer sign-off and audit capability
 */

import { DiagnosticResult, CircularityRecommendation, PreCheckSafetyChecklist } from '../types/battery';

export interface DecisionOutput {
  recommendation: CircularityRecommendation;
  reason: string;
  is_quarantine: boolean;
  can_proceed_to_passport: boolean;
  requires_reviewer_signoff: boolean;
}

export function evaluateCircularityDecision(
  result: DiagnosticResult,
  preCheck?: PreCheckSafetyChecklist
): DecisionOutput {
  // 1. Physical inspection checks
  if (preCheck) {
    if (preCheck.no_swelling === false || preCheck.no_electrolyte_leakage === false) {
      return {
        recommendation: 'QUARANTINE',
        reason: 'Physical inspection detected swelling or electrolyte leakage. Immediate safety hazard.',
        is_quarantine: true,
        can_proceed_to_passport: true,
        requires_reviewer_signoff: true,
      };
    }
  }

  // 2. Critical Safety status override
  if (result.safety_status === 'ABORT' || result.safety_status === 'QUARANTINE') {
    return {
      recommendation: 'QUARANTINE',
      reason: 'Safety condition overrides electrochemical health classification. Cell quarantined.',
      is_quarantine: true,
      can_proceed_to_passport: true,
      requires_reviewer_signoff: true,
    };
  }

  // 3. Low Confidence / Sensor Noise
  if (result.confidence < 0.60) {
    return {
      recommendation: 'EXPERT_REVIEW',
      reason: `Diagnostic confidence (${(result.confidence * 100).toFixed(0)}%) is below operational sign-off threshold (60%).`,
      is_quarantine: false,
      can_proceed_to_passport: false,
      requires_reviewer_signoff: true,
    };
  }

  // 4. Electrochemical classification
  const { low, high } = result.soh_range;

  if (low >= 70.0 && (result.usable_power_class === 'HIGH' || result.usable_power_class === 'MEDIUM')) {
    return {
      recommendation: 'SECOND_LIFE_SCREENING',
      reason: `Estimated health range (${low}%–${high}%) and stable apparent impedance meet second-life BESS eligibility.`,
      is_quarantine: false,
      can_proceed_to_passport: true,
      requires_reviewer_signoff: false,
    };
  }

  if (high < 50.0 || result.usable_power_class === 'RESTRICTED') {
    return {
      recommendation: 'RECYCLING_REVIEW',
      reason: `Estimated health range (${low}%–${high}%) is below second-life screening threshold. High impedance requires black mass recovery.`,
      is_quarantine: false,
      can_proceed_to_passport: true,
      requires_reviewer_signoff: false,
    };
  }

  return {
    recommendation: 'REFURBISHMENT_REVIEW',
    reason: `Intermediate health range (${low}%–${high}%). Cell requires rebalancing, deep conditioning, or lower-duty tier reallocation.`,
    is_quarantine: false,
    can_proceed_to_passport: true,
    requires_reviewer_signoff: true,
  };
}
