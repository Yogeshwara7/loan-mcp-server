import { ToolNames } from "../config/index.js";
import { mapLoan, toLoanListItem } from "../models/loan.js";
import { applicantEmailSchema } from "./schemas.js";
import { defineTool } from "./shared.js";

export const getApplicantHistoryTool = defineTool({
  name: ToolNames.getApplicantHistory,
  title: "Get Applicant History",
  description:
    "Retrieve all previous loan applications for an applicant, identified by " +
    "their email address, ordered by most recent first.",
  inputSchema: { applicantEmail: applicantEmailSchema },
  execute: async ({ applicantEmail }, { service, config }) => {
    const records = await service.findLoansByEmail(applicantEmail);
    const applications = records.map((r) =>
      toLoanListItem(mapLoan(r, config.dataverse.officer)),
    );
    return { applicantEmail, count: applications.length, applications };
  },
});
