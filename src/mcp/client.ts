// Carries the HTTP status and parsed body so callers can react to specific
// failures (notably 409 conflicts from the backend's compare-and-swap).
export class WorkoutApiError extends Error {
  constructor(public status: number, public body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.name = 'WorkoutApiError';
  }
}

export class WorkoutApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* not JSON — keep raw text */ }
      throw new WorkoutApiError(res.status, parsed, `API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async listWorkouts() {
    return this.request<unknown[]>('/workouts');
  }

  async getWorkout(id: string) {
    return this.request<unknown>(`/workouts/${id}`);
  }

  async createWorkout(data: unknown) {
    return this.request<unknown>('/workouts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWorkout(id: string, data: unknown) {
    return this.request<unknown>(`/workouts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async listExercises() {
    return this.request<unknown[]>('/exercises');
  }

  async getAllPRs() {
    return this.request<unknown[]>('/workouts/prs/all');
  }

  async getExercisePRs(exerciseName: string) {
    return this.request<unknown[]>(`/workouts/prs/${encodeURIComponent(exerciseName)}`);
  }
}
