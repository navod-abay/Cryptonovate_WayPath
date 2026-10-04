import { ChilledIcon, CarrotIcon, TechIcon, TruckIcon, VanIcon } from './icons';

export interface Vehicle {
  id: string;
  arrivalTime: string;
  stops: number;
  temperature: 'frozen' | 'chilled' | 'ambient';
  vehicleType: 'truck' | 'van';
}

interface VehicleCardProps {
  vehicle: Vehicle;
  onStartLoading: (vehicleId: string) => void;
  actionLabel?: string;
}

function TemperatureIcon({ type }: { type: Vehicle['temperature'] }) {
  const size = 32;
  if (type === 'frozen') return <ChilledIcon size={size} />;
  if (type === 'chilled') return <CarrotIcon size={size} />;
  return <TechIcon size={size} />;
}

function VehicleTypeIcon({ type }: { type: Vehicle['vehicleType'] }) {
  if (type === 'truck') return <TruckIcon size={24} />;
  return <VanIcon size={24} />;
}

export function VehicleCard({ vehicle, onStartLoading, actionLabel = 'Start Loading' }: VehicleCardProps) {
  return (
    <div className="flex items-center gap-6 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
      {/* Left: Vehicle Icon + Temp Icon + Vehicle ID */}
      <div className="flex flex-col items-center gap-1 min-w-[60px]">
        <div className="flex items-center gap-1.5">
          <VehicleTypeIcon type={vehicle.vehicleType} />
          <TemperatureIcon type={vehicle.temperature} />
        </div>
        <span className="text-base font-bold text-[#1a3a5c]">{vehicle.id}</span>
      </div>

      {/* Arrival Time */}
      <div className="min-w-[100px]">
        <span className="text-base font-medium text-slate-700">{vehicle.arrivalTime}</span>
      </div>

      {/* Middle: Temperature Icon */}
      <div className="flex-shrink-0">
        <TemperatureIcon type={vehicle.temperature} />
      </div>

      {/* Stops */}
      <div className="flex-1 text-right">
        <span className="text-base font-medium text-slate-700">{String(vehicle.stops).padStart(2, '0')} Stops</span>
      </div>

      {/* Start Loading Button */}
      <button
        onClick={() => onStartLoading(vehicle.id)}
        className="px-6 py-3 bg-[#1a3a5c] text-white text-sm font-semibold rounded-xl
                   hover:bg-[#0f2a44] active:bg-[#0a1f33]
                   transition-colors cursor-pointer min-w-[140px]"
      >
        {actionLabel}
      </button>
    </div>
  );
}
