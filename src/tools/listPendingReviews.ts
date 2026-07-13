/** MCP tool: ListPendingReviews — loans currently requiring manual review. */
import { ToolNames } from "../config/index.js";
import { mapLoan, toLoanListItem } from "../models/loan.js";
import { defineTool } from "./shared.js";

export const listPendingReviewsTool = defineTool({
  name: ToolNames.listPendingReviews,
  title: "List Pending Reviews",
  description:
    "List all loan applications currently in the manual-review queue " +
    "(status = Under Review).",
  inputSchema: {},
  execute: async (_args, { service, config }) => {
    const status = config.dataverse.statusLabels.underReview;
    const records = await service.findLoansByStatusLabel(status);
    const loans = records.map((r) => toLoanListItem(mapLoan(r, config.dataverse.officer)));
    return { status, count: loans.length, loans };
  },
});
