/**
 * Central registry of all MCP tools. Adding a tool is a one-line change here
 * (open/closed): implement it with `defineTool`, then list it below.
 */
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

/** All tool definitions, in a stable, documented order. */
export const toolDefinitions: readonly AnyToolDefinition[] = [
  // Customer tools
  getLoanSummaryTool,
  getLoanStatusTool,
  searchLoansByPhoneTool,
  getApplicantHistoryTool,
  trackLoanTimelineTool,
  explainEligibilityTool,
  getRequiredDocumentsTool,
  // Internal tools
  listPendingReviewsTool,
  getOfficerWorkloadTool,
  searchLoansByStatusTool,
  searchLoansByOfficerTool,
  getLoanAnalyticsTool,
];
