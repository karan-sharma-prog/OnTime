import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  department_id?: number;
  department_name?: string;
  subject_specialization?: string;
  employee_id?: string;
  extra_classes: number;
}

export interface TimetableEntry {
  id: number;
  teacher_id: number;
  day: string;
  start_time: string;
  end_time: string;
  subject: string;
  room: string;
  block: string;
  class_name: string;
}

export interface Notification {
  id: number;
  message: string;
  type: 'reminder' | 'request' | 'confirmation' | 'request_accepted' | 'request_rejected';
  is_read: boolean | number;
  created_at: string;
  related_id?: string;
}
