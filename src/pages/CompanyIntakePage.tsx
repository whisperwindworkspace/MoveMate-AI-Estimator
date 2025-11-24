
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import App from '../App';
import { getCompanyBySlug } from '../config/companies';
import { AlertTriangle } from 'lucide-react';

export const CompanyIntakePage: React.FC = () => {
  const { companySlug } = useParams<{ companySlug: string }>();
  
  // Validate that the slug corresponds to a known company configuration
  const company = getCompanyBySlug(companySlug || null);

  if (!company) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100 p-4">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-700">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={32} />
          </div>
          <h1 className="text-xl font-bold mb-2">Company Not Found</h1>
          <p className="text-slate-400 mb-6">
            The link you followed ({companySlug}) does not match any registered moving company in our system.
          </p>
          <Link 
            to="/" 
            className="inline-block w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors"
          >
            Go to Home Page
          </Link>
        </div>
      </div>
    );
  }

  // Render the main App with the company slug pre-injected
  return <App initialSlug={companySlug} />;
};
