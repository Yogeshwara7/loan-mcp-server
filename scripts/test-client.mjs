/**
 * Automated MCP test client for the Loan MCP server.
 *
 * Launches the built server over stdio (exactly like Claude Desktop), then
 * exercises every tool and asserts the response shape. Reads credentials from
 * the server's .env.
 *
 * Usage:
 *   npm run build && node scripts/test-client.mjs
 *
 * Known sample values (override via env): TEST_REF, TEST_PHONE, TEST_EMAIL,
 * TEST_OFFICER, TEST_STATUS, TEST_LOAN_TYPE.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SAMPLES = {
  ref: process.env.TEST_REF ?? "LN-20260708090758",
  phone: process.env.TEST_PHONE ?? "8197792301",
  email: process.env.TEST_EMAIL ?? "yogeshwara567@gmail.com",
  officer: process.env.TEST_OFFICER ?? "Akshitha S",
  status: process.env.TEST_STATUS ?? "Under Review",
  loanType: process.env.TEST_LOAN_TYPE ?? "Home Loan",
};

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  env: { ...process.env, LOG_LEVEL: "silent" },
});
const client = new Client({ name: "loan-mcp-test-client", version: "1.0.0" });

/** Call a tool and return its parsed structuredContent (+ isError). */
async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return { data: res.structuredContent ?? {}, isError: Boolean(res.isError) };
}

console.log(`Connecting to Loan MCP server (samples: ${JSON.stringify(SAMPLES)})\n`);
await client.connect(transport);

// --- Protocol ---
console.log("Protocol");
const { tools } = await client.listTools();
const names = new Set(tools.map((t) => t.name));
const expected = [
  "GetLoanSummary", "GetLoanStatus", "SearchLoansByPhone", "GetApplicantHistory",
  "TrackLoanTimeline", "ExplainEligibility", "GetRequiredDocuments",
  "ListPendingReviews", "GetOfficerWorkload", "SearchLoansByStatus",
  "SearchLoansByOfficer", "GetLoanAnalytics",
];
check(`tools/list advertises all ${expected.length} tools`, expected.every((n) => names.has(n)),
  expected.filter((n) => !names.has(n)).join(", "));

// --- Customer tools ---
console.log("\nCustomer tools");
{
  const { data, isError } = await call("GetLoanSummary", { referenceNumber: SAMPLES.ref });
  check("GetLoanSummary returns summary", !isError && data.referenceNumber === SAMPLES.ref, JSON.stringify(data));
}
{
  const { data, isError } = await call("GetLoanStatus", { referenceNumber: SAMPLES.ref });
  check("GetLoanStatus returns status", !isError && typeof data.status === "string", JSON.stringify(data));
}
{
  const { data, isError } = await call("SearchLoansByPhone", { phoneNumber: SAMPLES.phone });
  check("SearchLoansByPhone returns list", !isError && typeof data.count === "number", JSON.stringify(data.count));
}
{
  const { data, isError } = await call("GetApplicantHistory", { applicantEmail: SAMPLES.email });
  check("GetApplicantHistory returns applications", !isError && Array.isArray(data.applications), JSON.stringify(data.count));
}
{
  const { data, isError } = await call("TrackLoanTimeline", { referenceNumber: SAMPLES.ref });
  check("TrackLoanTimeline returns milestones", !isError && Array.isArray(data.milestones) && data.milestones.length > 0, JSON.stringify(data));
}
{
  const { data, isError } = await call("ExplainEligibility", { referenceNumber: SAMPLES.ref });
  check("ExplainEligibility returns explanation", !isError && typeof data.explanation === "string", JSON.stringify(data));
}
{
  const { data, isError } = await call("GetRequiredDocuments", { loanType: SAMPLES.loanType });
  check("GetRequiredDocuments returns documents", !isError && Array.isArray(data.requiredDocuments) && data.requiredDocuments.length > 0, JSON.stringify(data));
}

// --- Internal tools ---
console.log("\nInternal tools");
{
  const { data, isError } = await call("ListPendingReviews");
  check("ListPendingReviews returns list", !isError && typeof data.count === "number", JSON.stringify(data.count));
}
{
  const { data, isError } = await call("GetOfficerWorkload", { officerName: SAMPLES.officer });
  check("GetOfficerWorkload returns workload", !isError && typeof data.totalWorkload === "number", JSON.stringify(data.totalWorkload));
}
{
  const { data, isError } = await call("SearchLoansByStatus", { status: SAMPLES.status });
  check("SearchLoansByStatus returns list", !isError && typeof data.count === "number", JSON.stringify(data.count));
}
{
  const { data, isError } = await call("SearchLoansByOfficer", { officerName: SAMPLES.officer });
  check("SearchLoansByOfficer returns list", !isError && typeof data.count === "number", JSON.stringify(data.count));
}
{
  const { data, isError } = await call("GetLoanAnalytics");
  check("GetLoanAnalytics returns analytics", !isError && typeof data.totalApplications === "number", JSON.stringify(data));
  console.log("     analytics:", JSON.stringify(data));
}

// --- Error handling ---
console.log("\nError handling");
{
  const { data, isError } = await call("GetLoanSummary", { referenceNumber: "LN-DOES-NOT-EXIST-0000" });
  check("Unknown reference -> LOAN_NOT_FOUND", isError && data.code === "LOAN_NOT_FOUND", JSON.stringify(data));
}
{
  const { data, isError } = await call("SearchLoansByStatus", { status: "NotARealStatus" });
  check("Unknown status -> VALIDATION_ERROR", isError && data.code === "VALIDATION_ERROR", JSON.stringify(data));
}
{
  // Invalid args may surface as a thrown protocol error or an isError result,
  // depending on SDK version; either is acceptable rejection.
  let rejected = false;
  try {
    const { isError } = await call("GetApplicantHistory", { applicantEmail: "not-an-email" });
    rejected = isError;
  } catch {
    rejected = true;
  }
  check("Invalid email rejected by input schema", rejected);
}

await client.close();
console.log(`\n${failed === 0 ? "ALL CHECKS PASSED ✅" : "SOME CHECKS FAILED ❌"}  (${passed} passed, ${failed} failed)`);
process.exit(failed === 0 ? 0 : 1);
