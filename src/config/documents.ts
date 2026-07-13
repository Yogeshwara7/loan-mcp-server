/**
 * Static mapping of loan type -> required documents. Kept in configuration so
 * the GetRequiredDocuments tool has no hardcoded business data. Lookup is
 * case-insensitive; unknown types fall back to `DefaultRequiredDocuments`.
 */
export const RequiredDocumentsByLoanType: Readonly<Record<string, readonly string[]>> = {
  "Personal Loan": [
    "Government-issued photo ID",
    "Proof of address",
    "Latest 3 months' salary slips",
    "Latest 6 months' bank statements",
    "PAN card",
  ],
  "Home Loan": [
    "Government-issued photo ID",
    "Proof of address",
    "Latest 6 months' bank statements",
    "Income proof (salary slips / ITR)",
    "Property title deed",
    "Approved building plan",
    "Property valuation report",
  ],
  "Property Loan": [
    "Government-issued photo ID",
    "Proof of address",
    "Property title deed",
    "Property valuation report",
    "Latest 6 months' bank statements",
    "Income proof (salary slips / ITR)",
  ],
  "Education Loan": [
    "Government-issued photo ID",
    "Proof of address",
    "Admission/offer letter",
    "Fee structure from the institution",
    "Academic records",
    "Co-applicant income proof",
  ],
  "Business Loan": [
    "Government-issued photo ID",
    "Proof of address",
    "Business registration/incorporation documents",
    "Latest 12 months' business bank statements",
    "Income tax returns (last 2 years)",
    "Audited financial statements",
  ],
  "Vehicle Loan": [
    "Government-issued photo ID",
    "Proof of address",
    "Latest 3 months' salary slips",
    "Latest 6 months' bank statements",
    "Vehicle quotation/proforma invoice",
  ],
};

export const DefaultRequiredDocuments: readonly string[] = [
  "Government-issued photo ID",
  "Proof of address",
  "Income proof (salary slips / ITR)",
  "Latest 6 months' bank statements",
];
