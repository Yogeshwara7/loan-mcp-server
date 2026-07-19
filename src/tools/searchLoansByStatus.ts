import { ToolNames } from "../config/index.js";
import { mapLoan, toLoanListItem } from "../models/loan.js";
import { statusSchema } from "./schemas.js";
import { defineTool } from "./shared.js";

export const searchLoansByStatusTool = defineTool({
  name: ToolNames.searchLoansByStatus,
  title: "Search Loans By Status",
  description:
    "Find all loan applications matching a given status label (e.g. Received, " +
    "Pending, Under Review, Approved, Rejected).",
  inputSchema: { status: statusSchema },
  execute: async ({ status }, { service, config }) => {
    const records = await service.findLoansByStatusLabel(status);
    const loans = records.map((r) => toLoanListItem(mapLoan(r, config.dataverse.officer)));
    return { status, count: loans.length, loans };
  },
});
