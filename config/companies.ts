
export type PublicCompanyConfig = {
  slug: string;            // used in URL, e.g. /danmoving
  name: string;            // display name
  destinationEmail: string; // where inventories will be sent
  logoUrl?: string;
  primaryColor?: string;
};

export const COMPANIES: PublicCompanyConfig[] = [
  // Add your onboarded companies here
  // {
  //   slug: 'example-moving',
  //   name: 'Example Moving Co.',
  //   destinationEmail: 'sales@example.com',
  // },
];

export function getCompanyBySlug(slug?: string | null): PublicCompanyConfig | null {
  if (!slug) return null;
  return COMPANIES.find((c) => c.slug === slug) ?? null;
}