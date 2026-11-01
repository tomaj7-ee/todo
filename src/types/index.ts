export type Status = "todo" | "doing" | "done";

export interface Progress {
  done: number;
  total: number;
  percent: number;
}

export interface TodoDTO {
  id: string;
  title: string;
  status: Status;
  weekId: string;
  weekTitle: string;
  goalId: string | null;
  goalTitle: string | null;
  date: string;
}

export interface WeekDTO {
  id: string;
  title: string;
  goalId: string;
  goalTitle: string | null;
  startDate: string;
  endDate: string;
  progress: Progress;
}

export interface GoalDTO {
  id: string;
  title: string;
  year: number;
  weeks: WeekDTO[];
  progress: Progress;
}

export interface ApiError {
  error: string;
}
