# Provify

Provify is a production-oriented AI-powered technical interview platform that evaluates a candidate’s understanding of their own codebase. Users upload project files, the system builds a retrieval-augmented generation (RAG) knowledge base over the code, and an AI interviewer generates deep, code-specific questions and scores the responses.

The platform consists of a FastAPI backend, a Next.js frontend, Supabase for persistence/storage, Redis for session state, and Docker-based deployment support.

---

## 1. Overview

Provify helps teams and individuals perform technical interviews in a more realistic and evidence-based way by grounding the interview in the actual uploaded source code.

### Core capabilities
- Upload project files and code snapshots
- Ingest code into a per-session vector store using RAG
- Generate context-aware technical interview questions from retrieved code chunks
- Evaluate candidate answers with AI-based scoring and feedback
- Persist interview sessions, questions, and results
- Support local development and production deployment through Docker and cloud hosting

---

## 2. System Architecture

### Frontend
- Next.js application with modern React and TypeScript
- Handles authentication, interview flow, upload workflow, and results display

### Backend
- FastAPI service exposing interview, upload, auth, and history endpoints
- Uses LangGraph to orchestrate the interview workflow
- Uses LangChain and Groq for LLM-based question generation and evaluation

### RAG pipeline
- Uploaded project files are downloaded from Supabase Storage
- Files are chunked into smaller code segments
- Chunks are embedded using HuggingFace sentence-transformers
- Chunks are stored in Chroma for semantic retrieval
- The interviewer retrieves the most relevant code snippets at runtime to ask grounded questions

### Data and infrastructure
- Supabase for authentication, metadata storage, and file storage
- Redis for session state and transient interview persistence
- Docker for containerized deployment and local orchestration

---

## 3. Tech Stack

### Backend
- Python 3.12
- FastAPI
- Uvicorn
- Pydantic / Pydantic Settings
- LangChain
- LangGraph
- LangSmith
- Groq
- ChromaDB
- HuggingFace Embeddings
- Supabase Python SDK
- Redis

### Frontend
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase JS SDK

### DevOps / Deployment
- Docker
- Docker Compose
- GitHub Actions
- Render
- Vercel

---

## 4. Project Structure

```text
provify/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   └── services/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── render.yaml
├── provify-frontend/
│   ├── src/
│   ├── Dockerfile
│   ├── package.json
│   └── next.config.ts
├── docker-compose.yml
├── .github/workflows/ci-cd.yml
└── README.md
```

---

## 5. Prerequisites

Before running the project locally, ensure the following are available:
- Python 3.12+
- Node.js 22+
- Docker and Docker Compose (optional but recommended)
- Redis (or use the Docker Compose service)
- A Supabase project
- A Groq API key
- A LangSmith API key

---

## 6. Environment Variables

Create environment files before running the app.

### Backend
Create a file at [backend/.env](backend/.env) or set these variables in your shell:

```env
APP_ENV=development
SECRET_KEY=your-secret-key
GROQ_API_KEY=your-groq-api-key
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-anon-key
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
REDIS_URL=redis://localhost:6379
LANGCHAIN_API_KEY=your-langsmith-api-key
LANGCHAIN_PROJECT=provify
LANGCHAIN_TRACING_V2=true
```

### Frontend
Create a file at [provify-frontend/.env.local](provify-frontend/.env.local):

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

> Never commit secrets or API keys to version control. Use GitHub Secrets, environment groups, or platform-native secret storage for production.

---

## 7. Local Development

### Option A: Docker Compose
This is the easiest way to run the full stack locally.

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

### Option B: Run services manually

#### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend
```bash
cd provify-frontend
npm install
npm run dev
```

---

## 8. RAG Workflow

Provify uses a retrieval-augmented workflow to make interviews grounded in actual project code.

### Flow
1. A user uploads project code files.
2. The backend downloads the files from Supabase Storage.
3. Files are split into meaningful code chunks.
4. Each chunk is embedded and stored in ChromaDB.
5. During interview generation, the system retrieves the most relevant chunks for the current session.
6. The LLM uses those chunks to ask a detailed, code-specific technical question.
7. Candidate responses are evaluated against the retrieved code context.

### Why this matters
This ensures the AI does not rely on generic interview questions. Instead, it asks questions grounded in the candidate’s actual implementation, which makes the interview more accurate and meaningful.

---

## 9. Testing and Quality Assurance

The repository includes CI checks for both backend and frontend.

### Backend
- Python dependency installation
- Test execution with pytest

### Frontend
- Dependency installation
- Linting
- Production build validation

### CI/CD pipeline
The workflow in [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml) automates:
- backend test runs
- frontend build and lint checks
- Docker image builds and publishing
- deployment triggering for Render

---

## 10. Deployment

### Render (Backend)
The backend deployment is configured through [backend/render.yaml](backend/render.yaml).

Recommended production setup:
- Deploy the FastAPI service as a Dockerized web service
- Attach persistent storage for ChromaDB at /data/chroma
- Configure environment variables for Supabase, Groq, Redis, and LangSmith
- Use Redis for session state and persistence

### Vercel (Frontend)
The frontend is designed for deployment on Vercel.

Production configuration should include:
- `NEXT_PUBLIC_API_BASE_URL` pointing to the deployed backend URL
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Notes on cold starts
Render’s free tier may experience slower cold starts, especially when the backend initializes AI dependencies and embeddings. The backend image has been structured to pre-download the embedding model where possible, which helps reduce startup latency.

---

## 11. Production Considerations

For production readiness, consider the following:
- Use managed secrets instead of plain environment files
- Configure proper CORS origins for production domains
- Monitor logs, API errors, and latency
- Enable alerting for failed deployments or unhealthy services
- Consider a paid Render plan if persistent availability is required
- Use HTTPS and secure authentication for all environments

---

## 12. License

This project is intended for internal or experimental use unless otherwise specified by the repository owner.

---

## 13. Getting Started Summary

```bash
git clone <repository-url>
cd provify

# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd ../provify-frontend
npm install
```

Then configure the environment variables and run the services as described above.
