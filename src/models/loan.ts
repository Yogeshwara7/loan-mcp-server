/**
 * Domain models for the Loan Management System.
 *
 * Layering:
 *   1. `DataverseLoanRecord` - RAW Web API shape (logical names). Never crosses
 *      the MCP boundary.
 *   2. `Loan` - the full business-friendly domain object.
 *   3. Projections (`LoanSummary`, `LoanStatus`, `LoanListItem`, timeline,
 *      eligibility, workload, analytics) - what tools return to clients.
 *
 * The mappers here are the single translation point between logical names and
 * business fields; the pure functions (`buildTimeline`, `computeAnalytics`, …)
 * hold loan-domain logic independent of transport or Dataverse.
 */
import { LoanColumns, type StatusLabels } from "../config/dataverse.js";

/** Annotation suffix Dataverse appends for formatted (display) values. */
export const FORMATTED_VALUE_ANNOTATION =
  "@OData.Community.Display.V1.FormattedValue";

/** Options controlling how the officer lookup is resolved during mapping. */
export interface OfficerResolution {
  navigationProperty: string;
  nameField: string;
}

/** A choice/option-set option (value + display label). */
export interface ChoiceOption {
  value: number;
  label: string;
}

/** Raw record from the Dataverse Web API (only requested fields are typed). */
export interface DataverseLoanRecord {
  [key: string]: unknown;
}

/** Full business-friendly loan object. */
export interface Loan {
  referenceNumber: string;
  applicantName: string;
  applicantEmail: string;
  phoneNumber: string;
  loanAmount: number;
  propertyValue: number;
  loanType: string;
  status: string;
  eligibilityStatus: string;
  eligibilityRemarks: string;
  reviewRequired: boolean;
  assignedOfficer: string;
  officerComments: string;
  createdDate: string;
  eligibilityCheckedOn: string;
  decision: string;
  documentsUploaded: boolean;
}

/** Full summary returned by GetLoanSummary (stable, original shape). */
export type LoanSummary = Pick<
  Loan,
  | "referenceNumber"
  | "applicantName"
  | "applicantEmail"
  | "phoneNumber"
  | "loanAmount"
  | "propertyValue"
  | "loanType"
  | "status"
  | "eligibilityStatus"
  | "eligibilityRemarks"
  | "reviewRequired"
  | "assignedOfficer"
  | "createdDate"
  | "documentsUploaded"
>;

/** Lightweight status view returned by GetLoanStatus (stable, original shape). */
export type LoanStatus = Pick<
  Loan,
  | "referenceNumber"
  | "status"
  | "eligibilityStatus"
  | "assignedOfficer"
  | "reviewRequired"
>;

/** Compact item used by list/search tools. */
export type LoanListItem = Pick<
  Loan,
  | "referenceNumber"
  | "applicantName"
  | "applicantEmail"
  | "phoneNumber"
  | "loanAmount"
  | "loanType"
  | "status"
  | "eligibilityStatus"
  | "assignedOfficer"
  | "reviewRequired"
  | "createdDate"
>;

// Returned-to-client shapes are declared as `type` aliases (not interfaces) so
// they carry an implicit index signature and remain assignable to the MCP
// `Record<string, unknown>` structured-content type.
export type TimelineMilestone = {
  milestone: string;
  timestamp: string;
  description: string;
};

export type LoanTimeline = {
  referenceNumber: string;
  currentStatus: string;
  assignedOfficer: string;
  milestones: TimelineMilestone[];
};

export type EligibilityExplanation = {
  referenceNumber: string;
  eligibilityStatus: string;
  eligibilityRemarks: string;
  reviewRequired: boolean;
  explanation: string;
};

export type StatusBreakdown = {
  received: number;
  pending: number;
  underReview: number;
  approved: number;
  rejected: number;
  other: number;
};

export type OfficerWorkload = {
  officerName: string;
  totalWorkload: number;
  pendingReviews: number;
  byStatus: StatusBreakdown;
  loans: LoanListItem[];
};

export type LoanAnalytics = {
  totalApplications: number;
  pending: number;
  approved: number;
  rejected: number;
  underReview: number;
  received: number;
  averageLoanAmount: number;
  highestLoanAmount: number;
  lowestLoanAmount: number;
};

type StatusLabelMap = typeof StatusLabels;

// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function toNumberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toBooleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (typeof value === "number") return value !== 0;
  return false;
}

/** Resolve a choice column to its label via the formatted-value annotation. */
function toChoiceValue(record: DataverseLoanRecord, logicalName: string): string {
  const formatted = record[`${logicalName}${FORMATTED_VALUE_ANNOTATION}`];
  const label = toStringValue(formatted);
  return label || toStringValue(record[logicalName]);
}

/**
 * Resolve the assigned officer's display name. Preference order:
 *   1. Expanded navigation property -> name field.
 *   2. Lookup formatted-value annotation (on the `_value` property).
 */
function resolveAssignedOfficer(
  record: DataverseLoanRecord,
  officer: OfficerResolution,
): string {
  const expanded = record[officer.navigationProperty];
  if (expanded && typeof expanded === "object") {
    const name = toStringValue((expanded as Record<string, unknown>)[officer.nameField]);
    if (name) return name;
  }

  const formatted =
    record[`_${LoanColumns.officerAssigned}_value${FORMATTED_VALUE_ANNOTATION}`];
  return toStringValue(formatted);
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/** Map a raw Dataverse record to the full business `Loan` object. */
export function mapLoan(record: DataverseLoanRecord, officer: OfficerResolution): Loan {
  return {
    referenceNumber: toStringValue(record[LoanColumns.referenceNumber]),
    applicantName: toStringValue(record[LoanColumns.applicantName]),
    applicantEmail: toStringValue(record[LoanColumns.applicantEmail]),
    phoneNumber: toStringValue(record[LoanColumns.phoneNumber]),
    loanAmount: toNumberValue(record[LoanColumns.loanAmount]),
    propertyValue: toNumberValue(record[LoanColumns.propertyValue]),
    loanType: toChoiceValue(record, LoanColumns.loanType),
    status: toChoiceValue(record, LoanColumns.status),
    eligibilityStatus: toChoiceValue(record, LoanColumns.eligibilityStatus),
    eligibilityRemarks: toStringValue(record[LoanColumns.eligibilityRemarks]),
    reviewRequired: toBooleanValue(record[LoanColumns.reviewRequired]),
    assignedOfficer: resolveAssignedOfficer(record, officer),
    officerComments: toStringValue(record[LoanColumns.officerComments]),
    createdDate: toStringValue(record[LoanColumns.createdDate]),
    eligibilityCheckedOn: toStringValue(record[LoanColumns.eligibilityCheckedOn]),
    decision: toChoiceValue(record, LoanColumns.decision),
    documentsUploaded: toBooleanValue(record[LoanColumns.documentsUploaded]),
  };
}

export function toLoanSummary(loan: Loan): LoanSummary {
  return {
    referenceNumber: loan.referenceNumber,
    applicantName: loan.applicantName,
    applicantEmail: loan.applicantEmail,
    phoneNumber: loan.phoneNumber,
    loanAmount: loan.loanAmount,
    propertyValue: loan.propertyValue,
    loanType: loan.loanType,
    status: loan.status,
    eligibilityStatus: loan.eligibilityStatus,
    eligibilityRemarks: loan.eligibilityRemarks,
    reviewRequired: loan.reviewRequired,
    assignedOfficer: loan.assignedOfficer,
    createdDate: loan.createdDate,
    documentsUploaded: loan.documentsUploaded,
  };
}

export function toLoanStatus(loan: Loan): LoanStatus {
  return {
    referenceNumber: loan.referenceNumber,
    status: loan.status,
    eligibilityStatus: loan.eligibilityStatus,
    assignedOfficer: loan.assignedOfficer,
    reviewRequired: loan.reviewRequired,
  };
}

export function toLoanListItem(loan: Loan): LoanListItem {
  return {
    referenceNumber: loan.referenceNumber,
    applicantName: loan.applicantName,
    applicantEmail: loan.applicantEmail,
    phoneNumber: loan.phoneNumber,
    loanAmount: loan.loanAmount,
    loanType: loan.loanType,
    status: loan.status,
    eligibilityStatus: loan.eligibilityStatus,
    assignedOfficer: loan.assignedOfficer,
    reviewRequired: loan.reviewRequired,
    createdDate: loan.createdDate,
  };
}

// ---------------------------------------------------------------------------
// Domain functions
// ---------------------------------------------------------------------------

/** Build a chronological timeline from available milestone dates. */
export function buildTimeline(loan: Loan): LoanTimeline {
  const milestones: TimelineMilestone[] = [];

  if (loan.createdDate) {
    milestones.push({
      milestone: "Application Created",
      timestamp: loan.createdDate,
      description: `Loan application ${loan.referenceNumber} was submitted.`,
    });
  }
  if (loan.eligibilityCheckedOn) {
    milestones.push({
      milestone: "Eligibility Checked",
      timestamp: loan.eligibilityCheckedOn,
      description: loan.eligibilityStatus
        ? `Eligibility evaluated as "${loan.eligibilityStatus}".`
        : "Eligibility was evaluated.",
    });
  }
  if (loan.assignedOfficer) {
    // No dedicated assignment timestamp exists; anchor to eligibility/creation.
    milestones.push({
      milestone: "Officer Assigned",
      timestamp: loan.eligibilityCheckedOn || loan.createdDate,
      description: `Assigned to officer ${loan.assignedOfficer}.`,
    });
  }

  milestones.push({
    milestone: "Current Status",
    timestamp: loan.eligibilityCheckedOn || loan.createdDate,
    description: `Current status is "${loan.status || "Unknown"}"${
      loan.reviewRequired ? "; manual review is required." : "."
    }`,
  });

  milestones.sort((a, b) => {
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);
    if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
    return ta - tb;
  });

  return {
    referenceNumber: loan.referenceNumber,
    currentStatus: loan.status,
    assignedOfficer: loan.assignedOfficer,
    milestones,
  };
}

/** Produce a business-friendly eligibility explanation. */
export function buildEligibilityExplanation(loan: Loan): EligibilityExplanation {
  const parts: string[] = [];
  if (loan.eligibilityStatus) {
    parts.push(`The application is currently marked "${loan.eligibilityStatus}".`);
  } else {
    parts.push("Eligibility has not yet been determined for this application.");
  }
  if (loan.eligibilityRemarks) {
    parts.push(`Remarks: ${loan.eligibilityRemarks}`);
  }
  parts.push(
    loan.reviewRequired
      ? "This application requires manual review by a loan officer before a final decision."
      : "This application does not require additional manual review at this stage.",
  );
  if (loan.assignedOfficer) {
    parts.push(`It is assigned to officer ${loan.assignedOfficer}.`);
  }

  return {
    referenceNumber: loan.referenceNumber,
    eligibilityStatus: loan.eligibilityStatus,
    eligibilityRemarks: loan.eligibilityRemarks,
    reviewRequired: loan.reviewRequired,
    explanation: parts.join(" "),
  };
}

/** Categorize a loan's status label into a known status key. */
function categorizeStatus(
  status: string,
  labels: StatusLabelMap,
): keyof StatusBreakdown {
  const normalized = status.trim().toLowerCase();
  if (normalized === labels.received.toLowerCase()) return "received";
  if (normalized === labels.pending.toLowerCase()) return "pending";
  if (normalized === labels.underReview.toLowerCase()) return "underReview";
  if (normalized === labels.approved.toLowerCase()) return "approved";
  if (normalized === labels.rejected.toLowerCase()) return "rejected";
  return "other";
}

function emptyBreakdown(): StatusBreakdown {
  return { received: 0, pending: 0, underReview: 0, approved: 0, rejected: 0, other: 0 };
}

/** Compute an officer's workload from their assigned loans. */
export function computeOfficerWorkload(
  officerName: string,
  loans: Loan[],
  labels: StatusLabelMap,
): OfficerWorkload {
  const byStatus = emptyBreakdown();
  let pendingReviews = 0;

  for (const loan of loans) {
    byStatus[categorizeStatus(loan.status, labels)] += 1;
    if (loan.reviewRequired) pendingReviews += 1;
  }

  return {
    officerName,
    totalWorkload: loans.length,
    pendingReviews,
    byStatus,
    loans: loans.map(toLoanListItem),
  };
}

/** Compute portfolio-level analytics over a set of loans. */
export function computeAnalytics(loans: Loan[], labels: StatusLabelMap): LoanAnalytics {
  const breakdown = emptyBreakdown();
  const amounts: number[] = [];

  for (const loan of loans) {
    breakdown[categorizeStatus(loan.status, labels)] += 1;
    if (loan.loanAmount > 0) amounts.push(loan.loanAmount);
  }

  const total = amounts.reduce((sum, n) => sum + n, 0);
  const average = amounts.length > 0 ? total / amounts.length : 0;

  return {
    totalApplications: loans.length,
    pending: breakdown.pending,
    approved: breakdown.approved,
    rejected: breakdown.rejected,
    underReview: breakdown.underReview,
    received: breakdown.received,
    averageLoanAmount: Math.round(average * 100) / 100,
    highestLoanAmount: amounts.length > 0 ? Math.max(...amounts) : 0,
    lowestLoanAmount: amounts.length > 0 ? Math.min(...amounts) : 0,
  };
}
