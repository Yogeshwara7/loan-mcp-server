import { ToolNames } from "../config/index.js";
import { mapLoan, toLoanStatus } from "../models/loan.js";
import { referenceNumberSchema } from "./schemas.js";
import { defineTool } from "./shared.js";

export const getLoanStatusTool = defineTool({
  name: ToolNames.getLoanStatus,
  title: "Get Loan Status",
  description:
    "Retrieve the current processing status of a single loan application by " +
    "its reference number, including eligibility status, the assigned officer " +
    "and whether manual review is required.",
  inputSchema: { referenceNumber: referenceNumberSchema },
  execute: async ({ referenceNumber }, { service, config }) => {
    const record = await service.getLoanByReference(referenceNumber);
    return toLoanStatus(mapLoan(record, config.dataverse.officer));
  },
});
