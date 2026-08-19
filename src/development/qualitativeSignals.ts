import {isObject,nonEmptyString,normalizeText} from '../today/todayMetrics'
import type {RawRecord} from '../today/todayTypes'
import type {SkillId} from './developmentTypes'

export type QualitativePattern={
  id:string
  label:string
  skills:SkillId[]
  occurrences:number
  recordIds:string[]
  examples:string[]
}

const RULES:{id:string;label:string;skills:SkillId[];patterns:RegExp[]}[]=[
  {id:'communication-clarity',label:'registros mencionando dificuldade de clareza na comunicação',skills:['communication.clarity'],patterns:[/\b(confus[ao]|não fui clar[ao]|não consegui explicar|me expliquei demais|não consegui resumir|clareza)\b/i]},
  {id:'avoided-conversation',label:'registros de conversa evitada ou expressão adiada',skills:['communication.assertiveness','relations.boundaries'],patterns:[/\b(evitei (a |uma )?conversa|não consegui falar|não falei|deixei de dizer|adiei (a |uma )?conversa|conversa evitada)\b/i]},
  {id:'boundary',label:'registros envolvendo limites ou dificuldade em dizer não',skills:['relations.boundaries','communication.assertiveness'],patterns:[/\b(limite|dizer não|disse não|recus(ei|ar)|não consigo dizer não|preciso colocar limite)\b/i]},
  {id:'interpretation',label:'registros com interpretação de intenção antes de checagem explícita',skills:['communication.interpretation_checking','metacognition.observation_inference'],patterns:[/\b(acho que .* (quer|pensa|está|ficou)|parece que .* (quer|pensa|está|ficou)|assumi que|interpretei que|pensei que ele|pensei que ela|intenção)\b/i]},
  {id:'assumption',label:'registros em que pressupostos foram explicitamente mencionados',skills:['metacognition.assumptions'],patterns:[/\b(pressuposto|assumi que|estou assumindo|presumi que|supus que)\b/i]},
  {id:'uncertainty',label:'registros em que a incerteza foi explicitamente reconhecida',skills:['flexibility.uncertainty','critical.alternatives'],patterns:[/\b(não sei|incerteza|incerto|incerta|talvez|informação insuficiente|faltam dados|não tenho como saber)\b/i]},
  {id:'analysis-repetition',label:'registros de análise repetitiva sem indicação de informação nova',skills:['self.stop_recursive_analysis'],patterns:[/\b(pensando nisso de novo|mesma análise|mesma coisa de novo|não surgiu informação nova|continuo pensando|análise repetitiva|pensamento repetitivo)\b/i]},
  {id:'request',label:'registros envolvendo pedidos ou necessidades comunicadas',skills:['communication.assertiveness'],patterns:[/\b(pedi|pedido|preciso pedir|necessidade|expressei .* necessidade)\b/i]},
  {id:'learning',label:'registros explícitos de aprendizagem ou atualização',skills:['critical.alternatives','metacognition.assumptions'],patterns:[/\b(aprendi|percebi|notei|me dei conta|atualizei|revisei minha conclusão)\b/i]},
]

function reviewTexts(payload:Record<string,unknown>){
  if(nonEmptyString(payload.subtype)==='development_practice')return[]
  if(!isObject(payload.answers))return[]
  return Object.values(payload.answers).map(nonEmptyString).filter(Boolean)
}

export function textsFromRecord(record:RawRecord):string[]{
  if(!isObject(record.payload))return[]
  const payload=record.payload
  if(record.record_type==='review')return reviewTexts(payload)
  if(record.record_type==='checkin')return[payload.event,payload.notes].map(nonEmptyString).filter(Boolean)
  if(record.record_type==='relation')return[payload.context,payload.observed,payload.inferred,payload.assumption,payload.alternatives].map(nonEmptyString).filter(Boolean)
  if(record.record_type==='experiment')return[payload.situation,payload.prediction,payload.anticipatedEmotion,payload.actual,payload.observedEmotion,payload.learning].map(nonEmptyString).filter(Boolean)
  if(record.record_type==='reflection')return[payload.thought,payload.action].map(nonEmptyString).filter(Boolean)
  if(record.record_type==='value'){
    if(nonEmptyString(payload.subtype)==='act_commitment'){
      const items=Array.isArray(payload.items)?payload.items:[]
      return items.filter(isObject).map(item=>nonEmptyString(item.text)).filter(Boolean)
    }
    return[payload.value,payload.behavior,payload.action].map(nonEmptyString).filter(Boolean)
  }
  return[]
}

function structuralPatterns(record:RawRecord):{id:string;label:string;skills:SkillId[]}[]{
  if(record.record_type!=='relation'||!isObject(record.payload))return[]
  const observed=nonEmptyString(record.payload.observed)
  const inferred=nonEmptyString(record.payload.inferred)
  const assumption=nonEmptyString(record.payload.assumption)
  const alternatives=nonEmptyString(record.payload.alternatives)
  const patterns:{id:string;label:string;skills:SkillId[]}[]=[]
  if(inferred&&!observed)patterns.push({id:'inference-without-observation',label:'interações com inferência preenchida sem observação explícita',skills:['metacognition.observation_inference','communication.interpretation_checking']})
  if(inferred&&!alternatives)patterns.push({id:'inference-without-alternative',label:'interações com inferência registrada sem alternativa explícita',skills:['critical.alternatives','communication.interpretation_checking']})
  if(inferred&&!assumption)patterns.push({id:'inference-without-assumption',label:'interações com inferência registrada sem pressuposto explícito',skills:['metacognition.assumptions']})
  return patterns
}

export function collectQualitativePatterns(records:RawRecord[],nowMs=Date.now(),days=60):QualitativePattern[]{
  const cutoff=nowMs-days*86400000
  const buckets=new Map<string,QualitativePattern>()
  const recent=records.filter(record=>{
    const time=new Date(record.created_at).getTime()
    return Number.isFinite(time)&&time>=cutoff&&time<=nowMs
  })
  for(const record of recent){
    const texts=textsFromRecord(record)
    const matchedIds=new Set<string>()
    for(const rule of RULES){
      const example=texts.find(text=>rule.patterns.some(pattern=>pattern.test(normalizeText(text))))
      if(!example||matchedIds.has(rule.id))continue
      matchedIds.add(rule.id)
      const current=buckets.get(rule.id)??{id:rule.id,label:rule.label,skills:rule.skills,occurrences:0,recordIds:[],examples:[]}
      current.occurrences+=1
      current.recordIds.push(record.id)
      if(current.examples.length<2)current.examples.push(example.slice(0,180))
      buckets.set(rule.id,current)
    }
    for(const structural of structuralPatterns(record)){
      if(matchedIds.has(structural.id))continue
      const current=buckets.get(structural.id)??{id:structural.id,label:structural.label,skills:structural.skills,occurrences:0,recordIds:[],examples:[]}
      current.occurrences+=1
      current.recordIds.push(record.id)
      buckets.set(structural.id,current)
    }
  }
  return[...buckets.values()].sort((a,b)=>b.occurrences-a.occurrences)
}
