import React from 'react';
import { formatINR } from '../utils/money';

const MoneyText = ({ paise, className = '' }) => {
  return (
    <span className={`font-mono ${className}`}>
      {formatINR(paise)}
    </span>
  );
};

export default MoneyText;
