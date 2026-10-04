# Driver Mobile App - Backend API Specification

This document outlines all the REST API endpoints, request payloads, and response structures required by the Driver Mobile Application. You can hand this directly to the backend development team.

---

## 1. Authentication

### 1.1 Driver Login
Authenticates the driver and returns JWT tokens.

- **Endpoint:** `POST /api/auth/login`
- **Request Body:**
  ```json
  {
    "username": "driver_001",
    "password": "securepassword"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "accessToken": "eyJhbG...",
    "refreshToken": "dGVzdC...",
    "driver": {
      "id": "drv_123",
      "name": "John Doe",
      "vehicleNumber": "WP-1234"
    }
  }
  ```

---

## 2. Trip Management

### 2.1 Get Today's Trips
Fetches all the trips assigned to the logged-in driver for the current day. The first trip in the array is usually the active/next trip.

- **Endpoint:** `GET /api/trips/today`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Success Response (200 OK):**
  ```json
  {
    "trips": [
      {
        "activeTripId": "Trip 1",
        "isStarted": true,
        "nodes": [
          {
            "id": "node_01",
            "type": "warehouse",
            "title": "Peliyagoda Warehouse",
            "badgeText": "DOCK 3",
            "scheduledStart": "02:30 AM",
            "scheduledEnd": "03:30 AM",
            "status": "completed",
            "reportCount": 0,
            "inventory": [],
            "logs": []
          },
          {
            "id": "node_02",
            "type": "outlet",
            "title": "OUT001 Colombo",
            "badgeText": "MALL BAY DOCK",
            "scheduledStart": "05:30 AM",
            "scheduledEnd": "08:30 AM",
            "estimatedArrival": "5:28 AM",
            "status": "pending",
            "reportCount": 0,
            "inventory": [],
            "logs": []
          }
        ]
      },
      {
        "activeTripId": "Trip 2",
        "isStarted": false,
        "nodes": [
          {
            "id": "node_03",
            "type": "warehouse",
            "title": "Kandy Warehouse",
            "badgeText": "DOCK 1",
            "scheduledStart": "01:00 PM",
            "scheduledEnd": "02:00 PM",
            "status": "pending",
            "inventory": [],
            "logs": []
          }
        ]
      }
    ]
  }
  ```

---

## 3. Trip Execution (Node Updates)

### 3.1 Mark Node Arrival
Records the exact time the driver pressed the "I've Arrived!" button.

- **Endpoint:** `POST /api/trips/{tripId}/nodes/{nodeId}/arrive`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Request Body:**
  ```json
  {
    "timestamp": "2026-10-04T06:30:00.000Z",
    "gpsCoordinates": {
      "lat": 6.9271,
      "lng": 79.8612
    }
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "message": "Arrival recorded successfully.",
    "status": "arrived"
  }
  ```

### 3.2 Confirm Departure / Delivery (OTP Validation)
Validates the OTP entered by the driver (provided by the store manager) and marks the node as completed.

- **Endpoint:** `POST /api/trips/{tripId}/nodes/{nodeId}/depart`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Request Body:**
  ```json
  {
    "otpCode": "123456",
    "timestamp": "2026-10-04T07:05:00.000Z"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "message": "OTP verified successfully. Node completed.",
    "status": "completed"
  }
  ```
- **Error Response (400 Bad Request):**
  ```json
  {
    "error": "Invalid OTP code."
  }
  ```

### 3.3 Report an Issue
Logs an issue against a specific trip node (e.g., store closed, delay).

**Note to Backend Developer:** Since this involves uploading optional image files, this endpoint should accept `multipart/form-data`.

- **Endpoint:** `POST /api/trips/{tripId}/nodes/{nodeId}/report`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: multipart/form-data`
- **Form Data Payload:**
  - `issue`: (String) e.g., "closed", "blocked", "refused"
  - `action`: (String - Optional) e.g., "alt_route", "skipped"
  - `notes`: (String - Optional) "Store manager was not present."
  - `timestamp`: (String - ISO) "2026-10-04T06:45:00.000Z"
  - `photos`: (File Array - Optional) Multiple image files representing proof of the issue.
- **Success Response (200 OK):**
  ```json
  {
    "message": "Issue reported successfully."
  }
  ```

---

## 4. Offline Synchronization

### 4.1 Sync Offline Manual Delivery
Used when the app detects no network at the outlet. The app stores photos locally and sends this payload when the network reconnects.

**Note to Backend Developer:** Since this involves uploading image files, this endpoint should ideally accept `multipart/form-data`. 

- **Endpoint:** `POST /api/trips/offline-sync`
- **Headers:** `Authorization: Bearer <accessToken>`, `Content-Type: multipart/form-data`
- **Form Data Payload:**
  - `tripId`: (String) e.g., "TRP-90210"
  - `nodeId`: (String) e.g., "node_02"
  - `timestamp`: (String - ISO) Exact time the delivery was manually recorded offline.
  - `unloadedPhotos`: (File Array) Multiple image files (e.g., JPG/PNG) representing the unloaded goods.
  - `paperPhotos`: (File Array) Multiple image files representing the signed paper confirmation.

- **Success Response (200 OK):**
  ```json
  {
    "message": "Offline delivery synced and processed successfully."
  }
  ```
- **Error Response (500 Internal Server Error):**
  *(If the server responds with 500, the mobile app will keep the task in the offline queue and try again later).*

---

## 5. History

### 5.1 Get Trip History
Fetches a list of past completed or cancelled trips for the driver.

- **Endpoint:** `GET /api/trips/history`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Query Parameters:** `?page=1&limit=10`
- **Success Response (200 OK):**
  ```json
  {
    "trips": [
      {
        "tripId": "TRP-80123",
        "date": "2026-10-01T14:00:00Z",
        "status": "completed",
        "totalOutlets": 4
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5
    }
  }
  ```

---

## 6. Profile

### 6.1 Get Driver Profile
Fetches the current driver's profile information and statistics.

- **Endpoint:** `GET /api/profile`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Success Response (200 OK):**
  ```json
  {
    "profile": {
      "id": "drv_123",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "phone": "+94771234567",
      "vehicleType": "Lorry",
      "vehicleNumber": "WP-1234",
      "rating": 4.8,
      "totalTrips": 142
    }
  }
  ```

### 6.2 Update Profile
Updates specific details in the driver's profile (e.g., phone number).

- **Endpoint:** `PUT /api/profile`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Request Body:**
  ```json
  {
    "phone": "+94779876543"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "message": "Profile updated successfully."
  }
  ```
