
import React from 'react';
import { useParams } from 'react-router-dom';
import App from '../App';

export const CompanyIntakePage: React.FC = () => {
  const { companySlug } = useParams<{ companySlug: string }>();
  // We pass the slug to App, which handles DB lookup and fallback
  return <App initialSlug={companySlug} />;
};
