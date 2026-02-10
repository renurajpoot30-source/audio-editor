
export interface AudioMetadata {
  name: string;
  size: number;
  duration: number;
  format: string;
  lastModified: number;
}

export interface AIAnalysis {
  transcript: string;
  sentiment: string;
  enhancementSuggestions: string[];
  noiseLevel: 'Low' | 'Medium' | 'High';
  audioQualityScore: number;
}

export interface AudioFilterSettings {
  gain: number;
  lowPass: number;
  highPass: number;
  compression: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  EDITING = 'EDITING',
  ANALYZING = 'ANALYZING',
  RECORDING = 'RECORDING'
}
