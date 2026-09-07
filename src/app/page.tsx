'use client';

import { PublicLayout } from "./components/PublicLayout";
import FrontLanding from "@/components/landing/FrontLanding"

export default function HomePage() {
  return (
    <PublicLayout>
      <FrontLanding />
    </PublicLayout>
  );
}
