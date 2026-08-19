import {calculateAllDomainComparisons,calculateValueActionConsistency,finiteNumber,isObject,nonEmptyString,safeMean} from '../today/todayMetrics'
import type {Domain,RawRecord} from '../today/todayTypes'
import {PRACTICES,PRACTICES_BY_SKILL} from './practiceCatalog'
import {SKILL_BY_ID} from './skillCatalog'
import {collectQualitativePatterns} from './qualitativeSignals'
import type {DevelopmentCandidate,DevelopmentEvidence,DevelopmentPlan,EvidenceLevel,PracticeDefinition,PracticeRecommendation,PracticeStats,SkillId} from './developmentTypes'

export const RELATION_CHANGE_THRESHOLD=1
export const MIN_PERSONALIZED_OBSERVATIONS=3
export const DECLINE_COOLDOWN_DAYS=14
export const PRACTICE_SPACING_DAYS=3

export const PRIORITY_WEIGHTS={
  domainChange:2,
  relationChange:1.5,
  recurrencePerObservation:0.35,
  qualitativeSupport:1,
  valueRelevance:0.5,
  unfinishedAcceptedPractice:0.3,
  declinedRecentlyPenalty:2,
  recentSuccessPenalty:0.5,
  insufficientDataPenalty:3,
} as const

const DOMAIN_SKILLS:Record<Domain,SkillId[]>={
  Autorregulação:['self.start_action','self.stop_recursive_analysis'],
  Flexibilidade:['flexibility.uncertainty','values.small_action'],
  Socioemocional:['emotion.deliberate_response'],
  Relações:['communication.listening','communication.assertiveness','communication.interpretation_checking','relations.boundaries'],
  Metacognição:['metacognition.observation_inference','metacognition.assumptions','critical.alternatives'],
}

const RELATION_SKILLS:Record<string,SkillId[]>={
  listening:['communication.listening'],
  assertiveness:['communication.assertiveness'],
  boundaries:['relations.boundaries','communication.assertiveness'],
  presence:['communication.listening'],
  quality:['communication.clarity','communication.interpretation_checking'],
  connectionAfter:['communication.interpretation_checking'],
}

const RELATION_LABELS:Record<string,string>={
  listening:'escuta',
  assertiveness:'assertividade',
  boundaries:'limites',
  presence:'presença',
  quality:'qualidade da interação',
  connectionAfter:'conexão posterior',
}

function timeOf(record:RawRecord){const time=new Date(record.created_at).getTime();return Number.isFinite(time)?time:null}
function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,value))}
function daysMs(days:number){return days*86400000}

function levelFor(observations:number,sources:number):EvidenceLevel{
  if(observations<3)return'insufficient'
  if(observations<5||sources<2)return'weak'
  if(observations>=8&&sources>=3)return'strong'
  return'moderate'
}

function addEvidence(map:Map<SkillId,DevelopmentEvidence[]>,skills:SkillId[],evidence:Omit<DevelopmentEvidence,'skill'>){
  for(const skill of skills){
    const list=map.get(skill)??[]
    list.push({...evidence,skill})
    map.set(skill,list)
  }
}

function domainEvidence(records:RawRecord[],map:Map<SkillId,DevelopmentEvidence[]>){
  const checkins=records.filter(record=>record.record_type==='checkin')
  const latest=checkins.at(-1)
  if(!latest)return
  for(const comparison of calculateAllDomainComparisons(checkins,latest)){
    if(comparison.change!=='below'||comparison.difference===null)continue
    const magnitude=clamp(Math.abs(comparison.difference)/1.5,0,1)
    addEvidence(map,DOMAIN_SKILLS[comparison.domain],{
      source:'checkin',
      label:`${comparison.domain} abaixo do padrão recente`,
      detail:`O check-in mais recente ficou ${Math.abs(comparison.difference).toFixed(2)} ponto abaixo da média de ${comparison.baselineN} check-ins anteriores. É uma comparação intraindividual, não clínica.`,
      n:comparison.baselineN+1,
      strength:magnitude,
      quantitative:true,
    })
  }
}

function relationEvidence(records:RawRecord[],map:Map<SkillId,DevelopmentEvidence[]>){
  const rows=records.filter(record=>record.record_type==='relation'&&isObject(record.payload)).sort((a,b)=>(timeOf(a)??0)-(timeOf(b)??0))
  if(rows.length<6)return
  const latestTime=timeOf(rows.at(-1)!)??Date.now()
  const recent=rows.slice(-3)
  const prior=rows.slice(0,-3).filter(record=>{
    const time=timeOf(record)
    return time!==null&&time>=latestTime-daysMs(30)
  })
  if(prior.length<3)return
  for(const[key,skills]of Object.entries(RELATION_SKILLS)){
    const current=recent.map(record=>isObject(record.payload)?finiteNumber(record.payload[key]):null).filter((value):value is number=>value!==null)
    const baseline=prior.map(record=>isObject(record.payload)?finiteNumber(record.payload[key]):null).filter((value):value is number=>value!==null)
    if(current.length<3||baseline.length<3)continue
    const currentMean=safeMean(current),baselineMean=safeMean(baseline)
    if(currentMean===null||baselineMean===null)continue
    const difference=currentMean-baselineMean
    if(difference>-RELATION_CHANGE_THRESHOLD)continue
    addEvidence(map,skills,{
      source:'relation',
      label:`${RELATION_LABELS[key]} abaixo do padrão relacional recente`,
      detail:`A média das 3 interações mais recentes ficou ${Math.abs(difference).toFixed(1)} ponto abaixo da média de ${baseline.length} interações anteriores disponíveis.`,
      n:current.length+baseline.length,
      strength:clamp(Math.abs(difference)/3,0,1),
      quantitative:true,
    })
  }
}

function qualitativeEvidence(records:RawRecord[],map:Map<SkillId,DevelopmentEvidence[]>,nowMs:number){
  for(const pattern of collectQualitativePatterns(records,nowMs)){
    if(pattern.occurrences<2)continue
    addEvidence(map,pattern.skills,{
      source:'qualitative',
      label:pattern.label,
      detail:`Esse padrão textual/estrutural apareceu em ${pattern.occurrences} registros recentes. O Nexo usa recorrência conservadora e não interpreta uma palavra isolada como característica psicológica.`,
      n:pattern.occurrences,
      strength:clamp(pattern.occurrences/6,0,1),
      quantitative:false,
    })
  }
}

function valuesEvidence(records:RawRecord[],map:Map<SkillId,DevelopmentEvidence[]>,nowMs:number){
  const values=calculateValueActionConsistency(records,nowMs)
  if(values.confirmedValues.length){
    const relational=values.confirmedValues.filter(value=>/\b(rela|fam[ií]lia|amizade|comunidade|comunica|respeito|honestidade|presen)/i.test(`${value.area} ${value.text}`))
    if(relational.length){
      addEvidence(map,['communication.clarity','communication.assertiveness','communication.interpretation_checking','relations.boundaries'],{
        source:'values',label:'relevância para valores confirmados',detail:`Há ${relational.length} valor(es) confirmado(s) relacionado(s) a relações ou comunicação. Isso aumenta apenas a relevância da prática, não indica dificuldade.`,n:relational.length,strength:0.35,quantitative:false,
      })
    }
    addEvidence(map,['values.small_action'],{
      source:'values',label:'valores confirmados disponíveis',detail:`Há ${values.confirmedValues.length} valor(es) confirmado(s) que podem orientar uma ação pequena e observável.`,n:values.confirmedValues.length,strength:0.3,quantitative:false,
    })
  }
  if(values.actions>=2&&values.ratio!==null&&values.ratio<0.5){
    addEvidence(map,['values.small_action','self.start_action'],{
      source:'values',label:'ações vinculadas a valores ainda pouco realizadas',detail:`Nos últimos 30 dias, ${values.realized} de ${values.actions} ações registradas e vinculadas a valores confirmados foram marcadas como realizadas. Isso descreve comportamento registrado, não aderência moral nem saúde psicológica.`,n:values.actions,strength:clamp(1-values.ratio,0,1),quantitative:true,
    })
  }
}

function reviewGoalEvidence(records:RawRecord[],map:Map<SkillId,DevelopmentEvidence[]>){
  const reviews=records.filter(record=>record.record_type==='review'&&isObject(record.payload)&&nonEmptyString(record.payload.subtype)!=='development_practice')
  const latest=reviews.at(-1)
  if(!latest||!isObject(latest.payload)||!isObject(latest.payload.answers))return
  const target=nonEmptyString(latest.payload.answers['9'])
  if(!target)return
  const mappings:{pattern:RegExp;skills:SkillId[]}[]=[
    {pattern:/comunica|clareza|conversa|mensagem/i,skills:['communication.clarity']},
    {pattern:/assertiv|pedido|necessidade/i,skills:['communication.assertiveness']},
    {pattern:/escut/i,skills:['communication.listening']},
    {pattern:/limite/i,skills:['relations.boundaries']},
    {pattern:/pressupost/i,skills:['metacognition.assumptions']},
    {pattern:/observa|infer/i,skills:['metacognition.observation_inference']},
    {pattern:/alternativ|ponto de vista/i,skills:['critical.alternatives']},
    {pattern:/emoç|impulso|regula/i,skills:['emotion.deliberate_response']},
    {pattern:/ação|iniciar|começar/i,skills:['self.start_action']},
  ]
  for(const mapping of mappings)if(mapping.pattern.test(target))addEvidence(map,mapping.skills,{source:'review',label:'habilidade escolhida na revisão semanal',detail:'Sua revisão semanal recente mencionou explicitamente esta habilidade como algo que você deseja praticar.',n:1,strength:0.6,quantitative:false})
}

function developmentPayload(record:RawRecord){
  if(record.record_type!=='review'||!isObject(record.payload)||nonEmptyString(record.payload.subtype)!=='development_practice')return null
  return record.payload
}

export function getPracticeStats(records:RawRecord[]):PracticeStats[]{
  const stats=new Map<string,{outcomes:number;completed:number;partial:number;noOpportunity:number;declined:number;utilities:number[];efforts:number[];lastOutcomeAt:string|null}>()
  for(const record of records){
    const payload=developmentPayload(record)
    if(!payload)continue
    const practiceId=nonEmptyString(payload.practiceId)
    if(!practiceId)continue
    const current=stats.get(practiceId)??{outcomes:0,completed:0,partial:0,noOpportunity:0,declined:0,utilities:[],efforts:[],lastOutcomeAt:null}
    const phase=nonEmptyString(payload.phase)
    if(phase==='declined')current.declined++
    if(phase==='outcome'){
      current.outcomes++
      const completion=nonEmptyString(payload.completion)
      if(completion==='done')current.completed++
      if(completion==='partial')current.partial++
      if(completion==='no-opportunity')current.noOpportunity++
      if(completion==='declined')current.declined++
      const utility=finiteNumber(payload.utility),effort=finiteNumber(payload.effort)
      if(utility!==null)current.utilities.push(utility)
      if(effort!==null)current.efforts.push(effort)
      current.lastOutcomeAt=record.created_at
    }
    stats.set(practiceId,current)
  }
  return[...stats.entries()].map(([practiceId,value])=>({
    practiceId,
    outcomes:value.outcomes,
    completed:value.completed,
    partial:value.partial,
    noOpportunity:value.noOpportunity,
    declined:value.declined,
    meanUtility:safeMean(value.utilities),
    meanEffort:safeMean(value.efforts),
    lastOutcomeAt:value.lastOutcomeAt,
  }))
}

function recentDeclinedSkills(records:RawRecord[],nowMs:number){
  const cutoff=nowMs-daysMs(DECLINE_COOLDOWN_DAYS)
  const set=new Set<SkillId>()
  for(const record of records){
    const payload=developmentPayload(record)
    const time=timeOf(record)
    if(!payload||time===null||time<cutoff||nonEmptyString(payload.phase)!=='declined')continue
    const skill=nonEmptyString(payload.skill) as SkillId
    if(skill in SKILL_BY_ID)set.add(skill)
  }
  return set
}

function acceptedWithoutOutcome(records:RawRecord[],nowMs:number){
  const accepted=new Map<string,{skill:SkillId;time:number}>()
  const outcomes=new Set<string>()
  for(const record of records){
    const payload=developmentPayload(record)
    if(!payload)continue
    const assignmentId=nonEmptyString(payload.assignmentId)
    const skill=nonEmptyString(payload.skill) as SkillId
    const time=timeOf(record)
    if(!assignmentId||time===null||!(skill in SKILL_BY_ID))continue
    if(nonEmptyString(payload.phase)==='accepted')accepted.set(assignmentId,{skill,time})
    if(nonEmptyString(payload.phase)==='outcome')outcomes.add(assignmentId)
  }
  const pending=new Map<SkillId,number>()
  for(const[id,value]of accepted)if(!outcomes.has(id)&&value.time>=nowMs-daysMs(7))pending.set(value.skill,(pending.get(value.skill)??0)+1)
  return pending
}

function scoreCandidate(skill:SkillId,evidence:DevelopmentEvidence[],records:RawRecord[],stats:PracticeStats[],nowMs:number):DevelopmentCandidate{
  const sources=new Set(evidence.map(item=>item.source))
  const observations=evidence.reduce((sum,item)=>sum+Math.max(0,item.n),0)
  const quantitativeEvidence=evidence.filter(item=>item.quantitative)
  let score=0
  for(const item of evidence){
    if(item.source==='checkin')score+=PRIORITY_WEIGHTS.domainChange*item.strength
    else if(item.source==='relation')score+=PRIORITY_WEIGHTS.relationChange*item.strength
    else if(item.source==='qualitative')score+=PRIORITY_WEIGHTS.qualitativeSupport*item.strength
    else if(item.source==='values'||item.source==='review')score+=PRIORITY_WEIGHTS.valueRelevance*item.strength
    score+=Math.min(item.n,5)*PRIORITY_WEIGHTS.recurrencePerObservation/5
  }
  const declined=recentDeclinedSkills(records,nowMs)
  if(declined.has(skill))score-=PRIORITY_WEIGHTS.declinedRecentlyPenalty
  const pending=acceptedWithoutOutcome(records,nowMs).get(skill)??0
  if(pending)score+=PRIORITY_WEIGHTS.unfinishedAcceptedPractice
  const skillPracticeIds=new Set((PRACTICES_BY_SKILL.get(skill)??[]).map(practice=>practice.id))
  const strongRecentSuccess=stats.some(stat=>skillPracticeIds.has(stat.practiceId)&&stat.outcomes>=2&&(stat.meanUtility??0)>=8&&stat.lastOutcomeAt!==null&&(nowMs-new Date(stat.lastOutcomeAt).getTime())<daysMs(7))
  if(strongRecentSuccess)score-=PRIORITY_WEIGHTS.recentSuccessPenalty
  const evidenceLevel=levelFor(observations,sources.size)
  const inCooldown=declined.has(skill)
  const personalized=observations>=MIN_PERSONALIZED_OBSERVATIONS&&quantitativeEvidence.length>0&&sources.size>=2&&!inCooldown
  if(inCooldown)score=Math.min(score,-1)
  if(!personalized)score-=PRIORITY_WEIGHTS.insufficientDataPenalty
  return{skill,priority:score,evidence,evidenceLevel,observationCount:observations,sourceCount:sources.size,quantitativeEvidenceCount:quantitativeEvidence.length,personalized}
}

function latestContext(records:RawRecord[]){
  const checkin=records.filter(record=>record.record_type==='checkin'&&isObject(record.payload)).at(-1)
  const energy=checkin&&isObject(checkin.payload)?finiteNumber(checkin.payload.energy):null
  const stress=checkin&&isObject(checkin.payload)?finiteNumber(checkin.payload.stress):null
  return{energy,stress,lowCapacity:energy!==null&&stress!==null&&energy<=4&&stress>=7}
}

function practiceScore(practice:PracticeDefinition,stats:PracticeStats[],nowMs:number,lowCapacity:boolean){
  if(practice.difficulty==='high')return-Infinity
  if(lowCapacity&&(practice.difficulty!=='low'||practice.estimatedMinutes>5))return-Infinity
  const stat=stats.find(item=>item.practiceId===practice.id)
  let score=0
  if(!stat)return score
  if(stat.outcomes>=2&&stat.meanUtility!==null&&stat.meanUtility<4)score-=2
  if(stat.outcomes>=2&&stat.meanUtility!==null&&stat.meanUtility>=7){
    const last=stat.lastOutcomeAt?new Date(stat.lastOutcomeAt).getTime():0
    if(!last||nowMs-last>=daysMs(PRACTICE_SPACING_DAYS))score+=1
  }
  if(stat.lastOutcomeAt){
    const last=new Date(stat.lastOutcomeAt).getTime()
    if(Number.isFinite(last)&&nowMs-last<daysMs(PRACTICE_SPACING_DAYS))score-=1.5
  }
  return score
}

function recommendationFor(candidate:DevelopmentCandidate,practice:PracticeDefinition):PracticeRecommendation{
  const skill=SKILL_BY_ID[candidate.skill]
  const strongest=[...candidate.evidence].sort((a,b)=>b.strength-a.strength).slice(0,3)
  const reasonSummary=strongest.length?strongest.map(item=>item.label).join(' · '):'Escolha manual sem priorização pelo histórico.'
  return{practice,skill,evidence:candidate.evidence,evidenceLevel:candidate.evidenceLevel,personalized:candidate.personalized,reasonSummary}
}

function practiceOptions(candidate:DevelopmentCandidate,stats:PracticeStats[],nowMs:number,lowCapacity:boolean){
  return(PRACTICES_BY_SKILL.get(candidate.skill)??[])
    .map(practice=>({practice,score:practiceScore(practice,stats,nowMs,lowCapacity)}))
    .filter(item=>Number.isFinite(item.score))
    .sort((a,b)=>b.score-a.score||a.practice.estimatedMinutes-b.practice.estimatedMinutes)
    .map(item=>item.practice)
}

export function buildDevelopmentPlan(records:RawRecord[],nowMs=Date.now()):DevelopmentPlan{
  const evidence=new Map<SkillId,DevelopmentEvidence[]>()
  domainEvidence(records,evidence)
  relationEvidence(records,evidence)
  qualitativeEvidence(records,evidence,nowMs)
  valuesEvidence(records,evidence,nowMs)
  reviewGoalEvidence(records,evidence)

  const stats=getPracticeStats(records)
  const context=latestContext(records)
  const candidates=[...evidence.entries()]
    .map(([skill,items])=>scoreCandidate(skill,items,records,stats,nowMs))
    .sort((a,b)=>b.priority-a.priority||a.skill.localeCompare(b.skill))

  const eligible=candidates.filter(candidate=>candidate.personalized&&candidate.priority>0)
  const recommendations:PracticeRecommendation[]=[]
  for(const candidate of eligible){
    const options=practiceOptions(candidate,stats,nowMs,context.lowCapacity)
    for(const practice of options)recommendations.push(recommendationFor(candidate,practice))
  }
  const daily=recommendations[0]??null
  const alternatives=recommendations.filter(item=>item.practice.id!==daily?.practice.id).slice(0,5)

  const weekly:PracticeRecommendation[]=[]
  if(daily){
    weekly.push(daily)
    const second=recommendations.find(item=>item.skill.id!==daily.skill.id&&item.practice.id!==daily.practice.id)
      ??recommendations.find(item=>item.practice.id!==daily.practice.id)
    if(second)weekly.push(second)
  }

  return{daily,alternatives,weekly:weekly.slice(0,2),candidates,context,strategyLearning:stats.sort((a,b)=>(b.outcomes-a.outcomes)||((b.meanUtility??-1)-(a.meanUtility??-1)))}
}

export function manualRecommendation(skill:SkillId,lowCapacity=false):PracticeRecommendation|null{
  const practice=(PRACTICES_BY_SKILL.get(skill)??[]).find(item=>item.difficulty==='low'&&(!lowCapacity||item.estimatedMinutes<=5))
    ??(PRACTICES_BY_SKILL.get(skill)??[]).find(item=>item.difficulty!=='high')
    ??null
  if(!practice)return null
  return{practice,skill:SKILL_BY_ID[skill],evidence:[],evidenceLevel:'insufficient',personalized:false,reasonSummary:'Escolha manual: o histórico ainda não foi usado para priorizar esta habilidade.'}
}

export function availablePracticeIds(){return new Set(PRACTICES.map(practice=>practice.id))}

export function getPendingPractice(records:RawRecord[],nowMs=Date.now()){
  const outcomes=new Set<string>()
  for(const record of records){
    const payload=developmentPayload(record)
    if(payload&&nonEmptyString(payload.phase)==='outcome'){
      const assignmentId=nonEmptyString(payload.assignmentId)
      if(assignmentId)outcomes.add(assignmentId)
    }
  }
  const validPracticeIds=availablePracticeIds()
  const accepted=records.flatMap(record=>{
    const payload=developmentPayload(record)
    const time=timeOf(record)
    if(!payload||time===null||time<nowMs-daysMs(14)||nonEmptyString(payload.phase)!=='accepted')return[]
    const assignmentId=nonEmptyString(payload.assignmentId)
    const practiceId=nonEmptyString(payload.practiceId)
    const skill=nonEmptyString(payload.skill) as SkillId
    const rawScope=nonEmptyString(payload.scope)
    if(!assignmentId||outcomes.has(assignmentId)||!validPracticeIds.has(practiceId)||!(skill in SKILL_BY_ID))return[]
    return[{assignmentId,practiceId,skill,scope:rawScope==='weekly'?'weekly' as const:'daily' as const,time}]
  }).sort((a,b)=>b.time-a.time)
  return accepted[0]??null
}
