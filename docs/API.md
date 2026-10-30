# REST API Specification (Version 1.0)

All endpoints are versioned under `/api/v1`. Authentication uses `Bearer <JWT_ACCESS_TOKEN>`.

---

## Authentication Endpoints

### 1. Register User
`POST /api/v1/auth/register`
- **Request Body**:
  ```json
  {
    "username": "johndoe",
    "email": "johndoe@example.com",
    "password": "Password@123"
  }
  ```
- **Response**: `201 Created` with created user record.

### 2. Login
`POST /api/v1/auth/login`
- **Request Body**:
  ```json
  {
    "usernameOrEmail": "admin@distml.local",
    "password": "Admin@123"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi...",
      "user": { "id": "...", "username": "admin", "role": "admin" }
    }
  }
  ```

---

## Job Management Endpoints

### 3. Submit Workload
`POST /api/v1/jobs` (Multipart or JSON)
- **Headers**: `Authorization: Bearer <token>`
- **Fields / Body**:
  ```json
  {
    "name": "Customer Churn Inference",
    "job_type": "csv_batch_inference",
    "scheduling_strategy": "resource_aware",
    "priority": 8,
    "batch_size": 500,
    "sample_dataset": "customer_churn"
  }
  ```
- **Response**: `201 Created` with `job.id` and `total_batches`.

### 4. List Workloads
`GET /api/v1/jobs?status=RUNNING&limit=20&offset=0`

### 5. Inspect Workload Details
`GET /api/v1/jobs/:id`
- Returns job record, distributed task batches, scheduling decision, and state transition timeline.

### 6. Cancel Workload
`POST /api/v1/jobs/:id/cancel`

### 7. Retry Workload
`POST /api/v1/jobs/:id/retry`

### 8. Download Result Artifact
`GET /api/v1/jobs/:id/artifacts`
- Streams aggregated CSV or JSON result artifact file.

---

## Worker Cluster Endpoints

### 9. List Worker Cluster Nodes
`GET /api/v1/workers`
- Returns worker records with live Redis CPU load, available RAM, and active tasks.

### 10. Toggle Drain Mode
`POST /api/v1/workers/:id/drain` (Admin only)
- **Body**: `{ "drain": true }`
