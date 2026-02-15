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
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
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
