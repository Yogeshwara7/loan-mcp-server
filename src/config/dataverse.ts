/**
 * Dataverse-specific configuration: the single source of truth for the loan
 * table, its column LOGICAL names, choice columns, the officer lookup and the
 * canonical status labels. Nothing outside this module hardcodes logical names.
 *
 * NOTE: Dataverse column logical names are always lowercase (the PascalCase
 * form in the maker portal is the SCHEMA name). The Web API operates on logical
 * names, so these must be lowercase.
 */
import type { Env } from "./env.js";

export const LoanColumns = {
  referenceNumber: "cr174_referencenumber",
  applicantName: "cr174_applicantname",
  applicantEmail: "cr174_applicantemail",
  phoneNumber: "cr174_phonenumber",
  loanAmount: "cr174_amount",
  propertyValue: "cr174_propertyvalue",
  loanType: "cr174_loantype",
  status: "cr174_status",
  eligibilityStatus: "cr174_eligibilitystatus",
  eligibilityRemarks: "cr174_eligibilityremarks",
  reviewRequired: "cr174_reviewrequired",
  createdDate: "cr174_createddate",
  eligibilityCheckedOn: "cr174_eligibilitycheckedon",
  decision: "cr174_decision",
  officerAssigned: "cr174_officerassigned",
  officerAssignedName: "cr174_officerassignedname",
  officerComments: "cr174_officercomments",
  documentsUploaded: "cr174_documentsuploaded",
} as const;

export type LoanColumnKey = keyof typeof LoanColumns;

/**
 * Choice (Picklist) columns. The Web API returns their integer value on
 * $select; the human-readable label comes from the formatted-value annotation.
 * The mappers read the formatted value for these, and status filtering resolves
 * labels to option values via metadata.
 */
export const ChoiceColumnKeys = [
  "loanType",
  "status",
  "eligibilityStatus",
  "decision",
] as const satisfies readonly LoanColumnKey[];

/**
 * Canonical business status labels. Centralized so status-based tools and
 * analytics never hardcode the strings. Values are the labels as configured in
 * the Dataverse choice column.
 */
export const StatusLabels = {
  received: "Received",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  underReview: "Under Review",
} as const;

export type StatusKey = keyof typeof StatusLabels;

/** Columns requested via $select (the lookup attribute is resolved via $expand). */
const SELECT_COLUMNS: readonly string[] = [
  LoanColumns.referenceNumber,
  LoanColumns.applicantName,
  LoanColumns.applicantEmail,
  LoanColumns.phoneNumber,
  LoanColumns.loanAmount,
  LoanColumns.propertyValue,
  LoanColumns.loanType,
  LoanColumns.status,
  LoanColumns.eligibilityStatus,
  LoanColumns.eligibilityRemarks,
  LoanColumns.reviewRequired,
  LoanColumns.createdDate,
  LoanColumns.eligibilityCheckedOn,
  LoanColumns.decision,
  // NOTE: officerAssignedName is a lookup virtual field and is NOT directly
  // selectable; the officer name is resolved via the $expand of the lookup.
  LoanColumns.officerComments,
  LoanColumns.documentsUploaded,
];

export function buildDataverseConfig(env: Env) {
  return {
    url: env.DATAVERSE_URL,
    apiVersion: env.DATAVERSE_API_VERSION,
    /** Fully-qualified Web API root, e.g. https://.../api/data/v9.2 */
    apiBaseUrl: `${env.DATAVERSE_URL}/api/data/${env.DATAVERSE_API_VERSION}`,
    /** OAuth scope for client-credentials against this environment. */
    scope: `${env.DATAVERSE_URL}/.default`,
    /** Plural entity set name (data operations). */
    entitySet: env.DATAVERSE_LOAN_TABLE,
    /** Singular entity logical name (metadata operations). */
    entityLogicalName: env.DATAVERSE_LOAN_ENTITY,
    columns: LoanColumns,
    choiceColumnKeys: ChoiceColumnKeys,
    selectColumns: SELECT_COLUMNS,
    statusLabels: StatusLabels,
    officer: {
      navigationProperty: env.OFFICER_NAV_PROPERTY,
      nameField: env.OFFICER_NAME_FIELD,
      entitySet: env.OFFICER_ENTITY_SET,
      emailField: env.OFFICER_EMAIL_FIELD,
    },
  } as const;
}

export type DataverseConfig = ReturnType<typeof buildDataverseConfig>;
