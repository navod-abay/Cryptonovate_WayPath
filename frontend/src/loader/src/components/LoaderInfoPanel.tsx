
interface LoaderInfoPanelProps {
  depot?: string;
  dock?: string;
  vehiclesBefore?: number;
  cutoffTime?: string;
}

export function LoaderInfoPanel({
  depot = 'Peliyagoda',
  dock = 'Dock 03',
  vehiclesBefore = 4,
  cutoffTime = '04:00 AM',
}: LoaderInfoPanelProps) {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const dateString = now.toLocaleDateString('en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });

  return (
    <div className="w-full md:w-[320px] lg:w-[420px] bg-[#1a3a5c] text-white flex flex-col p-6 md:p-8 shrink-0">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">WayPath</h1>
        <p className="text-blue-200/80 text-xs md:text-sm mt-1">
          {depot} <span className="mx-1">•</span> {dock}
        </p>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Time, Date & Vehicle Count at bottom */}
      <div className="mt-auto">
        <p className="text-3xl md:text-5xl font-light tracking-tight">{timeString}</p>
        <p className="text-blue-200/70 text-xs md:text-sm mt-2">{dateString}</p>
        <p className="text-red-400 text-xs md:text-sm font-medium mt-1">
          {vehiclesBefore} vehicles before {cutoffTime}
        </p>
      </div>
    </div>
  );
}
