Now I want you to write the following algorithm using python and back test it with the data.

High Level

Utilize vans as much as possible for FRESH ORDERS

Furthest districts are served by the smallest vehicle that can server them. This is because weight and volume caps correlate well with km_per_l

Whenever choosing between two vehicles always use the one with higher remaining fuel quota

Hyperparameters

P_MIN

OUTLET_DEFERRAL_WINDOW

SUFFICIENT_WEIGHT_UTIL

SUFFICIENT_VOLUME_UTIL

Inputs

Set of orders. Each order contains the brand (Fresh dry, fresh chilled, style, tech) , the weight, the capacity, the district, the outlet, whether it is a van only outlet. And another attribute specifying how many times that outlet was deferred in the last OUTLET_DEFERRAL_WINDOW number of days.

Vehicles - Set of available Vehicles, Each vehicle has a number of kilometers it can travel according to the fuel quota.



States

VehicleView - A state for each route (maximum is two) for each vehicle in each depot. (2 x len(Vehcles)). States can (UNCONFIRMED, DISTRICT_BRAND_CONFIRMED, ROUTE_LEGS_CONFIRMED,  ) The first route of the day should always be a FRESH order. The second can be a fresh, STYLE or TECH.

DistrictView - A 2d Array for each each brand in each district. Exists(DistrictView[Distrcit][Brand]) returns null if there are no  



Process

First preprocess the orders and calculate p = # of time order was deferred * # of deferrals for the store in OUTLET_DEFERRAL_WINDOW.

New start greedily assigning routes starting with the orders with the highest p. Let the set of those orders be 

\(Q\left\lbrack p=p_{i}\right\rbrack\)

For each district-brand pair in 

\(Q\left\lbrack p=p_{i-1}\right\rbrack\)

, Starting from the smallest order in 

\(Q\left\lbrack p=p_{i}\right\rbrack\left\lbrack District\right\rbrack\left\lbrack Br\and\right\rbrack\)

 see if any orders can be packed into any vehicle-trips with DISRICT_BRAND_CONFIRMED state. If so add them.

If for any district-brand pair in 

\(Q\left\lbrack p=p_{i-1}\right\rbrack\)

, if there are no orders for that district-brand pair in 

\(Q-Q\left\lbrack p=p_{i-1}\right\rbrack\)

 and the truck's weight > SUFFICIENT_WEIGH_UTILIZATION and truck's volume is > SUFFICIENT_VOLUME_UTILIZATION. Move them to ROUTE_LEGS_CONFIRMED state.

We start with assigning vehicles to FRESH orders first. They always take up the first vehicle-trip of the day. And sometimes the second vehicle-trip of the day as well.

Consolidate van only fresh chilled orders in 

\(Q\left\lbrack p=p_{i}\right\rbrack\)

 from the same district (There is only one district with van only outlet in each depot) to one route. Assign the first vehicle-trip of both reefer vans of the depot if one is not enough(Set the state of the 1st route of the day of the vehicle to DISTRICT_BRAND_CONFIRMED). Try out all permutations to efficiently pack them. If only van one is being used assign the van with the maximum weekly kilometers left. If any orders are left assign the second route of the chilled vans for those orders as well. If there are still vehicle unassigned orders left in 

\(Q\)

, mark them as deferred and increase the number of defferals by one. If no vehicles are avaialble defer the orders.

At this point in the first iteration: Chilled Vans have at most 2 route of the day set. Colombo and Kandy chilled FRESH orders might have one van servicing them.

Next we assign other Fresh chilled orders, the ones that can be serviced from trucks as well. If there any vans are in the DISTRICT_BRAND_CONFIRMED state from the previous step that have weight and volume to carry more orders do fill them. From this step onward we have multiple districts to choose from. Start with the Farthest district. See if all its chilled orders can be served by the remaining reefer vehicle (state=UNCONFIRMED in the first vehicletrip of the day) with the smallest weight and volume capacities. If yes change the state of that vehicle to DISTRICT_BRAND_CONFIRMED. If any district can't be served wholly by one vehicle, Select the smallest vehicle that can have its weight > SUFFICIENT_WEIGHT_UTILIZATION or its volume > SUFFICIENT_VOLUME_UTILIZATION by efficiently packing the smallest amount orders, if none of them reach the thereshold take the vehicle that gave best weight or volume utilization. Mark those orders as vehicle_confirmed and the vehicle as straight up ROUTE_LEGS_CONFIRMED. Next take the leftover unassigned Fresh chilled orders of that district and try to find the smallest vehicle with vehicle-routes available that can carry the load. If no vehicles are avaialble defer the orders.

At this point in the first run: All districts with chilled orders have atleast one vehicle serving them.

 Next we assign Dry Fresh orders only reachable through vans. Use the same logic as van only chilled FRESH orders. Only difference is you can use reefer vans with its first vehicle-trip assigned to chilled FRESH orders and put the Dry FRESH orders as the second vehicle-trip of the day.   

Next is the Fresh Dry orders that can be served by trucks. Use the same logic as chilled Fresh orders. With the exception having the second vehicle-trip of reefer vehicles as well.

Next up style and tech orders follow the same pattern. Starting from the farthest district find the smallest vehicle (with an available second vehicle-trip) that can accomodate the orders of the district. If any district can't be served by one vehicle, find the smallest available vehicle that can reach SUFFICIENT_WEIGHT_UTILIZATION or SUFFICIENT_VOLUME_UTILIZATION with   by efficiently packing the smallest subset of orders. If found move the state of that vehicle straight to the ROUTE_LEGS_CONFIRMED stage. And try to find a vehicle that fits the remaining order set. If no vehicles are avaialble defer the orders.



After the loop runs put all the vehicles to ROUTE_LEGS_CONFIRMED stage. All the remaining orders are deferred