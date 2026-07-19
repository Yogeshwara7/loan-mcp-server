import { z } from "zod";

export const referenceNumberSchema = z
  .string()
  .trim()
  .min(1, "referenceNumber is required")
  .describe("The loan reference number, e.g. LN-20260709110527");

export const phoneNumberSchema = z
  .string()
  .trim()
  .min(3, "phoneNumber must be at least 3 characters")
  .describe("The applicant's phone number, e.g. 8197792301");

export const applicantEmailSchema = z
  .string()
  .trim()
  .email("applicantEmail must be a valid email address")
  .describe("The applicant's email address");

export const officerNameSchema = z
  .string()
  .trim()
  .min(1, "officerName is required")
  .describe("The loan officer's full name, e.g. Akshitha S");

export const statusSchema = z
  .string()
  .trim()
  .min(1, "status is required")
  .describe("A loan status label, e.g. Under Review, Approved, Rejected");

export const loanTypeSchema = z
  .string()
  .trim()
  .min(1, "loanType is required")
  .describe("A loan type, e.g. Home Loan, Personal Loan, Education Loan");
