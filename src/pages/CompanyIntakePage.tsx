import React from 'react';
import App from '../App';

export const CompanyIntakePage: React.FC = () => {
  // Extract slug manually since we are not using react-router-dom here
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const companySlug = pathParts.length > 0 ? pathParts[pathParts.length - 1] : undefined;
  
  return <App initialSlug={companySlug} />;
};
