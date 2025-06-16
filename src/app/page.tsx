'use client';

import { LoginPreviewLayout } from "./components/LoginPreviewLayout";
import FrontLanding from "@/components/landing/FrontLanding"

export default function HomePage() {
  return (
    <LoginPreviewLayout>
      <FrontLanding />
    </LoginPreviewLayout>
  )
} 