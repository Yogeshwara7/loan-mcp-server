// Dataverse column logical names must be lowercase (portal PascalCase is the schema name).
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

// Choice/picklist columns: label comes from the formatted-value annotation.
export const ChoiceColumnKeys = [
  "loanType",
  "status",
  "eligibilityStatus",
  "decision",
] as const satisfies readonly LoanColumnKey[];

export const StatusLabels = {
  received: "Received",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  underReview: "Under Review",
} as const;

export type StatusKey = keyof typeof StatusLabels;

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
  // officerAssignedName is a lookup virtual field, NOT $select-able; resolved via $expand.
  LoanColumns.officerComments,
  LoanColumns.documentsUploaded,
];

export function buildDataverseConfig(env: Env) {
  return {
    url: env.DATAVERSE_URL,
    apiVersion: env.DATAVERSE_API_VERSION,
    apiBaseUrl: `${env.DATAVERSE_URL}/api/data/${env.DATAVERSE_API_VERSION}`,
    scope: `${env.DATAVERSE_URL}/.default`,
    entitySet: env.DATAVERSE_LOAN_TABLE,
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
