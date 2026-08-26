export type StressOrientation='higher-is-more-stress'|'higher-is-better'

export type WearableDailyPayload={
  version:'1.0'
  subtype:'wearable_daily'
  date:string
  source:string
  sleepMinutes?:number
  stressScore?:number
  stressOrientation?:StressOrientation
  restingBpm?:number
  averageBpm?:number
  importedAt?:string
}

export type WearableMetricSignal='higher'|'lower'|'within'|'insufficient'

export type WearableMetricSummary={
  latest:number|null
  baseline:number|null
  baselineN:number
  difference:number|null
  threshold:number|null
  signal:WearableMetricSignal
  unit:string
}

export type WearableSummary={
  latestDate:string|null
  source:string|null
  fresh:boolean
  daysFromAnchor:number|null
  sleep:WearableMetricSummary
  stress:WearableMetricSummary
  stressOrientation:StressOrientation|null
  restingBpm:WearableMetricSummary
  averageBpm:number|null
  lowerSleep:boolean
  higherStressBurden:boolean
  higherRestingBpm:boolean
  shouldReduceLoad:boolean
}
