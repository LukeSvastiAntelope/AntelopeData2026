/**
 * Site template registry — fixed templates with named editable slots.
 */

import type { ComponentType } from 'react';
import type { SiteTemplateId } from '@/app/utils/types/site';
import { SITE_TEMPLATE_META } from '@/app/utils/types/site';
import type { SiteTemplateProps } from './shared';
import { ClassicCivicTemplate } from './ClassicCivicTemplate';
import { ModernCleanTemplate } from './ModernCleanTemplate';
import { CommunityLocalTemplate } from './CommunityLocalTemplate';

export type { SiteTemplateProps } from './shared';
export { ClassicCivicTemplate } from './ClassicCivicTemplate';
export { ModernCleanTemplate } from './ModernCleanTemplate';
export { CommunityLocalTemplate } from './CommunityLocalTemplate';
export {
  SiteCaptureBand,
  SiteSignupForm,
  SiteContactForm,
  SiteVolunteerForm,
  SiteDonateForm,
} from './SiteCaptureForms';

export const SITE_TEMPLATES: Record<
  SiteTemplateId,
  {
    id: SiteTemplateId;
    name: string;
    description: string;
    Component: ComponentType<SiteTemplateProps>;
  }
> = {
  classic_civic: {
    ...SITE_TEMPLATE_META.classic_civic,
    Component: ClassicCivicTemplate,
  },
  modern_clean: {
    ...SITE_TEMPLATE_META.modern_clean,
    Component: ModernCleanTemplate,
  },
  community_local: {
    ...SITE_TEMPLATE_META.community_local,
    Component: CommunityLocalTemplate,
  },
};

export function getSiteTemplate(templateId: SiteTemplateId) {
  return SITE_TEMPLATES[templateId] || SITE_TEMPLATES.classic_civic;
}

export function listSiteTemplates() {
  return Object.values(SITE_TEMPLATES);
}

/** Render helper for gallery / preview / public serve. */
export function SiteTemplateView({
  templateId,
  ...props
}: SiteTemplateProps & { templateId: SiteTemplateId }) {
  const { Component } = getSiteTemplate(templateId);
  return <Component {...props} />;
}
