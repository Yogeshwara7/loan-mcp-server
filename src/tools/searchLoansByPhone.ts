import { ToolNames } from "../config/index.js";
import { mapLoan, toLoanListItem } from "../models/loan.js";
import { phoneNumberSchema } from "./schemas.js";
import { defineTool } from "./shared.js";

export const searchLoansByPhoneTool = defineTool({
  name: ToolNames.searchLoansByPhone,
  title: "Search Loans By Phone",
  description:
    "Find all loan applications associated with a given phone number, returned " +
    "as a compact list.",
  inputSchema: { phoneNumber: phoneNumberSchema },
  execute: async ({ phoneNumber }, { service, config }) => {
    const records = await service.findLoansByPhone(phoneNumber);
    const loans = records.map((r) => toLoanListItem(mapLoan(r, config.dataverse.officer)));
    return { phoneNumber, count: loans.length, loans };
  },
});
