package main

// Response models. JSON field names follow the camelCase used by the other services.

type DepotSummary struct {
	Depot             string  `json:"depot"`
	VehiclesAvailable int     `json:"vehiclesAvailable"`
	VehiclesUsed      int     `json:"vehiclesUsed"`
	Trips             int     `json:"trips"`
	FleetUtilization  float64 `json:"fleetUtilization"`  // vehicles used / vehicles available
	WeightUtilization float64 `json:"weightUtilization"` // loaded kg / weight capacity of the trips run
	VolumeUtilization float64 `json:"volumeUtilization"` // loaded m³ / volume capacity of the trips run
	TotalWeightKg     float64 `json:"totalWeightKg"`
	TotalVolumeM3     float64 `json:"totalVolumeM3"`
	OrdersServed      int     `json:"ordersServed"`
	OrdersDeferred    int     `json:"ordersDeferred"`
	TotalDistanceKm   float64 `json:"totalDistanceKm"`
	FuelLitres        float64 `json:"fuelLitres"`
}

type ScheduleSummary struct {
	Date   string         `json:"date"`
	Depots []DepotSummary `json:"depots"`
	Totals DepotSummary   `json:"totals"`
}

type Stop struct {
	Sequence    int     `json:"sequence"`
	OrderRef    string  `json:"orderRef"`
	OutletID    string  `json:"outletId"`
	Brand       string  `json:"brand"`
	Temperature string  `json:"temperature"` // chilled | ambient
	WeightKg    float64 `json:"weightKg"`
	VolumeM3    float64 `json:"volumeM3"`
	ETA         string  `json:"eta"` // HH:MM, local time
	WindowOpen  string  `json:"windowOpen"`
	WindowClose string  `json:"windowClose"`
}

type Trip struct {
	TripID            string  `json:"tripId"` // <vehicleId>-T<tripNumber>
	TripNumber        int     `json:"tripNumber"`
	Brand             string  `json:"brand"`
	District          string  `json:"district"`
	DepartureTime     string  `json:"departureTime"`
	ReturnTime        string  `json:"returnTime"`
	DurationMin       int     `json:"durationMin"` // booklet trip time: outbound + inter-stop + handling
	DistanceKm        float64 `json:"distanceKm"`
	FuelLitres        float64 `json:"fuelLitres"`
	WeightKg          float64 `json:"weightKg"`
	VolumeM3          float64 `json:"volumeM3"`
	WeightUtilization float64 `json:"weightUtilization"`
	VolumeUtilization float64 `json:"volumeUtilization"`
	Stops             []Stop  `json:"stops"`
}

type VehicleSchedule struct {
	VehicleID        string  `json:"vehicleId"`
	Type             string  `json:"type"`        // truck | van
	Temperature      string  `json:"temperature"` // reefer | ambient
	WeightCapacityKg float64 `json:"weightCapacityKg"`
	VolumeCapacityM3 float64 `json:"volumeCapacityM3"`
	Trips            []Trip  `json:"trips"`
}

type DepotSchedule struct {
	Date      string            `json:"date"`
	Depot     string            `json:"depot"`
	PlanRunID string            `json:"planRunId,omitempty"`
	Vehicles  []VehicleSchedule `json:"vehicles"`
}

type DeferralReason string

const (
	ReasonNoReeferCapacity      DeferralReason = "NO_REEFER_CAPACITY"
	ReasonNoVehicleCapacity     DeferralReason = "NO_VEHICLE_CAPACITY"
	ReasonTimeBudgetExceeded    DeferralReason = "TIME_BUDGET_EXCEEDED"
	ReasonNoVanAvailable        DeferralReason = "NO_VAN_AVAILABLE"
	ReasonExceedsLargestVehicle DeferralReason = "EXCEEDS_LARGEST_VEHICLE"
	ReasonFuelQuotaExhausted    DeferralReason = "FUEL_QUOTA_EXHAUSTED"
)

type DeferredOrder struct {
	OrderRef      string         `json:"orderRef"`
	OutletID      string         `json:"outletId"`
	Depot         string         `json:"depot"`
	District      string         `json:"district"`
	Brand         string         `json:"brand"`
	Temperature   string         `json:"temperature"`
	WeightKg      float64        `json:"weightKg"`
	VolumeM3      float64        `json:"volumeM3"`
	OrderDate     string         `json:"orderDate"`
	TimesDeferred int            `json:"timesDeferred"`
	Reason        DeferralReason `json:"reason"`
	ReasonDetail  string         `json:"reasonDetail"`
}

type DeferralList struct {
	Date   string          `json:"date"`
	Depot  string          `json:"depot,omitempty"`
	Count  int             `json:"count"`
	Orders []DeferredOrder `json:"orders"`
}

type RunStatus string

const (
	RunQueued    RunStatus = "QUEUED"
	RunRunning   RunStatus = "RUNNING"
	RunCompleted RunStatus = "COMPLETED"
	RunFailed    RunStatus = "FAILED"
)

type PlanningRun struct {
	RunID       string    `json:"runId"`
	PlanDate    string    `json:"planDate"`
	Status      RunStatus `json:"status"`
	Trigger     string    `json:"trigger"` // cron | manual
	RequestedAt string    `json:"requestedAt"`
	StartedAt   string    `json:"startedAt,omitempty"`
	FinishedAt  string    `json:"finishedAt,omitempty"`
	Error       string    `json:"error,omitempty"`
}

type StartPlanningRequest struct {
	PlanDate string `json:"planDate,omitempty"` // YYYY-MM-DD; defaults to tomorrow
	Trigger  string `json:"trigger,omitempty"`  // defaults to "cron"
}

type ErrorResponse struct {
	Error string `json:"error"`
}
