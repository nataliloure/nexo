export type Domain='Autorregulação'|'Flexibilidade'|'Socioemocional'|'Relações'|'Metacognição'
export type PersonalChange='above'|'below'|'within'|'insufficient-data'
export type TrajectoryRange='7'|'30'|'90'

export type RawRecord={
  id:string
  record_type:string
  payload:unknown
  created_at:string
}

export type CheckinPayload={
  date?:string
  responses?:Record<string,unknown>
  energy?:unknown
  stress?:unknown
  connection?:unknown
  sleep?:unknown
  event?:unknown
  notes?:unknown
}

export type DomainComparison={
  domain:Domain
  current:number|null
  baseline:number|null
  baselineN:number
  difference:number|null
  change:PersonalChange
}

export type ConfirmedValue={
  key:string
  text:string
  area:string
}

export type ValueAction={
  text:string
  value:string
  status:string
  realized:boolean
  createdAt:string
}

export type ValueActionConsistency={
  confirmedValues:ConfirmedValue[]
  actions:number
  realized:number
  ratio:number|null
  latestAction:ValueAction|null
}

export type ExperimentPoint={
  anticipated:number
  observed:number
  difference:number
  certainty:number|null
  createdAt:string
}

export type ExperimentSummary={
  complete:number
  observedLower:number
  observedEqual:number
  observedHigher:number
  latest:ExperimentPoint|null
}

export type RelationSummary={
  n:number
  mostVariable:string|null
  mostStable:string|null
  presenceConnectionCorrelation:number|null
}

export type TodayInsight={
  domain:Domain
  title:string
  detail:string
  route:string
  actionLabel:string
  comparison:DomainComparison
}
