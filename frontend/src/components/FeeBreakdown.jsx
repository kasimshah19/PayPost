import React, { useState } from 'react';
import MoneyText from './MoneyText';

/**
 * Reusable Fee Breakdown Component (Phase 6).
 * Displays Gross fee, Platform fee, GST on platform fee, TDS, and Net creator payout.
 * 
 * Props:
 * - breakdown: object returned from GET /api/fees/preview or stored payoutBreakdown
 * - compact: boolean - whether to show concise single-line summary
 * - isCreator: boolean - whether viewer is creator ("You receive") or brand ("Creator receives")
 * - showExpandToggle: boolean - allows expanding into full table in compact mode
 */
const FeeBreakdown = ({
  breakdown,
  compact = false,
  isCreator = false,
  showExpandToggle = false,
  className = ''
}) => {
  const [expanded, setExpanded] = useState(!compact);

  if (!breakdown) return null;

  const {
    grossFeePaise = 0,
    platformFeePaise = 0,
    gstPaise = 0,
    payoutBeforeTdsPaise = 0,
    tdsPaise = 0,
    netPayoutPaise = 0,
    rates = {}
  } = breakdown;

  const platformPercent = rates.platformPercent ?? 10;
  const gstPercent = rates.gstPercent ?? 18;
  const tdsPercent = rates.tdsPercent ?? 1;

  if (compact && !expanded) {
    return (
      <div className={`flex items-center justify-between gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2.5 ${className}`}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-gray-600">
            {isCreator ? 'You will receive about:' : 'Creator receives:'}
          </span>
          <span className="font-semibold text-emerald-600">
            <MoneyText paise={netPayoutPaise} />
          </span>
          <span className="text-xs text-gray-500">
            (after {platformPercent}% fee, GST & {tdsPercent}% TDS)
          </span>
        </div>

        {showExpandToggle && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap underline ml-2"
          >
            See calculation
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm ${className}`}>
      {compact && showExpandToggle && (
        <div className="flex justify-between items-center mb-2 pb-1 border-b border-gray-200">
          <span className="font-semibold text-gray-800 text-xs uppercase tracking-wider">Fee Breakdown</span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Hide
          </button>
        </div>
      )}

      <table className="w-full text-xs sm:text-sm">
        <tbody className="divide-y divide-gray-100">
          <tr>
            <td className="py-1 text-gray-600">Gross Campaign Fee</td>
            <td className="py-1 text-right font-medium text-gray-800">
              <MoneyText paise={grossFeePaise} />
            </td>
          </tr>
          <tr>
            <td className="py-1 text-gray-500 pl-2">
              - Platform Fee ({platformPercent}%)
            </td>
            <td className="py-1 text-right text-gray-600">
              - <MoneyText paise={platformFeePaise} />
            </td>
          </tr>
          <tr>
            <td className="py-1 text-gray-500 pl-2">
              - GST ({gstPercent}% on platform fee)
            </td>
            <td className="py-1 text-right text-gray-600">
              - <MoneyText paise={gstPaise} />
            </td>
          </tr>
          {payoutBeforeTdsPaise > 0 && (
            <tr className="bg-gray-100/50">
              <td className="py-1 text-gray-500 pl-2 italic">Payout before TDS</td>
              <td className="py-1 text-right text-gray-600 italic">
                <MoneyText paise={payoutBeforeTdsPaise} />
              </td>
            </tr>
          )}
          <tr>
            <td className="py-1 text-gray-500 pl-2">
              - TDS ({tdsPercent}% on creator payout)
            </td>
            <td className="py-1 text-right text-gray-600">
              - <MoneyText paise={tdsPaise} />
            </td>
          </tr>
          <tr className="border-t-2 border-emerald-200 bg-emerald-50/60 font-semibold">
            <td className="py-2 text-emerald-800 font-bold pl-1">
              {isCreator ? 'You Receive (Net Payout)' : 'Creator Receives (Net Payout)'}
            </td>
            <td className="py-2 text-right text-emerald-700 font-bold text-base">
              <MoneyText paise={netPayoutPaise} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default FeeBreakdown;
