import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  markDiscountCodeUsed,
  validateDiscountCode,
} from "@/lib/server/discountCodes";
import { fulfillFreePrepaNda } from "@/lib/server/paymentFulfillment";
import { recordSelenPayment } from "@/lib/server/selenPayments";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

function getStripe() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY est manquante dans les variables d’environnement.");
  }
  return new Stripe(stripeSecretKey);
}


