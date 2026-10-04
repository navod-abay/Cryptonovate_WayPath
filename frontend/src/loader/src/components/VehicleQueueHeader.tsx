
interface VehicleQueueHeaderProps {
  vehiclesBefore: number;
  cutoffTime: string;
  depot: string;
  dock: string;
  currentTime: string;
  workerName: string;
}

export function VehicleQueueHeader({
  vehiclesBefore,
  cutoffTime,
  depot,
  dock,
  currentTime,
  workerName,
}: VehicleQueueHeaderProps) {
  return (
    <div className="bg-[#1a3a5c] text-white px-6 py-4">
      <div className="flex items-center justify-between">
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
    </div>
  );
}
