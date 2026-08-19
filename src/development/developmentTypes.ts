import type {RawRecord} from '../today/todayTypes'

export type SkillId=
  |'self.start_action'
  |'self.stop_recursive_analysis'
  |'emotion.deliberate_response'
  |'flexibility.uncertainty'
  |'communication.clarity'
  |'communication.assertiveness'
  |'communication.listening'
  |'communication.interpretation_checking'
  |'metacognition.observation_inference'
  |'metacognition.assumptions'
  |'critical.alternatives'
  |'relations.boundaries'
  |'values.small_action'

export type SkillCategory='Autorregulação'|'Regulação emocional'|'Flexibilidade'|'Comunicação'|'Metacognição'|'Pensamento crítico'|'Relações'|'Valores'
export type EvidenceLevel='insufficient'|'weak'|'moderate'|'strong'
export type EvidenceSource='checkin'|'relation'|'qualitative'|'values'|'review'|'practice-history'
export type PracticeDifficulty='low'|'medium'|'high'
export type PracticeScope='daily'|'weekly'
export type CompletionStatus='done'|'partial'|'declined'|'no-opportunity'

export type SkillDefinition={
  id:SkillId
  category:SkillCategory
  label:string
  description:string
}

export type PracticeDefinition={
  id:string
  title:string
  skill:SkillId
  description:string
  weeklyDescription:string
  estimatedMinutes:number
  difficulty:PracticeDifficulty
  contexts:string[]
  contraindications:string[]
  requiresOpportunity:boolean
  sourceType:'deterministic-template'
}

export type DevelopmentEvidence={
  source:EvidenceSource
  skill:SkillId
  label:string
  detail:string
  n:number
  strength:number
  quantitative:boolean
}

export type DevelopmentCandidate={
  skill:SkillId
  priority:number
  evidence:DevelopmentEvidence[]
  evidenceLevel:EvidenceLevel
  observationCount:number
  sourceCount:number
  quantitativeEvidenceCount:number
  personalized:boolean
}

export type PracticeStats={
  practiceId:string
  outcomes:number
  completed:number
  partial:number
  noOpportunity:number
  declined:number
  meanUtility:number|null
  meanEffort:number|null
  lastOutcomeAt:string|null
}

export type PracticeRecommendation={
  practice:PracticeDefinition
  skill:SkillDefinition
  evidence:DevelopmentEvidence[]
  evidenceLevel:EvidenceLevel
  personalized:boolean
  reasonSummary:string
}

export type DevelopmentPlan={
  daily:PracticeRecommendation|null
  alternatives:PracticeRecommendation[]
  weekly:PracticeRecommendation[]
  candidates:DevelopmentCandidate[]
  context:{energy:number|null;stress:number|null;lowCapacity:boolean}
  strategyLearning:PracticeStats[]
}

export type DevelopmentEventPayload={
  version:'1.0'
  subtype:'development_practice'
  phase:'accepted'|'declined'|'outcome'
  assignmentId:string
  practiceId:string
  skill:SkillId
  scope:PracticeScope
  completion?:CompletionStatus
  utility?:number
  effort?:number
  result?:string
  emotion?:string
  assignedAt?:string
}

export type DevelopmentRecord=RawRecord & {payload:DevelopmentEventPayload}
