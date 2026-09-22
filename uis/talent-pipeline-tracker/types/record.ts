// Tipos de la API del Talent Tracker
// Los nombres de campo son los del backend — no se traducen.

export type RecordStatus =
  | 'received'
  | 'in_progress'
  | 'selected'
  | 'discarded';

export type RecordStage =
  | 'pending'
  | 'review'
  | 'personal_interview'
  | 'technical_interview'
  | 'offer_presented';

export interface Note {
  id: string;
  record_id: string;
  content: string;
  created_at: string;
}

export interface TalentRecord{
  id: string;
  full_name: string;
  email: string;
  phone: string;
  position: string;
  linkedin_url: string | null;
  cv_url: string;
  status: RecordStatus;
  stage: RecordStage;
  experience_years: number;
  applied_at: string;
  updated_at: string;
  notes: Note[];
  notes_count: number;
}

export interface RecordsResponse {
  total: number;
  page: number;
  limit: number;
  data: TalentRecord[];
}

export interface RecordFilters {
  status?: RecordStatus;
  stage?: RecordStage;
  search?: string;
  page?: number;
  limit?: number;
}


export interface RecordInput {
  full_name: string;
  email: string;
  phone: string;
  position: string;
  experience_years: number;
  linkedin_url: string | null;
  cv_url: string | null;
}
