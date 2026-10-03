import React from 'react';
import { ChilledIcon, CarrotIcon, TechIcon, TruckIcon, VanIcon } from './icons';
import { Vehicle } from './VehicleCard';
import { BackButton } from './BackButton';

interface CommonHeaderProps {
  variant: 'queue' | 'detail';
  // Queue variant props
  vehiclesBefore?: number;
  cutoffTime?: string;
  depot?: string;
  dock?: string;
  // Detail variant props
  vehicle?: Vehicle;
  departMinutes?: number;
  // Shared props
  currentTime: string;
  workerName: string;
  onBack?: () => void;
}

export function CommonHeader({
  variant,
  vehiclesBefore,
  cutoffTime,
  depot,
  dock,
  vehicle,
  departMinutes,
  currentTime,
  workerName,
  onBack,
}: CommonHeaderProps) {
  if (variant === 'detail' && vehicle) {
    return (
      <div className="bg-[#1a3a5c] text-white px-6 h-[72px] flex items-center justify-between">
        {/* Left: Back + Vehicle Info */}
        <div className="flex items-center gap-4">
          <BackButton onClick={onBack} />
          <div className="flex flex-col gap-1.5">
            <span className="text-base font-bold">{vehicle.id}</span>
            <div className="flex items-center gap-2">
              {vehicle.vehicleType === 'truck' ? <TruckIcon size={28} /> : <VanIcon size={28} />}
              {vehicle.temperature === 'frozen' && <ChilledIcon size={28} />}
              {vehicle.temperature === 'chilled' && <CarrotIcon size={28} />}
              {vehicle.temperature === 'ambient' && <TechIcon size={28} />}
            </div>
          </div>
        </div>

        {/* Center: Departure */}
        <div className="text-center">
          <p className="text-red-400 text-sm font-semibold">
            Departs in {departMinutes} minutes
          </p>
        </div>

        {/* Right: Time + Worker */}
        <div className="text-right">
          <p className="text-lg font-semibold">{currentTime}</p>
          <p className="text-blue-200/80 text-xs">{workerName}</p>
        </div>
      </div>
    );
  }

  // Queue variant (default)
  return (
    <div className="bg-[#1a3a5c] text-white px-6 h-[72px] flex items-center justify-between">
      {/* Left: Brand */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">WayPath</h1>
      </div>

      {/* Center: Vehicle Count + Depot */}
      <div className="text-center">
        <p className="text-red-400 text-sm font-semibold">
          {vehiclesBefore} vehicles before {cutoffTime}
        </p>
        <p className="text-blue-200/80 text-xs mt-0.5">
          {depot} <span className="mx-1">•</span> {dock}
        </p>
      </div>

      {/* Right: Time + Worker */}
      <div className="text-right">
        <p className="text-lg font-semibold">{currentTime}</p>
        <p className="text-blue-200/80 text-xs">{workerName}</p>
      </div>
    </div>
  );
}
