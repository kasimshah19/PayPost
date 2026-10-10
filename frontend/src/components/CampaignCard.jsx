import React from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import MoneyText from './MoneyText';
import { formatDateIST } from '../utils/date';

const CampaignCard = ({ campaign, isBrand = false }) => {
  return (
    <Link 
      to={`/${isBrand ? 'brand' : 'creator'}/campaigns/${campaign._id}`}
      className="block bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{campaign.title}</h3>
          {!isBrand && <p className="text-gray-500 text-sm mt-1">by {campaign.brand?.name}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={campaign.status} />
          {campaign.myApplicationStatus && (
            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
              You: {campaign.myApplicationStatus}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        {isBrand ? (
          <>
            <div>
              <p className="text-sm text-gray-500">Budget</p>
              <p className="font-semibold"><MoneyText paise={campaign.budgetPaise} /></p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Available</p>
              <p className="font-semibold text-green-600"><MoneyText paise={campaign.availablePaise} /></p>
            </div>
          </>
        ) : (
          <div>
            <p className="text-sm text-gray-500">Fee per Creator</p>
            <p className="font-semibold text-indigo-600"><MoneyText paise={campaign.perCreatorFeePaise} /></p>
          </div>
        )}
        
        <div>
          <p className="text-sm text-gray-500">Slots Left</p>
          <p className="font-semibold">{campaign.slotsLeft} / {campaign.slots}</p>
        </div>
        
        <div className="col-span-2 md:col-span-1">
          <p className="text-sm text-gray-500">Application Deadline</p>
          <p className="text-sm font-medium">{formatDateIST(campaign.applicationDeadline)}</p>
        </div>
      </div>

      {isBrand && (
        <div className="mt-4 pt-4 border-t flex gap-4 text-sm text-gray-600">
          <div>Applicants: <span className="font-bold">{campaign.applicantCounts?.applied || 0}</span></div>
          <div>Submissions: <span className="font-bold">{campaign.submissionCounts?.submitted || 0}</span></div>
        </div>
      )}
    </Link>
  );
};

export default CampaignCard;
