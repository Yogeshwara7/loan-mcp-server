import { explainEligibilityTool } from "./explainEligibility.js";
import { getApplicantHistoryTool } from "./getApplicantHistory.js";
import { getLoanAnalyticsTool } from "./getLoanAnalytics.js";
import { getLoanStatusTool } from "./getLoanStatus.js";
import { getLoanSummaryTool } from "./getLoanSummary.js";
import { getOfficerWorkloadTool } from "./getOfficerWorkload.js";
import { getRequiredDocumentsTool } from "./getRequiredDocuments.js";
import { listPendingReviewsTool } from "./listPendingReviews.js";
import { searchLoansByOfficerTool } from "./searchLoansByOfficer.js";
import { searchLoansByPhoneTool } from "./searchLoansByPhone.js";
import { searchLoansByStatusTool } from "./searchLoansByStatus.js";
import { trackLoanTimelineTool } from "./trackLoanTimeline.js";
import type { AnyToolDefinition } from "./shared.js";

export const toolDefinitions: readonly AnyToolDefinition[] = [
  getLoanSummaryTool,
  getLoanStatusTool,
  searchLoansByPhoneTool,
  getApplicantHistoryTool,
  trackLoanTimelineTool,
  explainEligibilityTool,
  getRequiredDocumentsTool,
  listPendingReviewsTool,
  getOfficerWorkloadTool,
  searchLoansByStatusTool,
  searchLoansByOfficerTool,
  getLoanAnalyticsTool,
];
