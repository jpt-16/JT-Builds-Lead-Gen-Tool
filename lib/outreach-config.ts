// Who the drafts come from. The business name and site are public and fixed;
// the rest comes from env vars so personal details stay out of the repo.

export const BUSINESS_NAME = "JT Builds Co";
export const BUSINESS_SITE = "jtbuildsco.com";

/** The exact opt-out line every email draft carries. */
export const OPT_OUT_LINE = "Reply stop and I won't contact you again.";

export type OutreachConfig = {
  senderName: string | null;
  callbackPhone: string | null;
  mailingAddress: string | null;
};

const read = (name: string) => process.env[name]?.trim() || null;

export function getOutreachConfig(): OutreachConfig {
  return {
    senderName: read("OUTREACH_SENDER_NAME"),
    callbackPhone: read("OUTREACH_CALLBACK_PHONE"),
    mailingAddress: read("BUSINESS_MAILING_ADDRESS"),
  };
}
