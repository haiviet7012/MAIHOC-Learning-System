import { api } from './api.js';

export const loadNationalExams = signal => api('/api/national-exams', { signal });
export const loadNationalExamHistory = (id, signal) =>
  api(`/api/national-exams/${encodeURIComponent(id)}/history`, { signal });
export const loadNationalResult = (id, signal) => api(`/api/national-exams/results/${encodeURIComponent(id)}`, { signal });
export const loadExamBank = signal => api('/api/national-exams/manage', { signal });
export const saveBankExam = (exam, signal) => api(exam.id ? `/api/national-exams/manage/${encodeURIComponent(exam.id)}` : '/api/national-exams/manage', {
  method: exam.id ? 'PUT' : 'POST', body: exam, signal,
});
