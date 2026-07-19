import { ToolNames } from "../config/index.js";
import { mapLoan, toLoanListItem } from "../models/loan.js";
import { officerNameSchema } from "./schemas.js";
import { defineTool } from "./shared.js";

export const searchLoansByOfficerTool = defineTool({
  name: ToolNames.searchLoansByOfficer,
  title: "Search Loans By Officer",
  description:
    "Find all loan applications assigned to a specific loan officer, identified " +
    "by their full name.",
  inputSchema: { officerName: officerNameSchema },
  execute: async ({ officerName }, { service, config }) => {
    const records = await service.findLoansByOfficerName(officerName);
    const loans = records.map((r) => toLoanListItem(mapLoan(r, config.dataverse.officer)));
    return { officerName, count: loans.length, loans };
  },
});
