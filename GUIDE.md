# DataMind — Application Testing & Frontend Modification Guide

This guide explains how to properly test the local DataMind application (both frontend and backend) and details the necessary changes required on the frontend to match the backend's URL-based dataset ingestion flow.

---

## Part 1: How to Test the Application Locally

### 1. Start the Backend Server
The backend must be running for the frontend to fetch datasets, perform analysis, and run the AI models.
Open a terminal in the `backend` directory, activate your virtual environment, and run:
```bash
# Windows
.\venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# Mac/Linux
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### 2. Start the Frontend Server
Open a second terminal in the `frontend` directory and run:
```bash
npm install
npm run dev
```
The frontend will be available at [http://localhost:3000](http://localhost:3000).

### 3. Testing the Flow
1. **Login:** The frontend should bypass complex auth and log you in as `you@local` (based on the local configuration).
2. **View Datasets:** Navigate to the Dashboard. You should see any datasets you seeded via the `seed_datasets.py` script.
3. **Analyze a Dataset:** Click on a dataset to view its profile (schema, stats). 
4. **Research Questions:** The application will generate recommended research questions using the local Ollama models and the local Chroma RAG store.
5. **Run Analysis (Sandbox):** Trigger an analysis run to ensure the backend generates Python code, executes it inside the `datamind-sandbox` Docker container, and returns the plot/results.

---

## Part 2: Required Frontend Changes (File Upload → URL Import)

Currently, the frontend is built to handle local file uploads via Drag-and-Drop (sending `multipart/form-data` to the backend). However, the backend is now configured to ingest datasets via **URLs** (e.g., Kaggle or GitHub URLs) by accepting a JSON payload `{"url": "..."}`. 

To make the frontend compatible with the backend, you must implement the following changes in the frontend codebase:

### 1. Update the API Wrapper (`frontend/src/lib/api/datasets.ts`)
*   **Current State:** `uploadDataset(file: File)` uses `FormData` and appends the file.
*   **Required Change:** 
    *   Change the function signature to `uploadDataset(url: string)`.
    *   Modify the `fetchApi` call to send a JSON body: `body: JSON.stringify({ url })`.
    *   Ensure the `Content-Type` header is set to `application/json` (usually handled automatically by `fetchApi` if you pass an object, but verify this).

### 2. Revamp the Upload Page (`frontend/src/app/upload/page.tsx`)
*   **Remove File Drag-and-Drop:** Delete the `isDragOver`, `selectedFile`, and file input references. Remove the drag-and-drop UI box.
*   **Add URL Input:** Create a state variable `const [datasetUrl, setDatasetUrl] = useState("")`. Add a sleek text input field where the user can paste a Kaggle or GitHub URL.
*   **Update Validation:** Remove the `.csv` and `.json` file extension validation logic (`validateAndSetFile`). Add basic URL validation (e.g., ensuring it's a valid HTTP/HTTPS link).
*   **Update API Call:** In `handleStartUpload`, pass the `datasetUrl` to the `apiUploadDataset` function instead of a file.
*   **Update Mock Fallback Logic:** In the `catch` block of `handleStartUpload` (which simulates a successful upload for offline development), remove references to `selectedFile.name` and instead extract a mock filename from the provided URL.
*   **Update UI Copy:** 
    *   Change the page title from "Upload New Dataset" to "Import Dataset via URL".
    *   Change the subtext from "Select or drop a dataset file..." to "Paste a Kaggle or GitHub dataset URL to generate automated summary profiles."
    *   Change the button text from "Select File from Computer" to "Import Dataset".

### 3. Update Navigation Links (`frontend/src/components/layout/Header.tsx`)
*   **Current State:** The header contains a link or button labeled "Upload Dataset".
*   **Required Change:** Change the label to "Import Dataset" or "Add Dataset URL" to better reflect the new behavior.

### 4. (Optional) Rename Routes and Variables
*   For better code semantics, consider renaming the `upload` route folder to `import` or `ingest` (i.e., `frontend/src/app/import/page.tsx`).
*   In `frontend/src/lib/mock/datasets.ts`, change mock `storage_path` values from `uploads/...` to `imported/...` to match the new paradigm.
