import React from "react";

interface StatsCardProps {
  title: string;
  value: number | string;
}

const StatsCard: React.FC<StatsCardProps> = ({ title, value }) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-md text-center">
      <h3 className="text-sm text-gray-400">{title}</h3>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
};

export default StatsCard;