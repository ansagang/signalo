"use server";

import { action, query } from "@/lib/session";
import * as billing from "@/lib/services/billing";

export async function getBilling(options) {
  return query((db, user) => billing.billingOverview(db, user.id, options), null);
}

export async function getBalance() {
  return query((db, user) => billing.creditBalance(db, user.id), 0);
}
