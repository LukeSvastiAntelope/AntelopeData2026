import { getPricingSheet } from "@/app/utils/services/content-cms-service"
import { PricingPageClient } from "./pricing-page-client"

export const dynamic = "force-dynamic"

export default async function PricingPage() {
  const sheet = await getPricingSheet()
  return <PricingPageClient sheet={sheet} />
}
