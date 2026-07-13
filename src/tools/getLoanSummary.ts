/** MCP tool: GetLoanSummary — full business summary of one loan. */
import { ToolNames } from "../config/index.js";
import { mapLoan, toLoanSummary } from "../models/loan.js";
import { referenceNumberSchema } from "./schemas.js";
import { defineTool } from "./shared.js";

export const getLoanSummaryTool = defineTool({
  name: ToolNames.getLoanSummary,
  title: "Get Loan Summary",
  description:
    "Retrieve the full summary of a single loan application by its reference " +
    "number, including applicant details, amounts, status, eligibility and the " +
    "assigned officer.",
  inputSchema: { referenceNumber: referenceNumberSchema },
  execute: async ({ referenceNumber }, { service, config }) => {
    const record = await service.getLoanByReference(referenceNumber);
    return toLoanSummary(mapLoan(record, config.dataverse.officer));
  },
});
