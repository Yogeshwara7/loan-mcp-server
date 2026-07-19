export const ToolNames = {
  getLoanSummary: "GetLoanSummary",
  getLoanStatus: "GetLoanStatus",
  searchLoansByPhone: "SearchLoansByPhone",
  getApplicantHistory: "GetApplicantHistory",
  trackLoanTimeline: "TrackLoanTimeline",
  explainEligibility: "ExplainEligibility",
  getRequiredDocuments: "GetRequiredDocuments",
  listPendingReviews: "ListPendingReviews",
  getOfficerWorkload: "GetOfficerWorkload",
  searchLoansByStatus: "SearchLoansByStatus",
  searchLoansByOfficer: "SearchLoansByOfficer",
  getLoanAnalytics: "GetLoanAnalytics",
} as const;

export type ToolNameKey = keyof typeof ToolNames;
